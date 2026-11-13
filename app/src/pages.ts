// 平面设计的页面：一个页面（画板）怎么拆成几张纸、版心在哪、中缝在哪，以及加页、删页、调页序。
// 出血（成品边缘外多印出去的部分）还没有做：页面外面的内容现在一律裁掉。
// 这里只有计算和对画布数据的修改，不碰网页，编辑器、检查和导出共用。
import type { Value } from "./expr.ts";
import { allWindowIds, childrenOfNode, removeNodeReferences, roundInScene, type Scene, type SceneNode } from "./model.ts";

export interface PageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageGeometry {
  /** 这个页面由几张纸左右拼成：1 是单页，2 是跨页 */
  sheets: number;
  sheetWidth: number;
  /** 每张纸的方框，从左到右 */
  sheetRects: PageRect[];
  /** 每张纸的版心（去掉四边的边距），从左到右 */
  liveAreas: PageRect[];
  /** 中缝的位置（相邻两张纸之间），x 坐标 */
  folds: number[];
}

const numberProp = (node: SceneNode, key: string, fallback: number): number => {
  const value: Value | undefined = node.props?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

/** 页面由几张纸拼成。写得不对（小于 1、不是整数）就当 1。 */
export function sheetCount(node: SceneNode): number {
  const raw = Math.round(numberProp(node, "sheets", 1));
  return raw >= 1 && raw <= 16 ? raw : 1;
}

/**
 * 一个页面的版面：每张纸的方框和版心、中缝、出血。
 * 靠中缝的一边用“内边距”，靠外的一边用“外边距”；单页没有中缝，左右都用外边距。
 */
export function pageGeometry(node: SceneNode): PageGeometry {
  const sheets = sheetCount(node);
  const sheetWidth = node.width / sheets;
  const top = Math.max(0, numberProp(node, "marginTop", 0));
  const bottom = Math.max(0, numberProp(node, "marginBottom", 0));
  const outer = Math.max(0, numberProp(node, "marginOuter", 0));
  const inner = Math.max(0, numberProp(node, "marginInner", 0));
  const sheetRects: PageRect[] = [];
  const liveAreas: PageRect[] = [];
  const folds: number[] = [];
  for (let i = 0; i < sheets; i++) {
    const x = i * sheetWidth;
    const left = sheets === 1 || i === 0 ? outer : inner;
    const right = sheets === 1 || i === sheets - 1 ? outer : inner;
    sheetRects.push({ x, y: 0, width: sheetWidth, height: node.height });
    liveAreas.push({
      x: x + left,
      y: top,
      width: Math.max(0, sheetWidth - left - right),
      height: Math.max(0, node.height - top - bottom),
    });
    if (i > 0) folds.push(x);
  }
  return { sheets, sheetWidth, sheetRects, liveAreas, folds };
}

/** 吸附时参考的方框：每张纸的边和它的版心。不是页面的画板没有。 */
export function pageGuideRects(scene: Scene, boardId: string): PageRect[] {
  const node = scene.nodes[boardId];
  if (!node || node.type !== "Page") return [];
  const geo = pageGeometry(node);
  const rects = [...geo.sheetRects];
  for (const live of geo.liveAreas) {
    if (live.width > 0 && live.height > 0) rects.push(live);
  }
  return rects;
}

/** 全部页面，按页序。 */
export function pageIds(scene: Scene): string[] {
  return allWindowIds(scene).filter((id) => scene.nodes[id]?.type === "Page");
}

/**
 * 包封页面的 ID：scene.cover 是 "wrap"，而且第一个页面正好由两张纸拼成（左封底、右封面）。
 * 写了 wrap 但第一个页面不是两张纸时不算，页码照顺序排，检查里会提示。
 */
export function coverWrapId(scene: Scene): string | null {
  if (scene.cover !== "wrap") return null;
  const first = pageIds(scene)[0];
  return first && sheetCount(scene.nodes[first]) === 2 ? first : null;
}

/**
 * 每个页面里每张纸是第几页（从 1 数起），从左到右。
 * 平常按页面顺序数下去；有包封时，包封的左半是最后一页、右半是第 1 页，后面的页面从第 2 页数起，
 * 这样翻开封面看到的是第 2–3 页这一版。
 */
export function sheetPageNumbers(scene: Scene): Map<string, number[]> {
  const ids = pageIds(scene);
  const wrap = coverWrapId(scene);
  const total = ids.reduce((sum, id) => sum + sheetCount(scene.nodes[id]), 0);
  const result = new Map<string, number[]>();
  let next = 1;
  for (const id of ids) {
    if (id === wrap) {
      result.set(id, [total, 1]);
      next = 2;
      continue;
    }
    const count = sheetCount(scene.nodes[id]);
    result.set(id, Array.from({ length: count }, (_, i) => next + i));
    next += count;
  }
  return result;
}

/** 这个页面的每张纸是第几页，从左到右；不是页面时为 null。 */
export function pageNumbers(scene: Scene, boardId: string): number[] | null {
  return sheetPageNumbers(scene).get(boardId) ?? null;
}

/** 页面在翻页条和标题上的名字，例如“第 3–4 页”；包封是“封底 + 封面”。 */
export function pageLabel(scene: Scene, boardId: string): string {
  const numbers = pageNumbers(scene, boardId);
  if (!numbers || numbers.length === 0) return boardId;
  if (boardId === coverWrapId(scene)) return "封底 + 封面";
  const first = numbers[0];
  const last = numbers[numbers.length - 1];
  return first === last ? `第 ${first} 页` : `第 ${first}–${last} 页`;
}

/** 一个节点下面的全部节点（含它自己）。 */
export function subtreeIds(scene: Scene, rootId: string): Set<string> {
  const found = new Set<string>();
  const visit = (id: string) => {
    if (found.has(id) || !scene.nodes[id]) return;
    found.add(id);
    for (const child of childrenOfNode(scene.nodes[id])) visit(child);
  };
  visit(rootId);
  return found;
}

function ensureBoards(scene: Scene): string[] {
  scene.boards = pageIds(scene);
  return scene.boards;
}

/**
 * 在 afterId 后面加一页空白页，尺寸、拼页数、边距和样式类照抄 afterId（没有 afterId 就加在最后，用 A4）。
 * 直接改 scene。newId 由调用方给，保证不和别的 ID 重复。
 */
export function addPage(scene: Scene, newId: string, afterId: string | null): void {
  const boards = ensureBoards(scene);
  const source = afterId ? scene.nodes[afterId] : undefined;
  const page: SceneNode = {
    type: "Page",
    width: source?.width ?? 210,
    height: source?.height ?? 297,
    children: [],
  };
  if (source?.props) page.props = JSON.parse(JSON.stringify(source.props)) as Record<string, Value>;
  scene.nodes[newId] = page;
  const at = afterId ? boards.indexOf(afterId) : -1;
  if (at >= 0) boards.splice(at + 1, 0, newId);
  else boards.push(newId);
  if (!scene.nodes[scene.root]) scene.root = boards[0];
}

/**
 * 删掉一页和它里面的全部东西。只剩一页时不删，返回 false。
 * 被删的是 root 时，root 改成剩下的第一页。直接改 scene。
 */
export function removePage(scene: Scene, id: string): boolean {
  const boards = ensureBoards(scene);
  if (!boards.includes(id) || boards.length <= 1) return false;
  const removed = subtreeIds(scene, id);
  removeNodeReferences(scene, removed);
  for (const each of removed) delete scene.nodes[each];
  scene.boards = boards.filter((each) => each !== id);
  if (scene.root === id) scene.root = scene.boards[0];
  return true;
}

/** 把一页往前（delta 为负）或往后挪。挪不动（已经在头或尾）返回 false。直接改 scene。 */
export function movePage(scene: Scene, id: string, delta: number): boolean {
  const boards = ensureBoards(scene);
  const from = boards.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= boards.length || delta === 0) return false;
  boards.splice(from, 1);
  boards.splice(to, 0, id);
  // root 始终是第一页，文件里才不会留着一个“既不是第一页、又没有别的意义”的 root
  scene.root = boards[0];
  return true;
}

/** 改页面的尺寸，取整到画布单位。直接改 scene。 */
export function resizePage(scene: Scene, id: string, width: number, height: number): boolean {
  const node = scene.nodes[id];
  if (!node || node.type !== "Page" || !(width > 0) || !(height > 0)) return false;
  node.width = roundInScene(scene, width);
  node.height = roundInScene(scene, height);
  return true;
}

/** 常用的纸张尺寸，毫米，竖放。 */
export const PAPER_SIZES: Array<{ name: string; width: number; height: number }> = [
  { name: "A5", width: 148, height: 210 },
  { name: "A4", width: 210, height: 297 },
  { name: "A3", width: 297, height: 420 },
  { name: "B5", width: 176, height: 250 },
  { name: "Letter", width: 215.9, height: 279.4 },
];
