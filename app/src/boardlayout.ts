// 编辑模式下所有页面在无限画布上的排列位置：从上往下排成一列，左右按书脊（装订线）对齐。
// 纯数据计算，不碰网页和文件系统，编辑器画布、坐标换算和命令行测试共用。
import { roundInScene, type Scene, type SceneNode } from "./model.ts";
import { pageGeometry, pageIds, sheetCount, sheetPageNumbers } from "./pages.ts";

export interface BoardPlace {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 这个页面的书脊（装订线）在画布上的 x */
  spine: number;
}

interface CachedLayout {
  key: string;
  list: BoardPlace[];
  places: Map<string, { x: number; y: number }>;
}

const layoutCache = new WeakMap<Scene, CachedLayout>();

/** 页面之间的垂直间距：取全部页面最大高度的 12%，没有页面时为 0。 */
export function boardGap(scene: Scene): number {
  const ids = pageIds(scene);
  if (ids.length === 0) return 0;
  let maxHeight = 0;
  for (const id of ids) {
    const h = scene.nodes[id]?.height ?? 0;
    if (h > maxHeight) maxHeight = h;
  }
  return roundInScene(scene, maxHeight * 0.12);
}

/** 页面内部书脊相对页面左边的距离：跨页取最中间的中缝，单页按奇偶页码放左或右。 */
function localSpineOffset(node: SceneNode, firstPageNumber: number | undefined): number {
  const geo = pageGeometry(node);
  if (geo.sheets >= 2) {
    const mid = node.width / 2;
    if (geo.sheets % 2 === 0) return mid;
    let best = geo.folds[0] ?? mid;
    let bestDist = Math.abs(best - mid);
    for (const fold of geo.folds) {
      const dist = Math.abs(fold - mid);
      if (dist < bestDist - 1e-9) {
        best = fold;
        bestDist = dist;
      }
    }
    return best;
  }
  if (firstPageNumber !== undefined && firstPageNumber % 2 === 0) {
    return node.width;
  }
  return 0;
}

function buildCacheKey(scene: Scene, ids: string[]): string {
  let key = `${scene.unit ?? "px"}|${scene.cover ?? ""}|${scene.root}`;
  for (const id of ids) {
    const n = scene.nodes[id];
    const hasX = typeof n.x === "number" && Number.isFinite(n.x) ? String(n.x) : "";
    const hasY = typeof n.y === "number" && Number.isFinite(n.y) ? String(n.y) : "";
    key += `;${id}:${n.width}x${n.height}:${sheetCount(n)}:${hasX},${hasY}`;
  }
  return key;
}

function ensureLayout(scene: Scene): CachedLayout {
  const ids = pageIds(scene);
  const key = buildCacheKey(scene, ids);
  const hit = layoutCache.get(scene);
  if (hit && hit.key === key) return hit;

  const list: BoardPlace[] = [];
  const places = new Map<string, { x: number; y: number }>();
  if (ids.length > 0) {
    const gap = boardGap(scene);
    const numbers = sheetPageNumbers(scene);
    let rootSpine = 0;
    let nextY = 0;

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const node = scene.nodes[id];
      const width = roundInScene(scene, node.width);
      const height = roundInScene(scene, node.height);
      const offset = localSpineOffset(node, numbers.get(id)?.[0]);

      if (i === 0) {
        const x = 0;
        const y = 0;
        const spine = roundInScene(scene, x + offset);
        rootSpine = spine;
        nextY = roundInScene(scene, y + height + gap);
        list.push({ id, x, y, width, height, spine });
        places.set(id, { x, y });
        continue;
      }

      const manual =
        typeof node.x === "number" &&
        Number.isFinite(node.x) &&
        typeof node.y === "number" &&
        Number.isFinite(node.y);

      if (manual) {
        const x = roundInScene(scene, node.x!);
        const y = roundInScene(scene, node.y!);
        const spine = roundInScene(scene, x + offset);
        list.push({ id, x, y, width, height, spine });
        places.set(id, { x, y });
      } else {
        const x = roundInScene(scene, rootSpine - offset);
        const y = nextY;
        const spine = roundInScene(scene, x + offset);
        nextY = roundInScene(scene, y + height + gap);
        list.push({ id, x, y, width, height, spine });
        places.set(id, { x, y });
      }
    }
  }

  // 坐标换算层（transform.ts）把根画板固定在原点：根页面不是页序第一页时（手改的 scene.json），整体挪到以它为原点
  const anchor = places.get(scene.root);
  if (anchor && (anchor.x !== 0 || anchor.y !== 0)) {
    for (const place of list) {
      place.x = roundInScene(scene, place.x - anchor.x);
      place.y = roundInScene(scene, place.y - anchor.y);
      place.spine = roundInScene(scene, place.spine - anchor.x);
      places.set(place.id, { x: place.x, y: place.y });
    }
  }
  const entry: CachedLayout = { key, list, places };
  layoutCache.set(scene, entry);
  return entry;
}

/** 算出全部页面在无限画布上的位置、尺寸和书脊坐标，按页序排列。 */
export function boardWorldLayout(scene: Scene): BoardPlace[] {
  return ensureLayout(scene).list.map((place) => ({ ...place }));
}

/** 某个页面在无限画布上的左上角坐标；不是页面的画板或找不到时返回 null。 */
export function boardWorldOrigin(scene: Scene, id: string): { x: number; y: number } | null {
  const origin = ensureLayout(scene).places.get(id);
  return origin ? { x: origin.x, y: origin.y } : null;
}

/** 全部页面合起来在无限画布上的外包框；没有页面时返回 null。 */
export function boardWorldBounds(scene: Scene): { x: number; y: number; width: number; height: number } | null {
  const { list } = ensureLayout(scene);
  if (list.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of list) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x + p.width > maxX) maxX = p.x + p.width;
    if (p.y + p.height > maxY) maxY = p.y + p.height;
  }
  return {
    x: roundInScene(scene, minX),
    y: roundInScene(scene, minY),
    width: roundInScene(scene, maxX - minX),
    height: roundInScene(scene, maxY - minY),
  };
}
