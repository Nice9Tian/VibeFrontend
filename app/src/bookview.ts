// 预览时像翻书一样一屏一屏看：哪几面纸在同一屏、谁在左谁在右。
// 跨页（两张纸拼成的页面）按设计的样子一屏看完；单页按页码配对，奇数页在右、偶数页在左，像装订好的书；
// 包封（scene.cover = "wrap"）的封面单独在第一屏的右边，封底单独在最后一屏的左边。
// 纯数据计算，不碰网页和文件系统，编辑器的预览、播放页（独立预览和导出的网页）和命令行测试共用。
import type { SheetPiece } from "./deviceframe.ts";
import type { DeviceId } from "./devices.ts";
import { toPx } from "./kinds.ts";
import { unitOf, type Scene } from "./model.ts";
import { coverWrapId, pageIds, sheetCount, sheetPageNumbers } from "./pages.ts";

export interface BookLeaf {
  /** 所在的页面 ID */
  board: string;
  /** 这页是页面里从左数第几张纸（0 起） */
  sheet: number;
  /** 书的页码（1 起） */
  page: number;
}

export interface BookView {
  left: BookLeaf | null;
  right: BookLeaf | null;
  label: string;
}

function viewLabel(left: BookLeaf | null, right: BookLeaf | null, wrap: boolean, lastPage: number): string {
  if (left && right) return `第 ${left.page}–${right.page} 页`;
  const single = (left ?? right)!;
  if (wrap && single.page === 1) return "封面";
  if (wrap && single.page === lastPage) return "封底";
  return `第 ${single.page} 页`;
}

/**
 * 全部页面排成一屏一屏的翻书视图；没有页面（界面设计）时返回空数组。
 * - 包封：第一屏只有封面（包封的右半），最后一屏只有封底（包封的左半）。
 * - 拼了两张以上纸的页面：按设计的样子，两张两张一屏（第 0、1 张一屏，第 2、3 张一屏……），落单的最后一张单独在左边。
 * - 单页：奇数页是右手页，和前面等着的偶数页凑成一屏（没有就单独一屏在右边）；偶数页先等着下一页，下一页不是单页就单独一屏在左边。
 */
export function bookViews(scene: Scene): BookView[] {
  const numbers = sheetPageNumbers(scene);
  const boards = pageIds(scene);
  if (boards.length === 0) return [];
  const wrapId = coverWrapId(scene);
  const lastPage = Math.max(0, ...[...numbers.values()].flat());
  const views: BookView[] = [];
  const push = (left: BookLeaf | null, right: BookLeaf | null) => {
    if (left || right) views.push({ left, right, label: viewLabel(left, right, wrapId !== null, lastPage) });
  };
  let waiting: BookLeaf | null = null; // 等着右手页的左手单页
  const flush = () => {
    if (waiting) push(waiting, null);
    waiting = null;
  };

  if (wrapId) push(null, { board: wrapId, sheet: 1, page: numbers.get(wrapId)?.[1] ?? 1 });
  for (const board of boards) {
    if (board === wrapId) continue;
    const pages = numbers.get(board) ?? [];
    if (pages.length >= 2) {
      flush();
      for (let s = 0; s < pages.length; s += 2) {
        const left = { board, sheet: s, page: pages[s] };
        const right = s + 1 < pages.length ? { board, sheet: s + 1, page: pages[s + 1] } : null;
        push(left, right);
      }
      continue;
    }
    if (pages.length === 0) continue;
    const leaf = { board, sheet: 0, page: pages[0] };
    if (leaf.page % 2 === 1) {
      push(waiting, leaf);
      waiting = null;
    } else {
      flush();
      waiting = leaf;
    }
  }
  flush();
  if (wrapId) push({ board: wrapId, sheet: 0, page: numbers.get(wrapId)?.[0] ?? lastPage }, null);
  return views;
}

/** 套着设备外框时的一屏：书和电脑一屏两页（跨页），手机一屏一页 */
export interface ScreenView {
  label: string;
  left: SheetPiece | null;
  right: SheetPiece | null;
  /** 这一屏主要是哪个页面 */
  board: string;
  /** 这一屏的页码，换设备时按它停在同一页 */
  pages: number[];
}

/** 一面纸：页面里从左数第几张纸、多大（CSS 像素） */
export function sheetPiece(scene: Scene, board: string, sheet: number): SheetPiece | null {
  const node = scene.nodes[board];
  if (!node) return null;
  const unit = unitOf(scene);
  const sheets = node.type === "Page" ? sheetCount(node) : 1;
  return { board, sheet, width: toPx(unit, node.width / sheets), height: toPx(unit, node.height) };
}

/**
 * 平面设计套着设备外框时一屏一屏怎么看：书和电脑按 bookViews 配页（一屏两页），手机把每一屏拆开、一屏一页。
 * 没有页面（界面设计）时返回空数组。
 */
export function deviceViews(scene: Scene, device: DeviceId): ScreenView[] {
  const book = bookViews(scene).map((v) => ({
    label: v.label,
    left: v.left ? sheetPiece(scene, v.left.board, v.left.sheet) : null,
    right: v.right ? sheetPiece(scene, v.right.board, v.right.sheet) : null,
    board: (v.left ?? v.right)!.board,
    pages: [v.left?.page, v.right?.page].filter((n): n is number => n !== undefined),
  }));
  if (device !== "phone") return book;
  return book.flatMap((v) =>
    [v.left, v.right]
      .filter((piece): piece is SheetPiece => piece !== null)
      .map((piece, i) => ({ label: v.left && v.right ? `第 ${v.pages[i]} 页` : v.label, left: null, right: piece, board: piece.board, pages: [v.pages[i]] })),
  );
}

/**
 * 一个页面当“在看的地方”：页码从小到大。换设备时按第一个页码找那一屏，
 * 所以包封（左封底、右封面，页码是 [最后一页, 1]）落在封面那一屏，不是封底。
 */
export function boardAnchor(scene: Scene, board: string): { board: string; pages: number[] } {
  return { board, pages: [...(sheetPageNumbers(scene).get(board) ?? [])].sort((a, b) => a - b) };
}

/**
 * 只放其中几个页面时（播放页的 ?board=）的每一屏：别的页面那一面换成空白，没有要放的页面的屏去掉；
 * 只剩一面的屏，页码和名字跟着只剩的那一面（“第 2–3 页”只放第 3 页时叫“第 3 页”）。
 */
export function playingViews(views: ScreenView[], playing: ReadonlySet<string>): ScreenView[] {
  const out: ScreenView[] = [];
  for (const v of views) {
    const left = v.left && playing.has(v.left.board) ? v.left : null;
    const right = v.right && playing.has(v.right.board) ? v.right : null;
    if (!left && !right) continue;
    if (left === v.left && right === v.right) {
      out.push(v);
      continue;
    }
    // 原来两面都有（pages 是 [左, 右]），去掉了一面
    const page = left ? v.pages[0] : v.pages[v.pages.length - 1];
    out.push({ label: page === undefined ? v.label : `第 ${page} 页`, left, right, board: (left ?? right)!.board, pages: page === undefined ? [] : [page] });
  }
  return out;
}

/** 换设备时停在同一页：先按页码找，找不到再按页面找；都找不到返回 0 */
export function screenIndexForAnchor(views: ScreenView[], anchor: { pages: number[]; board: string }): number {
  const page = anchor.pages[0];
  if (page !== undefined) {
    const byPage = views.findIndex((v) => v.pages.includes(page));
    if (byPage >= 0) return byPage;
  }
  const byBoard = views.findIndex((v) => v.board === anchor.board || v.left?.board === anchor.board || v.right?.board === anchor.board);
  return byBoard >= 0 ? byBoard : 0;
}

/** 第一个含有这个页面的视图；找不到返回 0。 */
export function bookViewIndexOfBoard(views: BookView[], boardId: string): number {
  const index = views.findIndex((v) => v.left?.board === boardId || v.right?.board === boardId);
  return index >= 0 ? index : 0;
}

/** 含有这个页码的视图；找不到返回 0。 */
export function bookViewIndexOfPage(views: BookView[], page: number): number {
  const index = views.findIndex((v) => v.left?.page === page || v.right?.page === page);
  return index >= 0 ? index : 0;
}
