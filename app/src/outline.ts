// 闭合轮廓（一圈点）上的几何计算：纯函数，不碰 DOM 和场景。
// 轮廓和查询点要在同一个坐标系里。编辑器在节点自己的坐标系里算，只把结果换算到画布上：
// 节点到画布只有旋转和平移，距离和交点在两边一样，这样每次不用把整圈点都换算一遍。

export type Point = { x: number; y: number };

/** 从 origin 朝 direction 射出去，和闭合轮廓最远的那个交点。没有交点时返回 null。 */
export function farthestRayHit(outline: Point[], origin: Point, direction: Point): Point | null {
  let best: Point | null = null;
  let bestT = -1;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const denominator = direction.x * ey - direction.y * ex;
    if (Math.abs(denominator) < 1e-9) continue;
    const t = ((a.x - origin.x) * ey - (a.y - origin.y) * ex) / denominator;
    const u = ((a.x - origin.x) * direction.y - (a.y - origin.y) * direction.x) / denominator;
    if (t > 0 && u >= 0 && u <= 1 && t > bestT) {
      bestT = t;
      best = { x: origin.x + direction.x * t, y: origin.y + direction.y * t };
    }
  }
  return best;
}

/** 闭合轮廓上离 p 最近的点和距离。轮廓为空时返回 null。 */
export function nearestOnOutline(outline: Point[], p: Point): { point: Point; distance: number } | null {
  let best: { point: Point; distance: number } | null = null;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length2 = dx * dx + dy * dy;
    const t = length2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2)) : 0;
    const q = { x: a.x + dx * t, y: a.y + dy * t };
    const distance = Math.hypot(q.x - p.x, q.y - p.y);
    if (!best || distance < best.distance) best = { point: q, distance };
  }
  return best;
}
