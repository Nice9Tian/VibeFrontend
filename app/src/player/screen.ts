// 播放页在屏幕上怎么看（独立预览和导出的网页）：套上设备外框（书、电脑、手机），或者原样一页页排开。
// 外框和翻页动画是 deviceframe.ts，一屏一屏怎么配页是 bookview.ts，几何是 devices.ts：和编辑器的预览是同一套。
//
// 选哪种设备：
//   1. 网址参数 ?device=book|desktop|phone|plain（手机还可以带 &phone=<型号>、&landscape=1）
//   2. 存下来的选择：编辑器里（独立预览）是项目的 .designer/preview.json，和编辑器的预览共用；导出的网页存在这个浏览器里
//   3. 都没有时用书（播放页只放平面设计，和编辑器的默认一样）
// 换设备时网址参数跟着改：刷新、把网址发给别人，看到的还是这个设备。
//
// 页面只画一次（在 player/main.ts 里），换设备、翻页时把画好的页面元素挪进外框的屏幕，控件不重新创建，动画接着动。
import { boardAnchor, deviceViews, playingViews, screenIndexForAnchor, type ScreenView } from "../bookview.ts";
import { iconColorFor, mountBook, mountDesktop, mountPhone, placeSheets, playSlide, playTurn, turnSnapshot, type DeviceStage } from "../deviceframe.ts";
import { DEVICE_LABELS, defaultDevice, fitScale, isDeviceId, PHONE_MODELS, phoneModel, type DeviceId } from "../devices.ts";
import { toPx } from "../kinds.ts";
import { unitOf, type Scene } from "../model.ts";
import { coverWrapId, pageLabel } from "../pages.ts";

export type PreviewChoice = DeviceId | "plain";

/** 预览设备的选择，和编辑器的 .designer/preview.json 是同一个格式 */
export interface PreviewSettings {
  device?: PreviewChoice;
  phone?: string;
  landscape?: boolean;
}

declare global {
  interface Window {
    /** 编辑器里（host.ts）从 .designer/preview.json 读出来的预览设置；导出的网页里没有 */
    VF_PREVIEW_SETTINGS?: PreviewSettings;
    /** 编辑器里（host.ts）把换过的设置存回 .designer/preview.json；导出的网页里没有，存在浏览器里 */
    VF_SAVE_PREVIEW_SETTINGS?: (settings: PreviewSettings) => void | Promise<void>;
  }
}

export interface ScreenOptions {
  scene: Scene;
  /** 播放的页面，按顺序；?board= 时只有一个 */
  boards: string[];
  /** 每个页面画好的元素（.vf-board） */
  boardEls: Map<string, HTMLElement>;
  /** 原样时每个页面的框，和 boards 一一对应 */
  frames: HTMLElement[];
  /** 原样时装页面框的那一列（#vf-book） */
  book: HTMLElement;
  /** 电脑的窗口和任务栏上的名字和图标（图标是网址，没有就用名字的第一个字） */
  app: { name: string; icon?: string };
}

const SCREEN_CSS = `
#vf-player-ui {
  flex-wrap: wrap;
  justify-content: center;
  max-width: calc(100vw - 24px);
  box-sizing: border-box;
  border-radius: 20px;
  color-scheme: dark;
}
#vf-player-ui button:disabled {
  opacity: 0.35;
  cursor: default;
}
#vf-player-ui button:disabled:hover {
  background: none;
}
#vf-player-ui button:focus-visible,
#vf-player-ui select:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.72);
  outline-offset: 1px;
}
#vf-player-ui .vf-seg {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.07);
}
#vf-player-ui .vf-seg button {
  height: 26px;
  line-height: 26px;
  padding: 0 11px;
}
#vf-player-ui .vf-seg button[aria-pressed="true"] {
  background: rgba(255, 255, 255, 0.92);
  color: #15171c;
}
#vf-player-ui .vf-phone-opts {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
#vf-player-ui .vf-phone-opts[hidden] {
  display: none;
}
#vf-player-ui select {
  all: unset;
  box-sizing: border-box;
  height: 30px;
  padding: 0 26px 0 11px;
  border-radius: 999px;
  line-height: 30px;
  cursor: pointer;
  white-space: nowrap;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath d='M2 3.6l3 3 3-3' fill='none' stroke='%23f2f2f0' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat right 10px center;
}
#vf-player-ui select:hover {
  background-color: rgba(255, 255, 255, 0.12);
}
#vf-player-ui option {
  background: #23252b;
  color: #f2f2f0;
}
#vf-player-ui .sep {
  flex: none;
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background: rgba(255, 255, 255, 0.16);
}
#vf-player-ui .where {
  min-width: 5.5em;
  text-align: center;
}
/* 套着外框：设备缩放到装下窗口（底下让出播放条），页面不滚动；桌面中间亮一点，深色的手机和显示器才看得出轮廓 */
html.vf-device-mode {
  background: radial-gradient(110% 85% at 50% 42%, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0) 70%), var(--vf-desk, #1b1c1f);
}
html.vf-device-mode,
html.vf-device-mode body {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
#vf-device-view {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: var(--vf-ui-space, 68px);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
#vf-device-view[hidden],
#vf-book[hidden] {
  display: none;
}
.vf-device-fit {
  position: relative;
  flex: none;
}
.vf-device-fit > .vf-dev {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
}
@media print {
  #vf-device-view {
    display: none;
  }
}
`;

const params = new URLSearchParams(location.search);
// 同一个导出的网页用 /网页/ 和 /网页/index.html 打开时是同一份设置
const STORAGE_KEY = `vf-player-preview:${location.pathname.replace(/index\.html$/i, "")}`;

function readStored(): PreviewSettings {
  if (window.VF_PREVIEW_SETTINGS) return { ...window.VF_PREVIEW_SETTINGS };
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    const parsed = text ? (JSON.parse(text) as unknown) : null;
    return parsed && typeof parsed === "object" ? (parsed as PreviewSettings) : {};
  } catch {
    // 无痕窗口、禁了网站数据：不记，照默认的来
    return {};
  }
}

/** 开始时用哪个设备：网址参数最优先，其次是存下来的，都没有就是书 */
function initialSettings(): Required<PreviewSettings> {
  const stored = readStored();
  const fromUrl = params.get("device");
  const device = fromUrl === "plain" || isDeviceId(fromUrl) ? fromUrl : stored.device === "plain" || isDeviceId(stored.device) ? stored.device : defaultDevice("graphic");
  const phone = phoneModel(params.get("phone") ?? stored.phone).id;
  const landscape = params.has("landscape") ? params.get("landscape") === "1" : Boolean(stored.landscape);
  return { device, phone, landscape };
}

function button(text: string, title: string, action: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = text;
  el.title = title;
  el.dataset.board = action;
  el.addEventListener("click", onClick);
  return el;
}

/** 摆好屏幕上看的样子，挂上播放条（设备、翻页、打印）和键盘翻页。 */
export function setupScreen(options: ScreenOptions): void {
  const { scene, boards, boardEls, frames, book } = options;
  const style = document.createElement("style");
  style.id = "vf-player-screen-styles";
  style.textContent = SCREEN_CSS;
  document.head.append(style);

  const settings = initialSettings();
  let device: PreviewChoice = settings.device;
  /** 现在摆成哪种：平时就是 device，打印时临时换成原样 */
  let shown: PreviewChoice = "plain";
  let index = 0;
  let stage: DeviceStage | null = null;
  const desktop = { maximized: false, minimized: false };
  const playing = new Set(boards);

  const view = document.createElement("div");
  view.id = "vf-device-view";
  view.hidden = true;
  const fitBox = document.createElement("div");
  fitBox.className = "vf-device-fit";
  view.append(fitBox);
  document.body.append(view);

  /** 存一处改动。编辑器里只把改了的那一项交给 host.ts（另一项可能刚在编辑器里改过，不能用这里开始时的旧值盖掉） */
  const save = (patch: PreviewSettings) => {
    const current: PreviewSettings = { device, phone: settings.phone, landscape: settings.landscape };
    // 网址跟着改：刷新、发给别人还是这个设备
    const url = new URL(location.href);
    url.searchParams.set("device", device);
    if (device === "phone") {
      url.searchParams.set("phone", settings.phone);
      url.searchParams.set("landscape", settings.landscape ? "1" : "0");
    } else {
      url.searchParams.delete("phone");
      url.searchParams.delete("landscape");
    }
    history.replaceState(history.state, "", url.href);
    if (window.VF_SAVE_PREVIEW_SETTINGS) {
      void Promise.resolve(window.VF_SAVE_PREVIEW_SETTINGS(patch)).catch(() => undefined);
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {
      // 存不了就只在网址里
    }
  };

  // ---------- 一屏一屏 ----------

  /** 套外框时的每一屏；?board= 只放一个页面时，只留含有它的那几屏，屏里别的页面换成空白。播放页不改项目，算一次就够 */
  const screensCache = new Map<DeviceId, ScreenView[]>();
  const deviceScreens = (choice: DeviceId): ScreenView[] => {
    let screens = screensCache.get(choice);
    if (!screens) {
      screens = playingViews(deviceViews(scene, choice), playing);
      screensCache.set(choice, screens);
    }
    return screens;
  };

  /** 原样时现在看的是第几个页面：离窗口中线最近的那个 */
  const currentFrame = () => {
    const middle = window.innerHeight / 2;
    let best = 0;
    let bestDistance = Infinity;
    frames.forEach((frame, i) => {
      const rect = frame.getBoundingClientRect();
      const distance = Math.abs((rect.top + rect.bottom) / 2 - middle);
      if (distance < bestDistance) {
        best = i;
        bestDistance = distance;
      }
    });
    return best;
  };

  /** 现在在看哪一页（换设备时停在同一页） */
  const anchor = (): { pages: number[]; board: string } => {
    if (shown === "plain") return boardAnchor(scene, boards[currentFrame()] ?? boards[0]);
    const v = deviceScreens(shown)[index];
    return v ? { board: v.board, pages: v.pages } : { board: boards[0], pages: [] };
  };

  const boardFor = (id: string) => {
    const el = boardEls.get(id)!;
    el.style.position = "absolute";
    el.style.left = "0";
    el.style.top = "0";
    return el;
  };

  // ---------- 缩放 ----------

  const ui = document.createElement("div");
  const fit = () => {
    if (document.documentElement.classList.contains("vf-print")) return;
    if (shown === "plain") {
      // 每一页缩放到刚好放进窗口（宽和高都放得下），最多放大到原大的 1.6 倍
      const unit = unitOf(scene);
      frames.forEach((frame, i) => {
        const node = scene.nodes[boards[i]];
        if (!node) return;
        const width = toPx(unit, node.width);
        const height = toPx(unit, node.height);
        const zoom = Math.min((window.innerWidth - 32) / width, (window.innerHeight - 96) / height, 1.6);
        frame.style.setProperty("zoom", String(Math.max(0.05, zoom)));
      });
      return;
    }
    if (!stage) return;
    // 底下让出播放条（窄窗口里它会换成两行）
    const space = ui.offsetHeight + 14 + 10;
    document.documentElement.style.setProperty("--vf-ui-space", `${space}px`);
    const box = { width: window.innerWidth, height: Math.max(80, window.innerHeight - space) };
    // 书里是纸本身，可以放大一点；电脑和手机按设备本来的大小，最多 1:1
    const scale = Math.max(0.05, fitScale(stage.size, box, { padding: 12, max: shown === "book" ? 1.6 : 1 }));
    fitBox.style.width = `${stage.size.width * scale}px`;
    fitBox.style.height = `${stage.size.height * scale}px`;
    stage.root.style.transform = `scale(${scale})`;
  };

  // ---------- 摆 ----------

  const clearStage = () => {
    stage?.destroy();
    stage?.root.remove();
    stage = null;
  };

  /** 设备外框里画第 index 屏：页面元素挪进书的两面纸、电脑的窗口或手机的屏幕 */
  const renderDevice = (choice: DeviceId) => {
    const screens = deviceScreens(choice);
    index = Math.max(0, Math.min(screens.length - 1, index));
    const v = screens[index];
    clearStage();
    if (!v) return;
    let frame: DeviceStage;
    if (choice === "book") {
      // 读过几页、还剩几页：书两边纸的厚度
      const faces = (s: ScreenView) => (s.left ? 1 : 0) + (s.right ? 1 : 0);
      const before = screens.slice(0, index).reduce((n, s) => n + faces(s), 0);
      const after = screens.slice(index + 1).reduce((n, s) => n + faces(s), 0);
      // 合着的书只在最前面（只有封面）和最后面（只有封底）；中间少一面的是翻开的书、那面空白
      const closed =
        screens.length > 1 && index === 0 && !v.left
          ? "front"
          : screens.length > 1 && index === screens.length - 1 && !v.right && coverWrapId(scene)
            ? "back"
            : null;
      frame = mountBook(document, { left: v.left, right: v.right }, { before, after }, closed);
      for (const [board, slot] of frame.slots) slot.append(boardFor(board));
    } else {
      const content = { width: (v.left?.width ?? 0) + (v.right?.width ?? 0), height: Math.max(v.left?.height ?? 0, v.right?.height ?? 0) };
      const letter = [...(options.app.name.trim() || "?")][0].toUpperCase();
      const icon = { src: options.app.icon, letter, color: iconColorFor(options.app.name) };
      frame =
        choice === "desktop"
          ? mountDesktop(document, {
              app: { title: `${options.app.name} — ${v.label}`, icon },
              content,
              maximized: desktop.maximized,
              minimized: desktop.minimized,
              onMinimize: () => {
                desktop.minimized = true;
                renderDevice(choice);
              },
              onMaximize: () => {
                desktop.maximized = !desktop.maximized;
                renderDevice(choice);
              },
              onRestore: () => {
                desktop.minimized = false;
                renderDevice(choice);
              },
            })
          : mountPhone(document, phoneModel(settings.phone), { content, landscape: settings.landscape });
      const screen = frame.slots.get("screen")!;
      screen.style.background = "#fff";
      placeSheets(document, screen, v, boardFor);
    }
    fitBox.append(frame.root);
    stage = frame;
    fit();
  };

  /** 摆成 choice 的样子，停在 at 那一页 */
  const layout = (choice: PreviewChoice, at: { pages: number[]; board: string }) => {
    shown = choice;
    document.documentElement.classList.toggle("vf-device-mode", choice !== "plain");
    if (choice === "plain") {
      clearStage();
      view.hidden = true;
      book.hidden = false;
      boards.forEach((id, i) => {
        const el = boardEls.get(id);
        if (!el) return;
        el.style.position = "";
        el.style.left = "";
        el.style.top = "";
        frames[i].append(el);
      });
      fit();
      frames[Math.max(0, boards.indexOf(at.board))]?.scrollIntoView({ block: "center" });
    } else {
      book.hidden = true;
      view.hidden = false;
      index = screenIndexForAnchor(deviceScreens(choice), at);
      renderDevice(choice);
    }
    sync();
  };

  // ---------- 翻页 ----------

  const flip = (delta: number) => {
    if (shown === "plain") {
      frames[Math.max(0, Math.min(frames.length - 1, currentFrame() + delta))]?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const next = index + delta;
    if (next < 0 || next >= deviceScreens(shown).length) return;
    const snapshot = shown === "book" ? turnSnapshot(stage) : null;
    index = next;
    renderDevice(shown);
    sync();
    if (!stage) return;
    if (snapshot) playTurn(document, stage, snapshot, delta > 0);
    else playSlide(stage, delta > 0);
  };

  // ---------- 播放条 ----------

  ui.id = "vf-player-ui";
  ui.setAttribute("role", "toolbar");
  ui.setAttribute("aria-label", "播放");
  const seg = document.createElement("div");
  seg.className = "vf-seg";
  seg.setAttribute("role", "group");
  seg.setAttribute("aria-label", "看的设备");
  const choices: Array<[PreviewChoice, string, string]> = [
    ["book", DEVICE_LABELS.book, "翻开的书，一屏两页，像翻书一样翻页"],
    ["desktop", DEVICE_LABELS.desktop, "16:9 的电脑桌面：窗口里看跨页，底部任务栏（图标停一下看缩略图）"],
    ["phone", DEVICE_LABELS.phone, "手机：一屏一页，按屏幕宽度缩放"],
    ["plain", "原样", "不套外框，一页页排开"],
  ];
  for (const [id, label, title] of choices) {
    const b = button(label, title, "device", () => {
      if (device === id) return;
      const at = anchor();
      device = id;
      desktop.minimized = false;
      save({ device: id });
      layout(device, at);
    });
    delete b.dataset.board;
    b.dataset.device = id;
    seg.append(b);
  }
  const phoneOpts = document.createElement("span");
  phoneOpts.className = "vf-phone-opts";
  const modelSelect = document.createElement("select");
  modelSelect.title = "手机型号";
  modelSelect.dataset.board = "phone-model";
  for (const model of PHONE_MODELS) modelSelect.append(new Option(`${model.label}（${model.width}×${model.height}）`, model.id));
  modelSelect.value = settings.phone;
  modelSelect.addEventListener("change", () => {
    settings.phone = phoneModel(modelSelect.value).id;
    save({ phone: settings.phone });
    if (shown === "phone") renderDevice("phone");
  });
  const rotate = button("横放", "横过来看 / 竖过来看", "rotate", () => {
    settings.landscape = !settings.landscape;
    save({ landscape: settings.landscape });
    if (shown === "phone") renderDevice("phone");
    sync();
  });
  phoneOpts.append(modelSelect, rotate);
  const sep = () => {
    const el = document.createElement("span");
    el.className = "sep";
    el.setAttribute("aria-hidden", "true");
    return el;
  };
  const prev = button("◀", "上一屏（← 或 PageUp）", "prev", () => flip(-1));
  const next = button("▶", "下一屏（→ 或 PageDown）", "next", () => flip(1));
  const where = document.createElement("span");
  where.className = "where";
  where.dataset.board = "label";
  const print = button("打印", "按纸张原大打印，或者存成 PDF（纸张选“默认”，边距选“无”，勾上“背景图形”）", "print", () => {
    const url = new URL(location.href);
    url.searchParams.set("print", "1");
    url.searchParams.set("autoprint", "1");
    location.assign(url.href);
  });
  ui.append(seg, phoneOpts, sep(), prev, where, next, sep(), print);
  document.body.append(ui);

  function sync(): void {
    for (const b of seg.querySelectorAll<HTMLButtonElement>("[data-device]")) b.setAttribute("aria-pressed", String(b.dataset.device === device));
    phoneOpts.hidden = device !== "phone";
    rotate.textContent = settings.landscape ? "竖放" : "横放";
    if (shown === "plain") {
      const at = currentFrame();
      where.textContent = `${pageLabel(scene, boards[at])}　共 ${boards.length} 个页面`;
      where.title = "";
      prev.disabled = frames.length <= 1;
      next.disabled = frames.length <= 1;
    } else {
      const screens = deviceScreens(shown);
      where.textContent = screens[index]?.label ?? "";
      where.title = `共 ${screens.length} 屏`;
      prev.disabled = index <= 0;
      next.disabled = index >= screens.length - 1;
    }
  }

  window.addEventListener("scroll", () => shown === "plain" && sync(), { passive: true });
  window.addEventListener("resize", fit);
  // 播放条变高了（窄窗口里出现手机的选项、字体到位后换成两行），设备跟着让出地方
  new ResizeObserver(() => shown !== "plain" && fit()).observe(ui);
  window.addEventListener("keydown", (e) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.matches("input, textarea, select") || target.isContentEditable)) return;
    // Alt + ← 是浏览器的后退，不拦
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "ArrowRight" || e.key === "PageDown") {
      e.preventDefault();
      flip(1);
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      flip(-1);
    }
  });
  // 用浏览器的菜单或 Ctrl+P 打印时，临时换回原样：按纸张原大一页一页地出，打印完再套回外框
  let beforePrint: { pages: number[]; board: string } | null = null;
  window.addEventListener("beforeprint", () => {
    if (shown === "plain") return;
    beforePrint = anchor();
    layout("plain", beforePrint);
  });
  window.addEventListener("afterprint", () => {
    if (!beforePrint) return;
    const at = beforePrint;
    beforePrint = null;
    layout(device, at);
  });

  // 从第一个页面开始；包封是从封面开始，不是封底
  layout(device, boardAnchor(scene, boards[0]));
}
