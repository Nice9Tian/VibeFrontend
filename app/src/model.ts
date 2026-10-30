// 设计项目的数据结构，以及只依赖这些数据的查找与排版计算函数。
// 这里不碰网页和文件系统：工具界面、命令行导出和嵌进 Qt 的逻辑运行层共用这一份。
import type { Value } from "./expr.ts";
import { LINE_DECL, SHAPE_DECL, type ShapePreset } from "./shapes.ts";
import { STANDARD_COMPONENTS } from "../standard/index.ts";

export { STANDARD_COMPONENTS };

export const SCENE_PATH = "ui/scene.json";
export const LOGIC_PATH = "logic/app.logic.yaml";

/** 运行层为每个节点自动提供的鼠标事件，不需要控件声明。 */
export const MOUSE_EVENTS = ["click", "dblclick", "mousedown", "mouseup", "mouseenter", "mouseleave"];
/** 运行层自动触发的全局事件。 */
export const BUILTIN_GLOBAL_EVENTS = ["app.start", "window.click"];

// ---------- 排版与尺寸规则 ----------

export type LayoutKind = "vbox" | "hbox" | "grid" | "form" | "stack";
export type SizeMode = "preferred" | "fixed" | "expanding";
export type DockArea = "left" | "right" | "top" | "bottom";

export interface LayoutSpec {
  kind: LayoutKind;
  /** 内边距：一个数字（四边相同）或 [上, 右, 下, 左] */
  padding?: number | [number, number, number, number];
  /** 控件之间的间距 */
  gap?: number;
  rowGap?: number;
  columnGap?: number;
  /** 网格排版的列数（默认 2） */
  columns?: number;
  /** 网格各列的伸缩因子 */
  columnStretch?: number[];
  /** 网格各行的伸缩因子 */
  rowStretch?: number[];
  /** 表单排版左列标签的宽度（默认 96） */
  labelWidth?: number;
}

export interface SizePolicy {
  horizontal?: SizeMode;
  vertical?: SizeMode;
  preferredWidth?: number;
  preferredHeight?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  fixedWidth?: number;
  fixedHeight?: number;
  /** 在主轴方向上的伸缩因子（0 表示不伸缩，正整数按比例分配剩余空间） */
  stretch?: number;
}

export interface MenuItemSpec {
  id: string;
  text: string;
  shortcut?: string;
  checkable?: boolean;
  checked?: boolean;
  /** 关联的停靠面板 ID：点击时切换该面板的显示和隐藏 */
  dock?: string;
  /** 点击时触发的全局事件名 */
  emit?: string;
}

export interface MenuSpec {
  id: string;
  title: string;
  items: MenuItemSpec[];
}

export interface MenuBarSpec {
  height?: number;
  menus: MenuSpec[];
}

// ---------- 画布 ----------

export interface SceneNode {
  type: string;
  x?: number;
  y?: number;
  width: number;
  height: number;
  title?: string;
  props?: Record<string, Value>;
  children?: string[];
  /** 容器的排版方式 */
  layout?: LayoutSpec;
  /** 控件的尺寸规则 */
  size?: SizePolicy;
  /** 网格排版中的位置和跨度（从 0 开始） */
  row?: number;
  column?: number;
  rowSpan?: number;
  columnSpan?: number;
  /** 表单排版中左列显示的标签文字（也可以把标签写成单独的 Label 子节点） */
  formLabel?: string;
  /** 对话框是否模态 */
  modal?: boolean;
  /** 附加窗口在预览开始时是否默认打开 */
  initialOpen?: boolean;
  /** 停靠面板所在的停靠区 */
  dockArea?: DockArea;
  /** 停靠面板标题栏高度（默认 26） */
  headerHeight?: number;
  /** 主窗口分区：菜单栏、状态栏节点 ID、中央区节点 ID、停靠面板节点 ID 列表 */
  menuBar?: MenuBarSpec;
  statusBar?: string;
  central?: string;
  docks?: string[];
}

export interface Scene {
  version: number;
  root: string;
  /** 全部顶层窗口与对话框 ID（不写时自动包含 root 及所有 Window/Dialog 节点） */
  windows?: string[];
  nodes: Record<string, SceneNode>;
}

// ---------- 控件 ----------

export interface PropDecl {
  type: "string" | "number" | "boolean" | "array";
  default?: Value;
  logic?: boolean;
}

/** 控件在 Qt 里对应什么。没有这一项的控件，导出后是一个占位框。 */
export interface QtMapping {
  /** Qt 的控件类名，例如 QPushButton */
  widget: string;
  /** 控件属性名 → Qt 属性名 */
  props?: Record<string, string>;
  /** 固定写死的 Qt 属性，例如 QLabel 的 wordWrap */
  set?: Record<string, Value>;
  /** 控件自己的事件 → Qt 的信号；type 是信号带的值的类型，没有值就不写 */
  events?: Record<string, { signal: string; type?: "string" | "number" | "boolean" }>;
}

export interface ComponentDecl {
  type: string;
  label?: string;
  description?: string;
  defaultSize?: { width: number; height: number };
  props?: Record<string, PropDecl>;
  bind?: string;
  events?: string[];
  children?: boolean;
  entry?: string;
  style?: string;
  qt?: QtMapping;
}

export interface ComponentInstance {
  update(props: Record<string, Value>): void;
  destroy(): void;
}

export type ComponentCreate = (
  el: HTMLElement,
  ctx: { props: Record<string, Value>; emit: (event: string, value?: Value) => void; mode: "design" | "preview" },
) => ComponentInstance;

export interface LoadedComponent {
  decl: ComponentDecl;
  /** 所在的文件夹名 */
  folder?: string;
  /** 实现文件的原文 */
  source?: string;
  /** 只在工具界面里有：实现文件加载后得到的创建函数 */
  create?: ComponentCreate;
  error?: string;
}

/** 未转换的容器。 */
export const CONTAINER_DECL: ComponentDecl = {
  type: "Container",
  label: "容器",
  defaultSize: { width: 160, height: 80 },
  children: true,
};

/** 外部容器：工具里只是占位，导出后由业务把自己的控件放进来。 */
export const EXTERNAL_DECL: ComponentDecl = {
  type: "External",
  label: "外部容器",
  description: "工具里只是占位；导出后由业务把自己的控件（例如绘图区）放进来",
  defaultSize: { width: 240, height: 160 },
  children: false,
};

export const DIALOG_DECL: ComponentDecl = {
  type: "Dialog",
  label: "对话框",
  description: "弹出窗口或模态对话框",
  defaultSize: { width: 420, height: 320 },
  props: {
    title: { type: "string", default: "对话框", logic: true },
  },
  children: true,
};

export const DOCK_DECL: ComponentDecl = {
  type: "Dock",
  label: "停靠面板",
  description: "主窗口四侧的停靠面板，导出为 QDockWidget",
  defaultSize: { width: 240, height: 320 },
  props: {
    title: { type: "string", default: "面板", logic: true },
  },
  children: true,
};

export const STACK_DECL: ComponentDecl = {
  type: "Stack",
  label: "层叠布局",
  description: "多个子页面叠在同一区域，按 currentIndex 或 currentPage 切换显示",
  defaultSize: { width: 320, height: 240 },
  props: {
    currentIndex: { type: "number", default: 0, logic: true },
    currentPage: { type: "string", default: "", logic: true },
  },
  children: true,
};

export const LAYOUT_TYPE_KINDS: Record<string, LayoutKind> = {
  VBox: "vbox",
  HBox: "hbox",
  Grid: "grid",
  Form: "form",
  Stack: "stack",
};

/** 工具自带、不需要 components/ 里有文件夹的类型。 */
export const BUILTIN_TYPES = [
  "Window",
  "Dialog",
  "Container",
  "External",
  "Dock",
  "VBox",
  "HBox",
  "Grid",
  "Form",
  "Stack",
  "Shape",
  "Line",
];

// ---------- 效果 ----------

/** 效果的种类。目前只有一种：控件显示和隐藏时的过渡。 */
export const EFFECT_KINDS = ["visibility"];

export interface EffectDecl {
  name: string;
  label?: string;
  description?: string;
  kind: string;
  entry?: string;
}

/** 显示隐藏过渡在网页里的实现：播放完成时返回的 Promise 结束。 */
export type EffectPlay = (el: HTMLElement, ctx: { showing: boolean }) => Promise<unknown> | { finished: Promise<unknown> } | void;

export interface LoadedEffect {
  decl: EffectDecl;
  folder: string;
  /** 效果文件夹里的全部文件：文件名 → 原文 */
  files: Record<string, string>;
  /** 由名字、种类和实现算出的哈希，8 位十六进制。导出到 Qt 时用它对接。 */
  hash: string;
  /** 只在工具界面里有 */
  play?: EffectPlay;
  error?: string;
}

// ---------- 逻辑 ----------

export type ParamType = "string" | "number" | "boolean";

export type Step =
  | { set: string }
  | { emit: string | { name: string; args?: Record<string, Value | string> } }
  | { if: string; then?: Step[]; else?: Step[] }
  | { push: { to: string; item: Value | Record<string, Value | string>; index?: string | number } }
  | { remove: { from: string; index: string | number } }
  | { move: { in: string; from: string | number; to: string | number } }
  | { fn: string | { name: string; args?: Record<string, Value | string> } }
  | { openWindow: string | { id: string; modal?: boolean } }
  | { closeWindow: string }
  | { call: string };

export interface ConditionDef {
  type: "text" | "symbol";
  text?: string;
  expr?: string;
  preview?: boolean;
}

/** 业务事件（界面 → 业务）：交给业务处理；simulate 是业务没有接上时用来顶替的步骤。 */
export interface BusinessEventDef {
  owner: "business";
  text?: string;
  params?: Record<string, ParamType>;
  simulate?: Step[];
}

/** 请求事件（业务 → 界面）：业务调用接口触发，由界面执行 steps。 */
export interface RequestEventDef {
  owner: "ui";
  text?: string;
  params?: Record<string, ParamType>;
  steps: Step[];
}

/** 顶层 events 里的一项：普通全局事件是步骤列表，业务事件和请求事件是对象。 */
export type GlobalEventDef = Step[] | BusinessEventDef | RequestEventDef;

export interface ActionDef {
  handler?: string;
  text?: string;
  input?: Record<string, string | number | boolean>;
  mockResult?: Value;
  mockError?: string;
  onSuccess?: Step[];
  onError?: Step[];
}

export interface ObjectLogic {
  doc?: string;
  bind?: string;
  conditions?: Record<string, ConditionDef>;
  props?: Record<string, string | boolean | number>;
  events?: Record<string, Step[]>;
  /** 属性名 → 效果名。目前只支持 visible：显示和隐藏时播放这个效果 */
  effects?: Record<string, string>;
}

export interface Logic {
  state?: Record<string, unknown>;
  conditions?: Record<string, ConditionDef>;
  events?: Record<string, GlobalEventDef>;
  actions?: Record<string, ActionDef>;
  functions?: Record<string, { handler?: string; text?: string }>;
  objects?: Record<string, ObjectLogic>;
}

export interface Problem {
  level: "error" | "hint";
  message: string;
  nodeId?: string;
}

/** 逻辑运行层需要的那一部分项目内容。 */
export interface RuntimeProject {
  scene: Scene;
  logic: Logic;
  components: Map<string, { decl: ComponentDecl }>;
  /** 逻辑 JS 函数：函数名 → 源码 */
  functions?: Record<string, string>;
  /** 动作文件是否存在：动作名 → 源码（可选） */
  actionSources?: Record<string, string>;
}

export interface Project extends RuntimeProject {
  root: string;
  name: string;
  /** 当前窗口的页面文档路径 */
  pageDoc: string;
  /** scene.json 的原文，用来算出某个节点在文件中的行号 */
  sceneText: string;
  logicText: string;
  /** 路径 → Markdown 原文 */
  docs: Map<string, string>;
  components: Map<string, LoadedComponent>;
  /** 效果名 → 效果 */
  effects: Map<string, LoadedEffect>;
  /** 用户存下来的图形预设，来自 ui/presets.json */
  presets: ShapePreset[];
  /** 导出成 Qt 时默认写到哪里，相对于项目文件夹；project.json 里没写就是空 */
  qtExportDir: string | null;
  problems: Problem[];
  /** 所有项目文件内容拼成的指纹，用来判断重新加载后有没有变化 */
  signature: string;
}

// ---------- 状态与名字解析 ----------

export interface StateLeaf {
  type: "string" | "number" | "boolean" | "enum" | "array";
  initial?: Value;
  values?: string[];
  /** 归谁管：ui（界面自己管，默认）或 business（业务管） */
  owner?: string;
}

export function isStateLeaf(def: unknown): def is StateLeaf {
  return typeof def === "object" && def !== null && typeof (def as StateLeaf).type === "string";
}

export function findStateLeaf(logic: Logic, path: string): StateLeaf | null {
  let cursor: unknown = logic.state;
  for (const part of path.split(".")) {
    if (typeof cursor !== "object" || cursor === null || isStateLeaf(cursor)) return null;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return isStateLeaf(cursor) ? cursor : null;
}

/** 全部状态，按文件里的顺序。 */
export function allStateLeaves(logic: Logic): Array<{ path: string; leaf: StateLeaf }> {
  const list: Array<{ path: string; leaf: StateLeaf }> = [];
  const walk = (defs: unknown, prefix: string) => {
    if (typeof defs !== "object" || defs === null) return;
    for (const key of Object.keys(defs)) {
      const def = (defs as Record<string, unknown>)[key];
      if (isStateLeaf(def)) list.push({ path: prefix + key, leaf: def });
      else walk(def, `${prefix}${key}.`);
    }
  };
  walk(logic.state, "");
  return list;
}

export function isBusinessState(leaf: StateLeaf | null): boolean {
  return leaf !== null && leaf.owner === "business";
}

/** 是业务事件（界面 → 业务）就返回它的定义，否则返回 null。 */
export function businessEvent(logic: Logic, name: string): BusinessEventDef | null {
  const def = logic.events ? logic.events[name] : undefined;
  return def && !Array.isArray(def) && typeof def === "object" && def.owner === "business" ? def : null;
}

/** 是请求事件（业务 → 界面）就返回它的定义，否则返回 null。 */
export function requestEvent(logic: Logic, name: string): RequestEventDef | null {
  const def = logic.events ? logic.events[name] : undefined;
  return def && !Array.isArray(def) && typeof def === "object" && def.owner === "ui" ? (def as RequestEventDef) : null;
}

/** 普通全局事件的步骤；不存在或者是业务事件/请求事件时返回 null。 */
export function globalSteps(logic: Logic, name: string): Step[] | null {
  const def = logic.events ? logic.events[name] : undefined;
  return Array.isArray(def) ? def : null;
}

/** 按完整代号找条件：全局条件（run）或控件条件（saveButton.canSave）。 */
export function findCondition(logic: Logic, id: string): ConditionDef | null {
  const global = logic.conditions?.[id];
  if (global) return global;
  const dot = id.indexOf(".");
  if (dot < 0) return null;
  return logic.objects?.[id.slice(0, dot)]?.conditions?.[id.slice(dot + 1)] ?? null;
}

export function allConditions(logic: Logic): Array<{ id: string; def: ConditionDef }> {
  const list: Array<{ id: string; def: ConditionDef }> = [];
  const globals = logic.conditions ?? {};
  for (const id of Object.keys(globals)) list.push({ id, def: globals[id] });
  const objects = logic.objects ?? {};
  for (const objectId of Object.keys(objects)) {
    const conditions = objects[objectId]?.conditions ?? {};
    for (const name of Object.keys(conditions)) list.push({ id: `${objectId}.${name}`, def: conditions[name] });
  }
  return list;
}

export function declFor(project: RuntimeProject, type: string): ComponentDecl | null {
  if (type === "Stack") return STACK_DECL;
  if (type === "Dock") return DOCK_DECL;
  if (type === "Dialog") return DIALOG_DECL;
  if (type === "Container" || type === "Window" || type in LAYOUT_TYPE_KINDS) return CONTAINER_DECL;
  if (type === "External") return EXTERNAL_DECL;
  if (type === "Shape") return SHAPE_DECL;
  if (type === "Line") return LINE_DECL;
  return project.components.get(type)?.decl ?? STANDARD_COMPONENTS.get(type)?.decl ?? null;
}

/**
 * 统一获取一个画布节点的全部直接子节点 ID（按 docks → central → statusBar → children 顺序去重）。
 */
export function childrenOfNode(n: SceneNode | undefined): string[] {
  if (!n) return [];
  const list: string[] = [];
  const add = (cid: string | undefined) => {
    if (cid && !list.includes(cid)) list.push(cid);
  };
  for (const cid of n.docks ?? []) add(cid);
  add(n.central);
  add(n.statusBar);
  for (const cid of n.children ?? []) add(cid);
  return list;
}

/** 查找某个节点在画布树中的父节点 ID（含主窗口的 docks / central / statusBar 分区）。 */
export function parentOfNode(scene: Scene, id: string): string | null {
  for (const [parentId, parent] of Object.entries(scene.nodes)) {
    if (childrenOfNode(parent).includes(id)) return parentId;
  }
  return null;
}

/** 从画布所有节点引用（children / docks / central / statusBar / menuBar.dock / windows）中移除一组被删除的节点 ID。 */
export function removeNodeReferences(scene: Scene, removed: ReadonlySet<string>): void {
  if (scene.windows) {
    scene.windows = scene.windows.filter((wid) => !removed.has(wid));
  }
  for (const n of Object.values(scene.nodes)) {
    if (n.children) n.children = n.children.filter((cid) => !removed.has(cid));
    if (n.docks) n.docks = n.docks.filter((cid) => !removed.has(cid));
    if (n.central && removed.has(n.central)) delete n.central;
    if (n.statusBar && removed.has(n.statusBar)) delete n.statusBar;
    if (n.menuBar?.menus) {
      for (const menu of n.menuBar.menus) {
        for (const item of menu.items ?? []) {
          if (item.dock && removed.has(item.dock)) delete item.dock;
        }
      }
    }
  }
}

/** 将画布中对 oldId 的所有结构引用（root / windows / children / docks / central / statusBar / menuBar.dock / Line 端点）统一重命名为 nextId。 */
export function renameNodeReferences(scene: Scene, oldId: string, nextId: string): void {
  if (scene.root === oldId) scene.root = nextId;
  if (scene.windows) {
    scene.windows = scene.windows.map((wid) => (wid === oldId ? nextId : wid));
  }
  for (const n of Object.values(scene.nodes)) {
    if (n.children) n.children = n.children.map((cid) => (cid === oldId ? nextId : cid));
    if (n.docks) n.docks = n.docks.map((cid) => (cid === oldId ? nextId : cid));
    if (n.central === oldId) n.central = nextId;
    if (n.statusBar === oldId) n.statusBar = nextId;
    if (n.menuBar?.menus) {
      for (const menu of n.menuBar.menus) {
        for (const item of menu.items ?? []) {
          if (item.dock === oldId) item.dock = nextId;
        }
      }
    }
    if (n.type === "Line" && n.props) {
      if (n.props.startNode === oldId) n.props.startNode = nextId;
      if (n.props.endNode === oldId) n.props.endNode = nextId;
    }
  }
}

/** 复制粘贴节点时，按映射函数统一重写节点内部的 children / docks / central / statusBar 子节点 ID。 */
export function remapNodeChildren(n: SceneNode, mapId: (oldId: string) => string | undefined): void {
  if (n.children) {
    n.children = n.children.map(mapId).filter((cid): cid is string => Boolean(cid));
  }
  if (n.docks) {
    n.docks = n.docks.map(mapId).filter((cid): cid is string => Boolean(cid));
  }
  if (n.central) {
    const mapped = mapId(n.central);
    if (mapped) n.central = mapped;
    else delete n.central;
  }
  if (n.statusBar) {
    const mapped = mapId(n.statusBar);
    if (mapped) n.statusBar = mapped;
    else delete n.statusBar;
  }
}

// ---------- 窗口、菜单与排版计算 ----------

export function allWindowIds(scene: Scene): string[] {
  const result: string[] = [];
  const add = (id: string) => {
    if (id && scene.nodes[id] && !result.includes(id)) result.push(id);
  };
  add(scene.root);
  for (const id of scene.windows ?? []) add(id);
  for (const [id, n] of Object.entries(scene.nodes)) {
    if (n.type === "Window" || n.type === "Dialog") add(id);
  }
  return result;
}

export function allMenuItems(scene: Scene): Array<{ windowId: string; menuId: string; item: MenuItemSpec }> {
  const list: Array<{ windowId: string; menuId: string; item: MenuItemSpec }> = [];
  for (const winId of allWindowIds(scene)) {
    const menuBar = scene.nodes[winId]?.menuBar;
    if (!menuBar) continue;
    for (const menu of menuBar.menus ?? []) {
      for (const item of menu.items ?? []) list.push({ windowId: winId, menuId: menu.id, item });
    }
  }
  return list;
}

export function findMenuItem(scene: Scene, id: string): MenuItemSpec | null {
  for (const entry of allMenuItems(scene)) {
    if (entry.item.id === id) return entry.item;
  }
  return null;
}

export function layoutOf(node: SceneNode | undefined): LayoutSpec | null {
  if (!node) return null;
  if (node.layout) return node.layout;
  const kind = LAYOUT_TYPE_KINDS[node.type];
  return kind ? { kind } : null;
}

export function paddingOf(layout: LayoutSpec | null | undefined): [number, number, number, number] {
  const p = layout?.padding;
  if (Array.isArray(p) && p.length === 4) return [p[0], p[1], p[2], p[3]];
  const v = typeof p === "number" ? p : 0;
  return [v, v, v, v];
}

export function prefWidth(node: SceneNode): number {
  return Math.round(node.size?.fixedWidth ?? node.size?.preferredWidth ?? node.width ?? 100);
}

export function prefHeight(node: SceneNode): number {
  return Math.round(node.size?.fixedHeight ?? node.size?.preferredHeight ?? node.height ?? 32);
}

export function clampWidth(node: SceneNode, w: number): number {
  if (node.size?.fixedWidth !== undefined) return Math.round(node.size.fixedWidth);
  if (node.size?.horizontal === "fixed") return prefWidth(node);
  const minW = node.size?.minWidth ?? 0;
  const maxW = node.size?.maxWidth ?? Infinity;
  return Math.round(Math.max(minW, Math.min(maxW, w)));
}

export function clampHeight(node: SceneNode, h: number): number {
  if (node.size?.fixedHeight !== undefined) return Math.round(node.size.fixedHeight);
  if (node.size?.vertical === "fixed") return prefHeight(node);
  const minH = node.size?.minHeight ?? 0;
  const maxH = node.size?.maxHeight ?? Infinity;
  return Math.round(Math.max(minH, Math.min(maxH, h)));
}

/** 按与 Qt qGeomCalc 相同的累积舍入与最小/最大夹紧重分配规则把 rem 按比例分给各项。 */
function distributeStretch(rem: number, weights: number[], mins?: number[], maxs?: number[]): number[] {
  const n = weights.length;
  const result = new Array<number>(n).fill(0);
  const active = weights.map((w) => w > 0);
  let remaining = Math.max(0, rem);

  for (let pass = 0; pass < n; pass++) {
    const activeWeights = weights.map((w, i) => (active[i] ? w : 0));
    const total = activeWeights.reduce((a, b) => a + b, 0);
    if (total <= 0) break;

    let acc = 0;
    const remSpace = Math.max(0, remaining);
    const tentative = activeWeights.map((w) => {
      if (w <= 0) return 0;
      const start = Math.round((acc * remSpace) / total);
      acc += w;
      const end = Math.round((acc * remSpace) / total);
      return Math.max(0, end - start);
    });

    let clampedAny = false;
    for (let i = 0; i < n; i++) {
      if (!active[i]) continue;
      const minV = mins?.[i] ?? 0;
      const maxV = maxs?.[i] ?? Infinity;
      if (tentative[i] < minV || tentative[i] > maxV) {
        const clamped = Math.round(Math.max(minV, Math.min(maxV, tentative[i])));
        result[i] = clamped;
        active[i] = false;
        remaining -= clamped;
        clampedAny = true;
      }
    }

    if (!clampedAny) {
      for (let i = 0; i < n; i++) {
        if (active[i]) result[i] = tentative[i];
      }
      break;
    }
  }
  return result;
}

export interface ComputedBox {
  /** 相对于父节点左上角的坐标 */
  x: number;
  y: number;
  width: number;
  height: number;
  /** 相对于所属顶层窗口左上角的坐标 */
  absX: number;
  absY: number;
  visible: boolean;
  windowId: string;
}

export function isPartitionedWindow(node: SceneNode | undefined): boolean {
  if (!node) return false;
  return Boolean(node.menuBar || node.statusBar || node.central || (node.docks && node.docks.length > 0));
}

/**
 * 计算一个窗口（或全部窗口）内所有节点的位置和尺寸。
 * 规则与 Qt 的 QMainWindow + QDockWidget + QVBoxLayout/QHBoxLayout/QGridLayout/QFormLayout/QStackedLayout 完全一致。
 */
export function computeSceneLayout(
  scene: Scene,
  options: {
    rootSize?: { width: number; height: number };
    isVisible?: (id: string) => boolean;
    getProp?: (id: string, prop: string) => Value;
  } = {},
): Map<string, ComputedBox> {
  const isVisible = options.isVisible ?? (() => true);
  const getProp = options.getProp ?? ((id: string, prop: string) => scene.nodes[id]?.props?.[prop] ?? null);
  const boxes = new Map<string, ComputedBox>();

  const layoutSubtree = (parentId: string, parentBox: ComputedBox) => {
    const parent = scene.nodes[parentId];
    if (!parent) return;
    const children = (parent.children ?? []).filter((cid) => !boxes.has(cid) && Boolean(scene.nodes[cid]));
    if (children.length === 0) return;

    const headerOffset = parent.type === "Dock" ? (parent.headerHeight ?? 26) : 0;
    const layout = layoutOf(parent);

    if (!layout) {
      for (const cid of children) {
        const c = scene.nodes[cid]!;
        const cx = Math.round(c.x ?? 0);
        const cy = Math.round((c.y ?? 0) + headerOffset);
        const cw = Math.round(c.width);
        const ch = Math.round(c.height);
        const box: ComputedBox = {
          x: cx,
          y: cy,
          width: cw,
          height: ch,
          absX: parentBox.absX + cx,
          absY: parentBox.absY + cy,
          visible: parentBox.visible && isVisible(cid),
          windowId: parentBox.windowId,
        };
        boxes.set(cid, box);
        layoutSubtree(cid, box);
      }
      return;
    }

    const [padTop, padRight, padBottom, padLeft] = paddingOf(layout);
    const innerX = padLeft;
    const innerY = headerOffset + padTop;
    const innerW = Math.max(0, parentBox.width - padLeft - padRight);
    const innerH = Math.max(0, parentBox.height - headerOffset - padTop - padBottom);

    if (layout.kind === "vbox") {
      const gap = layout.gap ?? layout.rowGap ?? 0;
      const visChildren: string[] = [];
      for (const cid of children) {
        if (isVisible(cid)) visChildren.push(cid);
        else {
          const c = scene.nodes[cid]!;
          const box: ComputedBox = {
            x: innerX,
            y: innerY,
            width: clampWidth(c, innerW),
            height: prefHeight(c),
            absX: parentBox.absX + innerX,
            absY: parentBox.absY + innerY,
            visible: false,
            windowId: parentBox.windowId,
          };
          boxes.set(cid, box);
          layoutSubtree(cid, box);
        }
      }
      const stretches = visChildren.map((cid) => {
        const c = scene.nodes[cid]!;
        return c.size?.stretch ?? (c.size?.vertical === "expanding" ? 1 : 0);
      });
      const baseHeights = visChildren.map((cid, i) => (stretches[i] > 0 ? 0 : clampHeight(scene.nodes[cid]!, prefHeight(scene.nodes[cid]!))));
      const mins = visChildren.map((cid) => Math.round(scene.nodes[cid]!.size?.minHeight ?? 0));
      const maxs = visChildren.map((cid) => {
        const m = scene.nodes[cid]!.size?.maxHeight;
        return m !== undefined ? Math.round(m) : Infinity;
      });
      const fixedSum = baseHeights.reduce((a, b) => a + b, 0);
      const totalGap = Math.max(0, visChildren.length - 1) * gap;
      const remH = Math.max(0, innerH - fixedSum - totalGap);
      const extraH = distributeStretch(remH, stretches, mins, maxs);

      let curY = innerY;
      visChildren.forEach((cid, i) => {
        const c = scene.nodes[cid]!;
        const ch = stretches[i] > 0 ? clampHeight(c, extraH[i]) : baseHeights[i];
        const cw = clampWidth(c, innerW);
        const box: ComputedBox = {
          x: innerX,
          y: curY,
          width: cw,
          height: ch,
          absX: parentBox.absX + innerX,
          absY: parentBox.absY + curY,
          visible: parentBox.visible,
          windowId: parentBox.windowId,
        };
        boxes.set(cid, box);
        layoutSubtree(cid, box);
        curY += ch + gap;
      });
      return;
    }

    if (layout.kind === "hbox") {
      const gap = layout.gap ?? layout.columnGap ?? 0;
      const visChildren: string[] = [];
      for (const cid of children) {
        if (isVisible(cid)) visChildren.push(cid);
        else {
          const c = scene.nodes[cid]!;
          const box: ComputedBox = {
            x: innerX,
            y: innerY,
            width: prefWidth(c),
            height: clampHeight(c, innerH),
            absX: parentBox.absX + innerX,
            absY: parentBox.absY + innerY,
            visible: false,
            windowId: parentBox.windowId,
          };
          boxes.set(cid, box);
          layoutSubtree(cid, box);
        }
      }
      const stretches = visChildren.map((cid) => {
        const c = scene.nodes[cid]!;
        return c.size?.stretch ?? (c.size?.horizontal === "expanding" ? 1 : 0);
      });
      const baseWidths = visChildren.map((cid, i) => (stretches[i] > 0 ? 0 : clampWidth(scene.nodes[cid]!, prefWidth(scene.nodes[cid]!))));
      const mins = visChildren.map((cid) => Math.round(scene.nodes[cid]!.size?.minWidth ?? 0));
      const maxs = visChildren.map((cid) => {
        const m = scene.nodes[cid]!.size?.maxWidth;
        return m !== undefined ? Math.round(m) : Infinity;
      });
      const fixedSum = baseWidths.reduce((a, b) => a + b, 0);
      const totalGap = Math.max(0, visChildren.length - 1) * gap;
      const remW = Math.max(0, innerW - fixedSum - totalGap);
      const extraW = distributeStretch(remW, stretches, mins, maxs);

      let curX = innerX;
      visChildren.forEach((cid, i) => {
        const c = scene.nodes[cid]!;
        const cw = stretches[i] > 0 ? clampWidth(c, extraW[i]) : baseWidths[i];
        const ch = clampHeight(c, innerH);
        const box: ComputedBox = {
          x: curX,
          y: innerY,
          width: cw,
          height: ch,
          absX: parentBox.absX + curX,
          absY: parentBox.absY + innerY,
          visible: parentBox.visible,
          windowId: parentBox.windowId,
        };
        boxes.set(cid, box);
        layoutSubtree(cid, box);
        curX += cw + gap;
      });
      return;
    }

    if (layout.kind === "grid") {
      const cols = Math.max(1, layout.columns ?? 2);
      const colGap = layout.columnGap ?? layout.gap ?? 0;
      const rowGap = layout.rowGap ?? layout.gap ?? 0;
      interface CellItem {
        id: string;
        row: number;
        col: number;
        rowSpan: number;
        colSpan: number;
        vis: boolean;
      }
      const items: CellItem[] = [];
      let autoIndex = 0;
      for (const cid of children) {
        const c = scene.nodes[cid]!;
        const vis = isVisible(cid);
        const row = c.row ?? Math.floor(autoIndex / cols);
        const col = c.column ?? (autoIndex % cols);
        const rowSpan = Math.max(1, c.rowSpan ?? 1);
        const colSpan = Math.max(1, Math.min(cols - col, c.columnSpan ?? 1));
        items.push({ id: cid, row, col, rowSpan, colSpan, vis });
        autoIndex++;
      }
      const numRows = Math.max(1, ...items.map((it) => it.row + it.rowSpan));

      const colStretches = Array.from({ length: cols }, (_, col) => layout.columnStretch?.[col] ?? 1);
      const colBaseW = Array.from({ length: cols }, (_, col) => {
        if (colStretches[col] > 0) return 0;
        let maxW = 0;
        for (const it of items) {
          if (it.col === col && it.colSpan === 1) maxW = Math.max(maxW, clampWidth(scene.nodes[it.id]!, prefWidth(scene.nodes[it.id]!)));
        }
        return maxW || 60;
      });
      const colMins = Array.from({ length: cols }, (_, col) => {
        let minW = 0;
        for (const it of items) {
          if (it.col === col && it.colSpan === 1) minW = Math.max(minW, Math.round(scene.nodes[it.id]!.size?.minWidth ?? 0));
        }
        return minW;
      });
      const colMaxs = Array.from({ length: cols }, (_, col) => {
        let maxW = Infinity;
        for (const it of items) {
          const m = scene.nodes[it.id]!.size?.maxWidth;
          if (it.col === col && it.colSpan === 1 && m !== undefined) maxW = Math.min(maxW, Math.round(m));
        }
        return maxW;
      });
      const availW = Math.max(0, innerW - Math.max(0, cols - 1) * colGap - colBaseW.reduce((a, b) => a + b, 0));
      const colExtraW = distributeStretch(availW, colStretches, colMins, colMaxs);
      const colW = colBaseW.map((b, c) => (colStretches[c] > 0 ? colExtraW[c] : b));
      const colX: number[] = [];
      let cx = innerX;
      for (let c = 0; c < cols; c++) {
        colX.push(cx);
        cx += colW[c] + colGap;
      }

      const rowStretches = Array.from({ length: numRows }, (_, row) => layout.rowStretch?.[row] ?? 0);
      const rowBaseH = Array.from({ length: numRows }, (_, row) => {
        if (rowStretches[row] > 0) return 0;
        let maxH = 0;
        for (const it of items) {
          if (it.row === row && it.rowSpan === 1) maxH = Math.max(maxH, clampHeight(scene.nodes[it.id]!, prefHeight(scene.nodes[it.id]!)));
        }
        return maxH || 32;
      });
      const rowMins = Array.from({ length: numRows }, (_, row) => {
        let minH = 0;
        for (const it of items) {
          if (it.row === row && it.rowSpan === 1) minH = Math.max(minH, Math.round(scene.nodes[it.id]!.size?.minHeight ?? 0));
        }
        return minH;
      });
      const rowMaxs = Array.from({ length: numRows }, (_, row) => {
        let maxH = Infinity;
        for (const it of items) {
          const m = scene.nodes[it.id]!.size?.maxHeight;
          if (it.row === row && it.rowSpan === 1 && m !== undefined) maxH = Math.min(maxH, Math.round(m));
        }
        return maxH;
      });
      const availH = Math.max(0, innerH - Math.max(0, numRows - 1) * rowGap - rowBaseH.reduce((a, b) => a + b, 0));
      const rowExtraH = distributeStretch(availH, rowStretches, rowMins, rowMaxs);
      const rowH = rowBaseH.map((b, r) => (rowStretches[r] > 0 ? rowExtraH[r] : b));
      const rowY: number[] = [];
      let cy = innerY;
      for (let r = 0; r < numRows; r++) {
        rowY.push(cy);
        cy += rowH[r] + rowGap;
      }

      for (const it of items) {
        const c = scene.nodes[it.id]!;
        const x = colX[it.col] ?? innerX;
        const y = rowY[it.row] ?? innerY;
        let spanW = 0;
        for (let k = 0; k < it.colSpan; k++) spanW += (colW[it.col + k] ?? 0) + (k > 0 ? colGap : 0);
        let spanH = 0;
        for (let k = 0; k < it.rowSpan; k++) spanH += (rowH[it.row + k] ?? 0) + (k > 0 ? rowGap : 0);
        const w = clampWidth(c, spanW);
        const h = clampHeight(c, spanH);
        const box: ComputedBox = {
          x,
          y,
          width: w,
          height: h,
          absX: parentBox.absX + x,
          absY: parentBox.absY + y,
          visible: parentBox.visible && it.vis,
          windowId: parentBox.windowId,
        };
        boxes.set(it.id, box);
        layoutSubtree(it.id, box);
      }
      return;
    }

    if (layout.kind === "form") {
      const colGap = layout.columnGap ?? layout.gap ?? 8;
      const rowGap = layout.rowGap ?? layout.gap ?? 8;
      const labelW = layout.labelWidth ?? 96;
      const fieldW = Math.max(0, innerW - labelW - colGap);
      let curY = innerY;
      for (let i = 0; i < children.length; i += 2) {
        const labelId = children[i];
        const fieldId = children[i + 1];
        const labelNode = labelId ? scene.nodes[labelId] : undefined;
        const fieldNode = fieldId ? scene.nodes[fieldId] : undefined;
        const rowVis = (labelId ? isVisible(labelId) : false) || (fieldId ? isVisible(fieldId) : false);
        const rowH = Math.max(labelNode ? prefHeight(labelNode) : 0, fieldNode ? prefHeight(fieldNode) : 0, 28);
        if (labelId && labelNode) {
          const box: ComputedBox = {
            x: innerX,
            y: curY,
            width: labelW,
            height: rowH,
            absX: parentBox.absX + innerX,
            absY: parentBox.absY + curY,
            visible: parentBox.visible && isVisible(labelId),
            windowId: parentBox.windowId,
          };
          boxes.set(labelId, box);
          layoutSubtree(labelId, box);
        }
        if (fieldId && fieldNode) {
          const fx = innerX + labelW + colGap;
          const fw = clampWidth(fieldNode, fieldW);
          const box: ComputedBox = {
            x: fx,
            y: curY,
            width: fw,
            height: rowH,
            absX: parentBox.absX + fx,
            absY: parentBox.absY + curY,
            visible: parentBox.visible && isVisible(fieldId),
            windowId: parentBox.windowId,
          };
          boxes.set(fieldId, box);
          layoutSubtree(fieldId, box);
        }
        if (rowVis) curY += rowH + rowGap;
      }
      return;
    }

    if (layout.kind === "stack") {
      const activeIdx = Number(getProp(parentId, "currentIndex") ?? parent.props?.currentIndex ?? 0);
      const activePage = String(getProp(parentId, "currentPage") ?? parent.props?.currentPage ?? "");
      children.forEach((cid, idx) => {
        const active = activePage ? cid === activePage : idx === activeIdx;
        const box: ComputedBox = {
          x: innerX,
          y: innerY,
          width: innerW,
          height: innerH,
          absX: parentBox.absX + innerX,
          absY: parentBox.absY + innerY,
          visible: parentBox.visible && active && isVisible(cid),
          windowId: parentBox.windowId,
        };
        boxes.set(cid, box);
        layoutSubtree(cid, box);
      });
    }
  };

  for (const winId of allWindowIds(scene)) {
    const winNode = scene.nodes[winId];
    if (!winNode) continue;
    const W = winId === scene.root && options.rootSize ? options.rootSize.width : winNode.width;
    const H = winId === scene.root && options.rootSize ? options.rootSize.height : winNode.height;
    const winVis = isVisible(winId);
    const winBox: ComputedBox = { x: 0, y: 0, width: W, height: H, absX: 0, absY: 0, visible: winVis, windowId: winId };
    boxes.set(winId, winBox);

    if (isPartitionedWindow(winNode)) {
      const menuH = winNode.menuBar ? (winNode.menuBar.height ?? 28) : 0;
      const statusId = winNode.statusBar;
      const statusNode = statusId ? scene.nodes[statusId] : undefined;
      const statusVis = Boolean(statusId && statusNode && isVisible(statusId));
      const statusH = statusNode ? (statusVis ? prefHeight(statusNode) : 0) : 0;
      if (statusId && statusNode) {
        const sBox: ComputedBox = {
          x: 0,
          y: H - (statusH || prefHeight(statusNode)),
          width: W,
          height: statusH || prefHeight(statusNode),
          absX: 0,
          absY: H - (statusH || prefHeight(statusNode)),
          visible: winVis && statusVis,
          windowId: winId,
        };
        boxes.set(statusId, sBox);
        layoutSubtree(statusId, sBox);
      }

      const midY = menuH;
      const midH = Math.max(0, H - menuH - statusH);
      const dockIds = winNode.docks ?? (winNode.children ?? []).filter((cid) => scene.nodes[cid]?.type === "Dock");

      const byArea: Record<DockArea, string[]> = { top: [], bottom: [], left: [], right: [] };
      for (const did of dockIds) {
        const d = scene.nodes[did];
        if (!d) continue;
        const area: DockArea = d.dockArea ?? "left";
        if (isVisible(did)) byArea[area].push(did);
        else {
          const dBox: ComputedBox = {
            x: 0,
            y: midY,
            width: prefWidth(d),
            height: prefHeight(d),
            absX: 0,
            absY: midY,
            visible: false,
            windowId: winId,
          };
          boxes.set(did, dBox);
          layoutSubtree(did, dBox);
        }
      }

      let topH = 0;
      for (const did of byArea.top) {
        const d = scene.nodes[did]!;
        const dh = prefHeight(d);
        const dBox: ComputedBox = { x: 0, y: midY + topH, width: W, height: dh, absX: 0, absY: midY + topH, visible: winVis, windowId: winId };
        boxes.set(did, dBox);
        layoutSubtree(did, dBox);
        topH += dh;
      }

      let bottomH = 0;
      for (const did of byArea.bottom) bottomH += prefHeight(scene.nodes[did]!);
      let bCurY = midY + midH - bottomH;
      for (const did of byArea.bottom) {
        const d = scene.nodes[did]!;
        const dh = prefHeight(d);
        const dBox: ComputedBox = { x: 0, y: bCurY, width: W, height: dh, absX: 0, absY: bCurY, visible: winVis, windowId: winId };
        boxes.set(did, dBox);
        layoutSubtree(did, dBox);
        bCurY += dh;
      }

      const centerY = midY + topH;
      const centerH = Math.max(0, midH - topH - bottomH);

      let leftW = 0;
      for (const did of byArea.left) {
        const d = scene.nodes[did]!;
        const dw = prefWidth(d);
        const dBox: ComputedBox = { x: leftW, y: centerY, width: dw, height: centerH, absX: leftW, absY: centerY, visible: winVis, windowId: winId };
        boxes.set(did, dBox);
        layoutSubtree(did, dBox);
        leftW += dw;
      }

      let rightW = 0;
      for (const did of byArea.right) rightW += prefWidth(scene.nodes[did]!);
      let rCurX = W - rightW;
      for (const did of byArea.right) {
        const d = scene.nodes[did]!;
        const dw = prefWidth(d);
        const dBox: ComputedBox = { x: rCurX, y: centerY, width: dw, height: centerH, absX: rCurX, absY: centerY, visible: winVis, windowId: winId };
        boxes.set(did, dBox);
        layoutSubtree(did, dBox);
        rCurX += dw;
      }

      const centralId = winNode.central;
      if (centralId && scene.nodes[centralId]) {
        const cx = leftW;
        const cy = centerY;
        const cw = Math.max(0, W - leftW - rightW);
        const ch = centerH;
        const cBox: ComputedBox = {
          x: cx,
          y: cy,
          width: cw,
          height: ch,
          absX: cx,
          absY: cy,
          visible: winVis && isVisible(centralId),
          windowId: winId,
        };
        boxes.set(centralId, cBox);
        layoutSubtree(centralId, cBox);
      }
    }

    layoutSubtree(winId, winBox);
  }

  return boxes;
}

// ---------- 说明文档的小节 ----------

export function parseDocRef(ref: string): { path: string; section: string | null } {
  const hash = ref.indexOf("#");
  return hash < 0 ? { path: ref, section: null } : { path: ref.slice(0, hash), section: ref.slice(hash + 1) };
}

function sectionPattern(name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(<!--\\s*ui-section:\\s*${escaped}\\s*-->\\r?\\n?)([\\s\\S]*?)(\\r?\\n?<!--\\s*/ui-section\\s*-->)`);
}

/** 小节在文档中的位置（字符偏移）：start 到 end 是含标记的整个小节，contentStart 是正文开始处。 */
export function sectionOffsets(docText: string, name: string): { start: number; contentStart: number; end: number } | null {
  const match = sectionPattern(name).exec(docText);
  if (!match) return null;
  return { start: match.index, contentStart: match.index + match[1].length, end: match.index + match[0].length };
}

export function getSection(docText: string, name: string): string | null {
  const match = sectionPattern(name).exec(docText);
  return match ? match[2] : null;
}

export function replaceSection(docText: string, name: string, content: string): string {
  return docText.replace(sectionPattern(name), (_all, open: string, _old: string, close: string) => open + content + close);
}

export function appendSection(docText: string, name: string, heading: string): string {
  const base = docText.endsWith("\n") || docText === "" ? docText : docText + "\n";
  return `${base}\n<!-- ui-section: ${name} -->\n## ${heading}\n\n<!-- /ui-section -->\n`;
}

/** saveButton → save-button */
export function sectionNameFor(id: string): string {
  return id.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}
