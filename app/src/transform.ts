// 几何变换与编排操作：锁定判断、旋转、单选与多选整体缩放、对齐与等距分布、线条拐点操作。
// 纯数据计算，不依赖浏览器 DOM，可在编辑器界面和命令行测试中共用。
import type { Value } from "./expr.ts";
import type { Scene, SceneNode } from "./model.ts";
import {
  formatBends,
  insertLineBend,
  lineSegmentMidpoints,
  parseBends,
  removeLineBend,
  updateLineBend,
  type Point,
  type Rect,
} from "./shapes.ts";

export { insertLineBend, lineSegmentMidpoints, removeLineBend, updateLineBend };

export const MIN_NODE_SIZE = 8;

// ---------- 节点层级与绝对坐标 ----------

export function parentOfInScene(scene: Scene, id: string): string | null {
  for (const [parentId, parent] of Object.entries(scene.nodes)) {
    if (parent.children?.includes(id)) return parentId;
  }
  return null;
}

export function absRectInScene(scene: Scene, id: string): Rect {
  const n = scene.nodes[id];
  if (!n) return { x: 0, y: 0, width: 0, height: 0 };
  let x = 0;
  let y = 0;
  for (let cursor: string | null = id; cursor && cursor !== scene.root; cursor = parentOfInScene(scene, cursor)) {
    const curr = scene.nodes[cursor];
    x += curr?.x ?? 0;
    y += curr?.y ?? 0;
  }
  return { x, y, width: n.width, height: n.height };
}

export function parentOriginInScene(scene: Scene, id: string): Point {
  const parentId = parentOfInScene(scene, id);
  if (!parentId || parentId === scene.root) return { x: 0, y: 0 };
  const r = absRectInScene(scene, parentId);
  return { x: r.x, y: r.y };
}

export function unionRectOf(rects: Rect[]): Rect | null {
  let box: Rect | null = null;
  for (const r of rects) {
    if (!box) box = { ...r };
    else {
      const right = Math.max(box.x + box.width, r.x + r.width);
      const bottom = Math.max(box.y + box.height, r.y + r.height);
      box.x = Math.min(box.x, r.x);
      box.y = Math.min(box.y, r.y);
      box.width = right - box.x;
      box.height = bottom - box.y;
    }
  }
  return box;
}

// ---------- 锁定 ----------

/** 节点自己或任一祖先被锁定时，视为已锁定。根窗口不可锁定。 */
export function isNodeLocked(scene: Scene, id: string): boolean {
  for (let cursor: string | null = id; cursor && cursor !== scene.root; cursor = parentOfInScene(scene, cursor)) {
    if (scene.nodes[cursor]?.locked) return true;
  }
  return false;
}

/** 过滤出未锁定且不是根窗口的节点。 */
export function filterUnlocked(scene: Scene, ids: string[]): string[] {
  return ids.filter((id) => id !== scene.root && Boolean(scene.nodes[id]) && !isNodeLocked(scene, id));
}

/** 设置一组节点的锁定状态，返回是否有变化。 */
export function setNodesLocked(scene: Scene, ids: string[], locked: boolean): boolean {
  let changed = false;
  for (const id of ids) {
    if (id === scene.root) continue;
    const n = scene.nodes[id];
    if (!n) continue;
    const current = Boolean(n.locked);
    if (current === locked) continue;
    if (locked) n.locked = true;
    else delete n.locked;
    changed = true;
  }
  return changed;
}

/** 切换一组节点的锁定状态：只要有一个未锁定就全部锁定，否则全部解锁。返回切换后的锁定状态。 */
export function toggleNodesLocked(scene: Scene, ids: string[]): boolean {
  const targets = ids.filter((id) => id !== scene.root && Boolean(scene.nodes[id]));
  if (targets.length === 0) return false;
  const shouldLock = targets.some((id) => !scene.nodes[id].locked);
  setNodesLocked(scene, targets, shouldLock);
  return shouldLock;
}

// ---------- 旋转 ----------

/** 把角度规整到 (-180, 180] 的整数度数。 */
export function normalizeRotation(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  let a = Math.round(deg) % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a === 0 ? 0 : a;
}

/**
 * 绕中心点拖动旋转手柄时计算新角度。
 * snap15 为真（按住 Shift）时按 15 度取整。
 */
export function computeRotationAngle(
  center: Point,
  pointer: Point,
  startPointer?: Point,
  initialRotation = 0,
  snap15 = false,
): number {
  const currentAngle = (Math.atan2(pointer.y - center.y, pointer.x - center.x) * 180) / Math.PI;
  if (!startPointer) {
    let next = currentAngle + 90;
    if (snap15) next = Math.round(next / 15) * 15;
    return normalizeRotation(next);
  }
  const startAngle = (Math.atan2(startPointer.y - center.y, startPointer.x - center.x) * 180) / Math.PI;
  let next = initialRotation + (currentAngle - startAngle);
  if (snap15) next = Math.round(next / 15) * 15;
  return normalizeRotation(next);
}

/** 给节点写入旋转角度；0 度时删掉字段以保持 scene.json 干净。 */
export function setNodeRotation(node: SceneNode, deg: number): number {
  const angle = normalizeRotation(deg);
  if (angle === 0) delete node.rotation;
  else node.rotation = angle;
  return angle;
}

/** 把点 p 绕 center 顺时针旋转 deg 度。 */
export function rotatePoint(p: Point, center: Point, deg: number): Point {
  if (!deg) return { x: p.x, y: p.y };
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

/** 判断点 pt 是否落在顺时针旋转了 deg 度的矩形 rect 内。 */
export function pointInRotatedRect(pt: Point, rect: Rect, deg = 0): boolean {
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const local = deg ? rotatePoint(pt, center, -deg) : pt;
  return local.x >= rect.x && local.x <= rect.x + rect.width && local.y >= rect.y && local.y <= rect.y + rect.height;
}

// ---------- 缩放与多选整体缩放 ----------

/**
 * 拖动八个方向手柄计算新的外框。
 * keepAspect 为真且拖的是四角手柄时保持原长宽比。
 */
export function computeResizeBox(
  orig: Rect,
  handle: string,
  dx: number,
  dy: number,
  keepAspect = false,
  minSize = MIN_NODE_SIZE,
): Rect {
  let width = orig.width;
  let height = orig.height;
  if (handle.includes("e")) width = orig.width + dx;
  if (handle.includes("w")) width = orig.width - dx;
  if (handle.includes("s")) height = orig.height + dy;
  if (handle.includes("n")) height = orig.height - dy;
  if (keepAspect && handle.length === 2) {
    const ratio = orig.width / Math.max(1, orig.height);
    if (Math.abs(width / Math.max(1, orig.width)) >= Math.abs(height / Math.max(1, orig.height))) {
      height = width / ratio;
    } else {
      width = height * ratio;
    }
  }
  width = Math.max(minSize, width);
  height = Math.max(minSize, height);
  return {
    x: orig.x + (handle.includes("w") ? orig.width - width : 0),
    y: orig.y + (handle.includes("n") ? orig.height - height : 0),
    width,
    height,
  };
}

export interface MultiResizeItem {
  id: string;
  abs: Rect;
  parentOrigin: Point;
  isLine?: boolean;
  lineProps?: Record<string, Value>;
}

export interface ScaledNodeResult {
  x: number;
  y: number;
  width: number;
  height: number;
  props?: Record<string, Value>;
}

const numVal = (v: Value | undefined, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

/**
 * 多选整体缩放：按整体外框从 startBounds 到 nextBounds 的比例，
 * 缩放每个选中节点的位置和宽高（以及未挂接线条的端点与拐点）。
 */
export function scaleGroupItems(
  items: MultiResizeItem[],
  startBounds: Rect,
  nextBounds: Rect,
  minSize = MIN_NODE_SIZE,
): Map<string, ScaledNodeResult> {
  const sx = startBounds.width > 0 ? nextBounds.width / startBounds.width : 1;
  const sy = startBounds.height > 0 ? nextBounds.height / startBounds.height : 1;
  const mapX = (ax: number) => nextBounds.x + (ax - startBounds.x) * sx;
  const mapY = (ay: number) => nextBounds.y + (ay - startBounds.y) * sy;

  const out = new Map<string, ScaledNodeResult>();
  for (const item of items) {
    const nx = mapX(item.abs.x);
    const ny = mapY(item.abs.y);
    const nw = Math.max(minSize, Math.round(item.abs.width * sx));
    const nh = Math.max(minSize, Math.round(item.abs.height * sy));
    const result: ScaledNodeResult = {
      x: Math.round(nx - item.parentOrigin.x),
      y: Math.round(ny - item.parentOrigin.y),
      width: nw,
      height: nh,
    };
    if (item.isLine && item.lineProps) {
      const p = { ...item.lineProps };
      const ox = item.parentOrigin.x;
      const oy = item.parentOrigin.y;
      if (!p.startNode) {
        p.x1 = Math.round(mapX(ox + numVal(p.x1, 0)) - ox);
        p.y1 = Math.round(mapY(oy + numVal(p.y1, 0)) - oy);
      }
      if (!p.endNode) {
        p.x2 = Math.round(mapX(ox + numVal(p.x2, 160)) - ox);
        p.y2 = Math.round(mapY(oy + numVal(p.y2, 0)) - oy);
      }
      const bends = parseBends(p.bends);
      if (bends.length > 0) {
        p.bends = formatBends(
          bends.map((b) => ({
            x: mapX(ox + b.x) - ox,
            y: mapY(oy + b.y) - oy,
          })),
        );
      }
      result.props = p;
    }
    out.set(item.id, result);
  }
  return out;
}

/** 直接在 Scene 上对多选节点执行整体缩放，返回缩放后的整体外框。 */
export function applyGroupResize(
  scene: Scene,
  ids: string[],
  handle: string,
  dx: number,
  dy: number,
  keepAspect = false,
  minSize = MIN_NODE_SIZE,
): Rect | null {
  const unlocked = filterUnlocked(scene, ids);
  if (unlocked.length === 0) return null;
  const items: MultiResizeItem[] = unlocked.map((id) => {
    const n = scene.nodes[id];
    return {
      id,
      abs: absRectInScene(scene, id),
      parentOrigin: parentOriginInScene(scene, id),
      isLine: n.type === "Line",
      lineProps: n.type === "Line" ? { ...n.props } : undefined,
    };
  });
  const startBounds = unionRectOf(items.map((item) => item.abs));
  if (!startBounds) return null;
  const nextBounds = computeResizeBox(startBounds, handle, dx, dy, keepAspect, minSize);
  const scaled = scaleGroupItems(items, startBounds, nextBounds, minSize);
  for (const [id, res] of scaled) {
    const n = scene.nodes[id];
    if (!n) continue;
    n.x = res.x;
    n.y = res.y;
    n.width = res.width;
    n.height = res.height;
    if (res.props) n.props = res.props;
  }
  return nextBounds;
}

// ---------- 对齐和分布 ----------

export type AlignKind = "left" | "centerH" | "right" | "top" | "centerV" | "bottom";
export type DistributeAxis = "horizontal" | "vertical";

export interface AlignItem {
  id: string;
  rect: Rect;
  parentOrigin?: Point;
}

/**
 * 计算一组方框对齐后的位置（返回相对于各自 parentOrigin 的 x、y）。
 * 未给 referenceBounds 时，以这组方框的合围外框为基准。
 */
export function alignRects(
  items: AlignItem[],
  kind: AlignKind,
  referenceBounds?: Rect,
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  if (items.length === 0) return result;
  const bounds = referenceBounds ?? unionRectOf(items.map((item) => item.rect))!;
  for (const item of items) {
    const origin = item.parentOrigin ?? { x: 0, y: 0 };
    let absX = item.rect.x;
    let absY = item.rect.y;
    switch (kind) {
      case "left":
        absX = bounds.x;
        break;
      case "centerH":
        absX = bounds.x + bounds.width / 2 - item.rect.width / 2;
        break;
      case "right":
        absX = bounds.x + bounds.width - item.rect.width;
        break;
      case "top":
        absY = bounds.y;
        break;
      case "centerV":
        absY = bounds.y + bounds.height / 2 - item.rect.height / 2;
        break;
      case "bottom":
        absY = bounds.y + bounds.height - item.rect.height;
        break;
    }
    result.set(item.id, {
      x: Math.round(absX - origin.x),
      y: Math.round(absY - origin.y),
    });
  }
  return result;
}

/**
 * 计算一组方框（至少 3 个）在水平或垂直方向等距分布后的位置。
 * 最左/最上与最右/最下的外沿保持不动，中间各节点的间距相等。
 */
export function distributeRects(
  items: AlignItem[],
  axis: DistributeAxis,
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  if (items.length < 3) {
    for (const item of items) {
      const origin = item.parentOrigin ?? { x: 0, y: 0 };
      result.set(item.id, { x: Math.round(item.rect.x - origin.x), y: Math.round(item.rect.y - origin.y) });
    }
    return result;
  }
  const startOf = (r: Rect) => (axis === "horizontal" ? r.x : r.y);
  const sizeOf = (r: Rect) => (axis === "horizontal" ? r.width : r.height);
  const centerOf = (r: Rect) => startOf(r) + sizeOf(r) / 2;

  const sorted = [...items].sort((a, b) => centerOf(a.rect) - centerOf(b.rect) || startOf(a.rect) - startOf(b.rect));
  const minStart = Math.min(...sorted.map((item) => startOf(item.rect)));
  const maxEnd = Math.max(...sorted.map((item) => startOf(item.rect) + sizeOf(item.rect)));
  const totalSize = sorted.reduce((sum, item) => sum + sizeOf(item.rect), 0);
  const gap = (maxEnd - minStart - totalSize) / (sorted.length - 1);

  let cursor = minStart;
  for (const item of sorted) {
    const origin = item.parentOrigin ?? { x: 0, y: 0 };
    const absX = axis === "horizontal" ? cursor : item.rect.x;
    const absY = axis === "vertical" ? cursor : item.rect.y;
    result.set(item.id, {
      x: Math.round(absX - origin.x),
      y: Math.round(absY - origin.y),
    });
    cursor += sizeOf(item.rect) + gap;
  }
  return result;
}

/** 在 Scene 上对齐选中的节点（单选时相对于父容器对齐，多选时相对于选中外框对齐）。 */
export function alignSceneNodes(scene: Scene, ids: string[], kind: AlignKind): boolean {
  const unlocked = filterUnlocked(scene, ids).filter((id) => scene.nodes[id]?.type !== "Line");
  if (unlocked.length === 0) return false;
  const items: AlignItem[] = unlocked.map((id) => ({
    id,
    rect: absRectInScene(scene, id),
    parentOrigin: parentOriginInScene(scene, id),
  }));
  let referenceBounds: Rect | undefined;
  if (items.length === 1) {
    const parentId = parentOfInScene(scene, items[0].id) ?? scene.root;
    referenceBounds =
      parentId === scene.root
        ? { x: 0, y: 0, width: scene.nodes[scene.root].width, height: scene.nodes[scene.root].height }
        : absRectInScene(scene, parentId);
  }
  const next = alignRects(items, kind, referenceBounds);
  let changed = false;
  for (const [id, pos] of next) {
    const n = scene.nodes[id];
    if (!n) continue;
    if ((n.x ?? 0) !== pos.x || (n.y ?? 0) !== pos.y) {
      n.x = pos.x;
      n.y = pos.y;
      changed = true;
    }
  }
  return changed;
}

/** 在 Scene 上等距分布选中的节点（至少 3 个未锁定的非线条节点）。 */
export function distributeSceneNodes(scene: Scene, ids: string[], axis: DistributeAxis): boolean {
  const unlocked = filterUnlocked(scene, ids).filter((id) => scene.nodes[id]?.type !== "Line");
  if (unlocked.length < 3) return false;
  const items: AlignItem[] = unlocked.map((id) => ({
    id,
    rect: absRectInScene(scene, id),
    parentOrigin: parentOriginInScene(scene, id),
  }));
  const next = distributeRects(items, axis);
  let changed = false;
  for (const [id, pos] of next) {
    const n = scene.nodes[id];
    if (!n) continue;
    if ((n.x ?? 0) !== pos.x || (n.y ?? 0) !== pos.y) {
      n.x = pos.x;
      n.y = pos.y;
      changed = true;
    }
  }
  return changed;
}

// ---------- 直线和曲线拐点 ----------

/** 在线条的 props.bends 中第 segmentIndex 段插入一个拐点（相对于父节点的坐标）。 */
export function addBendToLine(
  props: Record<string, Value> | undefined,
  segmentIndex: number,
  point: Point,
  origin: Point = { x: 0, y: 0 },
): Record<string, Value> {
  const current = parseBends(props?.bends);
  const next = insertLineBend(current, segmentIndex, { x: point.x - origin.x, y: point.y - origin.y });
  return { ...(props ?? {}), bends: formatBends(next) };
}

/** 移动线条的 props.bends 中第 bendIndex 个拐点。 */
export function moveBendOnLine(
  props: Record<string, Value> | undefined,
  bendIndex: number,
  point: Point,
  origin: Point = { x: 0, y: 0 },
): Record<string, Value> {
  const current = parseBends(props?.bends);
  const next = updateLineBend(current, bendIndex, { x: point.x - origin.x, y: point.y - origin.y });
  return { ...(props ?? {}), bends: formatBends(next) };
}

/** 删除线条的 props.bends 中第 bendIndex 个拐点。 */
export function deleteBendFromLine(props: Record<string, Value> | undefined, bendIndex: number): Record<string, Value> {
  const current = parseBends(props?.bends);
  const next = removeLineBend(current, bendIndex);
  const copy: Record<string, Value> = { ...(props ?? {}) };
  if (next.length > 0) copy.bends = formatBends(next);
  else delete copy.bends;
  return copy;
}
