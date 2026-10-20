// 把设计项目导出成 Qt 工程。这里只做“项目内容 → 一组文件的文字”，不读写磁盘，
// 所以同样的输入一定得到同样的输出。读写磁盘在 scripts/export-qt.ts 里。
//
// 导出的工程分五层，结构和约束见 app/qt-templates/generated/AGENTS.md（它会被原样放进导出的工程）。
import type { Value } from "../expr.ts";
import {
  allStateLeaves,
  allConditions,
  BUILTIN_TYPES,
  businessEvent,
  isBusinessState,
  type ComponentDecl,
  type Problem,
  type Project,
  type QtMapping,
} from "../model.ts";
import * as code from "./qt-code.ts";
import type { RuntimeData } from "./qt-runtime.ts";

/** 导出要用到、但不是从设计项目来的东西。由调用方读好传进来。 */
export interface QtAssets {
  /** 逻辑运行层打包成的脚本（src/export/qt-runtime.ts 和它引用的文件） */
  runtimeJs: string;
  /** app/qt-templates/generated/ 里的文件：路径 → 内容 */
  generated: Record<string, string>;
  /** app/qt-templates/scaffold/ 里的文件：路径 → 内容 */
  scaffold: Record<string, string>;
}

// ---------- 接口的内容 ----------

export interface BusinessState {
  /** 状态路径，例如 layer.visible */
  path: string;
  type: "string" | "number" | "boolean" | "enum";
  values?: string[];
  /** 生成的函数名 */
  setter: string;
  getter: string;
}

export interface BusinessEvent {
  name: string;
  text: string;
  /** 生成的信号名 */
  signal: string;
}

export interface ExternalContainer {
  /** 控件 ID */
  id: string;
  /** 生成的函数名 */
  setter: string;
}

export interface EffectSlot {
  name: string;
  label: string;
  kind: string;
  /** 8 位十六进制 */
  hash: string;
  /** 效果在设计项目里的位置，给翻译的人看 */
  source: string;
  /** 生成的名字 */
  className: string;
  setter: string;
  getter: string;
}

export interface InterfaceSummary {
  states: BusinessState[];
  events: BusinessEvent[];
  externals: ExternalContainer[];
  effects: EffectSlot[];
}

/** 上一次导出留下的记录，放在导出目录的 vf-export.json 里。 */
export interface Manifest {
  generator: "VibeFrontend";
  formatVersion: 1;
  project: string;
  /** 工具生成的文件，下次导出时整个覆盖；不在新名单里的会被删掉 */
  generated: string[];
  interface: InterfaceSummary;
  /** 最近一次接口有变化时的变化清单 */
  lastChanges: string[];
}

export interface QtExport {
  /** 工具生成的文件：路径 → 内容。每次导出整个覆盖 */
  files: Map<string, string>;
  /** 交给 Agent 写的文件的起始内容：只在文件不存在时写入，之后不再碰 */
  scaffold: Map<string, string>;
  manifest: Manifest;
  /** 这一次和上一次相比，接口变了什么 */
  changes: string[];
  /** 导出时发现的问题。有错误时 files 是空的 */
  problems: Problem[];
}

// ---------- 画布里的一个控件，导出成什么 ----------

export interface ControlPlan {
  id: string;
  /** C++ 里的变量名 */
  variable: string;
  parentVariable: string;
  kind: "component" | "container" | "external" | "placeholder";
  /** 设计项目里的类型名 */
  type: string;
  qtClass: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 控件属性名 → Qt 属性名 */
  props: Array<[string, string]>;
  /** 固定写死的 Qt 属性 */
  fixed: Array<[string, Value]>;
  /** 控件自己的事件 → Qt 信号 */
  events: Array<{ event: string; signal: string; type?: "string" | "number" | "boolean" }>;
  /** 显示隐藏时播放的效果在 effects 里的下标，没有是 -1 */
  effect: number;
  /** 占位时显示的文字 */
  placeholder: string | null;
  hasChildren: boolean;
}

export interface WindowPlan {
  id: string;
  variable: string;
  title: string;
  width: number;
  height: number;
}

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]*$/;
const QT_CLASS = /^Q[A-Za-z0-9]+$/;
/** QObject 和界面类自己已经有的函数名，生成的名字不能和它们相同。 */
const RESERVED = new Set([
  "blockSignals", "children", "connect", "deleteLater", "destroyed", "disconnect", "dumpObjectInfo", "dumpObjectTree",
  "dynamicPropertyNames", "effects", "event", "eventFilter", "findChild", "findChildren", "inherits", "installEventFilter",
  "isWidgetType", "isWindowType", "killTimer", "metaObject", "moveToThread", "objectName", "objectNameChanged", "parent",
  "property", "removeEventFilter", "sender", "setObjectName", "setParent", "setProperty", "show", "signalsBlocked",
  "startTimer", "stateDump", "thread", "widgetDump", "window",
]);

function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** layer.visible → LayerVisible */
function pascal(path: string): string {
  return path.split(/[._]/).filter(Boolean).map(upperFirst).join("");
}

function sanitize(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, "_");
}

// ---------- 导出 ----------

export function exportQt(project: Project, assets: QtAssets, previous: Manifest | null): QtExport {
  const problems: Problem[] = [];
  const error = (message: string, nodeId?: string) => problems.push({ level: "error", message, nodeId });
  const hint = (message: string, nodeId?: string) => problems.push({ level: "hint", message, nodeId });
  const { scene, logic } = project;

  // 生成的函数名不能重复，也不能和 Qt 自带的重名
  const taken = new Map<string, string>();
  const claim = (name: string, what: string) => {
    if (RESERVED.has(name)) error(`${what}：生成的函数名 ${name} 和 Qt 自带的函数重名，请改名`);
    else if (taken.has(name)) error(`${what}：生成的函数名 ${name} 和“${taken.get(name)}”的重复，请改名`);
    else taken.set(name, what);
  };
  const needIdentifier = (name: string, what: string): boolean => {
    const ok = name.split(".").every((part) => IDENTIFIER.test(part));
    if (!ok) error(`${what}：导出成 C++ 的名字只能用英文字母、数字和下划线，并以字母开头`);
    return ok;
  };

  // ---- 业务接口 ----
  const states: BusinessState[] = [];
  for (const { path, leaf } of allStateLeaves(logic)) {
    if (!isBusinessState(leaf)) continue;
    if (!needIdentifier(path, `业务管的状态 ${path}`)) continue;
    const state: BusinessState = { path, type: leaf.type, setter: `set${pascal(path)}`, getter: lowerFirst(pascal(path)) };
    if (leaf.type === "enum") state.values = leaf.values ?? [];
    claim(state.setter, `状态 ${path}`);
    claim(state.getter, `状态 ${path}`);
    states.push(state);
  }

  const events: BusinessEvent[] = [];
  for (const name of Object.keys(logic.events ?? {})) {
    const def = businessEvent(logic, name);
    if (!def) continue;
    if (!needIdentifier(name, `业务事件 ${name}`)) continue;
    const event: BusinessEvent = { name, text: def.text ?? "", signal: `${lowerFirst(pascal(name))}Requested` };
    claim(event.signal, `业务事件 ${name}`);
    events.push(event);
  }

  // ---- 界面接口 ----
  const effects: EffectSlot[] = [];
  for (const [name, effect] of project.effects) {
    if (effect.error) continue;
    if (!needIdentifier(name, `效果 ${name}`) || name.includes(".")) continue;
    effects.push({
      name,
      label: effect.decl.label ?? name,
      kind: effect.decl.kind,
      hash: effect.hash,
      source: `effects/${effect.folder}/${effect.decl.entry ?? "index.js"}`,
      className: `${upperFirst(name)}Effect`,
      setter: `set${upperFirst(name)}`,
      getter: lowerFirst(name),
    });
  }
  effects.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const effectNames = new Map<string, string>();
  for (const effect of effects) {
    if (effectNames.has(effect.getter)) error(`效果 ${effect.name}：和效果 ${effectNames.get(effect.getter)} 只有首字母大小写不同，请改名`);
    effectNames.set(effect.getter, effect.name);
  }

  // ---- 控件树 ----
  const root = scene.nodes[scene.root];
  if (!root) error(`画布里找不到根窗口 ${scene.root}`);
  const window: WindowPlan = {
    id: scene.root,
    variable: `w_${sanitize(scene.root)}`,
    title: root?.title ?? scene.root,
    width: root?.width ?? 480,
    height: root?.height ?? 320,
  };
  const controls: ControlPlan[] = [];
  const externals: ExternalContainer[] = [];
  const variables = new Set<string>([window.variable]);
  const unmappedTypes = new Set<string>();
  const unmappedProps = new Set<string>();

  const visit = (id: string, parentVariable: string) => {
    const node = scene.nodes[id];
    if (!node) return error(`画布里找不到节点 ${id}`);
    let variable = `w_${sanitize(id)}`;
    for (let n = 2; variables.has(variable); n++) variable = `w_${sanitize(id)}_${n}`;
    variables.add(variable);

    const object = logic.objects?.[id];
    const effectName = object?.effects?.visible;
    const plan: ControlPlan = {
      id,
      variable,
      parentVariable,
      kind: "container",
      type: node.type,
      qtClass: "QFrame",
      x: Math.round(node.x ?? 0),
      y: Math.round(node.y ?? 0),
      width: Math.round(node.width),
      height: Math.round(node.height),
      props: [],
      fixed: [],
      events: [],
      effect: effectName ? effects.findIndex((effect) => effect.name === effectName) : -1,
      placeholder: null,
      hasChildren: (node.children?.length ?? 0) > 0,
    };

    if (node.type === "External") {
      plan.kind = "external";
      plan.placeholder = `外部容器 ${id}\n（业务还没有放入控件）`;
      if (needIdentifier(id, `外部容器 ${id}`)) {
        const external: ExternalContainer = { id, setter: `set${upperFirst(id)}Widget` };
        claim(external.setter, `外部容器 ${id}`);
        externals.push(external);
      }
    } else if (node.type === "Container") {
      // 没有转换、里面也没有东西的容器，和工具里一样显示自己的 ID
      if (!plan.hasChildren) plan.placeholder = id;
    } else {
      const decl: ComponentDecl | undefined = project.components.get(node.type)?.decl;
      const qt: QtMapping | undefined = decl?.qt;
      if (qt && QT_CLASS.test(qt.widget)) {
        plan.kind = "component";
        plan.qtClass = qt.widget;
        plan.props = Object.keys(qt.props ?? {}).map((name): [string, string] => [name, qt.props![name]]);
        plan.fixed = Object.keys(qt.set ?? {}).map((name): [string, Value] => [name, qt.set![name]]);
        for (const event of Object.keys(qt.events ?? {})) {
          const mapping = qt.events![event];
          if (!IDENTIFIER.test(mapping.signal)) error(`控件类型 ${node.type}：事件 ${event} 对应的 Qt 信号名“${mapping.signal}”不对`);
          else plan.events.push({ event, signal: mapping.signal, type: mapping.type });
        }
        // 用到了、但在 Qt 里没有对应的属性，导出后不起作用，提示出来
        const used = new Set([...Object.keys(node.props ?? {}), ...Object.keys(object?.props ?? {})]);
        used.delete("visible");
        used.delete("enabled");
        for (const name of used) {
          if (!qt.props?.[name]) unmappedProps.add(`${node.type}.${name}`);
        }
        for (const event of Object.keys(object?.events ?? {})) {
          if (decl?.events?.includes(event) && !qt.events?.[event]) {
            error(`控件 ${id}：事件 ${event} 在 ${node.type} 的 qt.events 里没有对应的 Qt 信号，导出后不会触发`, id);
          }
        }
        if (object?.bind && !qt.props?.value) {
          error(`控件 ${id}：用了 bind，但 ${node.type} 的 qt.props 里没有写 value 对应哪个 Qt 属性`, id);
        }
      } else {
        if (qt) error(`控件类型 ${node.type}：qt.widget 应该是一个 Qt 控件的类名，现在是“${qt.widget}”`);
        plan.kind = "placeholder";
        plan.placeholder = `${node.type}\n${id}`;
        unmappedTypes.add(node.type);
      }
    }
    controls.push(plan);
    for (const child of node.children ?? []) visit(child, variable);
  };
  for (const child of root?.children ?? []) visit(child, window.variable);

  for (const type of [...unmappedTypes].sort()) {
    if (type === "Shape" || type === "Line") {
      hint(`${type === "Shape" ? "基础图形" : "线条"}还不能导出成 Qt，导出后是一个占位框；事件、状态和逻辑照常工作`);
    } else {
      hint(`控件类型 ${type} 没有写在 Qt 里对应什么（component.json 的 qt），导出后是一个占位框；事件、状态和逻辑照常工作`);
    }
  }
  for (const name of [...unmappedProps].sort()) {
    hint(`属性 ${name} 在 Qt 里没有对应的属性，导出后不起作用`);
  }
  for (const { id, def } of allConditions(logic)) {
    if (def?.type === "text") hint(`文字条件 ${id} 还没有改写成符号条件，导出后它固定为 ${def.preview === true ? "真" : "假"}`);
  }
  for (const type of new Set(controls.map((control) => control.type))) {
    if (!BUILTIN_TYPES.includes(type) && !project.components.has(type)) error(`控件类型 ${type} 在 components/ 中找不到`);
  }

  const summary: InterfaceSummary = { states, events, externals, effects };
  const changes = diffInterface(previous?.interface ?? null, summary);
  const manifest: Manifest = {
    generator: "VibeFrontend",
    formatVersion: 1,
    project: project.name,
    generated: [],
    interface: summary,
    lastChanges: changes.length > 0 || !previous ? changes : previous.lastChanges ?? [],
  };

  const files = new Map<string, string>();
  const scaffold = new Map<string, string>();
  if (problems.some((problem) => problem.level === "error")) return { files, scaffold, manifest, changes, problems };

  const components: Record<string, ComponentDecl> = {};
  for (const type of [...project.components.keys()].sort()) components[type] = project.components.get(type)!.decl;
  const data: RuntimeData = { scene, logic, components };

  const context: code.Context = { projectName: project.name, window, controls, summary, lastChanges: manifest.lastChanges };
  // 固定的文件原样放进去，其中带标记的行换成生成的内容
  const fills: Record<string, Record<string, string>> = {
    "ui_binding/Ui.h": { businessOverrides: code.businessOverrides(context) },
    "ui_binding/Ui.cpp": { includes: code.includes(context), generated: code.generatedPart(context) },
    "ui_effects/EffectsSetup.cpp": { effectList: code.effectList(context) },
  };
  for (const path of Object.keys(assets.generated).sort()) files.set(path, code.fill(assets.generated[path], fills[path] ?? {}));
  for (const path of Object.keys(assets.scaffold).sort()) scaffold.set(path, code.fill(assets.scaffold[path], fills[path] ?? {}));
  files.set("INTERFACE.md", code.interfaceDoc(context));
  files.set("business_interface/BusinessInterface.h", code.businessInterfaceHeader(context));
  files.set("ui_interface/UiEffects.h", code.uiEffectsHeader(context));
  files.set("ui_binding/logic/runtime.js", assets.runtimeJs);
  files.set("ui_binding/logic/project.json", JSON.stringify(data, null, 2) + "\n");

  manifest.generated = [...files.keys(), "vf-export.json"].sort();
  files.set("vf-export.json", JSON.stringify(manifest, null, 2) + "\n");
  return { files, scaffold, manifest, changes, problems };
}

// ---------- 接口变化清单 ----------

function byKey<T>(list: T[], key: (item: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of list) map.set(key(item), item);
  return map;
}

/** 列出接口相对上一次导出的变化。没有上一次时，返回空（全部都是新的，不用逐条列）。 */
export function diffInterface(before: InterfaceSummary | null, after: InterfaceSummary): string[] {
  if (!before) return [];
  const changes: string[] = [];
  const compare = <T>(
    label: string,
    oldList: T[],
    newList: T[],
    key: (item: T) => string,
    describe: (item: T) => string,
    changed: (a: T, b: T) => string | null,
  ) => {
    const oldMap = byKey(oldList ?? [], key);
    const newMap = byKey(newList, key);
    for (const [name, item] of newMap) {
      const old = oldMap.get(name);
      if (!old) changes.push(`新增${label} ${describe(item)}`);
      else {
        const difference = changed(old, item);
        if (difference) changes.push(`${label} ${name}：${difference}`);
      }
    }
    for (const [name, item] of oldMap) {
      if (!newMap.has(name)) changes.push(`删除${label} ${describe(item)}`);
    }
  };
  const stateType = (state: BusinessState) => (state.type === "enum" ? `enum [${(state.values ?? []).join(", ")}]` : state.type);

  compare("业务管的状态", before.states, after.states, (s) => s.path, (s) => `${s.path}（${stateType(s)}）`,
    (a, b) => (stateType(a) !== stateType(b) ? `类型从 ${stateType(a)} 变成 ${stateType(b)}，业务那边的读写要跟着改` : null));
  compare("业务事件", before.events, after.events, (e) => e.name, (e) => e.name, () => null);
  compare("外部容器", before.externals, after.externals, (e) => e.id, (e) => e.id, () => null);
  compare("效果", before.effects, after.effects, (e) => e.name, (e) => `${e.name}（哈希 ${e.hash}）`,
    (a, b) =>
      a.kind !== b.kind
        ? `种类从 ${a.kind} 变成 ${b.kind}，需要重新翻译`
        : a.hash !== b.hash
          ? `在工具里的实现改了，哈希从 ${a.hash} 变成 ${b.hash}，需要对照 ${b.source} 重新翻译`
          : null);
  return changes;
}
