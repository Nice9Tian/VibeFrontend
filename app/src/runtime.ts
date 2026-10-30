// 逻辑运行层：保存状态，计算条件和属性，按批处理事件。
// 不依赖网页和 Tauri：工具的预览、命令行，以及导出后嵌进 Qt 的 JS 引擎，运行的都是这一份。
import { evalExpr, parseAssignment, parseExpr, type Expr, type Value } from "./expr.ts";
import {
  allConditions,
  allStateLeaves,
  allWindowIds,
  businessEvent,
  declFor,
  findCondition,
  findMenuItem,
  findStateLeaf,
  globalSteps,
  isBusinessState,
  layoutOf,
  requestEvent,
  type RuntimeProject,
  type StateLeaf,
  type Step,
} from "./model.ts";

export interface LogEntry {
  title: string;
  lines: string[];
}

export interface NodeView {
  visible: boolean;
  enabled: boolean;
  props: Record<string, Value>;
}

export type ActionSimMode = "real" | "success" | "error";

export interface ActionSimConfig {
  mode: ActionSimMode;
  delayMs: number;
  result?: Value;
  errorMessage?: string;
}

export interface PendingBusinessEvent {
  name: string;
  args: Record<string, Value>;
}

export interface RuntimeHooks {
  onChange(): void;
  onLog(entry: LogEntry): void;
  /**
   * 有业务事件要处理时调用。返回 true 表示外面接手了（导出到 Qt 后由界面绑定层决定交给业务还是模拟）；
   * 没有提供，或者返回 false，就执行这个事件的模拟步骤。
   */
  raiseBusiness?(name: string, args: Record<string, Value>): boolean;
}

const MAX_EMIT_DEPTH = 20;
/** 一次操作引出的业务事件最多连锁这么多个，防止模拟步骤互相触发停不下来。 */
const MAX_BUSINESS_CHAIN = 50;

function cloneValue<T extends Value>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function sameStateValue(a: Value | undefined, b: Value | undefined): boolean {
  if (a === b) return true;
  if (a !== undefined && b !== undefined && typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

function show(value: Value): string {
  if (typeof value === "string") return `'${value}'`;
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value);
}

function defaultFor(leaf: StateLeaf): Value {
  if (leaf.initial !== undefined) return cloneValue(leaf.initial);
  const fallback = (leaf as { default?: Value }).default;
  if (fallback !== undefined) return cloneValue(fallback);
  if (leaf.type === "number") return 0;
  if (leaf.type === "boolean") return false;
  if (leaf.type === "enum") return leaf.values?.[0] ?? "";
  if (leaf.type === "array") return [];
  return "";
}

function readTailValue(base: Value, tail: string[]): Value {
  let cursor: Value = base;
  for (const part of tail) {
    if (cursor === null || cursor === undefined) return null;
    if (Array.isArray(cursor)) {
      if (part === "length") cursor = cursor.length;
      else return null;
    } else if (typeof cursor === "object") {
      const next = (cursor as Record<string, Value>)[part];
      cursor = next === undefined ? null : next;
    } else if (typeof cursor === "string" && part === "length") {
      cursor = cursor.length;
    } else {
      return null;
    }
  }
  return cursor;
}

/** 一批步骤执行时用到的东西。 */
interface Batch {
  /** 状态的工作副本：后面的步骤读到前面步骤写入的新值，全部执行完再一次生效 */
  work: Map<string, Value>;
  /** 窗口开关状态的工作副本 */
  windows: Map<string, { open: boolean; modal: boolean }>;
  /** 停靠面板开关覆盖（当面板未通过 props.visible 绑定状态时使用） */
  docks: Map<string, boolean>;
  lines: string[];
  /** 这一批里 emit 的业务事件，等这批生效之后再处理 */
  pending: PendingBusinessEvent[];
  /** 这一批里 call 的动作，等这批生效之后再启动 */
  calls: Array<{ name: string; input: Record<string, Value> }>;
  /** 是不是业务事件的模拟步骤：只有模拟步骤能修改业务管的状态 */
  simulating: boolean;
}

export class Runtime {
  private project: RuntimeProject;
  private hooks: RuntimeHooks;
  /** 状态路径 → 当前值 */
  private state = new Map<string, Value>();
  /** 文字条件的开关 */
  private textConditions = new Map<string, boolean>();
  /** 顶层窗口与对话框的开关状态 */
  private windows = new Map<string, { open: boolean; modal: boolean }>();
  /** 停靠面板未绑定状态时的显隐开关 */
  private docks = new Map<string, boolean>();
  /** 动作模拟设置 */
  private actionSims = new Map<string, ActionSimConfig>();
  /** 正在进行中的异步动作集合 */
  private runningActions = new Set<string>();
  private exprCache = new Map<string, Expr>();
  private fnCache = new Map<string, (state: Record<string, unknown>, args: Record<string, Value>) => unknown>();
  private businessChain = 0;

  constructor(project: RuntimeProject, hooks: RuntimeHooks = { onChange() {}, onLog() {} }) {
    this.project = project;
    this.hooks = hooks;
    this.reset();
  }

  /** 把所有状态、窗口和文字条件恢复为初始值。 */
  reset(): void {
    this.state.clear();
    for (const { path, leaf } of allStateLeaves(this.project.logic)) this.state.set(path, defaultFor(leaf));
    this.textConditions.clear();
    for (const { id, def } of allConditions(this.project.logic)) {
      if (def?.type === "text") this.textConditions.set(id, def.preview === true);
    }
    this.windows.clear();
    for (const winId of allWindowIds(this.project.scene)) {
      const n = this.project.scene.nodes[winId];
      const isRoot = winId === this.project.scene.root;
      const open = isRoot ? true : Boolean(n?.initialOpen ?? n?.props?.open ?? false);
      const modal = isRoot ? false : Boolean(n?.modal ?? n?.props?.modal ?? n?.type === "Dialog");
      this.windows.set(winId, { open, modal });
    }
    this.docks.clear();
    for (const [id, n] of Object.entries(this.project.scene.nodes)) {
      if (n.type === "Dock") this.docks.set(id, n.props?.visible !== false);
    }
    for (const [name, def] of Object.entries(this.project.logic.actions ?? {})) {
      if (!this.actionSims.has(name)) {
        this.actionSims.set(name, {
          mode: "real",
          delayMs: 0,
          result: def?.mockResult,
          errorMessage: def?.mockError,
        });
      }
    }
    this.runningActions.clear();
  }

  /** 换成新加载的项目；状态结构没变的部分保留当前值。 */
  adopt(project: RuntimeProject): void {
    const oldState = new Map(this.state);
    const oldConditions = new Map(this.textConditions);
    const oldWindows = new Map(this.windows);
    const oldSims = new Map(this.actionSims);
    this.project = project;
    this.exprCache.clear();
    this.fnCache.clear();
    this.reset();
    for (const [path, value] of oldState) {
      const leaf = findStateLeaf(project.logic, path);
      if (leaf && this.accepts(leaf, value)) this.state.set(path, cloneValue(value));
    }
    for (const [id, value] of oldConditions) {
      if (this.textConditions.has(id)) this.textConditions.set(id, value);
    }
    for (const [id, win] of oldWindows) {
      if (this.windows.has(id)) this.windows.set(id, win);
    }
    for (const [name, sim] of oldSims) {
      this.actionSims.set(name, sim);
    }
  }

  /** 触发 app.start，预览开始时调用一次。 */
  start(): void {
    this.dispatch(null, "app.start");
  }

  // ---------- 读取 ----------

  private parse(source: string | number | boolean): Expr {
    const key = String(source);
    let expr = this.exprCache.get(key);
    if (!expr) {
      expr = parseExpr(key);
      this.exprCache.set(key, expr);
    }
    return expr;
  }

  private resolve(
    path: string,
    state: Map<string, Value>,
    stack: string[],
    scope: Record<string, Value> = {},
  ): Value {
    if (path in scope) return scope[path];
    for (const key of Object.keys(scope)) {
      if (path.startsWith(key + ".")) {
        return readTailValue(scope[key], path.slice(key.length + 1).split("."));
      }
    }
    if (state.has(path)) return state.get(path)!;
    // 支持读取数组或字符串状态的 .length 等尾部属性，例如 layers.items.length
    const parts = path.split(".");
    for (let i = parts.length - 1; i >= 1; i--) {
      const prefix = parts.slice(0, i).join(".");
      if (state.has(prefix)) {
        return readTailValue(state.get(prefix)!, parts.slice(i));
      }
    }
    const condition = findCondition(this.project.logic, path);
    if (!condition) throw new Error(`未知的状态路径或条件代号“${path}”`);
    if (condition.type === "text") return this.textConditions.get(path) ?? false;
    if (stack.includes(path)) throw new Error(`条件循环引用：${[...stack, path].join(" → ")}`);
    return Boolean(
      evalExpr(this.parse(condition.expr ?? "false"), (p) => this.resolve(p, state, [...stack, path], scope)),
    );
  }

  private evaluate(
    source: string | number | boolean,
    state = this.state,
    scope: Record<string, Value> = {},
  ): Value {
    return evalExpr(this.parse(source), (path) => this.resolve(path, state, [], scope));
  }

  private evaluateStructured(
    raw: Value | Record<string, Value | string>,
    state: Map<string, Value>,
    scope: Record<string, Value>,
  ): Value {
    if (raw === null || typeof raw === "boolean" || typeof raw === "number") return raw;
    if (typeof raw === "string") return this.evaluate(raw, state, scope);
    if (Array.isArray(raw)) return raw.map((item) => this.evaluateStructured(item, state, scope));
    const result: Record<string, Value> = {};
    for (const [k, v] of Object.entries(raw)) {
      result[k] = this.evaluateStructured(v as Value, state, scope);
    }
    return result;
  }

  /** 预览工具条用：全部条件及其当前值。 */
  conditions(): Array<{ id: string; text: string; kind: "text" | "symbol"; value: boolean }> {
    return allConditions(this.project.logic).map(({ id, def }) => {
      let value = false;
      try {
        value = Boolean(this.resolve(id, this.state, []));
      } catch {
        // 写错的条件已经在问题栏报告，这里按假处理
      }
      return { id, text: def?.text ?? "", kind: def?.type === "text" ? "text" : "symbol", value };
    });
  }

  /** 预览工具条用：全部动作及其模拟设置。 */
  actions(): Array<{ name: string; text: string; sim: ActionSimConfig }> {
    return Object.entries(this.project.logic.actions ?? {}).map(([name, def]) => ({
      name,
      text: def?.text ?? "",
      sim: this.getActionSimulation(name),
    }));
  }

  getActionSimulation(name: string): ActionSimConfig {
    const existing = this.actionSims.get(name);
    if (existing) return { ...existing };
    const def = this.project.logic.actions?.[name];
    return {
      mode: "real",
      delayMs: 0,
      result: def?.mockResult,
      errorMessage: def?.mockError,
    };
  }

  setActionSimulation(name: string, config: Partial<ActionSimConfig>): void {
    const cur = this.getActionSimulation(name);
    this.actionSims.set(name, { ...cur, ...config });
    this.hooks.onChange();
  }

  isWindowOpen(id: string): boolean {
    if (id === this.project.scene.root) return true;
    return this.windows.get(id)?.open ?? false;
  }

  isWindowModal(id: string): boolean {
    return this.windows.get(id)?.modal ?? false;
  }

  activeModalWindow(): string | null {
    let active: string | null = null;
    for (const [id, win] of this.windows) {
      if (id !== this.project.scene.root && win.open && win.modal) active = id;
    }
    return active;
  }

  private windowOf(nodeId: string): string {
    for (const winId of allWindowIds(this.project.scene)) {
      if (this.isInsideSubtree(winId, nodeId)) return winId;
    }
    return this.project.scene.root;
  }

  private isInsideSubtree(rootId: string, targetId: string): boolean {
    if (rootId === targetId) return true;
    const n = this.project.scene.nodes[rootId];
    if (!n) return false;
    const children = [...(n.children ?? []), ...(n.docks ?? []), ...(n.central ? [n.central] : []), ...(n.statusBar ? [n.statusBar] : [])];
    for (const cid of children) {
      if (this.isInsideSubtree(cid, targetId)) return true;
    }
    return false;
  }

  stateSnapshot(): Array<[string, Value]> {
    return [...this.state].map(([k, v]) => [k, cloneValue(v)]);
  }

  getState(path: string): Value | undefined {
    const val = this.state.get(path);
    return val === undefined ? undefined : cloneValue(val);
  }

  /** 某个节点（或菜单项）当前应有的样子：静态默认值、scene.json 的值、逻辑计算值依次覆盖。 */
  view(id: string): NodeView {
    const menuItem = findMenuItem(this.project.scene, id);
    if (menuItem && !this.project.scene.nodes[id]) {
      const object = this.project.logic.objects?.[id];
      const props: Record<string, Value> = {
        text: menuItem.text,
        checked: menuItem.dock ? this.view(menuItem.dock).visible : Boolean(menuItem.checked ?? false),
        enabled: true,
      };
      let visible = true;
      for (const [key, expr] of Object.entries(object?.props ?? {})) {
        try {
          const val = this.evaluate(expr);
          if (key === "visible") visible = Boolean(val);
          else props[key] = val;
        } catch {
          // 忽略错误表达式
        }
      }
      return { visible, enabled: props.enabled !== false, props };
    }

    const node = this.project.scene.nodes[id];
    const decl = node ? declFor(this.project, node.type) : null;
    const object = this.project.logic.objects?.[id];
    const props: Record<string, Value> = {};
    const declared = decl?.props ?? {};
    for (const key of Object.keys(declared)) {
      const value = declared[key].default;
      if (value !== undefined) props[key] = cloneValue(value);
    }
    if (node?.title !== undefined && (node.type === "Dock" || node.type === "Dialog")) {
      props.title = node.title;
    }
    if (node?.props) {
      for (const [k, v] of Object.entries(node.props)) {
        if (k !== "visible") props[k] = cloneValue(v);
      }
    }
    let visible = true;
    if (this.windows.has(id) && id !== this.project.scene.root) {
      visible = this.windows.get(id)!.open;
    } else if (node?.type === "Dock" && this.docks.has(id)) {
      visible = this.docks.get(id)!;
    } else if (node?.props?.visible !== undefined) {
      visible = Boolean(node.props.visible);
    }
    const computed = object?.props ?? {};
    for (const key of Object.keys(computed)) {
      try {
        const value = this.evaluate(computed[key]);
        if (key === "visible") visible = Boolean(value);
        else props[key] = cloneValue(value);
      } catch {
        // 表达式有错时保留静态值，错误已在问题栏报告
      }
    }
    if (object?.bind && this.state.has(object.bind)) {
      props.value = cloneValue(this.state.get(object.bind)!);
    }
    if (visible) {
      for (const [parentId, parentNode] of Object.entries(this.project.scene.nodes)) {
        if (layoutOf(parentNode)?.kind === "stack" && parentNode.children?.includes(id)) {
          const pView = this.view(parentId);
          const activeIdx = Number(pView.props.currentIndex ?? 0);
          const activePage = String(pView.props.currentPage ?? "");
          const idx = parentNode.children.indexOf(id);
          const isActive = activePage ? id === activePage : idx === activeIdx;
          if (!isActive) visible = false;
          break;
        }
      }
    }
    return { visible, enabled: props.enabled !== false, props };
  }

  // ---------- 事件 ----------

  toggleTextCondition(id: string): void {
    const next = !(this.textConditions.get(id) ?? false);
    this.textConditions.set(id, next);
    this.hooks.onLog({ title: `条件 ${id}`, lines: [`手动切换：${next ? "否 → 是" : "是 → 否"}`] });
    this.hooks.onChange();
  }

  /** nodeId 为 null 表示全局事件。 */
  dispatch(nodeId: string | null, event: string, value?: Value): void {
    const { logic, scene } = this.project;

    if (nodeId !== null) {
      const modalWin = this.activeModalWindow();
      if (modalWin && !this.isInsideSubtree(modalWin, nodeId)) {
        if (event !== "mouseenter" && event !== "mouseleave") {
          this.hooks.onLog({ title: `${nodeId}.${event}`, lines: [`已忽略：模态窗口 ${modalWin} 正在打开`] });
        }
        return;
      }
    }

    const menuItem = nodeId && !scene.nodes[nodeId] ? findMenuItem(scene, nodeId) : null;
    if (menuItem && nodeId) {
      const object = logic.objects?.[nodeId];
      const steps = object?.events?.[event];
      if (!steps && event !== "click") return;
      const view = this.view(nodeId);
      if (!view.visible || !view.enabled) {
        this.hooks.onLog({ title: `${nodeId}.${event}`, lines: [`已忽略：菜单项${view.visible ? "不可用" : "不可见"}`] });
        return;
      }
      this.runBatch(`${nodeId}.${event}`, false, false, (batch) => {
        if (steps) {
          this.runSteps(steps, batch, 0, this.scopeForValue(value));
        } else if (menuItem.emit) {
          this.runSteps([{ emit: menuItem.emit }], batch, 0, {});
        } else if (menuItem.dock) {
          this.toggleDockInBatch(batch, menuItem.dock);
        }
      });
      return;
    }

    const object = nodeId ? logic.objects?.[nodeId] : undefined;
    const steps = nodeId ? object?.events?.[event] : globalSteps(logic, event);
    const bindTarget = nodeId && event === "change" && value !== undefined ? object?.bind : undefined;
    if (!steps && !bindTarget) return;

    const title = nodeId ? `${nodeId}.${event}` : `全局事件 ${event}`;
    if (nodeId) {
      const winId = this.windowOf(nodeId);
      if (winId !== scene.root && !this.view(winId).visible) {
        if (event !== "mouseenter" && event !== "mouseleave") {
          this.hooks.onLog({ title, lines: [`已忽略：所属窗口 ${winId} 未打开`] });
        }
        return;
      }
      const view = this.view(nodeId);
      if (!view.visible || !view.enabled) {
        // 鼠标移入移出很频繁，被忽略时不记录，免得刷屏
        if (event !== "mouseenter" && event !== "mouseleave") {
          this.hooks.onLog({ title, lines: [`已忽略：控件${view.visible ? "不可用" : "不可见"}`] });
        }
        return;
      }
    }

    const scope = this.scopeForValue(value);
    // window.click 每次点击都会触发，没有引起变化时不记录
    this.runBatch(title, false, event === "window.click", (batch) => {
      if (bindTarget) this.assign(batch, bindTarget, value!);
      if (steps) this.runSteps(steps, batch, 0, scope);
    });
  }

  private scopeForValue(value?: Value): Record<string, Value> {
    if (value === undefined) return {};
    const scope: Record<string, Value> = { value };
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      scope.param = value;
      for (const [k, v] of Object.entries(value)) scope[k] = v;
    }
    return scope;
  }

  private toggleDockInBatch(batch: Batch, dockId: string): void {
    const dockObj = this.project.logic.objects?.[dockId];
    const visExpr = dockObj?.props?.visible;
    if (typeof visExpr === "string" && findStateLeaf(this.project.logic, visExpr)) {
      const cur = Boolean(batch.work.get(visExpr));
      this.assign(batch, visExpr, !cur);
      return;
    }
    const cur = batch.docks.get(dockId) ?? true;
    batch.docks.set(dockId, !cur);
    batch.lines.push(`停靠面板 ${dockId}: ${cur ? "显示 → 隐藏" : "隐藏 → 显示"}`);
  }

  /** 执行一个业务事件的模拟步骤，就像业务没有接上时那样。 */
  simulate(name: string, args: Record<string, Value> = {}): void {
    const def = businessEvent(this.project.logic, name);
    if (!def) return;
    const scope: Record<string, Value> = { param: args, ...args };
    this.runBatch(`业务事件 ${name}（模拟）`, true, false, (batch) => {
      if (def.simulate) this.runSteps(def.simulate, batch, 0, scope);
    });
  }

  /**
   * 业务触发请求事件（业务 → 界面）。成功返回 null，否则返回原因。
   */
  request(name: string, args: Record<string, Value> = {}): string | null {
    const def = requestEvent(this.project.logic, name);
    if (!def) return `“${name}”不是请求事件`;
    for (const [paramName, paramType] of Object.entries(def.params ?? {})) {
      const v = args[paramName];
      if (v === undefined) return `请求事件 ${name} 缺少参数 ${paramName}`;
      if (typeof v !== paramType) return `请求事件 ${name} 的参数 ${paramName} 需要 ${paramType}，得到 ${show(v)}`;
    }
    const scope: Record<string, Value> = { param: args, ...args };
    this.runBatch(`请求事件 ${name}`, false, false, (batch) => {
      if (def.steps) this.runSteps(def.steps, batch, 0, scope);
    });
    return null;
  }

  /**
   * 业务把自己管的状态写回界面。成功返回 null，否则返回原因。
   * 只能写标了 owner: business 的状态。
   */
  setBusinessState(path: string, value: Value): string | null {
    const leaf = findStateLeaf(this.project.logic, path);
    if (!leaf) return `“${path}”不是状态路径`;
    if (!isBusinessState(leaf)) return `“${path}”是界面自己管的状态，业务不能写`;
    if (!this.accepts(leaf, value)) return `${path} 需要 ${this.expected(leaf)}，得到 ${show(value)}`;
    const before = this.state.get(path);
    if (sameStateValue(before, value)) return null;
    this.state.set(path, cloneValue(value));
    this.hooks.onLog({ title: "业务写回状态", lines: [`${path}: ${show(before ?? null)} → ${show(value)}`] });
    this.hooks.onChange();
    return null;
  }

  /** 执行一批步骤，让结果一次生效，再处理这一批里 emit 的业务事件和 call 的动作。 */
  private runBatch(title: string, simulating: boolean, quietWhenEmpty: boolean, body: (batch: Batch) => void): void {
    const work = new Map<string, Value>();
    for (const [k, v] of this.state) work.set(k, cloneValue(v));
    const windows = new Map<string, { open: boolean; modal: boolean }>();
    for (const [k, v] of this.windows) windows.set(k, { ...v });
    const docks = new Map<string, boolean>(this.docks);

    const batch: Batch = { work, windows, docks, lines: [], pending: [], calls: [], simulating };
    body(batch);

    let changed = false;
    for (const [path, next] of batch.work) {
      const before = this.state.get(path);
      if (!sameStateValue(before, next)) {
        batch.lines.push(`${path}: ${show(before ?? null)} → ${show(next)}`);
        changed = true;
      }
    }
    for (const [id, next] of batch.windows) {
      const before = this.windows.get(id);
      if (!before || before.open !== next.open || before.modal !== next.modal) {
        changed = true;
      }
    }
    for (const [id, next] of batch.docks) {
      if (this.docks.get(id) !== next) changed = true;
    }

    this.state = batch.work;
    this.windows = batch.windows;
    this.docks = batch.docks;
    if (batch.lines.length > 0 || !quietWhenEmpty) {
      if (batch.lines.length === 0) batch.lines.push("（没有状态变化）");
      this.hooks.onLog({ title, lines: batch.lines });
    }
    if (changed) this.hooks.onChange();

    for (const item of batch.pending) this.raise(item.name, item.args);
    for (const call of batch.calls) this.executeAction(call.name, call.input);
  }

  private raise(name: string, args: Record<string, Value>): void {
    if (this.hooks.raiseBusiness?.(name, args)) return;
    if (this.businessChain >= MAX_BUSINESS_CHAIN) {
      this.hooks.onLog({
        title: `业务事件 ${name}`,
        lines: [`错误：业务事件连锁超过 ${MAX_BUSINESS_CHAIN} 个，可能是模拟步骤互相触发`],
      });
      return;
    }
    this.businessChain++;
    try {
      this.simulate(name, args);
    } finally {
      this.businessChain--;
    }
  }

  private executeAction(name: string, input: Record<string, Value>): void {
    const def = this.project.logic.actions?.[name];
    if (!def) {
      this.hooks.onLog({ title: `动作 ${name}`, lines: [`错误：动作“${name}”没有定义`] });
      return;
    }
    if (this.runningActions.has(name)) {
      this.hooks.onLog({ title: `动作 ${name}`, lines: ["已忽略：该动作正在进行中"] });
      return;
    }
    const sim = this.getActionSimulation(name);
    const finishSuccess = (resultVal: Value) => {
      this.runningActions.delete(name);
      const res = resultVal === undefined ? (def.mockResult ?? null) : resultVal;
      const scope: Record<string, Value> = { result: res };
      this.runBatch(`动作 ${name} 完成`, false, false, (batch) => {
        if (def.onSuccess) this.runSteps(def.onSuccess, batch, 0, scope);
      });
    };
    const finishError = (message: string) => {
      this.runningActions.delete(name);
      const errObj: Record<string, Value> = { message };
      const scope: Record<string, Value> = { error: errObj, "error.message": message };
      this.runBatch(`动作 ${name} 失败`, false, false, (batch) => {
        batch.lines.push(`失败：${message}`);
        if (def.onError) this.runSteps(def.onError, batch, 0, scope);
      });
    };

    const runNow = () => {
      if (sim.mode === "error") {
        finishError(sim.errorMessage ?? def.mockError ?? "模拟失败");
        return;
      }
      if (sim.mode === "success") {
        finishSuccess(sim.result !== undefined ? sim.result : (def.mockResult ?? null));
        return;
      }
      // real 模式：如果有动作源码则执行，否则按成功模拟
      const source = this.project.actionSources?.[name];
      if (!source) {
        finishSuccess(sim.result !== undefined ? sim.result : (def.mockResult ?? null));
        return;
      }
      try {
        const fn = this.compileFunction(`action:${name}`, source);
        const out = fn(input as Record<string, unknown>, input);
        if (out && typeof (out as Promise<unknown>).then === "function") {
          this.runningActions.add(name);
          (out as Promise<Value>).then(
            (res) => finishSuccess(res ?? null),
            (err) => finishError((err as Error)?.message ?? String(err)),
          );
        } else {
          finishSuccess((out as Value) ?? null);
        }
      } catch (e) {
        finishError((e as Error).message);
      }
    };

    if (sim.delayMs > 0 && typeof setTimeout === "function") {
      this.runningActions.add(name);
      this.hooks.onLog({ title: `动作 ${name}`, lines: [`开始（延迟 ${sim.delayMs} ms）`] });
      setTimeout(runNow, sim.delayMs);
    } else {
      runNow();
    }
  }

  private compileFunction(
    cacheKey: string,
    source: string,
  ): (state: Record<string, unknown>, args: Record<string, Value>) => unknown {
    let fn = this.fnCache.get(cacheKey);
    if (!fn) {
      const transformed = source.replace(/^\s*export\s+default\s+/m, "return ");
      const factory = new Function(transformed) as () => (
        state: Record<string, unknown>,
        args: Record<string, Value>,
      ) => unknown;
      const exported = factory();
      if (typeof exported !== "function") {
        throw new Error(`函数文件没有导出一个函数`);
      }
      fn = exported;
      this.fnCache.set(cacheKey, fn);
    }
    return fn;
  }

  private buildStateObject(work: Map<string, Value>): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    for (const [path, val] of work) {
      const cloned = cloneValue(val);
      obj[path] = cloned;
      const parts = path.split(".");
      let cursor = obj;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (typeof cursor[part] !== "object" || cursor[part] === null || Array.isArray(cursor[part])) {
          cursor[part] = {};
        }
        cursor = cursor[part] as Record<string, unknown>;
      }
      cursor[parts[parts.length - 1]] = cloneValue(val);
    }
    return obj;
  }

  private applyFnResult(batch: Batch, result: unknown): void {
    if (!result || typeof result !== "object" || Array.isArray(result)) return;
    const walk = (obj: Record<string, unknown>, prefix: string) => {
      for (const [k, v] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${k}` : k;
        const leaf = findStateLeaf(this.project.logic, path);
        if (leaf) {
          this.assign(batch, path, v as Value);
        } else if (v && typeof v === "object" && !Array.isArray(v)) {
          walk(v as Record<string, unknown>, path);
        } else {
          this.assign(batch, path, v as Value);
        }
      }
    };
    walk(result as Record<string, unknown>, "");
  }

  private runSteps(steps: Step[], batch: Batch, depth: number, scope: Record<string, Value>): void {
    if (!Array.isArray(steps)) return;
    for (const step of steps) {
      try {
        if ("set" in step) {
          const parsed = parseAssignment(step.set);
          const nextValue = evalExpr(parsed.value, (path) => this.resolve(path, batch.work, [], scope));
          if (parsed.index !== undefined) {
            const idx = Number(evalExpr(parsed.index, (path) => this.resolve(path, batch.work, [], scope)));
            this.assignIndexed(batch, parsed.target, idx, parsed.field, nextValue);
          } else {
            this.assign(batch, parsed.target, nextValue);
          }
        } else if ("push" in step) {
          const spec = typeof step.push === "string" ? { to: step.push, item: (step as { value?: Value }).value ?? null } : step.push;
          const itemVal = this.evaluateStructured(spec.item, batch.work, scope);
          const cur = batch.work.get(spec.to);
          const arr = Array.isArray(cur) ? cloneValue(cur) : [];
          if (spec.index !== undefined) {
            const idx = Math.max(0, Math.min(arr.length, Number(this.evaluate(spec.index, batch.work, scope))));
            arr.splice(idx, 0, itemVal);
          } else {
            arr.push(itemVal);
          }
          this.assign(batch, spec.to, arr);
        } else if ("remove" in step) {
          const spec = typeof step.remove === "string" ? { from: step.remove, index: (step as { index?: string | number }).index ?? 0 } : step.remove;
          const idx = Number(this.evaluate(spec.index, batch.work, scope));
          const cur = batch.work.get(spec.from);
          if (Array.isArray(cur)) {
            if (Number.isInteger(idx) && idx >= 0 && idx < cur.length) {
              const arr = cloneValue(cur);
              arr.splice(idx, 1);
              this.assign(batch, spec.from, arr);
            }
          } else {
            this.assign(batch, spec.from, []);
          }
        } else if ("move" in step) {
          const spec =
            typeof step.move === "string"
              ? {
                  in: step.move,
                  from: (step as { from?: string | number }).from ?? 0,
                  to: (step as { to?: string | number }).to ?? 0,
                }
              : step.move;
          const fromIdx = Number(this.evaluate(spec.from, batch.work, scope));
          const toIdx = Number(this.evaluate(spec.to, batch.work, scope));
          const cur = batch.work.get(spec.in);
          if (Array.isArray(cur)) {
            if (
              Number.isInteger(fromIdx) &&
              Number.isInteger(toIdx) &&
              fromIdx >= 0 &&
              fromIdx < cur.length &&
              toIdx >= 0 &&
              toIdx < cur.length
            ) {
              const arr = cloneValue(cur);
              const [moved] = arr.splice(fromIdx, 1);
              arr.splice(toIdx, 0, moved);
              this.assign(batch, spec.in, arr);
            }
          } else {
            this.assign(batch, spec.in, []);
          }
        } else if ("fn" in step) {
          const spec = typeof step.fn === "string" ? { name: step.fn, args: (step as { args?: Record<string, Value | string> }).args } : step.fn;
          const source = this.project.functions?.[spec.name];
          if (!source) {
            batch.lines.push(`错误：找不到函数“${spec.name}”`);
          } else {
            const evalArgs: Record<string, Value> = {};
            for (const [k, v] of Object.entries(spec.args ?? {})) {
              evalArgs[k] = this.evaluateStructured(v, batch.work, scope);
            }
            const fn = this.compileFunction(`fn:${spec.name}`, source);
            const stateObj = this.buildStateObject(batch.work);
            const result = fn(stateObj, evalArgs);
            this.applyFnResult(batch, result);
          }
        } else if ("openWindow" in step) {
          const spec = typeof step.openWindow === "string" ? { id: step.openWindow } : step.openWindow;
          const node = this.project.scene.nodes[spec.id];
          if (!node) {
            batch.lines.push(`错误：窗口“${spec.id}”不存在`);
          } else {
            const modal = spec.modal !== undefined ? Boolean(spec.modal) : Boolean(node.modal ?? node.props?.modal ?? node.type === "Dialog");
            batch.windows.set(spec.id, { open: true, modal });
            batch.lines.push(`打开窗口 ${spec.id}${modal ? "（模态）" : ""}`);
          }
        } else if ("closeWindow" in step) {
          const id = step.closeWindow;
          const prev = batch.windows.get(id);
          if (!this.project.scene.nodes[id]) {
            batch.lines.push(`错误：窗口“${id}”不存在`);
          } else {
            batch.windows.set(id, { open: false, modal: prev?.modal ?? true });
            batch.lines.push(`关闭窗口 ${id}`);
          }
        } else if ("call" in step) {
          const name = step.call;
          const def = this.project.logic.actions?.[name];
          if (!def) {
            batch.lines.push(`错误：动作“${name}”没有在 actions 中定义`);
          } else {
            const input: Record<string, Value> = {};
            for (const [k, expr] of Object.entries(def.input ?? {})) {
              input[k] = this.evaluate(expr, batch.work, scope);
            }
            batch.calls.push({ name, input });
            batch.lines.push(`调用动作 ${name}`);
          }
        } else if ("emit" in step) {
          const spec = typeof step.emit === "string" ? { name: step.emit, args: (step as { args?: Record<string, Value | string> }).args } : step.emit;
          const evalArgs: Record<string, Value> = {};
          for (const [k, v] of Object.entries(spec.args ?? {})) {
            evalArgs[k] = this.evaluateStructured(v, batch.work, scope);
          }
          const handler = globalSteps(this.project.logic, spec.name);
          const reqDef = requestEvent(this.project.logic, spec.name);
          if (businessEvent(this.project.logic, spec.name)) {
            batch.pending.push({ name: spec.name, args: evalArgs });
            batch.lines.push(`业务事件 ${spec.name}：这批步骤生效后处理`);
          } else if (reqDef) {
            if (depth >= MAX_EMIT_DEPTH) {
              batch.lines.push(`错误：全局事件嵌套超过 ${MAX_EMIT_DEPTH} 层，可能是互相触发`);
            } else {
              batch.lines.push(`触发请求事件 ${spec.name}`);
              this.runSteps(reqDef.steps, batch, depth + 1, { ...scope, param: evalArgs, ...evalArgs });
            }
          } else if (!handler) {
            batch.lines.push(`错误：全局事件“${spec.name}”没有定义`);
          } else if (batch.simulating) {
            batch.lines.push(`错误：模拟步骤里不能触发普通全局事件“${spec.name}”`);
          } else if (depth >= MAX_EMIT_DEPTH) {
            batch.lines.push(`错误：全局事件嵌套超过 ${MAX_EMIT_DEPTH} 层，可能是互相触发`);
          } else {
            batch.lines.push(`触发全局事件 ${spec.name}`);
            this.runSteps(handler, batch, depth + 1, { ...scope, param: evalArgs, ...evalArgs });
          }
        } else if ("if" in step) {
          const branch = this.evaluate(step.if, batch.work, scope) ? step.then : step.else;
          if (branch) this.runSteps(branch, batch, depth, scope);
        }
      } catch (e) {
        batch.lines.push(`错误：${(e as Error).message}`);
      }
    }
  }

  private accepts(leaf: StateLeaf, value: Value): boolean {
    if (leaf.type === "enum") return typeof value === "string" && (leaf.values ?? []).includes(value);
    if (leaf.type === "array") return Array.isArray(value);
    return typeof value === leaf.type;
  }

  private expected(leaf: StateLeaf): string {
    return leaf.type === "enum" ? `[${(leaf.values ?? []).join(", ")}] 之一` : leaf.type;
  }

  private assign(batch: Batch, target: string, value: Value): void {
    const leaf = findStateLeaf(this.project.logic, target);
    if (!leaf) {
      batch.lines.push(`错误：“${target}”不是状态路径`);
    } else if (isBusinessState(leaf) !== batch.simulating) {
      batch.lines.push(
        batch.simulating
          ? `错误：模拟步骤只能修改业务管的状态，“${target}”是界面自己管的`
          : `错误：状态“${target}”归业务管，只能在业务事件的模拟步骤里修改`,
      );
    } else if (!this.accepts(leaf, value)) {
      batch.lines.push(`错误：${target} 需要 ${this.expected(leaf)}，得到 ${show(value)}`);
    } else {
      batch.work.set(target, cloneValue(value));
    }
  }

  private assignIndexed(batch: Batch, target: string, idx: number, field: string | undefined, value: Value): void {
    const leaf = findStateLeaf(this.project.logic, target);
    if (!leaf) {
      batch.lines.push(`错误：“${target}”不是状态路径`);
      return;
    }
    if (leaf.type !== "array") {
      batch.lines.push(`错误：“${target}”不是数组状态，不能按位置赋值`);
      return;
    }
    if (isBusinessState(leaf) !== batch.simulating) {
      batch.lines.push(
        batch.simulating
          ? `错误：模拟步骤只能修改业务管的状态，“${target}”是界面自己管的`
          : `错误：状态“${target}”归业务管，只能在业务事件的模拟步骤里修改`,
      );
      return;
    }
    const cur = batch.work.get(target);
    if (!Array.isArray(cur) || !Number.isInteger(idx) || idx < 0 || idx >= cur.length) {
      return;
    }
    const nextArr = cloneValue(cur);
    if (field) {
      const item = nextArr[idx];
      if (item && typeof item === "object" && !Array.isArray(item)) {
        nextArr[idx] = { ...(item as Record<string, Value>), [field]: cloneValue(value) };
      }
    } else {
      nextArr[idx] = cloneValue(value);
    }
    batch.work.set(target, nextArr);
  }
}
