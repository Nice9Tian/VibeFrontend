// 设计类型：一个设计项目做的是哪一类设计。目前有两类：界面设计（ui）和平面设计（graphic）。
//
// 编辑器的内核不随类型变：画布树、选中、拖动、缩放、吸附、图层、撤销、锁定、引用、说明文档、文件监听。
// 随类型变的东西都写在这里，内核只从这里取，不在各处写“如果是平面设计就……”：
//   画板是什么（窗口还是页面）、坐标用什么单位、素材栏列什么、右侧有哪些页签、能预览什么、能导出成什么。
// 加一类新设计 = 在这里加一项，再给它写自己的标准控件和导出。
//
// 这个文件不碰网页和文件系统，工具界面、命令行和检查共用。

export type KindId = "ui" | "graphic";

export const DEFAULT_KIND: KindId = "ui";

/** 画布坐标的单位。scene.json 里的 x、y、width、height 都按它算。 */
export interface UnitSpec {
  /** 单位名，同时就是 CSS 里的单位 */
  css: "px" | "mm";
  /** 1 个单位在 100% 缩放下是多少 CSS 像素 */
  px: number;
  /** 写进文件前取整到的步长 */
  step: number;
  /** 显示数字时保留几位小数 */
  digits: number;
  /** 方向键一次移动多少：[普通, 按住 Shift] */
  nudge: [number, number];
  /** 可选的网格间距（0 表示关） */
  grids: number[];
}

/** 右侧页签的代号。每个页签由自己的模块建出来，这里只决定某类设计用哪几个、按什么顺序。 */
export type RightTab = "props" | "layout" | "menu" | "state" | "doc" | "yaml" | "events";

export interface DesignKind {
  id: KindId;
  /** 给人看的名字 */
  label: string;
  /**
   * 新建这类项目时画布用的单位。单位写在 scene.json 的 unit 里，以文件为准：
   * 平面设计默认毫米，做屏幕用的图也可以写成像素。
   */
  defaultUnit: "px" | "mm";
  /** 顶层画板：界面设计是窗口和对话框，平面设计是页面 */
  board: {
    /** 能当画板的节点类型，第一个是新建项目时用的 */
    types: string[];
    /** 界面上怎么称呼它 */
    noun: string;
    /**
     * 画板怎么摆：spread 是编辑时全部画板一页页摊开在一张无限画布上、预览时像翻书一样一屏一屏看（平面设计的页面）；
     * overlay 是主画板上叠着别的画板（界面设计的对话框，位置写在它们自己的 x、y 上）
     */
    arrange: "spread" | "overlay";
  };
  /** 素材栏“基础素材”里列出的内置类型 */
  paletteBasics: string[];
  /** 素材栏下方的图形分区要不要 */
  palette: { shapes: boolean; flow: boolean; lines: boolean };
  /** 右侧页签，按显示顺序 */
  tabs: RightTab[];
  /** 打开项目时显示哪个页签 */
  defaultTab: RightTab;
  /** 这类设计有没有这些东西 */
  has: {
    /** 逻辑（YAML）、条件开关和事件记录 */
    logic: boolean;
    /** 排版容器、停靠面板、菜单、对话框 */
    widgets: boolean;
    /** 页面的版心、出血和中缝参考线 */
    pageGuides: boolean;
    /** 双击直接改文字 */
    richText: boolean;
  };
  /** 能导出成什么 */
  exports: Array<"qt" | "web">;
}

export const UNITS: Record<"px" | "mm", UnitSpec> = {
  px: { css: "px", px: 1, step: 1, digits: 0, nudge: [1, 10], grids: [0, 4, 8, 10, 16] },
  mm: { css: "mm", px: 96 / 25.4, step: 0.01, digits: 2, nudge: [0.1, 1], grids: [0, 1, 2.5, 5] },
};

export const KINDS: Record<KindId, DesignKind> = {
  ui: {
    id: "ui",
    label: "界面设计",
    defaultUnit: "px",
    board: { types: ["Window", "Dialog"], noun: "窗口", arrange: "overlay" },
    paletteBasics: ["Container", "External", "VBox", "HBox", "Flow", "Grid", "Form", "Stack", "Dock", "Dialog"],
    palette: { shapes: true, flow: true, lines: true },
    // 和原来一样的顺序：各页签模块依次插在“文档”前面
    tabs: ["layout", "menu", "state", "events", "doc", "yaml"],
    defaultTab: "doc",
    has: { logic: true, widgets: true, pageGuides: false, richText: false },
    exports: ["qt"],
  },
  graphic: {
    id: "graphic",
    label: "平面设计",
    defaultUnit: "mm",
    board: { types: ["Page"], noun: "页面", arrange: "spread" },
    paletteBasics: ["Container", "Group"],
    // 线条（连接线、箭头）的走线和挂接是编辑器里按像素算的，平面设计里还没有；细线用很扁的矩形画
    palette: { shapes: true, flow: false, lines: false },
    tabs: ["props", "doc"],
    defaultTab: "props",
    has: { logic: false, widgets: false, pageGuides: true, richText: true },
    exports: ["web"],
  },
};

export function isKindId(value: unknown): value is KindId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(KINDS, value);
}

export function kindOf(id: KindId | undefined | null): DesignKind {
  return KINDS[id ?? DEFAULT_KIND] ?? KINDS[DEFAULT_KIND];
}

/**
 * 这类设计、这种单位下能不能画线条（直线、折线、曲线、连接线）。
 * 线条的走线、端头和吸附都按像素算，只在像素单位的画布上提供。
 */
export function linesAvailable(kind: DesignKind, unit: UnitSpec): boolean {
  return kind.palette.lines && unit.css === "px";
}

// ---------- 单位换算 ----------

/** 把一个长度取整到这个单位的步长，并去掉浮点运算留下的尾巴（0.1 + 0.2 这类）。 */
export function roundUnit(unit: UnitSpec, value: number): number {
  if (unit.step === 1) return Math.round(value);
  return Number((Math.round(value / unit.step) * unit.step).toFixed(unit.digits));
}

/**
 * 手和眼的量（点选容差、最小尺寸、吸附距离、粘贴错开的距离）是按屏幕像素定的，
 * 换成画布单位再用。像素单位下原样返回。
 */
export function fromPx(unit: UnitSpec, px: number): number {
  return unit.px === 1 ? px : px / unit.px;
}

/** 画布单位 → CSS 像素。 */
export function toPx(unit: UnitSpec, value: number): number {
  return unit.px === 1 ? value : value * unit.px;
}

/** 写成 CSS 长度，例如 12px、14.5mm。 */
export function cssLength(unit: UnitSpec, value: number): string {
  return `${unit.step === 1 ? value : Number(value.toFixed(4))}${unit.css}`;
}

/** 给人看的数字：像素不带小数，毫米最多两位，去掉末尾的 0。 */
export function formatLength(unit: UnitSpec, value: number): string {
  return String(Number(value.toFixed(unit.digits)));
}
