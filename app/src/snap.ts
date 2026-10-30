// 自动吸附：移动、缩放、画图时，让位置贴到别的东西的边、中线，等间距的位置，或者网格上。
// 规则参照 Figma 的 Snap to objects：对齐时出现红色参考线；间距相等时出现粉色的间距标记。
// 坐标都是设计窗口里的绝对坐标。
import type { Rect } from "./shapes.ts";

export interface SnapOptions {
  /** 离多近就吸过去（像素） */
  threshold: number;
  /** 吸附到其他东西的边和中线 */
  objects: boolean;
  /** 吸附到网格；0 表示不吸 */
  grid: number;
}

/** 对齐参考线：axis 为 x 时是一条竖线，位置是 pos，从 from 画到 to。 */
export interface AlignGuide {
  kind: "align";
  axis: "x" | "y";
  pos: number;
  from: number;
  to: number;
}

/** 等间距标记：一组长度相等的间隔，axis 为 x 时是横向的间隔。 */
export interface GapGuide {
  kind: "gap";
  axis: "x" | "y";
  size: number;
  /** 每一段间隔：在 axis 方向从 start 到 end，在另一个方向的位置是 at */
  segments: Array<{ start: number; end: number; at: number }>;
}

export type Guide = AlignGuide | GapGuide;

interface Candidate {
  /** 移动多少能对上 */
  delta: number;
  guides: Guide[];
  /** 对齐优先于间距，间距优先于网格 */
  rank: number;
}

const edges = (r: Rect, axis: "x" | "y"): number[] =>
  axis === "x" ? [r.x, r.x + r.width / 2, r.x + r.width] : [r.y, r.y + r.height / 2, r.y + r.height];

const span = (r: Rect, axis: "x" | "y"): [number, number] => (axis === "x" ? [r.y, r.y + r.height] : [r.x, r.x + r.width]);

function better(a: Candidate | null, b: Candidate): Candidate {
  if (!a) return b;
  const da = Math.abs(a.delta);
  const db = Math.abs(b.delta);
  if (Math.abs(da - db) < 0.01) return b.rank < a.rank ? b : a;
  return db < da ? b : a;
}

/**
 * 一条轴上的吸附。lines 是移动的东西在这条轴上哪几条线参与吸附（例如左边、中线、右边），
 * 返回挪动多少，以及要画的参考线。
 */
function snapAxis(moving: Rect, lines: number[], others: Rect[], axis: "x" | "y", options: SnapOptions, allowGaps: boolean): Candidate | null {
  let best: Candidate | null = null;
  if (options.objects) {
    // 1. 对齐：边对边、中线对中线、边对中线都算
    for (const other of others) {
      for (const target of edges(other, axis)) {
        for (const line of lines) {
          const delta = target - line;
          if (Math.abs(delta) > options.threshold) continue;
          const [a1, a2] = span(moving, axis);
          const [b1, b2] = span(other, axis);
          best = better(best, {
            delta,
            rank: 0,
            guides: [{ kind: "align", axis, pos: target, from: Math.min(a1, b1), to: Math.max(a2, b2) }],
          });
        }
      }
    }
    // 2. 等间距：和同一行（或同一列）里已有的间隔一样大，或者正好在两个东西中间
    if (allowGaps) {
      const gap = snapGap(moving, others, axis, options.threshold);
      if (gap) best = better(best, gap);
    }
  }
  // 3. 网格：只有对不上别的东西时才用
  // 网格按第一条线（左边或上边）对齐，和 Figma 的 Snap to pixel grid 一样
  if (options.grid > 0 && !best && lines.length > 0) {
    const target = Math.round(lines[0] / options.grid) * options.grid;
    best = { delta: target - lines[0], rank: 2, guides: [] };
  }
  return best;
}

function overlaps(a: Rect, b: Rect, axis: "x" | "y"): boolean {
  const [a1, a2] = span(a, axis);
  const [b1, b2] = span(b, axis);
  return Math.min(a2, b2) - Math.max(a1, b1) > 0;
}

function snapGap(moving: Rect, others: Rect[], axis: "x" | "y", threshold: number): Candidate | null {
  const start = (r: Rect) => (axis === "x" ? r.x : r.y);
  const size = (r: Rect) => (axis === "x" ? r.width : r.height);
  const end = (r: Rect) => start(r) + size(r);
  const at = (r: Rect) => (axis === "x" ? r.y + r.height / 2 : r.x + r.width / 2);
  // 和移动的东西在同一行（axis 为 x）或同一列的那些
  const row = others.filter((other) => overlaps(other, moving, axis)).sort((a, b) => start(a) - start(b));
  if (row.length === 0) return null;
  const before = row.filter((r) => end(r) <= start(moving) + threshold).pop();
  const after = row.find((r) => start(r) >= end(moving) - threshold);
  let best: Candidate | null = null;

  // 正好在前后两个东西的中间
  if (before && after) {
    const space = start(after) - end(before) - size(moving);
    if (space >= 0) {
      const target = end(before) + space / 2;
      const delta = target - start(moving);
      if (Math.abs(delta) <= threshold) {
        const g = space / 2;
        const segAt = at(moving);
        best = better(best, {
          delta,
          rank: 1,
          guides: [{ kind: "gap", axis, size: g, segments: [{ start: end(before), end: end(before) + g, at: segAt }, { start: target + size(moving), end: start(after), at: segAt }] }],
        });
      }
    }
  }

  // 和这一行里已有的某个间隔一样大
  const pairs: Array<{ a: Rect; b: Rect; g: number }> = [];
  for (let i = 0; i < row.length; i++) {
    for (let j = 0; j < row.length; j++) {
      if (i === j) continue;
      const g = start(row[j]) - end(row[i]);
      if (g > 0 && overlaps(row[i], row[j], axis)) pairs.push({ a: row[i], b: row[j], g });
    }
  }
  for (const { a, b, g } of pairs) {
    if (before) {
      const target = end(before) + g;
      const delta = target - start(moving);
      if (Math.abs(delta) <= threshold) {
        best = better(best, {
          delta,
          rank: 1,
          guides: [{
            kind: "gap", axis, size: g,
            segments: [{ start: end(a), end: start(b), at: at(a) }, { start: end(before), end: target, at: at(moving) }],
          }],
        });
      }
    }
    if (after) {
      const target = start(after) - g - size(moving);
      const delta = target - start(moving);
      if (Math.abs(delta) <= threshold) {
        best = better(best, {
          delta,
          rank: 1,
          guides: [{
            kind: "gap", axis, size: g,
            segments: [{ start: end(a), end: start(b), at: at(a) }, { start: target + size(moving), end: start(after), at: at(moving) }],
          }],
        });
      }
    }
  }
  return best;
}

/** 移动一个方框：返回吸附后的位置和参考线。 */
export function snapMove(moving: Rect, others: Rect[], options: SnapOptions): { x: number; y: number; guides: Guide[] } {
  const sx = snapAxis(moving, edges(moving, "x"), others, "x", options, true);
  const sy = snapAxis(moving, edges(moving, "y"), others, "y", options, true);
  const x = moving.x + (sx?.delta ?? 0);
  const y = moving.y + (sy?.delta ?? 0);
  const placed = { x, y, width: moving.width, height: moving.height };
  return { x, y, guides: refreshGuides(placed, [...(sx?.guides ?? []), ...(sy?.guides ?? [])]) };
}

/**
 * 拖动方框的某几条边来缩放：handle 里有 w、e、n、s 表示动的是哪几条边。
 * 返回吸附后的方框和参考线。
 */
export function snapResize(box: Rect, handle: string, others: Rect[], options: SnapOptions): { rect: Rect; guides: Guide[] } {
  let { x, y, width, height } = box;
  const guides: Guide[] = [];
  if (handle.includes("e") || handle.includes("w")) {
    const line = handle.includes("e") ? x + width : x;
    const s = snapAxis(box, [line], others, "x", options, false);
    if (s) {
      if (handle.includes("e")) width += s.delta;
      else {
        x += s.delta;
        width -= s.delta;
      }
      guides.push(...s.guides);
    }
  }
  if (handle.includes("n") || handle.includes("s")) {
    const line = handle.includes("s") ? y + height : y;
    const s = snapAxis(box, [line], others, "y", options, false);
    if (s) {
      if (handle.includes("s")) height += s.delta;
      else {
        y += s.delta;
        height -= s.delta;
      }
      guides.push(...s.guides);
    }
  }
  const rect = { x, y, width, height };
  return { rect, guides: refreshGuides(rect, guides) };
}

/** 一个点（画图的起点和终点、线的端点）的吸附。 */
export function snapPoint(x: number, y: number, others: Rect[], options: SnapOptions): { x: number; y: number; guides: Guide[] } {
  const point = { x, y, width: 0, height: 0 };
  const sx = snapAxis(point, [x], others, "x", options, false);
  const sy = snapAxis(point, [y], others, "y", options, false);
  const nx = x + (sx?.delta ?? 0);
  const ny = y + (sy?.delta ?? 0);
  return { x: nx, y: ny, guides: refreshGuides({ x: nx, y: ny, width: 0, height: 0 }, [...(sx?.guides ?? []), ...(sy?.guides ?? [])]) };
}

/** 吸附之后另一条轴也可能动了，对齐参考线的长度按最终位置重新算一遍。 */
function refreshGuides(placed: Rect, guides: Guide[]): Guide[] {
  return guides.map((guide) => {
    if (guide.kind !== "align") return guide;
    const [a1, a2] = span(placed, guide.axis);
    return { ...guide, from: Math.min(guide.from, a1), to: Math.max(guide.to, a2) };
  });
}
