// 版本的恢复与重做（Ctrl+Z / Ctrl+Y）：记录每次画布与逻辑修改前后的快照，
// 覆盖移动、缩放、旋转、属性修改、节点增删以及删除控件时同步清理 YAML 条目。
import { isMap, parseDocument } from "yaml";
import type { Value } from "./expr.ts";
import type { Scene, SceneNode } from "./model.ts";
import { computeResizeBox, filterUnlocked, isNodeLocked } from "./transform.ts";

export const DEFAULT_HISTORY_LIMIT = 200;

export interface HistorySnapshot {
  sceneText: string;
  logicText: string;
}

export interface VersionEntry {
  snapshot: HistorySnapshot;
  label: string;
  timestamp: number;
}

export interface HistoryStack {
  past: VersionEntry[];
  future: VersionEntry[];
  limit: number;
}

export function serializeScene(scene: Scene): string {
  return JSON.stringify(scene, null, 2) + "\n";
}

export function parseScene(sceneText: string): Scene {
  return JSON.parse(sceneText) as Scene;
}

export function snapshotOf(scene: Scene, logicText = ""): HistorySnapshot {
  return { sceneText: serializeScene(scene), logicText };
}

export function createHistory(limit = DEFAULT_HISTORY_LIMIT): HistoryStack {
  return { past: [], future: [], limit };
}

export function snapshotsEqual(a: HistorySnapshot, b: HistorySnapshot): boolean {
  return a.sceneText === b.sceneText && a.logicText === b.logicText;
}

/**
 * 记录一次操作：如果 before 和 after 有变化，把 before 压入 past，并清空 future。
 * 内容没有变化时不产生新版本。
 */
export function pushHistory(
  stack: HistoryStack,
  before: HistorySnapshot,
  after: HistorySnapshot,
  label = "编辑",
  timestamp = Date.now(),
): HistoryStack {
  if (snapshotsEqual(before, after)) return stack;
  const nextPast = [...stack.past, { snapshot: { ...before }, label, timestamp }];
  if (nextPast.length > stack.limit) nextPast.splice(0, nextPast.length - stack.limit);
  return {
    past: nextPast,
    future: [],
    limit: stack.limit,
  };
}

export function canUndo(stack: HistoryStack): boolean {
  return stack.past.length > 0;
}

export function canRedo(stack: HistoryStack): boolean {
  return stack.future.length > 0;
}

/** 恢复到上一个版本（Ctrl+Z），把当前状态压入 future。 */
export function undoHistory(
  stack: HistoryStack,
  current: HistorySnapshot,
  currentLabel = "编辑",
  timestamp = Date.now(),
): { stack: HistoryStack; snapshot: HistorySnapshot | null; entry: VersionEntry | null } {
  if (stack.past.length === 0) return { stack, snapshot: null, entry: null };
  const nextPast = stack.past.slice(0, -1);
  const entry = stack.past[stack.past.length - 1];
  const nextFuture = [...stack.future, { snapshot: { ...current }, label: entry.label || currentLabel, timestamp }];
  return {
    stack: { past: nextPast, future: nextFuture, limit: stack.limit },
    snapshot: { ...entry.snapshot },
    entry,
  };
}

/** 重做（Ctrl+Y / Ctrl+Shift+Z），把当前状态压回 past。 */
export function redoHistory(
  stack: HistoryStack,
  current: HistorySnapshot,
  currentLabel = "编辑",
  timestamp = Date.now(),
): { stack: HistoryStack; snapshot: HistorySnapshot | null; entry: VersionEntry | null } {
  if (stack.future.length === 0) return { stack, snapshot: null, entry: null };
  const nextFuture = stack.future.slice(0, -1);
  const entry = stack.future[stack.future.length - 1];
  const nextPast = [...stack.past, { snapshot: { ...current }, label: entry.label || currentLabel, timestamp }];
  if (nextPast.length > stack.limit) nextPast.splice(0, nextPast.length - stack.limit);
  return {
    stack: { past: nextPast, future: nextFuture, limit: stack.limit },
    snapshot: { ...entry.snapshot },
    entry,
  };
}

/**
 * 在完整版本时间线 `[...past, current, ...future.slice().reverse()]` 中直接跳转到第 index 个版本，
 * 不丢失任何已记录的版本。
 */
export function restoreHistoryVersion(
  stack: HistoryStack,
  index: number,
  current: HistorySnapshot,
  timestamp = Date.now(),
): { stack: HistoryStack; snapshot: HistorySnapshot | null } {
  const timeline: VersionEntry[] = [
    ...stack.past,
    { snapshot: { ...current }, label: "当前", timestamp },
    ...stack.future.slice().reverse(),
  ];
  if (index < 0 || index >= timeline.length || index === stack.past.length) {
    return { stack, snapshot: null };
  }
  const target = timeline[index];
  const nextPast = timeline.slice(0, index);
  const nextFuture = timeline.slice(index + 1).reverse();
  return {
    stack: { past: nextPast, future: nextFuture, limit: stack.limit },
    snapshot: { ...target.snapshot },
  };
}

// ---------- 删除控件与 YAML 条目清理 ----------

/** 收集待删除节点及其全部后代节点（不含根窗口，且跳过已锁定节点）。 */
export function collectSubtreeIds(scene: Scene, ids: string[]): Set<string> {
  const removed = new Set<string>();
  const collect = (target: string) => {
    if (target === scene.root || isNodeLocked(scene, target) || removed.has(target)) return;
    if (!scene.nodes[target]) return;
    removed.add(target);
    for (const child of scene.nodes[target].children ?? []) collect(child);
  };
  for (const id of ids) collect(id);
  return removed;
}

/** 检查待删除的节点中，哪些在 logic/app.logic.yaml 的 objects 下有条目。 */
export function nodesWithYamlEntries(logicText: string, ids: Iterable<string>): string[] {
  if (!logicText.trim()) return [];
  const doc = parseDocument(logicText);
  if (doc.errors.length > 0) return [];
  const objects = doc.get("objects");
  if (!isMap(objects)) return [];
  const result: string[] = [];
  for (const id of ids) {
    if (doc.getIn(["objects", id]) !== undefined) result.push(id);
  }
  return result;
}

/** 从 YAML 原文中删除指定控件的 objects.<id> 条目，保留文件其余部分的注释与格式。 */
export function removeYamlObjects(logicText: string, ids: Iterable<string>): string {
  const doc = parseDocument(logicText);
  if (doc.errors.length > 0) return logicText;
  let changed = false;
  for (const id of ids) {
    if (doc.getIn(["objects", id]) !== undefined) {
      doc.deleteIn(["objects", id]);
      changed = true;
    }
  }
  return changed ? doc.toString({ lineWidth: 0 }) : logicText;
}

// ---------- 画布纯函数操作（供测试与命令直接调用） ----------

export function cloneScene(scene: Scene): Scene {
  return JSON.parse(JSON.stringify(scene)) as Scene;
}

/** 移动一组未锁定节点。 */
export function applyMoveToScene(scene: Scene, ids: string[], dx: number, dy: number): Scene {
  const next = cloneScene(scene);
  for (const id of filterUnlocked(next, ids)) {
    const n = next.nodes[id];
    if (!n) continue;
    n.x = (n.x ?? 0) + dx;
    n.y = (n.y ?? 0) + dy;
  }
  return next;
}

/** 缩放单个未锁定节点。 */
export function applyResizeToScene(
  scene: Scene,
  id: string,
  handle: string,
  dx: number,
  dy: number,
  keepAspect = false,
): Scene {
  const next = cloneScene(scene);
  const n = next.nodes[id];
  if (!n || (id !== next.root && isNodeLocked(next, id))) return next;
  const orig = { x: n.x ?? 0, y: n.y ?? 0, width: n.width, height: n.height };
  const box = computeResizeBox(orig, handle, dx, dy, keepAspect);
  if (id !== next.root) {
    n.x = Math.round(box.x);
    n.y = Math.round(box.y);
  }
  n.width = Math.round(box.width);
  n.height = Math.round(box.height);
  return next;
}

/** 修改未锁定节点的 props 属性。 */
export function applyPropsToScene(
  scene: Scene,
  ids: string[],
  patch: Record<string, Value | undefined>,
): Scene {
  const next = cloneScene(scene);
  for (const id of filterUnlocked(next, ids)) {
    const n = next.nodes[id];
    if (!n) continue;
    n.props = { ...(n.props ?? {}) };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete n.props[key];
      else n.props[key] = value;
    }
  }
  return next;
}

/** 往画布中添加一个新节点。 */
export function applyAddNodeToScene(
  scene: Scene,
  parentId: string,
  id: string,
  node: SceneNode,
): Scene {
  const next = cloneScene(scene);
  const parent = next.nodes[parentId] ?? next.nodes[next.root];
  if (!parent) return next;
  next.nodes[id] = JSON.parse(JSON.stringify(node)) as SceneNode;
  parent.children ??= [];
  if (!parent.children.includes(id)) parent.children.push(id);
  return next;
}

/** 从画布中删除节点（跳过已锁定节点），并可选同步删除 YAML 中的 objects 条目。 */
export function applyDeleteFromScene(
  scene: Scene,
  ids: string[],
  logicText = "",
  removeYaml = false,
): { scene: Scene; logicText: string; removed: string[]; yamlCandidates: string[] } {
  const next = cloneScene(scene);
  const removedSet = collectSubtreeIds(next, ids);
  const removed = [...removedSet];
  const yamlCandidates = nodesWithYamlEntries(logicText, removed);
  if (removed.length === 0) {
    return { scene: next, logicText, removed, yamlCandidates };
  }
  for (const n of Object.values(next.nodes)) {
    if (n.children) n.children = n.children.filter((child) => !removedSet.has(child));
    if (n.type === "Line" && n.props) {
      if (typeof n.props.startNode === "string" && removedSet.has(n.props.startNode)) {
        n.props = { ...n.props };
        delete n.props.startNode;
        delete n.props.startSide;
        delete n.props.startAt;
      }
      if (typeof n.props.endNode === "string" && removedSet.has(n.props.endNode)) {
        n.props = { ...n.props };
        delete n.props.endNode;
        delete n.props.endSide;
        delete n.props.endAt;
      }
    }
  }
  for (const id of removed) delete next.nodes[id];
  const nextLogic = removeYaml && yamlCandidates.length > 0 ? removeYamlObjects(logicText, yamlCandidates) : logicText;
  return { scene: next, logicText: nextLogic, removed, yamlCandidates };
}
