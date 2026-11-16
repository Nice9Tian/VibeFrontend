// 播放页：不带编辑器，把一个平面设计项目按页画出来。
// 编辑器的“独立预览”打开的是它，导出的网页里跑的也是它，导出 PDF 和图片时无头浏览器打开的还是它。
// 屏幕上看时可以套设备外框（书、电脑、手机）或原样一页页排开，见 screen.ts。
//
// 它只读项目文件，不写（编辑器里 host.ts 会把换过的预览设备存回 .designer/preview.json）。
// 项目文件夹的网址由页面先放在 window.VF_PROJECT_BASE 里（以 / 结尾）：
// 编辑器里是 /__project/ 或 vfproject 协议，导出的网页里是 "./"。
//
// 网址参数：
//   ?device=book|desktop|phone|plain  屏幕上看时套哪种外框（不写就用存下来的，再没有就是书），见 screen.ts
//   &phone=<型号>&landscape=1          手机的型号、横放
//   ?print=1      按纸张的原大排版，控件只画静帧，画布换成图片。导出 PDF 和图片用它
//   ?autoprint=1  加载完就弹出打印对话框（和 print=1 一起用）
//   ?still=1      不动，但仍按屏幕的方式排版
//   ?motion=1     系统设了“减少动态效果”时也照常动
//   ?board=<ID>   只画这一页
//   ?split=1      和 print=1 一起用：跨页按纸拆开，一张纸一页（每张纸各画一遍整个跨页，只露出自己那一半）
import { GRAPHIC_COMPONENTS } from "../../standard/graphic.ts";
import { scopeComponentCss } from "../cssscope.ts";
import { cssLength } from "../kinds.ts";
import { allWindowIds, childrenOfNode, unitOf, type ComponentCreate, type ComponentDecl, type ComponentInstance, type Scene } from "../model.ts";
import { pageLabel, sheetCount, sheetPageNumbers } from "../pages.ts";
import { isValidPartPath, MAX_PART_DEPTH, referencedParts } from "../parts.ts";
import { renderNode, type RenderContext } from "../render.ts";
import { parsePreviewDevices } from "../devices.ts";
import { applyBoard, createStageServices, createWaitTracker, GRAPHIC_STAGE_CSS } from "../stage.ts";
import { setupScreen } from "./screen.ts";

declare global {
  interface Window {
    /** 项目文件夹的网址，以 / 结尾 */
    VF_PROJECT_BASE?: string;
    /** 控件类型 → components/ 下的文件夹名；没有就按“文件夹名和类型名一样”找 */
    VF_COMPONENT_FOLDERS?: Record<string, string>;
    /** 播放页的状态，导出脚本靠它知道什么时候可以出图 */
    __vfPlayer?: PlayerState;
  }
}

interface PlayerState {
  /** 全部画完、字体和图片都到位之后结束 */
  ready: Promise<void>;
  isReady: boolean;
  /** 加载和运行中出的错，导出脚本会原样报出来 */
  errors: string[];
  /** 还在等什么 */
  pending(): string[];
  boards: Array<{ id: string; label: string; width: number; height: number; unit: string }>;
}

interface LoadedType {
  decl: ComponentDecl;
  create?: ComponentCreate;
  error?: string;
}

const PLAYER_CSS = `
html {
  background: var(--vf-desk, #1b1c1f);
}
body {
  min-height: 100vh;
}
#vf-book {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4vh;
  padding: 4vh 0 calc(4vh + 64px);
}
.vf-board-frame {
  position: relative;
  flex: none;
  box-shadow: 0 1.2vh 4vh rgba(0, 0, 0, 0.42), 0 0 0 1px rgba(255, 255, 255, 0.04);
}
.vf-error {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border: 1px solid #c62828;
  background: #fdecec;
  color: #c62828;
  font: 12px/1.3 "Segoe UI", "Microsoft YaHei UI", system-ui, sans-serif;
  overflow: hidden;
  text-align: center;
}
#vf-player-ui {
  position: fixed;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 5px 6px;
  border-radius: 999px;
  background: rgba(24, 26, 32, 0.82);
  color: #f2f2f0;
  font: 500 12px/1 "Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", system-ui, sans-serif;
  backdrop-filter: blur(14px) saturate(1.3);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35), inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  user-select: none;
}
#vf-player-ui button {
  all: unset;
  cursor: pointer;
  min-width: 30px;
  height: 30px;
  padding: 0 9px;
  border-radius: 999px;
  text-align: center;
  box-sizing: border-box;
  line-height: 30px;
}
#vf-player-ui button:hover {
  background: rgba(255, 255, 255, 0.12);
}
#vf-player-ui .where {
  padding: 0 10px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
#vf-player-message {
  padding: 24px;
  color: #f2f2f0;
  font: 14px/1.6 "Segoe UI", "Microsoft YaHei UI", system-ui, sans-serif;
  white-space: pre-wrap;
}
/* 按纸张原大排版：导出 PDF 和图片时，或者浏览器自己打印时 */
html.vf-print {
  background: none;
}
html.vf-print #vf-book {
  display: block;
  padding: 0;
}
html.vf-print .vf-board-frame {
  zoom: 1 !important;
  width: max-content;
  box-shadow: none;
  break-after: page;
  break-inside: avoid;
}
html.vf-print #vf-player-ui {
  display: none;
}
/* 最后一页后面不再分页：页面后面的东西（控件放在 body 里的隐藏元素）不能另起一张空白纸 */
html.vf-print .vf-board-frame:last-child {
  break-after: auto;
}
@media print {
  html {
    background: none;
  }
  #vf-book {
    display: block;
    padding: 0;
  }
  .vf-board-frame {
    zoom: 1 !important;
    width: max-content;
    box-shadow: none;
    break-after: page;
    break-inside: avoid;
  }
  #vf-player-ui {
    display: none;
  }
  .vf-board-frame:last-child {
    break-after: auto;
  }
}
`;

const params = new URLSearchParams(location.search);
const printMode = params.get("print") === "1";
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const still = printMode || params.get("still") === "1" || (reducedMotion.matches && params.get("motion") !== "1");

const errors: string[] = [];
const tracker = createWaitTracker();

function projectBase(): string {
  const given = window.VF_PROJECT_BASE ?? "./";
  return new URL(given.endsWith("/") ? given : `${given}/`, location.href).href;
}

async function fetchText(base: string, path: string): Promise<string | null> {
  const res = await fetch(base + path, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`读取 ${path} 失败（HTTP ${res.status}）`);
  return res.text();
}

async function fetchJson<T>(base: string, path: string): Promise<T | null> {
  const text = await fetchText(base, path);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    throw new Error(`${path} 不是有效的 JSON：${(e as Error).message}`);
  }
}

function addStyle(id: string, css: string): void {
  const style = document.createElement("style");
  style.id = id;
  style.textContent = css;
  document.head.append(style);
}

/** 挂一张样式表，等它加载完（加载不了也算完，错误记下来）。 */
function addStylesheet(href: string, label: string): Promise<void> {
  return new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.addEventListener("load", () => resolve());
    link.addEventListener("error", () => {
      errors.push(`样式表 ${label} 加载不了`);
      resolve();
    });
    document.head.append(link);
  });
}

/**
 * 画布里用到的子项目，连同子项目里又用到的子项目，一层一层读进来（最多 MAX_PART_DEPTH 层）。
 * 子项目在项目文件夹的 parts/<名字>/ 下，和总项目共用控件、样式和素材。
 */
async function loadParts(base: string, scene: Scene): Promise<Map<string, Scene>> {
  const parts = new Map<string, Scene>();
  let frontier = referencedParts(scene);
  for (let depth = 0; depth < MAX_PART_DEPTH && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const part of frontier) {
      if (parts.has(part)) continue;
      const partScene = await fetchJson<Scene>(base, `${part}/ui/scene.json`).catch((e: Error) => {
        errors.push(`子项目 ${part} 读不出来：${e.message}`);
        return null;
      });
      if (!partScene) continue;
      parts.set(part, partScene);
      next.push(...referencedParts(partScene));
    }
    frontier = next;
  }
  return parts;
}

async function loadTypes(base: string, scenes: Scene[]): Promise<Map<string, LoadedType>> {
  const builtin = new Set(["Page", "Container", "Group", "Shape", "Line", "Part"]);
  const types = new Map<string, LoadedType>();
  const wanted = new Set(scenes.flatMap((scene) => Object.values(scene.nodes).map((node) => node.type)));
  let componentCss = "";
  for (const std of GRAPHIC_COMPONENTS.values()) {
    types.set(std.decl.type, { decl: std.decl, create: std.create });
    componentCss += `${scopeComponentCss(std.decl.type, std.styleText)}\n`;
  }
  const folders = window.VF_COMPONENT_FOLDERS ?? {};
  await Promise.all(
    [...wanted]
      .filter((type) => !builtin.has(type))
      .map(async (type) => {
        const folder = folders[type] ?? type;
        try {
          const decl = await fetchJson<ComponentDecl>(base, `components/${folder}/component.json`);
          if (!decl) {
            // 项目里没有这个控件，就用工具自带的同名标准控件；也没有才算找不到
            if (!types.has(type)) types.set(type, { decl: { type }, error: `找不到控件 ${type}` });
            return;
          }
          if (!decl.type) decl.type = type;
          const loaded: LoadedType = { decl };
          types.set(type, loaded);
          const css = await fetchText(base, `components/${folder}/${decl.style ?? "style.css"}`);
          if (css) componentCss += `${scopeComponentCss(type, css)}\n`;
          const module = (await import(/* @vite-ignore */ `${base}components/${folder}/${decl.entry ?? "index.js"}`)) as { default?: unknown };
          if (typeof module.default !== "function") loaded.error = `${decl.entry ?? "index.js"} 没有默认导出一个创建函数`;
          else loaded.create = module.default as ComponentCreate;
        } catch (e) {
          types.set(type, { decl: { type }, error: `${type} 加载失败：${(e as Error).message}` });
          errors.push(`控件 ${type} 加载失败：${(e as Error).message}`);
        }
      }),
  );
  addStyle("vf-component-styles", componentCss);
  return types;
}


/** 每个页面框一条 @page 规则：打印时每个框按自己的尺寸出一页，不留白边。sizes 是 CSS 长度。 */
function pageRules(sizes: Array<{ width: string; height: string }>): string {
  let css = "";
  sizes.forEach((size, index) => {
    css += `@page vf-board-${index} { size: ${size.width} ${size.height}; margin: 0; }\n`;
    css += `.vf-board-frame[data-vf-index="${index}"] { page: vf-board-${index}; }\n`;
  });
  return css;
}

async function start(state: PlayerState): Promise<void> {
  const base = projectBase();
  // 项目里的脚本和内容用相对路径取图片、数据：让它们相对于项目文件夹，而不是这个页面
  if (new URL(".", location.href).href !== base) {
    const baseEl = document.createElement("base");
    baseEl.href = base;
    document.head.prepend(baseEl);
  }
  if (printMode) document.documentElement.classList.add("vf-print");
  document.documentElement.classList.toggle("vf-still", still);

  // ?part=parts/<名字>：只看一个子项目。样式表、控件、素材都是总项目的，画布和名字是子项目的
  const partParam = (params.get("part") ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
  const part = partParam && isValidPartPath(partParam) ? partParam : "";
  const own = (path: string) => (part ? `${part}/${path}` : path);
  type Config = { name?: string; kind?: string; styles?: string[]; icon?: string; preview?: unknown };
  const config = (await fetchJson<Config>(base, "project.json")) ?? {};
  const partConfig = part ? await fetchJson<Config>(base, own("project.json")) : null;
  const scene = await fetchJson<Scene>(base, own("ui/scene.json"));
  if (!scene) throw new Error(`找不到 ${own("ui/scene.json")}`);
  if (config.kind !== "graphic") throw new Error("这个播放页只放平面设计项目（project.json 的 kind 是 \"graphic\"）");
  const name = partConfig?.name ?? config.name;
  if (name) document.title = name;

  const only = params.get("board");
  const boards = allWindowIds(scene).filter((id) => scene.nodes[id]?.type === "Page" && (!only || id === only));
  if (boards.length === 0) throw new Error(only ? `找不到页面 ${only}` : "这个项目里没有页面");

  const unit = unitOf(scene);
  const split = printMode && params.get("split") === "1";
  addStyle("vf-stage-base-styles", GRAPHIC_STAGE_CSS);
  addStyle("vf-player-styles", PLAYER_CSS);
  // 项目的样式表盖在基础样式上面，控件自己的样式再盖在它上面
  await Promise.all((config.styles ?? []).map((path) => addStylesheet(base + path, path)));
  const parts = await loadParts(base, scene);
  const types = await loadTypes(base, [scene, ...parts.values()]);

  const services = createStageServices({ unit, still, print: printMode, baseUrl: base, tracker });
  const book = document.createElement("main");
  book.id = "vf-book";
  document.body.append(book);
  const instances: ComponentInstance[] = [];
  const ctx: RenderContext = {
    types: (type) => types.get(type),
    services,
    instances,
    parts: (ref) => parts.get(ref),
    stack: part ? [part] : [],
    onError: (message) => {
      if (!errors.includes(message)) errors.push(message);
    },
  };
  const numbers = sheetPageNumbers(scene);
  // 平时一个页面一个框；按纸拆开时，跨页的每张纸各一个框，框里是整个跨页，只露出这张纸
  const views: Array<{ frame: HTMLElement; size: { width: string; height: string }; order: number }> = [];
  // 屏幕上看时每个页面画好的元素：换设备、翻页时挪进外框，不重新画
  const boardEls = new Map<string, HTMLElement>();
  for (const id of boards) {
    const node = scene.nodes[id];
    const sheets = sheetCount(node);
    const sheetWidth = node.width / sheets;
    const pages = numbers.get(id) ?? [];
    for (let s = 0; s < (split ? sheets : 1); s++) {
      const frame = document.createElement("div");
      frame.className = "vf-board-frame";
      frame.dataset.vfSheets = String(split ? 1 : sheets);
      // 每张纸是第几页，导出图片时按它起名
      frame.dataset.vfPages = (split ? [pages[s]] : pages).join(",");
      const board = document.createElement("div");
      applyBoard(board, id, node, unit);
      if (split && sheets > 1) {
        frame.style.width = cssLength(unit, sheetWidth);
        frame.style.height = cssLength(unit, node.height);
        frame.style.overflow = "hidden";
        board.style.marginLeft = cssLength(unit, -s * sheetWidth);
      }
      frame.append(board);
      if (!split) boardEls.set(id, board);
      views.push({
        frame,
        size: { width: cssLength(unit, split ? sheetWidth : node.width), height: cssLength(unit, node.height) },
        // 一页一页地出时按页码排：有包封时，封面（包封的右半）是第一页，封底是最后一页
        order: split ? (pages[s] ?? views.length + 1) : views.length,
      });
      for (const child of childrenOfNode(node)) renderNode(scene, child, board, ctx);
    }
    state.boards.push({ id, label: pageLabel(scene, id), width: node.width, height: node.height, unit: unit.css });
  }
  views.sort((a, b) => a.order - b.order);
  const frames = views.map((view, index) => {
    view.frame.dataset.vfIndex = String(index);
    book.append(view.frame);
    return view.frame;
  });
  addStyle("vf-page-rules", pageRules(views.map((view) => view.size)));

  if (!printMode) {
    // 和编辑器读 project.json 一样：不是字符串就当没写（编辑器的检查会提示），前后的空格去掉
    // 子项目自己写了（哪怕写成 null）就用它的，和编辑器读 project.json 的规则一样
    const own = (key: "icon" | "preview") => (partConfig && partConfig[key] !== undefined ? partConfig[key] : config[key]);
    const raw: unknown = own("icon");
    const icon = typeof raw === "string" ? raw.trim().replace(/\\/g, "/").replace(/^\/+/, "") : "";
    setupScreen({
      scene,
      boards,
      boardEls,
      frames,
      book,
      app: { name: name ?? "未命名项目", icon: icon ? base + icon.split("/").map(encodeURIComponent).join("/") : undefined },
      // 子项目没写就跟着总项目；写错的地方编辑器的检查会报，这里只用认得出来的
      allowed: parsePreviewDevices(own("preview")).devices,
    });
  }

  // 字体、图片、控件自己声明的异步加载都到位，才算准备好
  await document.fonts.ready;
  await tracker.idle();
  await document.fonts.ready;
  // 再等两帧让控件把第一帧画完。页面在后台时浏览器不发帧，所以同时设一个定时，谁先到算谁
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    setTimeout(resolve, 200);
  });
  await tracker.idle();
  if (printMode) await settleCanvases(book);
}

/** 画布换成图片时，图片要接过来的样式：位置、尺寸、混合方式这些，图片才落在同一个地方、长得一样。 */
const STILL_PROPS = ["position", "left", "top", "right", "bottom", "width", "height", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "display", "vertical-align", "transform", "transform-origin", "z-index", "opacity", "mix-blend-mode", "filter", "border-radius",
  "object-fit", "object-position", "clip-path", "mask-image", "mask-size", "mask-position", "mask-repeat", "box-shadow", "visibility",
  "grid-column-start", "grid-column-end", "grid-row-start", "grid-row-end", "align-self", "justify-self", "inset"];

/**
 * 导出 PDF 时，把每块画布（canvas）换成同一个位置、同样大小的图片。Chromium 打印 canvas 会在下面垫一块不透明的白底，
 * 透明的画布会在纸上打出白方块。控件不用自己管这件事；WebGL 画布建的时候要传 preserveDrawingBuffer: stage.print，
 * 画面才留得到这里。
 */
async function settleCanvases(root: HTMLElement): Promise<void> {
  const decodes: Promise<unknown>[] = [];
  for (const canvas of root.querySelectorAll("canvas")) {
    const cs = getComputedStyle(canvas);
    if (cs.display === "none") continue;
    let url: string;
    try {
      url = canvas.toDataURL("image/png");
    } catch (e) {
      errors.push(`有一块画布读不出来，导出里会是白的：${(e as Error).message}`);
      continue;
    }
    const img = document.createElement("img");
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    img.className = "vf-canvas-still";
    for (const prop of STILL_PROPS) img.style.setProperty(prop, cs.getPropertyValue(prop));
    img.style.setProperty("pointer-events", "none");
    canvas.before(img);
    canvas.style.display = "none";
    img.src = url;
    decodes.push(img.decode().catch(() => undefined));
  }
  await Promise.all(decodes);
}

function boot(): void {
  let markReady: () => void = () => undefined;
  const state: PlayerState = {
    ready: new Promise<void>((resolve) => (markReady = resolve)),
    isReady: false,
    errors,
    pending: () => tracker.pending(),
    boards: [],
  };
  window.__vfPlayer = state;
  window.addEventListener("error", (e) => errors.push(e.message));
  window.addEventListener("unhandledrejection", (e) => errors.push(String((e.reason as Error | undefined)?.message ?? e.reason)));
  start(state)
    .catch((e: Error) => {
      errors.push(e.message);
      const message = document.createElement("div");
      message.id = "vf-player-message";
      message.textContent = `打不开这个项目：${e.message}`;
      document.body.append(message);
    })
    .finally(() => {
      state.isReady = true;
      document.documentElement.dataset.vfReady = "true";
      markReady();
      if (printMode && params.get("autoprint") === "1") {
        // 打印完（或者取消了）回到平时的样子
        window.addEventListener("afterprint", () => {
          const url = new URL(location.href);
          url.searchParams.delete("print");
          url.searchParams.delete("autoprint");
          location.replace(url.href);
        });
        setTimeout(() => window.print(), 100);
      }
    });
}

boot();
