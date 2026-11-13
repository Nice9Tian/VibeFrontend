// 设计窗口里一个节点的 DOM 是怎么搭的：基础样式、方框的位置、给控件的环境。
// 编辑器的设计窗口、独立的播放页和导出的网页共用这一份，三处看到的才是同一个东西。
// 这里不碰编辑器的任何状态，也不读写文件。
import { cssLength, type KindId, type UnitSpec } from "./kinds.ts";
import type { SceneNode, StageServices } from "./model.ts";

/** 每个节点一个定位的外框（.vf-node），里面一个铺满的内容区（.vf-body）。 */
export const NODE_STAGE_CSS = `
.vf-node {
  position: absolute;
}
.vf-body {
  position: absolute;
  inset: 0;
}
`;

/**
 * 平面设计里，节点的外框在哪、多大只由画布数据决定（scene.json 的 x、y、width、height，写在外框的行内样式里）。
 * 组的样式类加在外框上，样式表里给这个类写的外边距、右边和下边的定位、最小最大尺寸都不能把外框挪走或撑大。
 */
export const NODE_BOX_LOCK_CSS = `
.vf-node {
  position: absolute !important;
  margin: 0 !important;
  right: auto !important;
  bottom: auto !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: none !important;
  max-height: none !important;
  box-sizing: border-box !important;
  float: none !important;
}
`;

/**
 * 铺满节点方框的根元素。节点在哪、多大由它的方框决定（scene.json 里的 x、y、width、height），
 * 所以控件画在方框里的那个根元素一律铺满方框：样式类里写的定位、外边距、宽高对它不起作用。
 * 文本框和图片的根元素自带这条；项目自己的控件给根元素加上 vf-fill 这个类就行。
 * 宽高写 100% 而不是 auto：根元素是 <svg>、<img> 这类替换元素时，auto 会按它自己的长宽比取尺寸，不撑满方框。
 */
export const FILL_STAGE_CSS = `
.vf-fill {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  margin: 0 !important;
  box-sizing: border-box !important;
}
`;

/** 基础图形和线条。 */
export const SHAPE_STAGE_CSS = `
.vf-node[data-vf-type="Shape"],
.vf-node[data-vf-type="Line"] {
  pointer-events: none;
}
.vf-shape-svg .vf-hit {
  pointer-events: all;
}
.vf-line-svg .vf-hit {
  pointer-events: stroke;
}
.vf-shape-svg,
.vf-line-svg {
  position: absolute;
  left: 0;
  top: 0;
  display: block;
  overflow: visible;
}
.vf-shape-text {
  position: absolute;
  display: flex;
  align-items: center;
  overflow: hidden;
  line-height: 1.3;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  pointer-events: none;
}
.vf-line-label {
  position: absolute;
  transform: translate(-50%, -50%);
  padding: 1px 5px;
  border-radius: 3px;
  background: #fff;
  line-height: 1.3;
  white-space: pre;
}
`;

/**
 * 平面设计的设计窗口从这份样式开始，项目自己的样式表（project.json 的 styles）盖在它上面。
 * 只定最基本的东西：盒模型、默认字体、页面是一张白纸。别的都由项目的样式表决定。
 */
export const GRAPHIC_STAGE_CSS = `
*, *::before, *::after {
  box-sizing: border-box;
}
html, body {
  margin: 0;
  padding: 0;
}
:root {
  font-family: "Noto Sans SC", "Microsoft YaHei UI", "PingFang SC", system-ui, sans-serif;
  font-size: 10pt;
  line-height: 1.5;
  color: #1a1a1a;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.vf-board {
  position: relative;
  overflow: hidden;
  background: #ffffff;
}
${NODE_STAGE_CSS}${NODE_BOX_LOCK_CSS}${FILL_STAGE_CSS}${SHAPE_STAGE_CSS}`;

/** 有没有这类设计专用的整份基础样式；界面设计的基础样式和编辑器的预览外观绑在一起，留在 main.ts。 */
export function stageBaseCssFor(kind: KindId): string | null {
  return kind === "graphic" ? GRAPHIC_STAGE_CSS : null;
}

/** 把一个节点的方框写到它的外框元素上。位置和尺寸按画布单位，写成 CSS 时带上单位。 */
export function applyNodeBox(
  el: HTMLElement,
  unit: UnitSpec,
  box: { x: number; y: number; width: number; height: number },
  rotation?: number,
): void {
  el.style.left = cssLength(unit, box.x);
  el.style.top = cssLength(unit, box.y);
  el.style.width = cssLength(unit, box.width);
  el.style.height = cssLength(unit, box.height);
  // 没有旋转时写 none：样式类里的变换也不能把外框挪走
  el.style.transform = rotation ? `rotate(${rotation}deg)` : "none";
  el.style.transformOrigin = "center center";
}

/** 组的样式类加在它的外框上，组里面的节点都在这个外框里。 */
export function applyGroupClass(wrapper: HTMLElement, node: SceneNode): void {
  const extra = typeof node.props?.class === "string" ? node.props.class.trim() : "";
  wrapper.className = extra ? `vf-node ${extra}` : "vf-node";
}

/** 页面（画板）元素：尺寸、样式类和标记。编辑器里是设计窗口的画布，播放页里每页一个。 */
export function applyBoard(el: HTMLElement, id: string, node: SceneNode, unit: UnitSpec, baseClass = "vf-board"): void {
  const extra = typeof node.props?.class === "string" ? node.props.class.trim() : "";
  el.className = extra ? `${baseClass} ${extra}` : baseClass;
  el.dataset.vfBoard = id;
  el.dataset.vfType = node.type;
  el.style.width = cssLength(unit, node.width);
  el.style.height = cssLength(unit, node.height);
}

/** 记着还有多少控件在等异步加载。导出时等它清零再出图。 */
export interface WaitTracker {
  wait(label?: string): () => void;
  /** 还没完成的那些的名字 */
  pending(): string[];
  /** 全部完成时结束；本来就没有在等的，立刻结束 */
  idle(): Promise<void>;
}

export function createWaitTracker(): WaitTracker {
  const open = new Map<number, string>();
  let next = 1;
  let waiters: Array<() => void> = [];
  const settle = () => {
    if (open.size > 0) return;
    const done = waiters;
    waiters = [];
    for (const resolve of done) resolve();
  };
  return {
    wait(label = "") {
      const key = next++;
      open.set(key, label);
      let finished = false;
      return () => {
        if (finished) return;
        finished = true;
        open.delete(key);
        settle();
      };
    },
    pending: () => [...open.values()],
    idle: () => (open.size === 0 ? Promise.resolve() : new Promise<void>((resolve) => waiters.push(resolve))),
  };
}

/** 给控件的环境。baseUrl 是项目文件夹的网址，以 / 结尾。 */
export function createStageServices(options: { unit: UnitSpec; still: boolean; print?: boolean; baseUrl: string; tracker?: WaitTracker }): StageServices {
  const { unit, still, baseUrl, tracker } = options;
  return {
    unit: { css: unit.css, px: unit.px },
    still,
    print: options.print ?? false,
    url(path: string): string {
      if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(path)) return path;
      return baseUrl + path.replace(/\\/g, "/").replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
    },
    wait: (label?: string) => (tracker ? tracker.wait(label) : () => undefined),
  };
}
