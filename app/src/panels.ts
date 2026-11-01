// 左、右、下三个拓展栏：收起、展开，拖动边缘改大小。尺寸记在 localStorage，只是这台机器上的习惯。

export interface PanelState {
  leftOpen: boolean;
  rightOpen: boolean;
  bottomOpen: boolean;
  left: number;
  right: number;
  bottom: number;
}

export const DEFAULT_PANELS: PanelState = { leftOpen: true, rightOpen: true, bottomOpen: true, left: 200, right: 360, bottom: 150 };

const MIN_LEFT = 140;
const MIN_RIGHT = 260;
const MIN_BOTTOM = 72;
const TOPBAR_HEIGHT = 36;
/** 不管怎么拖，中间的画布至少留这么大。宽度要放得下顶部一行的模式选择和缩放 */
const MIN_CENTER_WIDTH = 500;
const MIN_CENTER_HEIGHT = 200;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(min, max), Math.max(min, value));
}

/** 把尺寸限制在窗口放得下的范围里。收起的栏不占地方，窗口太小时各栏停在自己的最小值。 */
export function clampPanels(state: PanelState, viewport: { width: number; height: number }): PanelState {
  const room = viewport.width - MIN_CENTER_WIDTH;
  const right = clamp(state.right, MIN_RIGHT, room - (state.leftOpen ? MIN_LEFT : 0));
  const left = clamp(state.left, MIN_LEFT, room - (state.rightOpen ? right : 0));
  const bottom = clamp(state.bottom, MIN_BOTTOM, viewport.height - TOPBAR_HEIGHT - MIN_CENTER_HEIGHT);
  return { ...state, left, right, bottom };
}

const STORAGE_KEY = "vf.panels";

function loadState(): PanelState {
  try {
    return { ...DEFAULT_PANELS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") };
  } catch {
    return { ...DEFAULT_PANELS };
  }
}

export function initPanels(): void {
  const $ = (id: string) => document.getElementById(id) as HTMLElement;
  const body = document.body;
  const bottomPanel = $("bottom");
  let state = loadState();

  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 存不下只是下次打开回到默认
    }
  };

  const apply = () => {
    const shown = clampPanels(state, { width: window.innerWidth, height: window.innerHeight });
    body.style.setProperty("--left-width", shown.leftOpen ? `${shown.left}px` : "0px");
    body.style.setProperty("--right-width", shown.rightOpen ? `${shown.right}px` : "0px");
    body.style.setProperty("--bottom-height", shown.bottomOpen ? `${shown.bottom}px` : "auto");
    body.classList.toggle("left-collapsed", !shown.leftOpen);
    body.classList.toggle("right-collapsed", !shown.rightOpen);
    body.classList.toggle("bottom-collapsed", !shown.bottomOpen);
    $("toggle-left").setAttribute("aria-pressed", String(shown.leftOpen));
    $("toggle-right").setAttribute("aria-pressed", String(shown.rightOpen));
    $("bottom-toggle").textContent = shown.bottomOpen ? "收起" : "展开";
    $("resize-left").hidden = !shown.leftOpen;
    $("resize-right").hidden = !shown.rightOpen;
    $("resize-bottom").hidden = !shown.bottomOpen;
    body.style.setProperty("--bottom-offset", `${bottomPanel.offsetHeight}px`);
  };

  const toggle = (key: "leftOpen" | "rightOpen" | "bottomOpen") => {
    state = { ...state, [key]: !state[key] };
    apply();
    save();
  };

  $("toggle-left").addEventListener("click", () => toggle("leftOpen"));
  $("toggle-right").addEventListener("click", () => toggle("rightOpen"));
  $("bottom-toggle").addEventListener("click", () => toggle("bottomOpen"));
  // 收起之后点页签，就是想看里面的内容
  for (const id of ["tab-problems", "tab-log"]) {
    $(id).addEventListener("click", () => {
      if (!state.bottomOpen) toggle("bottomOpen");
    });
  }

  const resizer = (id: string, key: "left" | "right" | "bottom", sizeAt: (e: PointerEvent) => number) => {
    const handle = $(id);
    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      // 指针捕获让拖动经过画布的 iframe 时事件也不丢
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", (e) => {
      if (!handle.hasPointerCapture(e.pointerId)) return;
      state = clampPanels({ ...state, [key]: sizeAt(e) }, { width: window.innerWidth, height: window.innerHeight });
      apply();
    });
    handle.addEventListener("pointerup", save);
    handle.addEventListener("pointercancel", save);
    handle.addEventListener("dblclick", () => {
      state = { ...state, [key]: DEFAULT_PANELS[key] };
      apply();
      save();
    });
  };

  resizer("resize-left", "left", (e) => e.clientX);
  resizer("resize-right", "right", (e) => window.innerWidth - e.clientX);
  resizer("resize-bottom", "bottom", (e) => window.innerHeight - e.clientY);

  window.addEventListener("resize", apply);
  apply();
}
