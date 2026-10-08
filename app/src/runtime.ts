// 逻辑运行层：保存状态，计算条件和属性，按批处理事件。不依赖 Tauri。
import { evalExpr, parseAssignment, parseExpr, type Expr, type Value } from "./expr";
import {
  allConditions,
  declFor,
  findCondition,
  findStateLeaf,
  isStateLeaf,
  type Project,
  type StateLeaf,
  type Step,
} from "./project";

export interface LogEntry {
  title: string;
  lines: string[];
}

export interface NodeView {
  visible: boolean;
  enabled: boolean;
  props: Record<string, Value>;
}

const MAX_EMIT_DEPTH = 20;

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

export class Runtime {
  /** 状态路径 → 当前值 */
  private state = new Map<string, Value>();
  /** 文字条件的开关 */
  private textConditions = new Map<string, boolean>();
  private exprCache = new Map<string, Expr>();

  constructor(
    private project: Project,
    private hooks: { onChange: () => void; onLog: (entry: LogEntry) => void } = { onChange() {}, onLog() {} },
  ) {
    this.reset();
  }

  /** 把所有状态和文字条件恢复为初始值。 */
  reset(): void {
    this.state.clear();
    const walk = (defs: unknown, prefix: string) => {
      if (typeof defs !== "object" || defs === null) return;
      for (const [key, def] of Object.entries(defs)) {
        if (isStateLeaf(def)) this.state.set(prefix + key, defaultFor(def));
        else walk(def, `${prefix}${key}.`);
      }
    };
    walk(this.project.logic.state, "");
    this.textConditions.clear();
    for (const { id, def } of allConditions(this.project.logic)) {
      if (def?.type === "text") this.textConditions.set(id, def.preview === true);
    }
  }

  /** 换成新加载的项目；状态结构没变的部分保留当前值。 */
  adopt(project: Project): void {
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

  /** 某个节点当前应有的样子：静态默认值、scene.json 的值、逻辑计算值依次覆盖。 */
  view(id: string): NodeView {
    const node = this.project.scene.nodes[id];
    const decl = node ? declFor(this.project, node.type) : null;
    const object = this.project.logic.objects?.[id];
    const props: Record<string, Value> = {};
    for (const [key, propDecl] of Object.entries(decl?.props ?? {})) {
      if (propDecl.default !== undefined) props[key] = propDecl.default;
    }
    Object.assign(props, node?.props);
    let visible = true;
    for (const [key, source] of Object.entries(object?.props ?? {})) {
      try {
        const value = this.evaluate(source);
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
    const steps = nodeId ? object?.events?.[event] : logic.events?.[event];
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

    // 这一批的工作副本：后面的步骤读到前面步骤写入的新值，全部执行完再一次生效
    const work = new Map(this.state);
    const lines: string[] = [];
    if (bindTarget) this.assign(work, bindTarget, value!, lines);
    if (steps) this.runSteps(steps, work, lines, 0);

    let changed = false;
    for (const [path, next] of work) {
      const before = this.state.get(path);
      if (before !== next) {
        lines.push(`${path}: ${show(before ?? null)} → ${show(next)}`);
        changed = true;
      }
    }
    this.state = work;
    // window.click 每次点击都会触发，没有引起变化时不记录
    if (lines.length === 0 && event === "window.click") return;
    if (lines.length === 0) lines.push("（没有状态变化）");
    this.hooks.onLog({ title, lines });
    if (changed) this.hooks.onChange();
  }

  private runSteps(steps: Step[], work: Map<string, Value>, lines: string[], depth: number): void {
    if (!Array.isArray(steps)) return;
    for (const step of steps) {
      try {
        if ("set" in step) {
          const { target, value } = parseAssignment(step.set);
          this.assign(work, target, evalExpr(value, (path) => this.resolve(path, work, [])), lines);
        } else if ("emit" in step) {
          const handler = this.project.logic.events?.[step.emit];
          if (!handler) {
            lines.push(`错误：全局事件“${step.emit}”没有定义`);
          } else if (depth >= MAX_EMIT_DEPTH) {
            lines.push(`错误：全局事件嵌套超过 ${MAX_EMIT_DEPTH} 层，可能是互相触发`);
          } else {
            lines.push(`触发全局事件 ${step.emit}`);
            this.runSteps(handler, work, lines, depth + 1);
          }
        } else if ("if" in step) {
          const branch = this.evaluate(step.if, work) ? step.then : step.else;
          if (branch) this.runSteps(branch, work, lines, depth);
        }
      } catch (e) {
        lines.push(`错误：${(e as Error).message}`);
      }
    }
  }

  private accepts(leaf: StateLeaf, value: Value): boolean {
    if (leaf.type === "enum") return typeof value === "string" && (leaf.values ?? []).includes(value);
    return typeof value === leaf.type;
  }

  private assign(work: Map<string, Value>, target: string, value: Value, lines: string[]): void {
    const leaf = findStateLeaf(this.project.logic, target);
    if (!leaf) {
      lines.push(`错误：“${target}”不是状态路径`);
    } else if (!this.accepts(leaf, value)) {
      const expected = leaf.type === "enum" ? `[${(leaf.values ?? []).join(", ")}] 之一` : leaf.type;
      lines.push(`错误：${target} 需要 ${expected}，得到 ${show(value)}`);
    } else {
      work.set(target, value);
    }
  }
}
