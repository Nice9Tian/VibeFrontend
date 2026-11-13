// 预览时像翻书一样一屏一屏看：哪几面纸在同一屏、谁在左谁在右。
// 跨页（两张纸拼成的页面）按设计的样子一屏看完；单页按页码配对，奇数页在右、偶数页在左，像装订好的书；
// 包封（scene.cover = "wrap"）的封面单独在第一屏的右边，封底单独在最后一屏的左边。
// 纯数据计算，不碰网页和文件系统，预览界面和命令行测试共用。
import type { Scene } from "./model.ts";
import { coverWrapId, pageIds, sheetPageNumbers } from "./pages.ts";

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
