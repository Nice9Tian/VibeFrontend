// 版本的恢复与重做（Ctrl+Z / Ctrl+Y）：记录每次画布、逻辑、说明文档与预设修改前后的快照，
// 覆盖移动、缩放、旋转、属性修改、节点增删以及删除控件时同步清理 YAML 条目，并隔离外部文件修改。
import { isMap, parseDocument } from "yaml";
import type { Value } from "./expr.ts";
import {
  isDockArea,
  syncSceneNodesFromDockLayout,
  type DockArea,
} from "./dock.ts";
import {
  childrenOfNode,
  isLayoutPositionedNode,
  isPartitionedWindow,
  layoutOf,
  removeNodeReferences,
  syncResizedNodeDimensions,
  type DockLayoutSpec,
  type Scene,
  type SceneNode,
} from "./model.ts";
import {
  MIN_NODE_SIZE,
  absRectInScene,
  computeResizeBox,
  filterUnlocked,
  hasLockedInSubtree,
  isNodeLocked,
  parentOfInScene,
  worldRectToNodeLocalInScene,
  worldRotationInScene,
  worldToParentDeltaInScene,
} from "./transform.ts";

export const DEFAULT_HISTORY_LIMIT = 200;

export interface HistorySnapshot {
  sceneText: string;
  logicText: string;
  docs?: Record<string, string>;
  presetsText?: string;
}

export interface VersionEntry {
  /**
   * 在 past 中表示本次操作前的快照（undo 的目标状态）；
   * 在 future 中表示本次操作后的快照（redo 的目标状态）。
   */
  snapshot: HistorySnapshot;
  /**
   * 与 snapshot 配对的另一端状态（在 past 中为操作后状态，在 future 中为撤销后状态），
   * 用于识别本次操作实际改动了哪些文件，避免撤销画布时覆盖外部修改的 YAML（反之亦然），
   * 并在同一文件被外部修改后保留中间版本。
   */
  after?: HistorySnapshot;
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

export function snapshotOf(
  scene: Scene,
  logicText = "",
  docs?: Record<string, string>,
  presetsText?: string,
): HistorySnapshot {
  return {
    sceneText: serializeScene(scene),
    logicText,
    ...(docs ? { docs: { ...docs } } : {}),
    ...(presetsText !== undefined ? { presetsText } : {}),
  };
}

export function cloneSnapshot(s: HistorySnapshot): HistorySnapshot {
  return {
    sceneText: s.sceneText,
    logicText: s.logicText,
    ...(s.docs ? { docs: { ...s.docs } } : {}),
    ...(s.presetsText !== undefined ? { presetsText: s.presetsText } : {}),
  };
}

export function createHistory(limit = DEFAULT_HISTORY_LIMIT): HistoryStack {
  return { past: [], future: [], limit };
}

function docsEqual(a?: Record<string, string>, b?: Record<string, string>): boolean {
  if (!a && !b) return true;
  if (!a || !b) return true;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if ((a[k] ?? "") !== (b[k] ?? "")) return false;
  }
  return true;
}

function presetsEqual(a?: string, b?: string): boolean {
  if (a === undefined || b === undefined) return true;
  return a === b;
}

export function snapshotsEqual(a: HistorySnapshot, b: HistorySnapshot): boolean {
  return (
    a.sceneText === b.sceneText &&
    a.logicText === b.logicText &&
    docsEqual(a.docs, b.docs) &&
    presetsEqual(a.presetsText, b.presetsText)
  );
}

interface SnapshotDelta {
  scene: boolean;
  logic: boolean;
  presets: boolean;
  docKeys: string[];
}

function computeDelta(a: HistorySnapshot, b?: HistorySnapshot): SnapshotDelta {
  if (!b) {
    return {
      scene: true,
      logic: true,
      presets: a.presetsText !== undefined,
      docKeys: a.docs ? Object.keys(a.docs) : [],
    };
  }
  const docKeys: string[] = [];
  if (a.docs && b.docs) {
    const keys = new Set([...Object.keys(a.docs), ...Object.keys(b.docs)]);
    for (const k of keys) {
      if ((a.docs[k] ?? "") !== (b.docs[k] ?? "")) docKeys.push(k);
    }
  }
  return {
    scene: a.sceneText !== b.sceneText,
    logic: a.logicText !== b.logicText,
    presets: a.presetsText !== undefined && b.presetsText !== undefined && a.presetsText !== b.presetsText,
    docKeys,
  };
}

function applyPartialSnapshot(base: HistorySnapshot, target: HistorySnapshot, delta: SnapshotDelta): HistorySnapshot {
  const next = cloneSnapshot(base);
  if (delta.scene) next.sceneText = target.sceneText;
  if (delta.logic) next.logicText = target.logicText;
  if (delta.presets && target.presetsText !== undefined) next.presetsText = target.presetsText;
  if (delta.docKeys.length > 0 && target.docs) {
    next.docs = { ...(next.docs ?? {}) };
    for (const k of delta.docKeys) {
      if (target.docs[k] === undefined) delete next.docs[k];
      else next.docs[k] = target.docs[k];
    }
  }
  return next;
}

/**
 * 记录一次操作：如果 before 和 after 有变化，把 before 压入 past，并清空 future。
 * 若上一次记录的 after 与本次 before 在已跟踪的文件上发生了外部改动，先自动补入一条“外部修改”记录，
 * 保证中间状态不会丢失。
 */
export function pushHistory(
  stack: HistoryStack,
  before: HistorySnapshot,
  after: HistorySnapshot,
  label = "编辑",
  timestamp = Date.now(),
): HistoryStack {
  if (snapshotsEqual(before, after)) return stack;
  const nextPast = [...stack.past];
  if (nextPast.length > 0) {
    const prev = nextPast[nextPast.length - 1];
    if (prev.after) {
      const extDelta = computeDelta(prev.after, before);
      if (extDelta.scene || extDelta.logic || extDelta.presets || extDelta.docKeys.length > 0) {
        const extBefore = applyPartialSnapshot(before, prev.after, extDelta);
        nextPast.push({
          snapshot: extBefore,
          after: cloneSnapshot(before),
          label: "外部修改",
          timestamp,
        });
      }
    }
  }
  nextPast.push({
    snapshot: cloneSnapshot(before),
    after: cloneSnapshot(after),
    label,
    timestamp,
  });
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

/**
 * 恢复到上一个版本（Ctrl+Z），把当前状态压入 future。
 * - 若栈顶记录仅修改了画布（sceneText），而外部修改了逻辑（logicText），只回滚画布、保留外部逻辑修改（反之亦然）。
 * - 若栈顶记录修改的文件在操作后又被外部修改（如 S1 -> S_ext），第一次撤销先从 S_ext 退回 S1，第二次再从 S1 退回 S0。
 */
export function undoHistory(
  stack: HistoryStack,
  current: HistorySnapshot,
  currentLabel = "编辑",
  timestamp = Date.now(),
): { stack: HistoryStack; snapshot: HistorySnapshot | null; entry: VersionEntry | null } {
  if (stack.past.length === 0) return { stack, snapshot: null, entry: null };
  const entry = stack.past[stack.past.length - 1];
  const delta = computeDelta(entry.snapshot, entry.after);

  if (entry.after) {
    const extScene = delta.scene && current.sceneText !== entry.after.sceneText;
    const extLogic = delta.logic && current.logicText !== entry.after.logicText;
    const extPresets =
      delta.presets &&
      current.presetsText !== undefined &&
      entry.after.presetsText !== undefined &&
      current.presetsText !== entry.after.presetsText;
    const extDocKeys = delta.docKeys.filter(
      (k) => (current.docs?.[k] ?? "") !== (entry.after?.docs?.[k] ?? ""),
    );
    if (extScene || extLogic || extPresets || extDocKeys.length > 0) {
      const extDelta: SnapshotDelta = {
        scene: extScene,
        logic: extLogic,
        presets: extPresets,
        docKeys: extDocKeys,
      };
      const targetSnap = applyPartialSnapshot(current, entry.after, extDelta);
      const extEntry: VersionEntry = {
        snapshot: cloneSnapshot(current),
        after: cloneSnapshot(targetSnap),
        label: "外部修改",
        timestamp,
      };
      return {
        stack: {
          past: [...stack.past],
          future: [...stack.future, extEntry],
          limit: stack.limit,
        },
        snapshot: targetSnap,
        entry: extEntry,
      };
    }
  }

  const nextPast = stack.past.slice(0, -1);
  const targetSnap = applyPartialSnapshot(current, entry.snapshot, delta);
  const futureEntry: VersionEntry = {
    snapshot: cloneSnapshot(current),
    after: cloneSnapshot(targetSnap),
    label: entry.label || currentLabel,
    timestamp,
  };
  const nextFuture = [...stack.future, futureEntry];
  return {
    stack: { past: nextPast, future: nextFuture, limit: stack.limit },
    snapshot: targetSnap,
    entry,
  };
}

/** 重做（Ctrl+Y / Ctrl+Shift+Z），把当前状态压回 past，并同样按文件粒度应用变更。 */
export function redoHistory(
  stack: HistoryStack,
  current: HistorySnapshot,
  currentLabel = "编辑",
  timestamp = Date.now(),
): { stack: HistoryStack; snapshot: HistorySnapshot | null; entry: VersionEntry | null } {
  if (stack.future.length === 0) return { stack, snapshot: null, entry: null };
  const nextFuture = stack.future.slice(0, -1);
  const entry = stack.future[stack.future.length - 1];
  const delta = computeDelta(entry.snapshot, entry.after);
  const targetSnap = applyPartialSnapshot(current, entry.snapshot, delta);
  const pastEntry: VersionEntry = {
    snapshot: cloneSnapshot(current),
    after: cloneSnapshot(targetSnap),
    label: entry.label || currentLabel,
    timestamp,
  };
  const nextPast = [...stack.past, pastEntry];
  if (nextPast.length > stack.limit) nextPast.splice(0, nextPast.length - stack.limit);
  return {
    stack: { past: nextPast, future: nextFuture, limit: stack.limit },
    snapshot: targetSnap,
    entry,
  };
}

/**
 * 在完整版本时间线 `[...past, current, ...future.slice().reverse()]` 中直接跳转到第 index 个版本，
 * 不丢失任何已记录的版本，且不会覆盖跳转区间内未涉及文件的外部修改。
 */
export function restoreHistoryVersion(
  stack: HistoryStack,
  index: number,
  current: HistorySnapshot,
  timestamp = Date.now(),
): { stack: HistoryStack; snapshot: HistorySnapshot | null } {
  const currentIdx = stack.past.length;
  const total = stack.past.length + 1 + stack.future.length;
  if (index < 0 || index >= total || index === currentIdx) {
    return { stack, snapshot: null };
  }
  let workingStack: HistoryStack = {
    past: [...stack.past],
    future: [...stack.future],
    limit: stack.limit,
  };
  let workingSnap = cloneSnapshot(current);

  if (index < currentIdx) {
    const top = workingStack.past[workingStack.past.length - 1];
    if (top?.after) {
      const extDelta = computeDelta(workingSnap, top.after);
      if (extDelta.scene || extDelta.logic || extDelta.presets || extDelta.docKeys.length > 0) {
        const revertedSnap = applyPartialSnapshot(workingSnap, top.after, extDelta);
        workingStack = {
          past: [...workingStack.past],
          future: [
            ...workingStack.future,
            {
              snapshot: cloneSnapshot(workingSnap),
              after: cloneSnapshot(revertedSnap),
              label: "外部修改",
              timestamp,
            },
          ],
          limit: workingStack.limit,
        };
        workingSnap = revertedSnap;
      }
    }
    let guard = workingStack.past.length * 2 + 4;
    while (workingStack.past.length > index && guard-- > 0) {
      const u = undoHistory(workingStack, workingSnap, "编辑", timestamp);
      if (!u.snapshot) break;
      workingStack = u.stack;
      workingSnap = u.snapshot;
    }
  } else {
    const targetFutureLen = total - 1 - index;
    let guard = workingStack.future.length * 2 + 4;
    while (workingStack.future.length > targetFutureLen && guard-- > 0) {
      const r = redoHistory(workingStack, workingSnap, "编辑", timestamp);
      if (!r.snapshot) break;
      workingStack = r.stack;
      workingSnap = r.snapshot;
    }
  }
  return {
    stack: workingStack,
    snapshot: workingSnap,
  };
}

// ---------- 删除控件与 YAML 条目清理 ----------

/**
 * 收集待删除节点及其全部后代节点（不含根窗口）。
 * 若某个待删节点自身或其任何后代节点处于锁定状态，则跳过整个子树，绝不产生孤儿锁定子节点。
 */
export function collectSubtreeIds(scene: Scene, ids: string[]): Set<string> {
  const removed = new Set<string>();
  const collect = (target: string) => {
    if (target === scene.root || hasLockedInSubtree(scene, target) || removed.has(target)) return;
    if (!scene.nodes[target]) return;
    removed.add(target);
    for (const child of childrenOfNode(scene.nodes[target])) collect(child);
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

/**
 * 从 YAML 原文中删除指定控件的 objects.<id> 条目，保留文件其余部分的注释与格式。
 * 注意：yaml AST 会把 objects 下第一个键值对上方的注释挂在 objectsMap.commentBefore 上，
 * 因此当删除当时位于 objects.items[0] 的首条目时，同步清理归属它的前导注释。
 */
export function removeYamlObjects(logicText: string, ids: Iterable<string>): string {
  const doc = parseDocument(logicText);
  if (doc.errors.length > 0) return logicText;
  const objects = doc.get("objects");
  if (!isMap(objects)) return logicText;
  const firstPair = objects.items.length > 0 ? objects.items[0] : undefined;
  const firstKey = (firstPair?.key as { value?: unknown } | undefined)?.value as string | undefined;
  const firstKeyHadOwnComment = Boolean((firstPair?.key as { commentBefore?: string | null } | undefined)?.commentBefore);
  let changed = false;
  let deletedFirst = false;
  for (const id of ids) {
    if (doc.getIn(["objects", id]) !== undefined) {
      if (id === firstKey) deletedFirst = true;
      doc.deleteIn(["objects", id]);
      changed = true;
    }
  }
  if (changed && deletedFirst && objects.commentBefore && !firstKeyHadOwnComment) {
    const parts = objects.commentBefore.split(/\n[ \t]*\n/);
    objects.commentBefore = parts.length > 1 ? parts.slice(0, -1).join("\n\n") : null;
  }
  return changed ? doc.toString({ lineWidth: 0 }) : logicText;
}

/** 将 sceneText 中引用了旧控件类型的节点同步替换为新控件类型名。 */
export function renameComponentTypeInSceneText(
  sceneText: string,
  oldTypes: Iterable<string>,
  nextType: string,
): string {
  const oldSet = new Set(Array.from(oldTypes).filter(Boolean));
  if (oldSet.size === 0 || !nextType) return sceneText;
  try {
    const scene = parseScene(sceneText);
    let changed = false;
    for (const n of Object.values(scene.nodes ?? {})) {
      if (n && oldSet.has(n.type)) {
        n.type = nextType;
        changed = true;
      }
    }
    return changed ? serializeScene(scene) : sceneText;
  } catch {
    return sceneText;
  }
}

/** 重命名项目中的控件类型后，同步更新历史栈各快照中的节点 type 引用，避免撤销时回退到已删除的旧控件目录。 */
export function renameComponentTypeInHistory(
  stack: HistoryStack,
  oldTypes: Iterable<string>,
  nextType: string,
): HistoryStack {
  const mapSnap = (snap: HistorySnapshot): HistorySnapshot => ({
    ...cloneSnapshot(snap),
    sceneText: renameComponentTypeInSceneText(snap.sceneText, oldTypes, nextType),
  });
  const mapEntry = (entry: VersionEntry): VersionEntry => ({
    ...entry,
    snapshot: mapSnap(entry.snapshot),
    ...(entry.after ? { after: mapSnap(entry.after) } : {}),
  });
  return {
    past: stack.past.map(mapEntry),
    future: stack.future.map(mapEntry),
    limit: stack.limit,
  };
}

// ---------- 画布纯函数操作（供主界面与测试共同调用） ----------

export function cloneScene(scene: Scene): Scene {
  return JSON.parse(JSON.stringify(scene)) as Scene;
}

/** 移动一组未锁定节点（当子节点位于旋转后的父容器内时，自动将世界位移换算为父容器局部坐标增量；由自动排版或分区定位的节点不写入无意义坐标）。 */
export function applyMoveToScene(scene: Scene, ids: string[], dx: number, dy: number): Scene {
  const next = cloneScene(scene);
  const chosen = new Set(filterUnlocked(next, ids));
  for (const id of chosen) {
    let hasChosenAncestor = false;
    for (let p = parentOfInScene(next, id); p; p = parentOfInScene(next, p)) {
      if (chosen.has(p)) {
        hasChosenAncestor = true;
        break;
      }
    }
    if (hasChosenAncestor) continue;
    const n = next.nodes[id];
    if (!n) continue;
    if (isLayoutPositionedNode(next, id)) {
      delete n.x;
      delete n.y;
      continue;
    }
    const d = worldToParentDeltaInScene(next, id, dx, dy);
    n.x = Math.round((n.x ?? 0) + d.x);
    n.y = Math.round((n.y ?? 0) + d.y);
  }
  return next;
}

/** 缩放单个未锁定节点（考虑节点及其祖先容器的旋转角度；自由定位节点将世界外框换算回父容器局部坐标，排版/分区节点只更新有效尺寸而不写 x、y）。 */
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
  const isRoot = id === next.root;
  const orig = isRoot ? { x: 0, y: 0, width: n.width, height: n.height } : absRectInScene(next, id);
  const rot = isRoot ? 0 : worldRotationInScene(next, id);
  const box = computeResizeBox(orig, handle, dx, dy, keepAspect, MIN_NODE_SIZE, rot);
  if (!isRoot) {
    if (isLayoutPositionedNode(next, id)) {
      delete n.x;
      delete n.y;
      syncResizedNodeDimensions(n, box.width, box.height, MIN_NODE_SIZE, next, id);
    } else {
      const local = worldRectToNodeLocalInScene(next, id, box);
      n.x = local.x;
      n.y = local.y;
      syncResizedNodeDimensions(n, local.width, local.height, MIN_NODE_SIZE, next, id);
    }
  } else {
    n.width = Math.round(box.width);
    n.height = Math.round(box.height);
  }
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
  const targetParentId = next.nodes[parentId] ? parentId : next.root;
  const parent = next.nodes[targetParentId];
  if (!parent) return next;
  const created = JSON.parse(JSON.stringify(node)) as SceneNode;
  if (layoutOf(parent) !== null || (created.type === "Dock" && targetParentId === next.root && isPartitionedWindow(parent))) {
    delete created.x;
    delete created.y;
  }
  next.nodes[id] = created;
  if (created.type === "Dock" && targetParentId === next.root && isPartitionedWindow(parent)) {
    parent.docks ??= [];
    if (!parent.docks.includes(id)) parent.docks.push(id);
    if (parent.dockLayout) {
      const area: DockArea = isDockArea(created.dockArea) ? created.dockArea : "left";
      parent.dockLayout.areas[area] ??= { groups: [] };
      parent.dockLayout.areas[area].groups.push({ tabs: [id], active: id });
    }
    return next;
  }
  parent.children ??= [];
  if (!parent.children.includes(id)) parent.children.push(id);
  return next;
}

/** 从画布中删除节点（跳过已锁定节点及含已锁定后代的容器，统一清理 children / docks / central / statusBar / menuBar.dock / windows），并可选同步删除 YAML 中的 objects 条目。 */
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
  removeNodeReferences(next, removedSet);
  for (const n of Object.values(next.nodes)) {
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

/** 将窗口停靠排列写入 scene.nodes[winId].dockLayout，供画布持久化与撤销重做使用。 */
export function applyDockLayoutToScene(scene: Scene, dockLayout: DockLayoutSpec, winId = scene.root): Scene {
  const next = cloneScene(scene);
  const winNode = next.nodes[winId];
  if (!winNode) return next;
  syncSceneNodesFromDockLayout(next, winNode, dockLayout);
  return next;
}
