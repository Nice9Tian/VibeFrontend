// 预览模式下的翻书分屏：把每个页面里的每张纸按书的页码配成左右两页一屏，像拿着装订好的书一页一页翻。
// 纯数据计算，不碰网页和文件系统，预览界面和命令行测试共用。
import type { Scene } from "./model.ts";
import { coverWrapId, sheetPageNumbers } from "./pages.ts";

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

export type BookDirection = "ltr" | "rtl";

function viewLabel(left: BookLeaf | null, right: BookLeaf | null, wrap: boolean, maxPage: number): string {
  if (left && right) {
    return `第 ${left.page}–${right.page} 页`;
  }
  const single = (left ?? right)!;
  if (wrap && single.page === 1) return "封面";
  if (wrap && single.page === maxPage) return "封底";
  return `第 ${single.page} 页`;
}

/** 按页码把画布里的全部纸排成一屏一屏的翻书视图；没有页面时返回空数组。 */
export function bookViews(scene: Scene, options?: { direction?: BookDirection }): BookView[] {
  const pageMap = sheetPageNumbers(scene);
  if (pageMap.size === 0) return [];

  const byPage = new Map<number, BookLeaf>();
  let maxPage = 0;
  for (const [board, pages] of pageMap) {
    for (let sheet = 0; sheet < pages.length; sheet++) {
      const page = pages[sheet];
      if (typeof page === "number" && Number.isFinite(page) && page >= 1) {
        byPage.set(page, { board, sheet, page });
        if (page > maxPage) maxPage = page;
      }
    }
  }
  if (maxPage <= 0) return [];

  const rtl = options?.direction === "rtl";
  // 和页码一样按 pages.ts 认包封：写了 cover: "wrap" 而且第一个页面真是两张纸拼的，才叫封面、封底
  const wrap = coverWrapId(scene) !== null;
  const views: BookView[] = [];

  const pushSpread = (ltrLeft: BookLeaf | null, ltrRight: BookLeaf | null) => {
    const left = rtl ? ltrRight : ltrLeft;
    const right = rtl ? ltrLeft : ltrRight;
    if (!left && !right) return;
    views.push({
      left,
      right,
      label: viewLabel(left, right, wrap, maxPage),
    });
  };

  pushSpread(null, byPage.get(1) ?? null);
  for (let even = 2; even <= maxPage; even += 2) {
    const evenLeaf = byPage.get(even) ?? null;
    const oddLeaf = even + 1 <= maxPage ? (byPage.get(even + 1) ?? null) : null;
    pushSpread(evenLeaf, oddLeaf);
  }

  return views;
}

/** 找到第一个含有指定页面的翻书视图下标；找不到时返回 0。 */
export function bookViewIndexOfBoard(views: BookView[], boardId: string): number {
  const index = views.findIndex((v) => v.left?.board === boardId || v.right?.board === boardId);
  return index >= 0 ? index : 0;
}

/** 找到含有指定页码的翻书视图下标；找不到时返回 0。 */
export function bookViewIndexOfPage(views: BookView[], page: number): number {
  const index = views.findIndex((v) => v.left?.page === page || v.right?.page === page);
  return index >= 0 ? index : 0;
}
