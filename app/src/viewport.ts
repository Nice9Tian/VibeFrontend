// 设计窗口的视角：平移和缩放。参照 Figma 的操作：
//   按住鼠标中键拖动，或者按住空格再用左键拖动：平移
//   滚轮：上下平移；Shift + 滚轮：左右平移
//   Ctrl + 滚轮（触控板双指捏合也是这样传过来的）：以鼠标所在的点为中心缩放
//   Ctrl + =、Ctrl + -：放大、缩小；Ctrl + 0：回到 100%；Shift + 1：缩放到刚好装下整个窗口
//
// 做法：设计窗口（#stage-frame）放在一块比它大得多的画布（#stage-space）上，四周留出空白，
// 这样可以把视角移到窗口外面；缩放用 CSS 的 transform 把设计窗口整个放大缩小。
// 设计窗口里的坐标换算（屏幕坐标 → 设计窗口坐标）要除以 viewZoom()。

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
/** 设计窗口四周留出的空白（屏幕像素），平移时可以把视角挪到窗口外面 */
const MARGIN = 800;
/** 工具栏里的放大、缩小按钮每次走一档 */
const STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4];

let zoom = 1;
const listeners: Array<() => void> = [];

/** 当前的缩放比例。屏幕上的距离除以它，就是设计窗口里的距离。 */
export function viewZoom(): number {
  return zoom;
}

/** 缩放变化后要做的事（例如重新摆放浮在设计窗口上的东西）。 */
export function onZoomChange(listener: () => void): void {
  listeners.push(listener);
}

function $(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

function elements() {
  return { scroll: $("stage-scroll"), space: $("stage-space"), frame: $("stage-frame") };
}

/** 按当前的缩放比例摆放设计窗口，并撑开画布的大小。 */
function layout(): void {
  const { scroll, space, frame } = elements();
  const width = frame.offsetWidth * zoom;
  const height = frame.offsetHeight * zoom;
  // 画布至少有视口那么大，设计窗口比视口小时，居中放在空白里
  const spaceWidth = Math.max(width + MARGIN * 2, scroll.clientWidth);
  const spaceHeight = Math.max(height + MARGIN * 2, scroll.clientHeight);
  space.style.width = `${spaceWidth}px`;
  space.style.height = `${spaceHeight}px`;
  frame.style.left = `${(spaceWidth - width) / 2}px`;
  frame.style.top = `${(spaceHeight - height) / 2}px`;
  frame.style.transform = `scale(${zoom})`;
  space.style.setProperty("--vf-zoom", String(zoom));
  renderZoomBar();
}

/** 设计窗口左上角在画布上的位置（屏幕像素）。 */
function frameOrigin(): { x: number; y: number } {
  const { frame } = elements();
  return { x: parseFloat(frame.style.left) || 0, y: parseFloat(frame.style.top) || 0 };
}

/**
 * 缩放到 next，并让视口里 (clientX, clientY) 这一点下面的内容保持不动。
 * 没给点时以视口中心为准。
 */
export function setZoom(next: number, clientX?: number, clientY?: number): void {
  const { scroll } = elements();
  userMoved = true;
  const target = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
  if (Math.abs(target - zoom) < 1e-4) return;
  const box = scroll.getBoundingClientRect();
  const px = (clientX ?? box.left + box.width / 2) - box.left;
  const py = (clientY ?? box.top + box.height / 2) - box.top;
  // 这一点在设计窗口里的坐标
  const origin = frameOrigin();
  const contentX = (scroll.scrollLeft + px - origin.x) / zoom;
  const contentY = (scroll.scrollTop + py - origin.y) / zoom;
  zoom = target;
  layout();
  const after = frameOrigin();
  scroll.scrollLeft = after.x + contentX * zoom - px;
  scroll.scrollTop = after.y + contentY * zoom - py;
  for (const listener of listeners) listener();
}

/** 把设计窗口放在视口正中。 */
export function centerView(): void {
  const { scroll, frame } = elements();
  const origin = frameOrigin();
  scroll.scrollLeft = origin.x + (frame.offsetWidth * zoom) / 2 - scroll.clientWidth / 2;
  scroll.scrollTop = origin.y + (frame.offsetHeight * zoom) / 2 - scroll.clientHeight / 2;
}

/** 缩放到刚好装下整个设计窗口（最多 100%），并放在正中。 */
export function zoomToFit(): void {
  const { scroll, frame } = elements();
  userMoved = true;
  const padding = 48;
  const fit = Math.min((scroll.clientWidth - padding) / frame.offsetWidth, (scroll.clientHeight - padding) / frame.offsetHeight, 1);
  zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fit));
  layout();
  centerView();
  for (const listener of listeners) listener();
}

function stepZoom(direction: 1 | -1): void {
  const next = direction > 0 ? STEPS.find((step) => step > zoom + 1e-3) : [...STEPS].reverse().find((step) => step < zoom - 1e-3);
  setZoom(next ?? zoom);
}

// ---------- 缩放控件 ----------

function renderZoomBar(): void {
  const label = document.getElementById("zoom-level");
  if (label) label.textContent = `${Math.round(zoom * 100)}%`;
}

function buildZoomBar(): void {
  const bar = document.getElementById("zoom-bar");
  if (!bar) return;
  const button = (text: string, title: string, onClick: () => void, id?: string) => {
    const el = document.createElement("button");
    el.type = "button";
    el.textContent = text;
    el.title = title;
    if (id) el.id = id;
    el.addEventListener("click", onClick);
    return el;
  };
  bar.replaceChildren(
    button("−", "缩小（Ctrl + -）", () => stepZoom(-1)),
    button("100%", "回到 100%（Ctrl + 0）", () => setZoom(1), "zoom-level"),
    button("+", "放大（Ctrl + =）", () => stepZoom(1)),
    button("适应", "缩放到刚好装下整个窗口（Shift + 1）", () => zoomToFit()),
  );
  renderZoomBar();
}

// ---------- 平移 ----------

let spaceHeld = false;
/** 用户自己动过视角（平移、滚动、缩放）之后，就不再自动居中 */
let userMoved = false;
let pan: { x: number; y: number; left: number; top: number; pointerId: number } | null = null;

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.matches("input, textarea, select") || target.isContentEditable);
}

function startPan(e: PointerEvent): void {
  const { scroll } = elements();
  userMoved = true;
  pan = { x: e.clientX, y: e.clientY, left: scroll.scrollLeft, top: scroll.scrollTop, pointerId: e.pointerId };
  scroll.classList.add("panning");
  try {
    scroll.setPointerCapture(e.pointerId);
  } catch {
    // 拿不到也不影响平移
  }
}

function endPan(): void {
  pan = null;
  elements().scroll.classList.remove("panning");
}

export function initViewport(): void {
  const { scroll, frame } = elements();
  buildZoomBar();
  layout();
  centerView();

  // 设计窗口的大小变了（改了窗口尺寸、切换模式），重新摆放。
  // 用户自己动过视角之前，设计窗口一直保持居中（页面刚打开时，两者的大小会变好几次）
  const relayout = () => {
    layout();
    if (!userMoved && scroll.clientWidth > 0 && frame.offsetWidth > 0) centerView();
  };
  new ResizeObserver(relayout).observe(frame);
  new ResizeObserver(relayout).observe(scroll);

  // 中键，或者按住空格的左键：平移。在捕获阶段先拦下来，编辑层就不会把它当成选择或拖动
  scroll.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button === 1 || (e.button === 0 && spaceHeld)) {
        e.preventDefault();
        e.stopPropagation();
        startPan(e);
      }
    },
    true,
  );
  // 中键按下时浏览器默认会进入自动滚动模式，挡掉
  scroll.addEventListener("mousedown", (e) => {
    if (e.button === 1) e.preventDefault();
  });
  scroll.addEventListener("auxclick", (e) => {
    if (e.button === 1) e.preventDefault();
  });
  scroll.addEventListener(
    "pointermove",
    (e) => {
      if (!pan) return;
      e.stopPropagation();
      scroll.scrollLeft = pan.left - (e.clientX - pan.x);
      scroll.scrollTop = pan.top - (e.clientY - pan.y);
    },
    true,
  );
  const finish = (e: PointerEvent) => {
    if (!pan) return;
    e.stopPropagation();
    endPan();
  };
  scroll.addEventListener("pointerup", finish, true);
  scroll.addEventListener("pointercancel", finish, true);

  // Ctrl + 滚轮：缩放。普通滚轮和 Shift + 滚轮交给浏览器，照常上下、左右平移
  scroll.addEventListener(
    "wheel",
    (e) => {
      userMoved = true;
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      // 触控板捏合的 deltaY 很小，滚轮一格大约是 100
      const factor = Math.exp(-e.deltaY * (Math.abs(e.deltaY) < 40 ? 0.01 : 0.0015));
      setZoom(zoom * factor, e.clientX, e.clientY);
    },
    { passive: false },
  );

  document.addEventListener("keydown", (e) => {
    if (isTyping(e.target)) return;
    if (e.code === "Space") {
      // 空格按住期间是平移模式；不让页面跟着滚
      if (!spaceHeld) {
        spaceHeld = true;
        scroll.classList.add("pan-ready");
      }
      e.preventDefault();
      return;
    }
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && (e.key === "=" || e.key === "+")) {
      e.preventDefault();
      stepZoom(1);
    } else if (ctrl && e.key === "-") {
      e.preventDefault();
      stepZoom(-1);
    } else if (ctrl && e.key === "0") {
      e.preventDefault();
      setZoom(1);
    } else if (e.shiftKey && !ctrl && e.code === "Digit1") {
      e.preventDefault();
      zoomToFit();
    }
  });
  document.addEventListener("keyup", (e) => {
    if (e.code !== "Space") return;
    spaceHeld = false;
    scroll.classList.remove("pan-ready");
  });
  // 切到别的窗口时，空格可能按下了没有松开的消息
  window.addEventListener("blur", () => {
    spaceHeld = false;
    scroll.classList.remove("pan-ready");
    endPan();
  });
}
