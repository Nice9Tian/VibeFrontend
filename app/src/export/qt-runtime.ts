// 导出到 Qt 之后，嵌在 Qt 自带的 JS 引擎里运行的入口。
// 导出时把这个文件连同它引用的逻辑运行层打包成一个脚本，放进界面绑定层；
// 界面绑定层的 C++ 代码只调用这里导出的几个函数。所以网页预览和 Qt 程序运行的是同一份逻辑。
import type { Value } from "../expr.ts";
import {
  allMenuItems,
  computeSceneLayout,
  parentOfNode,
  type ComponentDecl,
  type ComputedBox,
  type Logic,
  type Scene,
} from "../model.ts";
import {
  SIDES,
  type Point,
  type Rect,
  type Side,
  autoSide,
  capInset,
  capShape,
  lineGeometry,
  parseBends,
  pathFromPoints,
  sampleSvgPath,
  shapeGeometry,
  shapeTextBox,
  shortenEnd,
  sideAnchor,
  sideDirection,
  svgPathMidpoint,
  type Endpoint,
  type LineGeometry,
} from "../shapes.ts";
import {
  nodeLocalToWorldInScene,
  rotatePoint,
  worldRotationInScene,
  worldToNodeLocalInScene,
} from "../transform.ts";
import { Runtime, type ActionSimMode, type NodeView } from "../runtime.ts";
import { effectiveDockLayout } from "../dock.ts";
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
    getDockLayout: (winId) => runtime.getDockLayout(winId),
  });
  const out: Record<string, { x: number; y: number; width: number; height: number; absX: number; absY: number; visible: boolean; windowId: string }> = {};
  for (const [id, box] of boxes) out[id] = box;
  return out;
}

export function dockLayout(): string {
  return JSON.stringify(runtime.getDockLayout(scene.root));
}

/** 当前窗口尺寸下应有的实际排列，check 用它和 Qt 实测比较。 */
export function effectiveDockLayoutAt(width: number, height: number): string {
  const boxes = computeLayout(width, height);
  return JSON.stringify(effectiveDockLayout(runtime.getDockLayout(scene.root), (id) => boxes[id]));
}

export function dockOp(op: string, argsJson: string): OutgoingEvent[] {
  let args: Record<string, Value> = {};
  if (argsJson) {
    try {
      args = JSON.parse(argsJson) as Record<string, Value>;
    } catch {
      // 忽略格式错误
    }
  }
  runtime.dockOp(op, args);
  return take();
}

export function dump(): string {
  return dumpRuntime(runtime, scene);
}

// ---------- 基础图形（Shape）与线条（Line）在 Qt 中的几何与绘制规格计算 ----------

const num = (value: Value | undefined, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const str = (value: Value | undefined, fallback = ""): string =>
  typeof value === "string" && value !== "" ? value : fallback;

function paintColor(value: Value | undefined, fallback: string): string {
  const color = str(value, fallback);
  return color === "none" || color === "transparent" ? "none" : color;
}

const outlineCache = new Map<string, Point[]>();

function parseAt(value: Value | undefined): Point | null {
  if (typeof value !== "string") return null;
  const [x, y] = value.split(",").map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

export function graphics(width: number, height: number): Record<string, Value> {
  let hasAny = false;
  for (const n of Object.values(scene.nodes)) {
    if (n.type === "Shape" || n.type === "Line") {
      hasAny = true;
      break;
    }
  }
  if (!hasAny) return {};

  const boxes: Map<string, ComputedBox> = computeSceneLayout(scene, {
    rootSize: { width, height },
    isVisible: (id) => runtime.view(id).visible,
    getProp: (id, prop) => runtime.view(id).props[prop] ?? null,
  });

  const absRect = (id: string): Rect => {
    const b = boxes.get(id);
    if (b) return { x: b.absX, y: b.absY, width: b.width, height: b.height };
    const n = scene.nodes[id];
    return { x: n?.x ?? 0, y: n?.y ?? 0, width: n?.width ?? 0, height: n?.height ?? 0 };
  };

  const sceneParentOrigin = (id: string): Point => {
    const pId = parentOfNode(scene, id);
    if (!pId) return { x: 0, y: 0 };
    const r = absRect(pId);
    return { x: r.x, y: r.y };
  };

  const qtParentOrigin = (id: string): Point => {
    const pId = parentOfNode(scene, id);
    if (!pId || pId === scene.root) return { x: 0, y: 0 };
    const pNode = scene.nodes[pId];
    if (!pNode || pNode.type === "Window" || pNode.type === "Dialog") return { x: 0, y: 0 };
    const r = absRect(pId);
    const hdr = pNode.type === "Dock" ? (pNode.headerHeight ?? 26) : 0;
    return { x: r.x, y: r.y + hdr };
  };

  const attachedTarget = (lineId: string, value: Value | undefined): string | null => {
    const target = typeof value === "string" ? value : "";
    const n = target ? scene.nodes[target] : undefined;
    return n && target !== lineId && n.type !== "Line" && target !== scene.root ? target : null;
  };

  const outlineOf = (id: string): Point[] => {
    const n = scene.nodes[id];
    if (!n) return [];
    const r = absRect(id);
    const props = runtime.view(id).props;
    const kind = str(props.shape, "rectangle");
    const isShape = n.type === "Shape" && kind !== "text";
    const stroke = props.stroke === "none" ? 0 : num(props.strokeWidth, 2);
    const key = isShape
      ? JSON.stringify([kind, r.width, r.height, stroke, props.radius, props.sides, props.points, props.ratio])
      : `box|${r.width}|${r.height}`;
    const cached = outlineCache.get(key);
    if (cached) return cached;
    let pts: Point[];
    if (isShape) {
      const d = shapeGeometry(kind, r.width, r.height, stroke, props).body;
      pts = sampleSvgPath(d);
    } else {
      pts = [
        { x: 0, y: 0 },
        { x: r.width, y: 0 },
        { x: r.width, y: r.height },
        { x: 0, y: r.height },
      ];
    }
    if (outlineCache.size > 500) outlineCache.clear();
    outlineCache.set(key, pts);
    return pts;
  };

  const worldOutlineOf = (id: string): Point[] =>
    outlineOf(id).map((pt) => nodeLocalToWorldInScene(scene, id, pt, boxes));

  const nearestOnOutline = (id: string, p: Point): { point: Point; distance: number } => {
    const r = absRect(id);
    const pts = worldOutlineOf(id);
    let best = { point: { x: r.x, y: r.y }, distance: Infinity };
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length2 = dx * dx + dy * dy;
      const t = length2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2)) : 0;
      const q = { x: a.x + dx * t, y: a.y + dy * t };
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < best.distance) best = { point: q, distance: d };
    }
    return best;
  };

  const outlineRayHit = (id: string, direction: Point): Point | null => {
    const r = absRect(id);
    const c = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    const pts = worldOutlineOf(id);
    let best: Point | null = null;
    let bestT = -1;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const denominator = direction.x * ey - direction.y * ex;
      if (Math.abs(denominator) < 1e-9) continue;
      const t = ((a.x - c.x) * ey - (a.y - c.y) * ex) / denominator;
      const u = ((a.x - c.x) * direction.y - (a.y - c.y) * direction.x) / denominator;
      if (t > 0 && u >= 0 && u <= 1 && t > bestT) {
        bestT = t;
        best = { x: c.x + direction.x * t, y: c.y + direction.y * t };
      }
    }
    return best;
  };

  const sideDirectionOf = (id: string, side: Side): Point => {
    const dir = sideDirection(side);
    const rot = worldRotationInScene(scene, id);
    return rot ? rotatePoint(dir, { x: 0, y: 0 }, rot) : dir;
  };

  const sideAnchorOf = (id: string, side: Side): Point => {
    const rotDir = sideDirectionOf(id, side);
    if (scene.nodes[id]?.type === "Shape") {
      const hit = outlineRayHit(id, rotDir);
      if (hit) return hit;
    }
    const r = absRect(id);
    const localAnchor = sideAnchor({ x: 0, y: 0, width: r.width, height: r.height }, side);
    return nodeLocalToWorldInScene(scene, id, localAnchor, boxes);
  };

  const resolveAttach = (id: string, sideValue: string, at: Point | null, other: Point): Endpoint => {
    const rect = absRect(id);
    const localRect = { x: 0, y: 0, width: rect.width, height: rect.height };
    if (sideValue === "outline" && at) {
      const guess = nodeLocalToWorldInScene(scene, id, { x: at.x * rect.width, y: at.y * rect.height }, boxes);
      const point = nearestOnOutline(id, guess).point;
      const localPt = worldToNodeLocalInScene(scene, id, point, boxes);
      const localSide = autoSide(localRect, localPt);
      return { point, direction: sideDirectionOf(id, localSide) };
    }
    const localOther = worldToNodeLocalInScene(scene, id, other, boxes);
    const side: Side = SIDES.includes(sideValue as Side) ? (sideValue as Side) : autoSide(localRect, localOther);
    return { point: sideAnchorOf(id, side), direction: sideDirectionOf(id, side) };
  };

  const lineEndpoints = (id: string, props: Record<string, Value>): { start: Endpoint; end: Endpoint } => {
    const origin = sceneParentOrigin(id);
    const raw = (which: "start" | "end"): Point =>
      which === "start"
        ? { x: origin.x + num(props.x1, 0), y: origin.y + num(props.y1, 0) }
        : { x: origin.x + num(props.x2, 160), y: origin.y + num(props.y2, 0) };
    const startTarget = attachedTarget(id, props.startNode);
    const endTarget = attachedTarget(id, props.endNode);
    const center = (target: string): Point => {
      const r = absRect(target);
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    };
    const startRef = startTarget ? center(startTarget) : raw("start");
    const endRef = endTarget ? center(endTarget) : raw("end");
    const resolve = (which: "start" | "end", target: string | null, other: Point): Endpoint => {
      if (!target) return { point: raw(which), direction: null };
      const sideValue = str(which === "start" ? props.startSide : props.endSide, "auto");
      return resolveAttach(target, sideValue, parseAt(which === "start" ? props.startAt : props.endAt), other);
    };
    return { start: resolve("start", startTarget, endRef), end: resolve("end", endTarget, startRef) };
  };

  const computeLineLayout = (id: string, props: Record<string, Value>): {
    start: Endpoint;
    end: Endpoint;
    geometry: LineGeometry;
    bbox: Rect;
  } => {
    const { start, end } = lineEndpoints(id, props);
    const origin = sceneParentOrigin(id);
    const bends = parseBends(props.bends).map((p) => ({ x: p.x + origin.x, y: p.y + origin.y }));
    const geometry = lineGeometry(props.route ?? "straight", start, end, bends);
    const xs = geometry.points.map((p) => p.x);
    const ys = geometry.points.map((p) => p.y);
    const margin = 10 + num(props.strokeWidth, 2) * 3 + (str(props.label, "") ? num(props.fontSize, 12) : 0);
    const x = Math.min(...xs) - margin;
    const y = Math.min(...ys) - margin;
    return {
      start,
      end,
      geometry,
      bbox: { x, y, width: Math.max(...xs) + margin - x, height: Math.max(...ys) + margin - y },
    };
  };

  const out: Record<string, Value> = {};
  for (const [id, n] of Object.entries(scene.nodes)) {
    if (n.type === "Shape") {
      const box = absRect(id);
      const pOrigin = qtParentOrigin(id);
      const bx = box.x - pOrigin.x;
      const by = box.y - pOrigin.y;
      const bw = Math.round(box.width);
      const bh = Math.round(box.height);
      const props = runtime.view(id).props;
      const kind = str(props.shape, "rectangle");
      const fill = paintColor(props.fill, "#ffffff");
      const stroke = paintColor(props.stroke, "#1f2430");
      const strokeWidth = stroke === "none" ? 0 : Math.max(0, num(props.strokeWidth, 2));
      const strokeStyle = str(props.strokeStyle, "solid");
      const opacity = Math.max(0, Math.min(1, num(props.opacity, 1)));
      const rot = typeof n.rotation === "number" ? n.rotation : 0;
      const rad = (rot * Math.PI) / 180;
      const cosA = Math.abs(Math.cos(rad));
      const sinA = Math.abs(Math.sin(rad));
      const cx = bx + bw / 2;
      const cy = by + bh / 2;
      const aabbW = rot !== 0 ? Math.ceil(bw * cosA + bh * sinA) + 4 : bw;
      const aabbH = rot !== 0 ? Math.ceil(bw * sinA + bh * cosA) + 4 : bh;
      const aabbX = rot !== 0 ? Math.round(cx - aabbW / 2) : Math.round(bx);
      const aabbY = rot !== 0 ? Math.round(cy - aabbH / 2) : Math.round(by);
      const geom = shapeGeometry(kind, bw, bh, strokeWidth, props);
      const tbox = shapeTextBox(kind, bw, bh);
      out[id] = {
        kind: "shape",
        x: aabbX,
        y: aabbY,
        width: aabbW,
        height: aabbH,
        logicalX: Math.round(bx),
        logicalY: Math.round(by),
        logicalWidth: bw,
        logicalHeight: bh,
        centerX: cx - aabbX,
        centerY: cy - aabbY,
        rotation: rot,
        opacity,
        body: geom.body,
        details: geom.details,
        fill,
        stroke,
        strokeWidth,
        strokeStyle,
        text: typeof props.text === "string" ? props.text : "",
        textX: tbox.x,
        textY: tbox.y,
        textWidth: tbox.width,
        textHeight: tbox.height,
        textColor: str(props.textColor, "#1f2430"),
        fontSize: num(props.fontSize, 14),
        fontWeight: str(props.fontWeight, "normal"),
        textAlign: str(props.textAlign, "center"),
      };
    } else if (n.type === "Line") {
      const props = runtime.view(id).props;
      const layout = computeLineLayout(id, props);
      const pOrigin = qtParentOrigin(id);
      const left = Math.floor(layout.bbox.x);
      const top = Math.floor(layout.bbox.y);
      const w = Math.ceil(layout.bbox.x + layout.bbox.width) - left;
      const h = Math.ceil(layout.bbox.y + layout.bbox.height) - top;
      const stroke = paintColor(props.stroke, "#1f2430");
      const strokeWidth = Math.max(0.5, num(props.strokeWidth, 2));
      const strokeStyle = str(props.strokeStyle, "solid");
      const opacity = Math.max(0, Math.min(1, num(props.opacity, 1)));
      const route = props.route ?? "straight";
      let pts = layout.geometry.points;
      pts = shortenEnd(pts, true, capInset(props.startCap, strokeWidth));
      pts = shortenEnd(pts, false, capInset(props.endCap, strokeWidth));
      const mainPath = pathFromPoints(route, pts);
      const first = layout.geometry.points[0];
      const last = layout.geometry.points[layout.geometry.points.length - 1];
      const sCap = capShape(props.startCap ?? "none", first, layout.geometry.startAngle, strokeWidth);
      const eCap = capShape(props.endCap ?? "none", last, layout.geometry.endAngle, strokeWidth);
      const label = typeof props.label === "string" ? props.label : "";
      const fallbackMid = { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 };
      const mid = label ? svgPathMidpoint(mainPath, fallbackMid) : fallbackMid;
      out[id] = {
        kind: "line",
        x: left - pOrigin.x,
        y: top - pOrigin.y,
        width: w,
        height: h,
        logicalX: left - pOrigin.x,
        logicalY: top - pOrigin.y,
        logicalWidth: w,
        logicalHeight: h,
        originX: left,
        originY: top,
        opacity,
        mainPath,
        hitPath: layout.geometry.path,
        stroke,
        strokeWidth,
        strokeStyle,
        startCapPath: sCap ? sCap.path : "",
        startCapFilled: sCap ? sCap.filled : false,
        endCapPath: eCap ? eCap.path : "",
        endCapFilled: eCap ? eCap.filled : false,
        label,
        labelX: mid.x - left,
        labelY: mid.y - top,
        textColor: str(props.textColor, "#1f2430"),
        fontSize: num(props.fontSize, 12),
      };
    }
  }
  return out;
}
