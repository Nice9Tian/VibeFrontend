// 导出到 Qt 之后，嵌在 Qt 自带的 JS 引擎里运行的入口。
// 导出时把这个文件连同它引用的逻辑运行层打包成一个脚本，放进界面绑定层；
// 界面绑定层的 C++ 代码只调用这里导出的几个函数。所以网页预览和 Qt 程序运行的是同一份逻辑。
import type { Value } from "../expr.ts";
import { allMenuItems, computeSceneLayout, type ComponentDecl, type Logic, type Scene } from "../model.ts";
import { Runtime, type ActionSimMode, type NodeView } from "../runtime.ts";
import { dumpRuntime } from "./dump.ts";

/** 导出时写进 project.json 的内容：逻辑运行层需要的那一部分项目数据。 */
export interface RuntimeData {
  scene: Scene;
  logic: Logic;
  components: Record<string, ComponentDecl>;
  functions?: Record<string, string>;
  actionSources?: Record<string, string>;
}

export interface OutgoingEvent {
  kind?: "event" | "action";
  name: string;
  args: Record<string, Value>;
}

export interface PendingTimer {
  id: number;
  delayMs: number;
}

let runtime: Runtime;
let scene: Scene;
/** 等界面绑定层处理的业务事件与动作请求 */
let outgoing: OutgoingEvent[] = [];
let nextTimerId = 1;
let pendingTimers: PendingTimer[] = [];
const timerCallbacks = new Map<number, () => void>();

// Qt 的 QJSEngine 默认没有提供浏览器 setTimeout 与 globalThis；通过 Function("return this")() 获取全局对象并提供桥接实现，交给 C++ 侧 QTimer 触发。
const g = Function("return this")() as {
  setTimeout?: (cb: () => void, ms?: number) => number;
  clearTimeout?: (id?: number) => void;
};
if (typeof g.setTimeout !== "function") {
  g.setTimeout = (cb: () => void, ms?: number): number => {
    const id = nextTimerId++;
    const delayMs = Math.max(0, Math.round(Number(ms ?? 0)));
    timerCallbacks.set(id, cb);
    pendingTimers.push({ id, delayMs });
    return id;
  };
  g.clearTimeout = (id?: number): void => {
    if (id !== undefined) {
      timerCallbacks.delete(id);
      pendingTimers = pendingTimers.filter((t) => t.id !== id);
    }
  };
}

function take(): OutgoingEvent[] {
  const list = outgoing;
  outgoing = [];
  return list;
}

export function takePending(): OutgoingEvent[] {
  return take();
}

export function takeTimers(): PendingTimer[] {
  const list = pendingTimers;
  pendingTimers = [];
  return list;
}

export function fireTimer(id: number): OutgoingEvent[] {
  const cb = timerCallbacks.get(id);
  if (cb) {
    timerCallbacks.delete(id);
    cb();
  }
  return take();
}

export function init(json: string): void {
  const data = JSON.parse(json) as RuntimeData;
  scene = data.scene;
  outgoing = [];
  pendingTimers = [];
  timerCallbacks.clear();
  const components = new Map<string, { decl: ComponentDecl }>();
  for (const type of Object.keys(data.components)) components.set(type, { decl: data.components[type] });
  runtime = new Runtime(
    {
      scene: data.scene,
      logic: data.logic,
      components,
      functions: data.functions,
      actionSources: data.actionSources,
    },
    {
      onChange() {},
      onLog() {},
      // 业务事件不在这里处理：交给界面绑定层，由它看业务有没有连接对应的信号
      raiseBusiness(name, args) {
        outgoing.push({ kind: "event", name, args });
        return true;
      },
      // 动作调用同样交给界面绑定层：业务连接了动作信号就由业务处理，否则回退执行动作脚本或模拟
      raiseAction(name, input) {
        outgoing.push({ kind: "action", name, args: input });
        return true;
      },
    },
  );
}

// 下面函数都返回“这次操作引出的业务事件或动作请求”。界面绑定层逐个处理：
// 业务连接了对应的信号，就发信号；没有连接，就调用 simulate / simulateAction。

export function start(): OutgoingEvent[] {
  runtime.start();
  return take();
}

/** control 为 null 表示全局事件。 */
export function dispatch(control: string | null, event: string, value?: Value): OutgoingEvent[] {
  runtime.dispatch(control, event, value === null ? undefined : value);
  return take();
}

export function simulate(name: string, args?: Record<string, Value>): OutgoingEvent[] {
  runtime.simulate(name, args ?? {});
  return take();
}

export function simulateAction(name: string, input?: Record<string, Value>): OutgoingEvent[] {
  runtime.runActionDefault(name, input ?? {});
  return take();
}

export function finishActionSuccess(name: string, result?: Value): OutgoingEvent[] {
  runtime.finishActionSuccess(name, result === null ? undefined : result);
  return take();
}

export function finishActionError(name: string, message: string): OutgoingEvent[] {
  runtime.finishActionError(name, message);
  return take();
}

export function request(name: string, args?: Record<string, Value>): OutgoingEvent[] {
  runtime.request(name, args ?? {});
  return take();
}

export function closeWindow(id: string): OutgoingEvent[] {
  runtime.closeWindow(id);
  return take();
}

export function setClock(ms: number): OutgoingEvent[] {
  runtime.setClock(ms);
  return take();
}

export function getClock(): number {
  return runtime.getClock();
}

export function setActionSim(name: string, mode: ActionSimMode, delayMs?: number): void {
  runtime.setActionSimulation(name, {
    mode,
    ...(delayMs !== undefined && Number.isFinite(delayMs) ? { delayMs: Math.max(0, delayMs) } : {}),
  });
}

/** 业务把自己管的状态写回来。成功返回 null，否则返回原因。 */
export function setState(path: string, value: Value): string | null {
  return runtime.setBusinessState(path, value);
}

export function getState(path: string): Value {
  const value = runtime.getState(path);
  return value === undefined ? null : value;
}

/** 每个控件（及菜单项）当前应有的样子：ID → 可见、可用、属性。 */
export function views(): Record<string, NodeView> {
  const result: Record<string, NodeView> = {};
  for (const id of Object.keys(scene.nodes)) result[id] = runtime.view(id);
  for (const { item } of allMenuItems(scene)) {
    if (!result[item.id]) result[item.id] = runtime.view(item.id);
  }
  return result;
}

export function computeLayout(width: number, height: number): Record<string, { x: number; y: number; width: number; height: number; absX: number; absY: number; visible: boolean; windowId: string }> {
  const boxes = computeSceneLayout(scene, {
    rootSize: { width, height },
    isVisible: (id) => runtime.view(id).visible,
    getProp: (id, prop) => runtime.view(id).props[prop] ?? null,
  });
  const out: Record<string, { x: number; y: number; width: number; height: number; absX: number; absY: number; visible: boolean; windowId: string }> = {};
  for (const [id, box] of boxes) out[id] = box;
  return out;
}

export function dump(): string {
  return dumpRuntime(runtime, scene);
}
