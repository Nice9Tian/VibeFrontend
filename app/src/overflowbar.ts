// 一排控件放不下时，把放不下的收进“…”弹层。收进去的是控件本身，下拉框、输入框照常能用。

export interface OverflowOptions {
  /** 这一排最多能占多宽 */
  limit(): number;
  /** 这个元素大小变了就重新排一次 */
  watch: Element;
  /** 必须留在外面的控件，例如当前页签 */
  keep?(item: HTMLElement): boolean;
  /** 在弹层里点了东西就关上；要连续操作的工具栏不关 */
  closeOnPick?: boolean;
}

/** 给一排控件加上收纳，返回重新排一次的函数：内容变了之后调用。 */
export function overflowBar(bar: HTMLElement, options: OverflowOptions): () => void {
  const more = document.createElement("button");
  more.type = "button";
  more.className = "tool overflow-more";
  more.textContent = "…";
  more.title = "更多";
  more.hidden = true;
  const panel = document.createElement("div");
  panel.className = "overflow-panel";
  panel.hidden = true;
  // 收进弹层的控件原来的位置，放回去时用
  const marks = new Map<HTMLElement, Comment>();

  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    more.setAttribute("aria-expanded", String(open));
    if (!open) return;
    const button = more.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(button.right, window.innerWidth - 8) - panel.offsetWidth)}px`;
    panel.style.top = `${button.bottom + 4}px`;
  };

  const usedWidth = () => {
    const shown = [...bar.children].filter((el): el is HTMLElement => el !== panel && !(el as HTMLElement).hidden);
    const last = shown[shown.length - 1];
    if (!last) return 0;
    const style = getComputedStyle(bar);
    return last.getBoundingClientRect().right - bar.getBoundingClientRect().left + parseFloat(style.paddingRight) + parseFloat(style.borderRightWidth);
  };

  const collapse = (item: HTMLElement) => {
    const mark = document.createComment("");
    item.replaceWith(mark);
    marks.set(item, mark);
    panel.prepend(item);
  };

  const fit = () => {
    if (bar.hidden) return;
    // 这一排可能刚被整个重建过，原来的位置没了的控件就是旧的，不用放回去
    for (const [item, mark] of marks) {
      if (mark.parentNode === bar) mark.replaceWith(item);
      else item.remove();
    }
    marks.clear();
    bar.append(more, panel);
    more.hidden = true;
    const limit = options.limit();
    if (usedWidth() <= limit) {
      setOpen(false);
      return;
    }
    more.hidden = false;
    const items = [...bar.children].filter((el): el is HTMLElement => el !== more && el !== panel && !(el as HTMLElement).hidden);
    for (let i = items.length - 1; i >= 0 && usedWidth() > limit; i--) {
      if (!options.keep?.(items[i])) collapse(items[i]);
    }
    // 分隔线不留在一排的末尾
    const remaining = [...bar.children].filter((el) => el !== more && el !== panel);
    const tail = remaining[remaining.length - 1];
    if (tail instanceof HTMLElement && tail.classList.contains("tool-sep")) collapse(tail);
    if (!panel.hidden) setOpen(true);
  };

  more.addEventListener("click", () => setOpen(Boolean(panel.hidden)));
  panel.addEventListener("click", (e) => {
    if (options.closeOnPick && e.target !== panel) setOpen(false);
  });
  document.addEventListener("pointerdown", (e) => {
    if (!panel.hidden && !more.contains(e.target as Node) && !panel.contains(e.target as Node)) setOpen(false);
  });

  let frame = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(fit);
  }).observe(options.watch);
  // 字体加载完宽度会变
  void document.fonts?.ready.then(fit);
  return fit;
}
