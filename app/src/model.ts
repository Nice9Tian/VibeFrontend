// 设计项目的数据结构，以及只依赖这些数据的查找函数。
// 这里不碰网页和文件系统：工具界面、命令行导出和嵌进 Qt 的逻辑运行层共用这一份。
import type { Value } from "./expr.ts";
import { LINE_DECL, SHAPE_DECL, type ShapePreset } from "./shapes.ts";

export const SCENE_PATH = "ui/scene.json";
export const LOGIC_PATH = "logic/app.logic.yaml";

/** 运行层为每个节点自动提供的鼠标事件，不需要控件声明。 */
export const MOUSE_EVENTS = ["click", "dblclick", "mousedown", "mouseup", "mouseenter", "mouseleave"];
/** 运行层自动触发的全局事件。 */
export const BUILTIN_GLOBAL_EVENTS = ["app.start", "window.click"];

// ---------- 画布 ----------

export interface SceneNode {
  type: string;
  x?: number;
  y?: number;
  width: number;
  height: number;
  rotation?: number;
  locked?: boolean;
  title?: string;
  props?: Record<string, Value>;
  children?: string[];
}

export interface Scene {
  version: number;
  root: string;
  nodes: Record<string, SceneNode>;
}

// ---------- 控件 ----------

export interface PropDecl {
  type: "string" | "number" | "boolean";
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

/** 工具自带、不需要 components/ 里有文件夹的类型。Shape 和 Line 是基础图形和线条，见 shapes.ts。 */
export const BUILTIN_TYPES = ["Window", "Container", "External", "Shape", "Line"];

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

export type Step = { set: string } | { emit: string } | { if: string; then?: Step[]; else?: Step[] };

export interface ConditionDef {
  type: "text" | "symbol";
  text?: string;
  expr?: string;
  preview?: boolean;
}

/** 业务事件：交给业务处理；simulate 是业务没有接上时用来顶替的步骤。 */
export interface BusinessEventDef {
  owner: "business";
  text?: string;
  simulate?: Step[];
}

/** 顶层 events 里的一项：普通全局事件是步骤列表，业务事件是一个对象。 */
export type GlobalEventDef = Step[] | BusinessEventDef;

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
  type: "string" | "number" | "boolean" | "enum";
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

/** 是业务事件就返回它的定义，否则返回 null。 */
export function businessEvent(logic: Logic, name: string): BusinessEventDef | null {
  const def = logic.events ? logic.events[name] : undefined;
  return def && !Array.isArray(def) && typeof def === "object" ? def : null;
}

/** 普通全局事件的步骤；不存在或者是业务事件时返回 null。 */
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
  if (type === "Container" || type === "Window") return CONTAINER_DECL;
  if (type === "External") return EXTERNAL_DECL;
  if (type === "Shape") return SHAPE_DECL;
  if (type === "Line") return LINE_DECL;
  return project.components.get(type)?.decl ?? null;
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
