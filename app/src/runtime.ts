// 逻辑运行层：保存状态，计算条件和属性，按批处理事件。
// 不依赖网页和 Tauri：工具的预览、命令行，以及导出后嵌进 Qt 的 JS 引擎，运行的都是这一份。
import { evalExpr, parseAssignment, parseExpr, type Expr, type Value } from "./expr.ts";
import {
  allConditions,
  allStateLeaves,
  businessEvent,
  declFor,
  findCondition,
  findStateLeaf,
  globalSteps,
  isBusinessState,
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

export interface RuntimeHooks {
  onChange(): void;
  onLog(entry: LogEntry): void;
  /**
   * 有业务事件要处理时调用。返回 true 表示外面接手了（导出到 Qt 后由界面绑定层决定交给业务还是模拟）；
   * 没有提供，或者返回 false，就执行这个事件的模拟步骤。
   */
  raiseBusiness?(name: string): boolean;
}

const MAX_EMIT_DEPTH = 20;
/** 一次操作引出的业务事件最多连锁这么多个，防止模拟步骤互相触发停不下来。 */
const MAX_BUSINESS_CHAIN = 50;

function show(value: Value): string {
  return typeof value === "string" ? `'${value}'` : String(value);
}

function defaultFor(leaf: StateLeaf): Value {
  if (leaf.initial !== undefined) return leaf.initial;
  if (leaf.type === "number") return 0;
  if (leaf.type === "boolean") return false;
  if (leaf.type === "enum") return leaf.values?.[0] ?? "";
  return "";
}

/** 一批步骤执行时用到的东西。 */
interface Batch {
  /** 状态的工作副本：后面的步骤读到前面步骤写入的新值，全部执行完再一次生效 */
  work: Map<string, Value>;
  lines: string[];
  /** 这一批里 emit 的业务事件，等这批生效之后再处理 */
  pending: string[];
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
  private exprCache = new Map<string, Expr>();
  private businessChain = 0;

  constructor(project: RuntimeProject, hooks: RuntimeHooks = { onChange() {}, onLog() {} }) {
    this.project = project;
    this.hooks = hooks;
    this.reset();
  }

  /** 把所有状态和文字条件恢复为初始值。 */
  reset(): void {
    this.state.clear();
    for (const { path, leaf } of allStateLeaves(this.project.logic)) this.state.set(path, defaultFor(leaf));
    this.textConditions.clear();
    for (const { id, def } of allConditions(this.project.logic)) {
      if (def?.type === "text") this.textConditions.set(id, def.preview === true);
    }
  }

  /** 换成新加载的项目；状态结构没变的部分保留当前值。 */
  adopt(project: RuntimeProject): void {
    const oldState = new Map(this.state);
    const oldConditions = new Map(this.textConditions);
    this.project = project;
    this.exprCache.clear();
    this.reset();
    for (const [path, value] of oldState) {
      const leaf = findStateLeaf(project.logic, path);
      if (leaf && this.accepts(leaf, value)) this.state.set(path, value);
    }
    for (const [id, value] of oldConditions) {
      if (this.textConditions.has(id)) this.textConditions.set(id, value);
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

  private resolve(path: string, state: Map<string, Value>, stack: string[]): Value {
    if (state.has(path)) return state.get(path)!;
    const condition = findCondition(this.project.logic, path);
    if (!condition) throw new Error(`未知的状态路径或条件代号“${path}”`);
    if (condition.type === "text") return this.textConditions.get(path) ?? false;
    if (stack.includes(path)) throw new Error(`条件循环引用：${[...stack, path].join(" → ")}`);
    return Boolean(evalExpr(this.parse(condition.expr ?? "false"), (p) => this.resolve(p, state, [...stack, path])));
  }

  private evaluate(source: string | number | boolean, state = this.state): Value {
    return evalExpr(this.parse(source), (path) => this.resolve(path, state, []));
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

  stateSnapshot(): Array<[string, Value]> {
    return [...this.state];
  }

  getState(path: string): Value | undefined {
    return this.state.get(path);
  }

  /** 某个节点当前应有的样子：静态默认值、scene.json 的值、逻辑计算值依次覆盖。 */
  view(id: string): NodeView {
    const node = this.project.scene.nodes[id];
    const decl = node ? declFor(this.project, node.type) : null;
    const object = this.project.logic.objects?.[id];
    const props: Record<string, Value> = {};
    const declared = decl?.props ?? {};
    for (const key of Object.keys(declared)) {
      const value = declared[key].default;
      if (value !== undefined) props[key] = value;
    }
    Object.assign(props, node?.props);
    let visible = true;
    const computed = object?.props ?? {};
    for (const key of Object.keys(computed)) {
      try {
        const value = this.evaluate(computed[key]);
        if (key === "visible") visible = Boolean(value);
        else props[key] = value;
      } catch {
        // 表达式有错时保留静态值，错误已在问题栏报告
      }
    }
    if (object?.bind && this.state.has(object.bind)) props.value = this.state.get(object.bind)!;
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
    const { logic } = this.project;
    const object = nodeId ? logic.objects?.[nodeId] : undefined;
    const steps = nodeId ? object?.events?.[event] : globalSteps(logic, event);
    const bindTarget = nodeId && event === "change" && value !== undefined ? object?.bind : undefined;
    if (!steps && !bindTarget) return;

    const title = nodeId ? `${nodeId}.${event}` : `全局事件 ${event}`;
    if (nodeId) {
      const view = this.view(nodeId);
      if (!view.visible || !view.enabled) {
        // 鼠标移入移出很频繁，被忽略时不记录，免得刷屏
        if (event !== "mouseenter" && event !== "mouseleave") {
          this.hooks.onLog({ title, lines: [`已忽略：控件${view.visible ? "不可用" : "不可见"}`] });
        }
        return;
      }
    }

    // window.click 每次点击都会触发，没有引起变化时不记录
    this.runBatch(title, false, event === "window.click", (batch) => {
      if (bindTarget) this.assign(batch, bindTarget, value!);
      if (steps) this.runSteps(steps, batch, 0);
    });
  }

  /** 执行一个业务事件的模拟步骤，就像业务没有接上时那样。 */
  simulate(name: string): void {
    const def = businessEvent(this.project.logic, name);
    if (!def) return;
    this.runBatch(`业务事件 ${name}（模拟）`, true, false, (batch) => {
      if (def.simulate) this.runSteps(def.simulate, batch, 0);
    });
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
    if (before === value) return null;
    this.state.set(path, value);
    this.hooks.onLog({ title: "业务写回状态", lines: [`${path}: ${show(before ?? null)} → ${show(value)}`] });
    this.hooks.onChange();
    return null;
  }

  /** 执行一批步骤，让结果一次生效，再处理这一批里 emit 的业务事件。 */
  private runBatch(title: string, simulating: boolean, quietWhenEmpty: boolean, body: (batch: Batch) => void): void {
    const batch: Batch = { work: new Map(this.state), lines: [], pending: [], simulating };
    body(batch);

    let changed = false;
    for (const [path, next] of batch.work) {
      const before = this.state.get(path);
      if (before !== next) {
        batch.lines.push(`${path}: ${show(before ?? null)} → ${show(next)}`);
        changed = true;
      }
    }
    this.state = batch.work;
    if (batch.lines.length > 0 || !quietWhenEmpty) {
      if (batch.lines.length === 0) batch.lines.push("（没有状态变化）");
      this.hooks.onLog({ title, lines: batch.lines });
    }
    if (changed) this.hooks.onChange();

    for (const name of batch.pending) this.raise(name);
  }

  private raise(name: string): void {
    if (this.hooks.raiseBusiness?.(name)) return;
    if (this.businessChain >= MAX_BUSINESS_CHAIN) {
      this.hooks.onLog({ title: `业务事件 ${name}`, lines: [`错误：业务事件连锁超过 ${MAX_BUSINESS_CHAIN} 个，可能是模拟步骤互相触发`] });
      return;
    }
    this.businessChain++;
    try {
      this.simulate(name);
    } finally {
      this.businessChain--;
    }
  }

  private runSteps(steps: Step[], batch: Batch, depth: number): void {
    if (!Array.isArray(steps)) return;
    for (const step of steps) {
      try {
        if ("set" in step) {
          const { target, value } = parseAssignment(step.set);
          this.assign(batch, target, evalExpr(value, (path) => this.resolve(path, batch.work, [])));
        } else if ("emit" in step) {
          const handler = globalSteps(this.project.logic, step.emit);
          if (businessEvent(this.project.logic, step.emit)) {
            batch.pending.push(step.emit);
            batch.lines.push(`业务事件 ${step.emit}：这批步骤生效后处理`);
          } else if (!handler) {
            batch.lines.push(`错误：全局事件“${step.emit}”没有定义`);
          } else if (batch.simulating) {
            batch.lines.push(`错误：模拟步骤里不能触发普通全局事件“${step.emit}”`);
          } else if (depth >= MAX_EMIT_DEPTH) {
            batch.lines.push(`错误：全局事件嵌套超过 ${MAX_EMIT_DEPTH} 层，可能是互相触发`);
          } else {
            batch.lines.push(`触发全局事件 ${step.emit}`);
            this.runSteps(handler, batch, depth + 1);
          }
        } else if ("if" in step) {
          const branch = this.evaluate(step.if, batch.work) ? step.then : step.else;
          if (branch) this.runSteps(branch, batch, depth);
        }
      } catch (e) {
        batch.lines.push(`错误：${(e as Error).message}`);
      }
    }
  }

  private accepts(leaf: StateLeaf, value: Value): boolean {
    if (leaf.type === "enum") return typeof value === "string" && (leaf.values ?? []).includes(value);
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
      batch.work.set(target, value);
    }
  }
}
