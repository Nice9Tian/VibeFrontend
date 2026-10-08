// 读取并检查设计项目：project.json、ui/scene.json、logic/app.logic.yaml、docs/*.md、components/*
import { parse as parseYaml } from "yaml";
import { listDir, projectRoot, readText } from "./fs";
import { parseAssignment, parseExpr, pathsIn, type Value } from "./expr";

export const SCENE_PATH = "ui/scene.json";
export const LOGIC_PATH = "logic/app.logic.yaml";

/** 运行层为每个节点自动提供的鼠标事件，不需要控件声明。 */
export const MOUSE_EVENTS = ["click", "dblclick", "mousedown", "mouseup", "mouseenter", "mouseleave"];
/** 运行层自动触发的全局事件。 */
export const BUILTIN_GLOBAL_EVENTS = ["app.start", "window.click"];

export interface SceneNode {
  type: string;
  x?: number;
  y?: number;
  width: number;
  height: number;
  title?: string;
  props?: Record<string, Value>;
  children?: string[];
}

export interface Scene {
  version: number;
  root: string;
  nodes: Record<string, SceneNode>;
}

export interface PropDecl {
  type: "string" | "number" | "boolean";
  default?: Value;
  logic?: boolean;
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
  create?: ComponentCreate;
  error?: string;
}

export type Step = { set: string } | { emit: string } | { if: string; then?: Step[]; else?: Step[] };

export interface ConditionDef {
  type: "text" | "symbol";
  text?: string;
  expr?: string;
  preview?: boolean;
}

export interface ObjectLogic {
  doc?: string;
  bind?: string;
  conditions?: Record<string, ConditionDef>;
  props?: Record<string, string | boolean | number>;
  events?: Record<string, Step[]>;
}

export interface Logic {
  state?: Record<string, unknown>;
  conditions?: Record<string, ConditionDef>;
  events?: Record<string, Step[]>;
  objects?: Record<string, ObjectLogic>;
}

export interface Problem {
  level: "error" | "hint";
  message: string;
  nodeId?: string;
}

export interface Project {
  root: string;
  name: string;
  /** 当前窗口的页面文档路径 */
  pageDoc: string;
  scene: Scene;
  /** scene.json 的原文，用来算出某个节点在文件中的行号 */
  sceneText: string;
  logic: Logic;
  logicText: string;
  /** 路径 → Markdown 原文 */
  docs: Map<string, string>;
  components: Map<string, LoadedComponent>;
  problems: Problem[];
  /** 所有项目文件内容拼成的指纹，用来判断重新加载后有没有变化 */
  signature: string;
}

export const CONTAINER_DECL: ComponentDecl = {
  type: "Container",
  label: "容器",
  defaultSize: { width: 160, height: 80 },
  children: true,
};

// ---------- 状态与名字解析 ----------

export interface StateLeaf {
  type: "string" | "number" | "boolean" | "enum";
  initial?: Value;
  values?: string[];
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

/** 按完整代号找条件：全局条件（run）或控件条件（saveButton.canSave）。 */
export function findCondition(logic: Logic, id: string): ConditionDef | null {
  const global = logic.conditions?.[id];
  if (global) return global;
  const dot = id.indexOf(".");
  if (dot < 0) return null;
  return logic.objects?.[id.slice(0, dot)]?.conditions?.[id.slice(dot + 1)] ?? null;
}

export function allConditions(logic: Logic): Array<{ id: string; def: ConditionDef }> {
  const list = Object.entries(logic.conditions ?? {}).map(([id, def]) => ({ id, def }));
  for (const [objectId, object] of Object.entries(logic.objects ?? {})) {
    for (const [name, def] of Object.entries(object?.conditions ?? {})) list.push({ id: `${objectId}.${name}`, def });
  }
  return list;
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

// ---------- 加载 ----------

const moduleCache = new Map<string, { source: string; create?: ComponentCreate; error?: string }>();
/** 每个控件的声明和实现原文，只用于计算指纹 */
const componentTexts = new Map<string, string>();

async function loadComponent(folder: string): Promise<LoadedComponent | null> {
  const declText = await readText(`components/${folder}/component.json`);
  if (declText === null) return null;
  let decl: ComponentDecl;
  try {
    decl = JSON.parse(declText) as ComponentDecl;
  } catch (e) {
    return { decl: { type: folder }, error: `component.json 不是有效的 JSON：${(e as Error).message}` };
  }
  if (!decl.type) decl.type = folder;
  const entry = decl.entry ?? "index.js";
  const source = await readText(`components/${folder}/${entry}`);
  if (source === null) return { decl, error: `找不到实现文件 ${entry}` };

  componentTexts.set(folder, declText + source);
  const cacheKey = `${folder}/${entry}`;
  let cached = moduleCache.get(cacheKey);
  if (!cached || cached.source !== source) {
    cached = { source };
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    try {
      const mod = (await import(/* @vite-ignore */ url)) as { default?: ComponentCreate };
      if (typeof mod.default !== "function") cached.error = `${entry} 没有默认导出一个创建函数`;
      else cached.create = mod.default;
    } catch (e) {
      cached.error = `${entry} 加载失败：${(e as Error).message}`;
    } finally {
      URL.revokeObjectURL(url);
    }
    moduleCache.set(cacheKey, cached);
  }
  return { decl, create: cached.create, error: cached.error };
}

/** 把所有控件的 style.css 限定在各自的类型范围内，合并注入页面。 */
async function injectComponentStyles(components: Map<string, LoadedComponent>, folders: Map<string, string>): Promise<string> {
  let css = "";
  for (const [type, component] of components) {
    const folder = folders.get(type);
    if (!folder) continue;
    const text = await readText(`components/${folder}/${component.decl.style ?? "style.css"}`);
    if (text) css += `@scope ([data-vf-type="${type}"]) {\n${text}\n}\n`;
  }
  let style = document.getElementById("vf-component-styles");
  if (!style) {
    style = document.createElement("style");
    style.id = "vf-component-styles";
    document.head.append(style);
  }
  if (style.textContent !== css) style.textContent = css;
  return css;
}

/** previous 用于在 YAML 写坏时沿用上一份有效的逻辑。 */
export async function loadProject(previous: Project | null): Promise<Project> {
  const problems: Problem[] = [];
  const root = await projectRoot();

  let name = "未命名项目";
  let pageDoc = "docs/page.md";
  try {
    const config = JSON.parse((await readText("project.json")) ?? "{}") as {
      name?: string;
      windows?: Array<{ doc?: string }>;
    };
    name = config.name ?? name;
    pageDoc = config.windows?.[0]?.doc ?? pageDoc;
  } catch (e) {
    problems.push({ level: "error", message: `project.json 不是有效的 JSON：${(e as Error).message}` });
  }

  let scene: Scene = previous?.scene ?? { version: 1, root: "window", nodes: { window: { type: "Window", width: 480, height: 320, children: [] } } };
  const sceneText = await readText(SCENE_PATH);
  if (sceneText === null) {
    problems.push({ level: "error", message: `找不到 ${SCENE_PATH}` });
  } else {
    try {
      scene = JSON.parse(sceneText) as Scene;
    } catch (e) {
      problems.push({ level: "error", message: `${SCENE_PATH} 不是有效的 JSON，画布沿用上一份有效内容：${(e as Error).message}` });
    }
  }

  const logicText = (await readText(LOGIC_PATH)) ?? "";
  let logic: Logic = previous?.logic ?? {};
  try {
    logic = (parseYaml(logicText) as Logic | null) ?? {};
  } catch (e) {
    problems.push({ level: "error", message: `${LOGIC_PATH} 有语法错误，预览沿用上一份有效逻辑：${(e as Error).message}` });
  }

  const components = new Map<string, LoadedComponent>();
  const folders = new Map<string, string>();
  componentTexts.clear();
  for (const entry of await listDir("components")) {
    if (!entry.isDir) continue;
    const component = await loadComponent(entry.name);
    if (!component) continue;
    components.set(component.decl.type, component);
    folders.set(component.decl.type, entry.name);
    if (component.error) problems.push({ level: "error", message: `控件 ${component.decl.type}：${component.error}` });
  }
  const css = await injectComponentStyles(components, folders);

  const docs = new Map<string, string>();
  const docPaths = new Set<string>([pageDoc]);
  for (const object of Object.values(logic.objects ?? {})) {
    if (object?.doc) docPaths.add(parseDocRef(object.doc).path);
  }
  for (const path of docPaths) {
    const text = await readText(path);
    if (text !== null) docs.set(path, text);
  }

  const signature = JSON.stringify([sceneText, logicText, [...docs], [...componentTexts], css, name, pageDoc]);
  const project: Project = {
    root, name, pageDoc, scene, sceneText: sceneText ?? "", logic, logicText, docs, components, problems, signature,
  };
  problems.push(...check(project));
  return project;
}

// ---------- 检查 ----------

export function declFor(project: Project, type: string): ComponentDecl | null {
  if (type === "Container" || type === "Window") return CONTAINER_DECL;
  return project.components.get(type)?.decl ?? null;
}

function check(project: Project): Problem[] {
  const problems: Problem[] = [];
  const { scene, logic } = project;
  const error = (message: string, nodeId?: string) => problems.push({ level: "error", message, nodeId });
  const hint = (message: string, nodeId?: string) => problems.push({ level: "hint", message, nodeId });

  // 表达式里的名字必须是状态路径或条件代号
  const checkExpr = (source: unknown, where: string, nodeId?: string) => {
    try {
      for (const path of pathsIn(parseExpr(String(source)))) {
        if (!findStateLeaf(logic, path) && !findCondition(logic, path)) {
          error(`${where}：未知的状态路径或条件代号“${path}”`, nodeId);
        }
      }
    } catch (e) {
      error(`${where}：${(e as Error).message}`, nodeId);
    }
  };
  const checkSteps = (steps: unknown, where: string, nodeId?: string) => {
    if (!Array.isArray(steps)) return error(`${where}：事件的内容应该是步骤列表`, nodeId);
    for (const step of steps as Step[]) {
      if ("set" in step) {
        try {
          const { target } = parseAssignment(step.set);
          if (!findStateLeaf(logic, target)) error(`${where}：set 的目标“${target}”不是状态路径`, nodeId);
          checkExpr(step.set.slice(step.set.indexOf("=") + 1), where, nodeId);
        } catch (e) {
          error(`${where}：${(e as Error).message}`, nodeId);
        }
      } else if ("emit" in step) {
        if (!logic.events?.[step.emit]) error(`${where}：emit 的全局事件“${step.emit}”没有在顶层 events 中定义`, nodeId);
      } else if ("if" in step) {
        checkExpr(step.if, where, nodeId);
        if (step.then) checkSteps(step.then, where, nodeId);
        if (step.else) checkSteps(step.else, where, nodeId);
      } else {
        error(`${where}：无法识别的步骤 ${JSON.stringify(step)}`, nodeId);
      }
    }
  };
  const checkConditions = (conditions: Record<string, ConditionDef> | undefined, prefix: string, nodeId?: string) => {
    for (const [name, def] of Object.entries(conditions ?? {})) {
      const id = prefix + name;
      if (def?.type === "symbol") {
        if (def.expr === undefined) error(`条件 ${id}：符号条件缺少 expr`, nodeId);
        else checkExpr(def.expr, `条件 ${id}`, nodeId);
      } else if (def?.type === "text") {
        hint(`文字条件 ${id}（“${def.text ?? ""}”）尚未改写为符号条件，预览时用开关切换`, nodeId);
      } else {
        error(`条件 ${id}：type 应为 text 或 symbol`, nodeId);
      }
    }
  };

  // 画布
  for (const [id, node] of Object.entries(scene.nodes)) {
    if (node.type === "Window" || node.type === "Container") continue;
    const component = project.components.get(node.type);
    if (!component) {
      error(`控件 ${id} 的类型“${node.type}”在 components/ 中找不到`, id);
      continue;
    }
    for (const key of Object.keys(node.props ?? {})) {
      if (!component.decl.props?.[key]) error(`控件 ${id}：scene.json 中的属性“${key}”不在 ${node.type} 的声明里`, id);
    }
  }

  // 逻辑
  const stateRoots = Object.keys(logic.state ?? {});
  for (const id of Object.keys(logic.conditions ?? {})) {
    if (stateRoots.includes(id) || scene.nodes[id]) error(`全局条件“${id}”与状态根名或控件 ID 重名`);
  }
  for (const root of stateRoots) {
    if (scene.nodes[root]) error(`状态根名“${root}”与控件 ID 重名`);
  }
  checkConditions(logic.conditions, "");
  for (const [name, steps] of Object.entries(logic.events ?? {})) checkSteps(steps, `全局事件 ${name}`);

  for (const [id, object] of Object.entries(logic.objects ?? {})) {
    if (!object) continue;
    const node = scene.nodes[id];
    if (!node) {
      error(`逻辑中的对象“${id}”在画布中不存在`);
      continue;
    }
    const decl = declFor(project, node.type);
    checkConditions(object.conditions, `${id}.`, id);
    for (const [key, source] of Object.entries(object.props ?? {})) {
      if (key !== "visible" && !decl?.props?.[key]?.logic) {
        error(`控件 ${id}：当前类型 ${node.type} 不支持由逻辑控制属性“${key}”`, id);
      }
      checkExpr(source, `控件 ${id} 的 props.${key}`, id);
    }
    if (object.bind !== undefined) {
      if (!decl?.bind) error(`控件 ${id}：当前类型 ${node.type} 不支持 bind`, id);
      if (!findStateLeaf(logic, object.bind)) error(`控件 ${id}：bind 的目标“${object.bind}”不是状态路径`, id);
    }
    for (const [event, steps] of Object.entries(object.events ?? {})) {
      if (!MOUSE_EVENTS.includes(event) && !decl?.events?.includes(event)) {
        error(`控件 ${id}：当前类型 ${node.type} 不支持事件“${event}”`, id);
      }
      checkSteps(steps, `控件 ${id} 的 ${event} 事件`, id);
    }
    if (object.doc) {
      const { path, section } = parseDocRef(object.doc);
      const text = project.docs.get(path);
      if (text === undefined) hint(`控件 ${id}：找不到说明文档 ${path}`, id);
      else if (section && getSection(text, section) === null) hint(`控件 ${id}：${path} 中找不到小节 ${section}`, id);
    }
  }
  return problems;
}
