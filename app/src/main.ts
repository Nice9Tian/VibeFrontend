// 编辑器界面：素材栏、图层、设计窗口（编辑模式 / 预览模式）、文档与 YAML 页签、问题栏。
import { isMap, parseDocument, type Document } from "yaml";
import { listDir, readText, watchProject, writeText } from "./fs";
import { initDocView, syncDocView, syncPreviewSelectionToTextarea } from "./docview";
import { initLibrary, renderLibraryPalette } from "./library";
import { initPreviewLauncher, initStandalonePreviewWindow, syncStandalonePreviewTitle } from "./previewwindow";
import {
  allWindowIds,
  appendSection,
  BUILTIN_TYPES,
  childrenOfNode,
  computeSceneLayout,
  CONTAINER_DECL,
  declFor,
  EXTERNAL_DECL,
  getSection,
  isPartitionedWindow,
  LAYOUT_TYPE_KINDS,
  loadProject,
  LOGIC_PATH,
  MOUSE_EVENTS,
  parentOfNode,
  parseDocRef,
  remapNodeChildren,
  removeNodeReferences,
  renameNodeReferences,
  replaceSection,
  SCENE_PATH,
  sectionNameFor,
  sectionOffsets,
  STANDARD_COMPONENTS,
  type ComponentInstance,
  type Project,
  type SceneNode,
} from "./project";
import {
  componentReference,
  controlReference,
  docSectionRange,
  fileReference,
  lineAt,
  linesReference,
  logicEntryRange,
  logicPathAt,
  problemReference,
  projectReference,
  selectionRange,
} from "./refs";
import { Runtime, type LogEntry } from "./runtime";
import { layoutLine, paintLine, paintShape, presetIcon, type LineLayout } from "./paint";
import {
  autoSide,
  CAPS,
  COLOR_STYLES,
  dragElbowSegment,
  formatBends,
  parseBends,
  FONT_SIZES,
  LINE_STYLE_KEYS,
  presetById,
  ROUTES,
  SHAPE_KINDS,
  SHAPE_PRESETS,
  SHAPE_STYLE_KEYS,
  shapeGeometry,
  shapeKind,
  sideAnchor,
  sideDirection,
  SIDES,
  STROKE_STYLES,
  STROKE_WIDTHS,
  type Endpoint,
  type Point,
  type Rect,
  type ShapePreset,
  type Side,
} from "./shapes";
import { snapMove, snapPoint, snapResize, type Guide, type SnapOptions } from "./snap";
import { onZoomChange, viewZoom } from "./viewport";
import { PRESETS_PATH } from "./loader";
import type { Value } from "./expr";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let project: Project;
let mode: "edit" | "preview" = "edit";
let selectedId: string | null = null;
/**
 * 多选时选中的全部节点。selectedId 是其中“主要”的那一个（最后点的），右侧面板显示它。
 * 别处直接给 selectedId 赋值（新建、复制之后）时，这里会把选择收成只有它一个。
 */
let selectedIds: string[] = [];
/** 编辑模式用：只用来算出初始状态下各控件的样子 */
let designRuntime: Runtime;
/** 预览模式用：第一次进入预览时创建，之后一直保留状态 */
let previewRuntime: Runtime | null = null;

interface Mounted {
  wrapper: HTMLElement;
  body: HTMLElement;
  instance?: ComponentInstance;
  /** 预览模式下当前是不是显示着；undefined 表示还没有摆过 */
  shown?: boolean;
  /** 每次显示或隐藏加一，用来丢弃被打断的过渡 */
  generation: number;
  /** 形状和线条：用来判断鼠标是不是点在图形上的那条路径 */
  hit?: SVGGeometryElement;
}
const mounted = new Map<string, Mounted>();
const log: LogEntry[] = [];
/** 工具改写 YAML 时不自动折行，避免把长表达式拆成两行 */
const YAML_OUTPUT = { lineWidth: 0 };

// ---------- 小工具 ----------

let toastTimer: number | undefined;
function toast(message: string): void {
  const el = $("toast");
  el.textContent = message;
  el.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), 2200);
}

function node(id: string): SceneNode | undefined {
  return project.scene.nodes[id];
}

function childrenOf(n: SceneNode | undefined): string[] {
  return childrenOfNode(n);
}

function parentOf(id: string): string | null {
  return parentOfNode(project.scene, id);
}

/** 节点相对于设计窗口左上角的位置。根窗口在 (0, 0)。 */
function windowRootOf(id: string): string {
  let cursor: string | null = id;
  while (cursor) {
    const p = parentOf(cursor);
    if (!p) return cursor;
    cursor = p;
  }
  return project.scene.root;
}

function isDialogShownInStage(winId: string): boolean {
  const runtime = activeRuntime();
  const effectiveVis = runtime.view(winId).visible;
  if (mode === "preview") return effectiveVis;
  if (effectiveVis) return true;
  if (selectedId && windowRootOf(selectedId) === winId) return true;
  return selectedIds.some((id) => windowRootOf(id) === winId);
}

function absRect(id: string): { x: number; y: number; width: number; height: number } {
  const runtime = activeRuntime();
  const boxes = computeSceneLayout(project.scene, {
    isVisible: (nid) => runtime.view(nid).visible,
    getProp: (nid, prop) => runtime.view(nid).props[prop] ?? null,
  });
  const box = boxes.get(id);
  if (box) {
    const winId = windowRootOf(id);
    if (winId !== project.scene.root) {
      const winBox = boxes.get(winId);
      const rootNode = node(project.scene.root);
      const dx = rootNode && winBox ? Math.round((rootNode.width - winBox.width) / 2) : 0;
      const dy = rootNode && winBox ? Math.round((rootNode.height - winBox.height) / 2) : 0;
      return { x: box.absX + dx, y: box.absY + dy, width: box.width, height: box.height };
    }
    return { x: box.absX, y: box.absY, width: box.width, height: box.height };
  }
  const n = node(id)!;
  let x = 0;
  let y = 0;
  for (let cursor: string | null = id; cursor && cursor !== project.scene.root; cursor = parentOf(cursor)) {
    x += node(cursor)?.x ?? 0;
    y += node(cursor)?.y ?? 0;
  }
  return { x, y, width: n.width, height: n.height };
}

function hitTest(px: number, py: number): string | null {
  const runtime = activeRuntime();
  const visit = (id: string): string | null => {
    const n = node(id);
    if (!n) return null;
    if (mode === "preview" && !runtime.view(id).visible) return null;
    const children = childrenOf(n);
    for (let i = children.length - 1; i >= 0; i--) {
      const hit = visit(children[i]);
      if (hit) return hit;
    }
    if (id === project.scene.root) return null;
    return containsPoint(id, px, py) ? id : null;
  };
  const winIds = allWindowIds(project.scene);
  for (let i = winIds.length - 1; i >= 0; i--) {
    const winId = winIds[i];
    if (winId !== project.scene.root && !isDialogShownInStage(winId)) continue;
    const hit = visit(winId);
    if (hit) return hit;
  }
  return null;
}

function canHoldChildren(id: string): boolean {
  const n = node(id);
  return n ? n.type === "Window" || declFor(project, n.type)?.children === true : false;
}

// ---------- 写文件 ----------

// 画布操作的撤销和重做：每次写 scene.json 之前，把写之前的原文记下来
const undoStack: string[] = [];
const redoStack: string[] = [];
const HISTORY_LIMIT = 200;

async function saveScene(options: { history?: boolean } = {}): Promise<void> {
  normalizeLines();
  const text = JSON.stringify(project.scene, null, 2) + "\n";
  if (text === project.sceneText) return;
  if (options.history !== false) {
    undoStack.push(project.sceneText);
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;
  }
  await writeText(SCENE_PATH, text);
  await reload();
}

async function undo(): Promise<void> {
  const previous = undoStack.pop();
  if (previous === undefined) return toast("没有可以撤销的画布操作");
  redoStack.push(project.sceneText);
  await writeText(SCENE_PATH, previous);
  await reload();
}

async function redo(): Promise<void> {
  const next = redoStack.pop();
  if (next === undefined) return toast("没有可以重做的画布操作");
  undoStack.push(project.sceneText);
  await writeText(SCENE_PATH, next);
  await reload();
}

/** 用保留注释和格式的方式修改 YAML。 */
async function editLogic(mutate: (doc: Document) => void): Promise<boolean> {
  const doc = parseDocument(project.logicText);
  if (doc.errors.length > 0) {
    toast("YAML 有语法错误，请先在 YAML 页签中修正");
    return false;
  }
  mutate(doc);
  yamlDirty = false;
  await writeText(LOGIC_PATH, doc.toString(YAML_OUTPUT));
  await reload();
  return true;
}

function ensureObject(doc: Document, id: string): void {
  if (!isMap(doc.getIn(["objects", id]))) doc.setIn(["objects", id], doc.createNode({}));
}

let loading = false;
let reloadAgain = false;
async function reload(): Promise<void> {
  if (loading) {
    reloadAgain = true;
    return;
  }
  loading = true;
  try {
    do {
      reloadAgain = false;
      const next = await loadProject(project);
      if (next.signature === project.signature) continue;
      project = next;
      designRuntime = new Runtime(project);
      previewRuntime?.adopt(project);
      if (selectedId && !node(selectedId)) selectedId = null;
      renderAll();
    } while (reloadAgain);
  } catch (e) {
    toast(`加载项目失败：${(e as Error).message}`);
  } finally {
    loading = false;
  }
}

// ---------- 设计窗口 ----------

function activeRuntime(): Runtime {
  return mode === "preview" && previewRuntime ? previewRuntime : designRuntime;
}

function showNodeError(body: HTMLElement, message: string): void {
  body.innerHTML = "";
  const box = document.createElement("div");
  box.className = "vf-error";
  box.textContent = message;
  body.append(box);
}

function buildNode(id: string, parentEl: HTMLElement): void {
  const n = node(id);
  if (!n) return;
  const wrapper = document.createElement("div");
  wrapper.className = "vf-node";
  wrapper.dataset.vfId = id;
  wrapper.dataset.vfType = n.type;
  Object.assign(wrapper.style, {
    left: `${n.x ?? 0}px`,
    top: `${n.y ?? 0}px`,
    width: `${n.width}px`,
    height: `${n.height}px`,
  });
  const body = document.createElement("div");
  body.className = "vf-body";
  wrapper.append(body);
  parentEl.append(wrapper);
  const entry: Mounted = { wrapper, body, generation: 0 };
  mounted.set(id, entry);

  if (n.type === "Dock") {
    const header = document.createElement("div");
    header.className = "vf-dock-header";
    header.style.cssText = `height:${n.headerHeight ?? 26}px;display:flex;align-items:center;padding:0 10px;font-size:12px;font-weight:600;background:#182030;color:#cbd5e1;border-bottom:1px solid #2b3548;box-sizing:border-box;user-select:none;`;
    header.textContent = String(activeRuntime().view(id).props.title ?? n.title ?? id);
    wrapper.prepend(header);
    wrapper.style.background = "#111726";
    wrapper.style.boxShadow = "inset 0 0 0 1px #263042";
    wrapper.style.boxSizing = "border-box";
  } else if (n.type === "Dialog") {
    wrapper.style.background = "#151c2c";
    wrapper.style.borderRadius = "8px";
    wrapper.style.boxShadow = "inset 0 0 0 1px #334155, 0 20px 50px rgba(0,0,0,0.6)";
    wrapper.style.zIndex = "50";
  } else if (n.type === "Container" || n.type in LAYOUT_TYPE_KINDS) {
    // 未转换的容器或布局容器：没有子节点时显示自己的 ID，作为占位
    if (!childrenOf(n).length) body.textContent = id;
  } else if (n.type === "External") {
    // 外部容器：工具里只是占位，导出后由业务把自己的控件放进来
    body.textContent = `外部容器 ${id}\n导出后由业务放入控件`;
  } else if (n.type === "Shape" || n.type === "Line") {
    paintGraphic(id, entry, activeRuntime().view(id).props);
  } else {
    const component = project.components.get(n.type) ?? STANDARD_COMPONENTS.get(n.type);
    if (!component?.create) {
      showNodeError(body, component?.error ?? `找不到控件 ${n.type}`);
    } else {
      try {
        entry.instance = component.create(body, {
          props: activeRuntime().view(id).props,
          emit: (event, value) => {
            if (mode === "preview") previewRuntime?.dispatch(id, event, value);
          },
          mode: mode === "preview" ? "preview" : "design",
        });
      } catch (e) {
        showNodeError(body, `${n.type} 运行出错：${(e as Error).message}`);
      }
    }
  }

  // 每个节点都自动获得基础鼠标事件，不需要控件自己声明
  for (const name of MOUSE_EVENTS) {
    wrapper.addEventListener(name, (e) => {
      if (mode !== "preview" || !previewRuntime) return;
      const bubbles = name !== "mouseenter" && name !== "mouseleave";
      // 会冒泡的事件只交给最里面的那个节点，避免点按钮时外层容器也收到点击
      if (bubbles && (e.target as Element).closest(".vf-node") !== wrapper) return;
      // 按住 Alt 点击是“选中这个控件”，不交给逻辑；移入移出照常处理，免得悬停状态对不上
      if (bubbles && (e as MouseEvent).altKey) {
        if (name === "click") {
          select(id);
          showRightTab("doc");
        }
        return;
      }
      previewRuntime.dispatch(id, name);
    });
  }

  for (const child of childrenOf(n)) buildNode(child, wrapper);
}

/**
 * 预览模式下显示或隐藏一个节点。节点的 visible 指定了效果时播放它：
 * 显示是先显示再播放，隐藏是播放完再隐藏；中途又变了，旧的那次作废。
 */
function setShown(id: string, entry: Mounted, shown: boolean): void {
  if (entry.shown === shown) return;
  const first = entry.shown === undefined;
  entry.shown = shown;
  const generation = ++entry.generation;
  const effectName = project.logic.objects?.[id]?.effects?.visible;
  const play = effectName ? project.effects.get(effectName)?.play : undefined;
  const finish = () => {
    if (entry.generation === generation) entry.wrapper.style.display = shown ? "" : "none";
  };
  // 刚摆出来时直接到位，不播放
  if (first || !play) return finish();
  entry.wrapper.style.display = "";
  try {
    const result = play(entry.wrapper, { showing: shown });
    const done = result && "finished" in result ? result.finished : result;
    Promise.resolve(done).then(finish, finish);
  } catch (e) {
    toast(`效果 ${effectName} 运行出错：${(e as Error).message}`);
    finish();
  }
}

/** 按当前运行层的计算结果更新每个节点的可见性和属性。 */
function applyViews(): void {
  const runtime = activeRuntime();
  const boxes = computeSceneLayout(project.scene, {
    isVisible: (nid) => runtime.view(nid).visible,
    getProp: (nid, prop) => runtime.view(nid).props[prop] ?? null,
  });
  const rootNode = node(project.scene.root);
  for (const [id, entry] of mounted) {
    const view = runtime.view(id);
    const n = node(id);
    const box = boxes.get(id);
    if (box && n?.type !== "Line") {
      if (n?.type === "Dialog" && id !== project.scene.root && rootNode) {
        const dx = Math.round((rootNode.width - box.width) / 2);
        const dy = Math.round((rootNode.height - box.height) / 2);
        Object.assign(entry.wrapper.style, {
          left: `${dx}px`,
          top: `${dy}px`,
          width: `${box.width}px`,
          height: `${box.height}px`,
        });
      } else {
        Object.assign(entry.wrapper.style, {
          left: `${box.x}px`,
          top: `${box.y}px`,
          width: `${box.width}px`,
          height: `${box.height}px`,
        });
      }
    }
    const effectiveVis = box ? box.visible : view.visible;
    if (mode === "preview") {
      setShown(id, entry, effectiveVis);
      entry.wrapper.classList.remove("vf-ghost");
    } else {
      entry.wrapper.style.display = n?.type === "Dialog" && !isDialogShownInStage(id) ? "none" : "";
      entry.wrapper.classList.toggle("vf-ghost", !effectiveVis);
    }
    entry.wrapper.toggleAttribute("data-vf-disabled", !view.enabled);
    const type = n?.type;
    if (type === "Dock") {
      const header = entry.wrapper.querySelector(".vf-dock-header");
      if (header) header.textContent = String(view.props.title ?? n?.title ?? id);
    }
    if (type === "Shape" || type === "Line") {
      paintGraphic(id, entry, view.props);
      continue;
    }
    try {
      entry.instance?.update(view.props);
    } catch (e) {
      entry.instance = undefined;
      showNodeError(entry.body, `运行出错：${(e as Error).message}`);
    }
  }
}

function renderStage(): void {
  for (const entry of mounted.values()) {
    try {
      entry.instance?.destroy();
    } catch {
      // 控件的清理出错不影响重建
    }
  }
  mounted.clear();

  const root = node(project.scene.root);
  const stage = $("stage");
  stage.innerHTML = "";
  if (!root) return;
  stage.style.width = `${root.width}px`;
  stage.style.height = `${root.height}px`;
  $("stage-title").textContent = (root.title ?? project.scene.root) + (mode === "preview" ? "　·　预览中" : "");
  $("window-size").textContent = `窗口 ${root.width}×${root.height}`;

  if (root.menuBar) {
    const bar = document.createElement("div");
    const mh = root.menuBar.height ?? 28;
    bar.style.cssText = `position:absolute;left:0;top:0;width:100%;height:${mh}px;display:flex;align-items:center;gap:4px;padding:0 8px;background:#111827;border-bottom:1px solid #263042;box-sizing:border-box;z-index:20;font-size:12px;color:#e2e8f0;`;
    for (const menu of root.menuBar.menus ?? []) {
      const group = document.createElement("div");
      group.style.cssText = "display:flex;align-items:center;gap:2px;margin-right:8px;";
      const titleSpan = document.createElement("span");
      titleSpan.style.cssText = "font-weight:600;color:#94a3b8;padding:0 4px;";
      titleSpan.textContent = menu.title;
      group.append(titleSpan);
      for (const item of menu.items ?? []) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.dataset.vfMenuItem = item.id;
        btn.style.cssText = "background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;";
        btn.textContent = item.text;
        btn.addEventListener("click", () => {
          if (mode === "preview" && previewRuntime) {
            previewRuntime.dispatch(item.id, "mousedown");
            previewRuntime.dispatch(item.id, "mouseup");
            previewRuntime.dispatch(item.id, "click");
            previewRuntime.dispatch(null, "window.click");
          }
        });
        group.append(btn);
      }
      bar.append(group);
    }
    stage.append(bar);
  }

  for (const child of childrenOf(root)) buildNode(child, stage);
  for (const winId of allWindowIds(project.scene)) {
    if (winId !== project.scene.root) buildNode(winId, stage);
  }
  applyViews();
  if (mode === "edit") {
    stage.append(overlay);
    updateSelectionBox();
  }
}

// ---------- 图形和线条 ----------

const SVG_NS = "http://www.w3.org/2000/svg";
const num = (value: Value | undefined, fallback: number): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const str = (value: Value | undefined, fallback = ""): string => (typeof value === "string" ? value : fallback);

function isGraphic(id: string | null): boolean {
  const type = id ? node(id)?.type : undefined;
  return type === "Shape" || type === "Line";
}

/** 节点的父节点在设计窗口里的左上角。 */
function parentOrigin(id: string): Point {
  const parentId = parentOf(id);
  if (!parentId) return { x: 0, y: 0 };
  const r = absRect(parentId);
  return { x: r.x, y: r.y };
}

/** 线挂着的节点：存在、不是线、不是它自己，才算挂着。 */
function attachedTarget(lineId: string, value: Value | undefined): string | null {
  const target = str(value);
  const n = target ? node(target) : undefined;
  return n && target !== lineId && n.type !== "Line" && target !== project.scene.root ? target : null;
}

// ---- 节点的真实外轮廓：线头挂在形状上时按它算，不按方框 ----

// 量路径用的隐藏 SVG：形状的轮廓是 SVG 路径（有圆弧、曲线），用浏览器量出路径上的点
const measureSvg = document.createElementNS(SVG_NS, "svg");
measureSvg.setAttribute("style", "position:absolute;left:-9999px;top:-9999px;width:0;height:0;visibility:hidden");
const measurePath = document.createElementNS(SVG_NS, "path");
measureSvg.append(measurePath);
document.body.append(measureSvg);
const outlineCache = new Map<string, Point[]>();

/** 节点外轮廓上的一圈点，相对于节点左上角。形状按真实轮廓（描边的中线），其余按方框。 */
function outlineOf(id: string): Point[] {
  const n = node(id);
  if (!n) return [];
  const props = activeRuntime().view(id).props;
  const kind = str(props.shape, "rectangle");
  const isShape = n.type === "Shape" && kind !== "text";
  const stroke = props.stroke === "none" ? 0 : num(props.strokeWidth, 2);
  const key = isShape
    ? JSON.stringify([kind, n.width, n.height, stroke, props.radius, props.sides, props.points, props.ratio])
    : `box|${n.width}|${n.height}`;
  const cached = outlineCache.get(key);
  if (cached) return cached;
  let points: Point[];
  if (isShape) {
    measurePath.setAttribute("d", shapeGeometry(kind, n.width, n.height, stroke, props).body);
    const total = measurePath.getTotalLength();
    const count = Math.max(32, Math.min(800, Math.round(total / 2)));
    points = [];
    for (let i = 0; i < count; i++) {
      const p = measurePath.getPointAtLength((total * i) / count);
      points.push({ x: p.x, y: p.y });
    }
  } else {
    points = [{ x: 0, y: 0 }, { x: n.width, y: 0 }, { x: n.width, y: n.height }, { x: 0, y: n.height }];
  }
  if (outlineCache.size > 500) outlineCache.clear();
  outlineCache.set(key, points);
  return points;
}

/** 外轮廓上离 p 最近的点（设计窗口里的绝对坐标）。 */
function nearestOnOutline(id: string, p: Point): { point: Point; distance: number } {
  const r = absRect(id);
  const pts = outlineOf(id);
  let best = { point: { x: r.x, y: r.y }, distance: Infinity };
  for (let i = 0; i < pts.length; i++) {
    const a = { x: r.x + pts[i].x, y: r.y + pts[i].y };
    const b = { x: r.x + pts[(i + 1) % pts.length].x, y: r.y + pts[(i + 1) % pts.length].y };
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length2 = dx * dx + dy * dy;
    const t = length2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2)) : 0;
    const q = { x: a.x + dx * t, y: a.y + dy * t };
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < best.distance) best = { point: q, distance: d };
  }
  return best;
}

/** 从节点中心朝 direction 射出去，和外轮廓最远的那个交点。用来放形状四条“边”的中点：三角形的左边中点在斜边上，不在方框上。 */
function outlineRayHit(id: string, direction: Point): Point | null {
  const r = absRect(id);
  const c = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  const pts = outlineOf(id);
  let best: Point | null = null;
  let bestT = -1;
  for (let i = 0; i < pts.length; i++) {
    const a = { x: r.x + pts[i].x, y: r.y + pts[i].y };
    const b = { x: r.x + pts[(i + 1) % pts.length].x, y: r.y + pts[(i + 1) % pts.length].y };
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
}

/** 节点某一边的“中点”：形状按真实轮廓，其余按方框。 */
function sideAnchorOf(id: string, side: Side): Point {
  if (node(id)?.type === "Shape") {
    const hit = outlineRayHit(id, sideDirection(side));
    if (hit) return hit;
  }
  return sideAnchor(absRect(id), side);
}

/** "0.250,1.000" → 相对于节点方框的位置（0 到 1）。 */
function parseAt(value: Value | undefined): Point | null {
  if (typeof value !== "string") return null;
  const [x, y] = value.split(",").map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/**
 * 线的一头挂在节点上时，它在哪里、朝哪个方向出去。
 * side 为 outline 时挂在外轮廓的某一点（at 记着它在方框里的相对位置，节点缩放后跟着走，再贴回轮廓上）；
 * 为 top、right、bottom、left 时挂在那一边的中点；为 auto 时朝着另一头自动选边。
 */
function resolveAttach(id: string, sideValue: string, at: Point | null, other: Point): Endpoint {
  const rect = absRect(id);
  if (sideValue === "outline" && at) {
    const guess = { x: rect.x + at.x * rect.width, y: rect.y + at.y * rect.height };
    const point = nearestOnOutline(id, guess).point;
    return { point, direction: sideDirection(autoSide(rect, point)) };
  }
  const side: Side = SIDES.includes(sideValue as Side) ? (sideValue as Side) : autoSide(rect, other);
  return { point: sideAnchorOf(id, side), direction: sideDirection(side) };
}

/** 一条线两端现在在哪里（设计窗口的绝对坐标）。挂着节点的一头跟着节点走。 */
function lineEndpoints(id: string, props: Record<string, Value>): { start: Endpoint; end: Endpoint } {
  const origin = parentOrigin(id);
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
}

function lineLayoutOf(id: string, props: Record<string, Value>): LineLayout {
  const { start, end } = lineEndpoints(id, props);
  // 折线手动调整过的拐点存的是相对于父节点的坐标
  const origin = parentOrigin(id);
  const bends = props.route === "elbow" ? parseBends(props.bends).map((p) => ({ x: p.x + origin.x, y: p.y + origin.y })) : [];
  return layoutLine(start, end, props, bends);
}

/** 平移一条线：没挂着的端点和手动调整过的拐点一起挪；挂着的端点跟着它挂的节点，不动。 */
function offsetLineProps(lineId: string, props: Record<string, Value>, dx: number, dy: number): Record<string, Value> {
  const next = { ...props };
  if (!attachedTarget(lineId, props.startNode)) {
    next.x1 = num(props.x1, 0) + dx;
    next.y1 = num(props.y1, 0) + dy;
  }
  if (!attachedTarget(lineId, props.endNode)) {
    next.x2 = num(props.x2, 160) + dx;
    next.y2 = num(props.y2, 0) + dy;
  }
  const bends = parseBends(props.bends);
  if (bends.length > 0) next.bends = formatBends(bends.map((p) => ({ x: p.x + dx, y: p.y + dy })));
  return next;
}

/** 把线的外框写回节点（相对于父节点），取整，返回外框左上角的绝对坐标。 */
function placeLine(id: string, layout: LineLayout): Point {
  const n = node(id)!;
  const origin = parentOrigin(id);
  const left = Math.floor(layout.bbox.x);
  const top = Math.floor(layout.bbox.y);
  n.x = left - origin.x;
  n.y = top - origin.y;
  n.width = Math.ceil(layout.bbox.x + layout.bbox.width) - left;
  n.height = Math.ceil(layout.bbox.y + layout.bbox.height) - top;
  return { x: left, y: top };
}

/** 画形状或线条。线条每次都按它挂着的节点重新算位置。 */
function paintGraphic(id: string, entry: Mounted, props: Record<string, Value>): void {
  const n = node(id);
  if (!n) return;
  if (n.type === "Shape") {
    entry.hit = paintShape(entry.body, n.width, n.height, props);
  } else {
    const layout = lineLayoutOf(id, props);
    const origin = placeLine(id, layout);
    Object.assign(entry.wrapper.style, { left: `${n.x}px`, top: `${n.y}px`, width: `${n.width}px`, height: `${n.height}px` });
    entry.hit = paintLine(entry.body, layout, origin, props);
  }
  entry.wrapper.style.opacity = String(Math.max(0, Math.min(1, num(props.opacity, 1))));
}

/** 重画所有线条：拖动、缩放节点时，挂在它上面的线跟着走。 */
function refreshLines(): void {
  const runtime = activeRuntime();
  for (const [id, entry] of mounted) {
    if (node(id)?.type === "Line") paintGraphic(id, entry, runtime.view(id).props);
  }
}

/** 写文件之前：线条的外框按当前位置重算，挂着节点的一头把位置记下来（被挂的节点删掉后，线停在这里）。 */
function normalizeLines(): void {
  for (const [id, n] of Object.entries(project.scene.nodes)) {
    if (n.type !== "Line") continue;
    const props = designRuntime.view(id).props;
    const layout = lineLayoutOf(id, props);
    placeLine(id, layout);
    const origin = parentOrigin(id);
    n.props = { ...n.props };
    if (attachedTarget(id, n.props.startNode)) {
      n.props.x1 = Math.round(layout.start.point.x - origin.x);
      n.props.y1 = Math.round(layout.start.point.y - origin.y);
    }
    if (attachedTarget(id, n.props.endNode)) {
      n.props.x2 = Math.round(layout.end.point.x - origin.x);
      n.props.y2 = Math.round(layout.end.point.y - origin.y);
    }
  }
}

/** 一个点在不在节点上。形状和线条按图形本身判断，别的按方框。 */
function containsPoint(id: string, px: number, py: number): boolean {
  const n = node(id);
  const entry = mounted.get(id);
  if (n && entry?.hit && (n.type === "Shape" || n.type === "Line")) {
    if (n.type === "Line") return entry.hit.isPointInStroke(new DOMPoint(px, py));
    const r = absRect(id);
    const local = new DOMPoint(px - r.x, py - r.y);
    return entry.hit.isPointInFill(local) || entry.hit.isPointInStroke(local);
  }
  const r = absRect(id);
  return px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height;
}

// ---------- 工具、吸附和样式的设置 ----------

/** 当前的工具：选择；画一个图形或线条（预设）；画一个容器、外部容器或控件（节点类型）。 */
type Tool = { kind: "select" } | { kind: "preset"; preset: ShapePreset } | { kind: "node"; type: string };
let tool: Tool = { kind: "select" };

function loadSetting<T>(key: string, fallback: T): T {
  try {
    const text = localStorage.getItem(key);
    return text ? ({ ...fallback, ...JSON.parse(text) } as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveSetting(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存不下也不影响使用，只是下次打开要重新设置
  }
}

const snapSettings = loadSetting("vf.snap", { objects: true, grid: 0 });
/** 上次用过的样式：新画的图形沿用它，和 FigJam 一样 */
let lastShapeStyle = loadSetting<Record<string, Value>>("vf.lastShapeStyle", {});
let lastLineStyle = loadSetting<Record<string, Value>>("vf.lastLineStyle", {});

/** 按住 Ctrl 时临时关掉吸附，和 Figma 一样。 */
function snapOptions(e: { ctrlKey: boolean; metaKey: boolean }): SnapOptions {
  const off = e.ctrlKey || e.metaKey;
  return { threshold: 6, objects: snapSettings.objects && !off, grid: off ? 0 : snapSettings.grid };
}

/** 吸附时参考的方框：除了正在动的这些（和它们里面的东西）以外的全部节点，以及窗口本身。线条不算。 */
function snapTargets(exclude: string | string[] | null): Rect[] {
  const excluded = new Set<string>();
  const collect = (id: string) => {
    excluded.add(id);
    for (const child of childrenOf(node(id))) collect(child);
  };
  for (const id of exclude === null ? [] : typeof exclude === "string" ? [exclude] : exclude) collect(id);
  const rects: Rect[] = [];
  for (const [id, n] of Object.entries(project.scene.nodes)) {
    if (excluded.has(id) || n.type === "Line") continue;
    rects.push(id === project.scene.root ? { x: 0, y: 0, width: n.width, height: n.height } : absRect(id));
  }
  return rects;
}

function setTool(next: Tool): void {
  if (mode !== "edit") setMode("edit");
  tool = next;
  overlay.classList.toggle("drawing", tool.kind !== "select");
  renderToolbar();
}

// ---------- 编辑层 ----------

const overlay = document.createElement("div");
overlay.id = "overlay";
const selectionBox = document.createElement("div");
selectionBox.id = "selection";
const selectionTag = document.createElement("div");
selectionTag.className = "tag";
const sizeLabel = document.createElement("div");
sizeLabel.className = "size";
selectionBox.append(selectionTag, sizeLabel);
const HANDLES: Record<string, [number, number]> = {
  nw: [0, 0], n: [50, 0], ne: [100, 0], e: [100, 50],
  se: [100, 100], s: [50, 100], sw: [0, 100], w: [0, 50],
};
for (const [name, [left, top]] of Object.entries(HANDLES)) {
  const handle = document.createElement("div");
  handle.className = "handle";
  handle.dataset.handle = name;
  handle.style.left = `${left}%`;
  handle.style.top = `${top}%`;
  handle.style.cursor = `${name}-resize`;
  selectionBox.append(handle);
}
// 线条选中时，两端各有一个可以拖动的圆点
const endpointHandles = (["start", "end"] as const).map((which) => {
  const handle = document.createElement("div");
  handle.className = "endpoint";
  handle.dataset.endpoint = which;
  return handle;
});
// 吸附参考线、挂接提示、正在画的图形
const guidesLayer = document.createElementNS(SVG_NS, "svg");
guidesLayer.id = "guides";
const ghost = document.createElement("div");
ghost.id = "draw-ghost";
// 框选时拉出来的方框
const marqueeBox = document.createElement("div");
marqueeBox.id = "marquee";
// 多选时每个选中的东西各有一个细框
const outlines = document.createElement("div");
outlines.id = "multi-outlines";
// 折线每一段中间的小把手，拖动它调整这一段的位置
const bendHandles = document.createElement("div");
bendHandles.id = "bend-handles";
overlay.append(ghost, guidesLayer, outlines, selectionBox, bendHandles, ...endpointHandles, marqueeBox);

/** 多选时的外框：所有选中的东西合起来的方框。 */
function unionRect(ids: string[]): Rect | null {
  let box: Rect | null = null;
  for (const id of ids) {
    const r = absRect(id);
    if (!box) box = { ...r };
    else {
      const right = Math.max(box.x + box.width, r.x + r.width);
      const bottom = Math.max(box.y + box.height, r.y + r.height);
      box.x = Math.min(box.x, r.x);
      box.y = Math.min(box.y, r.y);
      box.width = right - box.x;
      box.height = bottom - box.y;
    }
  }
  return box;
}

/** 选中的那条折线：每一段中间放一个小把手。 */
function updateBendHandles(): void {
  bendHandles.replaceChildren();
  const id = selectedIds.length === 1 ? selectedId : null;
  const n = id ? node(id) : undefined;
  if (!id || n?.type !== "Line" || mode !== "edit") return;
  const props = designRuntime.view(id).props;
  if (props.route !== "elbow") return;
  const points = lineLayoutOf(id, props).geometry.points;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 14) continue;
    const horizontal = Math.abs(a.y - b.y) < 0.5;
    const handle = document.createElement("div");
    handle.className = `bend-handle ${horizontal ? "horizontal" : "vertical"}`;
    handle.dataset.segment = String(i);
    handle.title = horizontal ? "上下拖动这一段" : "左右拖动这一段";
    Object.assign(handle.style, { left: `${(a.x + b.x) / 2}px`, top: `${(a.y + b.y) / 2}px` });
    bendHandles.append(handle);
  }
}

function updateSelectionBox(): void {
  syncSelection();
  const n = selectedId ? node(selectedId) : undefined;
  const isLine = n?.type === "Line";
  for (const handle of endpointHandles) handle.style.display = "none";
  outlines.replaceChildren();
  bendHandles.replaceChildren();
  if (!selectedId || !n) {
    selectionBox.style.display = "none";
    positionShapeBar();
    return;
  }
  if (selectedIds.length > 1) {
    // 多选：每个东西一个细框，外面一个合起来的框，不能缩放，只能整体移动
    for (const id of selectedIds) {
      const r = absRect(id);
      const box = document.createElement("div");
      box.className = "multi-outline";
      Object.assign(box.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px` });
      outlines.append(box);
    }
    const all = unionRect(topSelection())!;
    Object.assign(selectionBox.style, { display: "", left: `${all.x}px`, top: `${all.y}px`, width: `${all.width}px`, height: `${all.height}px` });
    selectionBox.classList.remove("line");
    selectionBox.classList.add("multi");
    selectionTag.textContent = `已选中 ${selectedIds.length} 个`;
    selectionTag.style.display = "";
    for (const handle of selectionBox.querySelectorAll<HTMLElement>(".handle")) handle.style.display = "none";
    positionShapeBar();
    return;
  }
  selectionBox.classList.remove("multi");
  const r = absRect(selectedId);
  const isRoot = selectedId === project.scene.root;
  Object.assign(selectionBox.style, {
    display: "",
    left: `${r.x}px`,
    top: `${r.y}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
  });
  selectionBox.classList.toggle("line", isLine);
  selectionTag.textContent = `${selectedId} · ${typeLabel(selectedId)}`;
  selectionTag.style.display = isRoot ? "none" : "";
  // 根窗口只能从右边和下边调整尺寸；线条用两端的圆点调整
  for (const handle of selectionBox.querySelectorAll<HTMLElement>(".handle")) {
    handle.style.display = isLine ? "none" : !isRoot || ["e", "s", "se"].includes(handle.dataset.handle!) ? "" : "none";
  }
  if (isLine) {
    const layout = lineLayoutOf(selectedId, designRuntime.view(selectedId).props);
    for (const handle of endpointHandles) {
      const point = handle.dataset.endpoint === "start" ? layout.start.point : layout.end.point;
      Object.assign(handle.style, { display: "", left: `${point.x}px`, top: `${point.y}px` });
    }
    updateBendHandles();
  }
  positionShapeBar();
}

/** 鼠标在设计窗口里的坐标。视角缩放过时，屏幕上的距离要除以缩放比例。 */
function stagePoint(e: MouseEvent): { x: number; y: number } {
  const rect = $("stage").getBoundingClientRect();
  const zoom = viewZoom();
  return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
}

// ---- 参考线 ----

function svgChild<K extends keyof SVGElementTagNameMap>(parent: Element, tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  parent.append(el);
  return el;
}

function clearGuides(): void {
  guidesLayer.replaceChildren();
}

/** 画吸附参考线：对齐是红线，等间距是粉色的标尺加数字。 */
function drawGuides(guides: Guide[]): void {
  for (const guide of guides) {
    if (guide.kind === "align") {
      const attrs = guide.axis === "x"
        ? { x1: guide.pos, y1: guide.from, x2: guide.pos, y2: guide.to }
        : { x1: guide.from, y1: guide.pos, x2: guide.to, y2: guide.pos };
      svgChild(guidesLayer, "line", { ...attrs, class: "guide-align" });
      continue;
    }
    for (const segment of guide.segments) {
      const horizontal = guide.axis === "x";
      const a = horizontal ? { x: segment.start, y: segment.at } : { x: segment.at, y: segment.start };
      const b = horizontal ? { x: segment.end, y: segment.at } : { x: segment.at, y: segment.end };
      svgChild(guidesLayer, "line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: "guide-gap" });
      for (const p of [a, b]) {
        const tick = horizontal ? { x1: p.x, y1: p.y - 4, x2: p.x, y2: p.y + 4 } : { x1: p.x - 4, y1: p.y, x2: p.x + 4, y2: p.y };
        svgChild(guidesLayer, "line", { ...tick, class: "guide-gap" });
      }
      const label = svgChild(guidesLayer, "text", { x: (a.x + b.x) / 2 + (horizontal ? 0 : 6), y: (a.y + b.y) / 2 + (horizontal ? -6 : 4), class: "guide-label" });
      label.textContent = String(Math.round(guide.size));
    }
  }
}

/** 线的一头将要挂到哪个节点上：把那个节点框出来，四边的中点画成圆点，选中的那一个填色。 */
function drawAttachHint(anchor: Anchor | null): void {
  if (!anchor?.node) return;
  const r = absRect(anchor.node);
  if (node(anchor.node)?.type === "Shape") {
    // 形状：把真实的外轮廓描出来
    const points = outlineOf(anchor.node).map((p) => `${r.x + p.x},${r.y + p.y}`).join(" ");
    svgChild(guidesLayer, "polygon", { points, class: "attach-box" });
  } else {
    svgChild(guidesLayer, "rect", { x: r.x - 2, y: r.y - 2, width: r.width + 4, height: r.height + 4, class: "attach-box" });
  }
  for (const side of SIDES) {
    const p = sideAnchorOf(anchor.node, side);
    svgChild(guidesLayer, "circle", { cx: p.x, cy: p.y, r: 4, class: anchor.side === side ? "attach-dot active" : "attach-dot" });
  }
  if (anchor.side === "outline") svgChild(guidesLayer, "circle", { cx: anchor.point.x, cy: anchor.point.y, r: 4, class: "attach-dot active" });
}

function showSize(width: number, height: number): void {
  sizeLabel.textContent = `${Math.round(width)} × ${Math.round(height)}`;
  sizeLabel.style.display = "";
}

// ---- 线的端点挂到哪里 ----

/** 线的一头：位置，以及挂着的节点和边（auto 表示朝着另一头自动选边）。 */
interface Anchor {
  point: Point;
  node: string | null;
  /** outline 表示挂在外轮廓上的某一点，位置记在 at 里（相对于节点方框，0 到 1） */
  side: Side | "auto" | "outline";
  at?: Point;
}

/** 按在它里面就能把线挂上去的节点：形状和控件。容器、外部容器面积大，常常只是底板，只能通过边的中点挂。 */
function interiorAttachable(id: string): boolean {
  const type = node(id)?.type;
  return !!type && type !== "Container" && type !== "External" && type !== "Window" && type !== "Line";
}

/** 鼠标下面能从内部挂线的节点：最上面、最里面的那个。avoid 是线另一头挂着的节点，不让线两头挂在同一个东西上。 */
function attachableAt(px: number, py: number, excludeId: string | null, avoid: string | null): string | null {
  const visit = (id: string): string | null => {
    const children = childrenOf(node(id));
    for (let i = children.length - 1; i >= 0; i--) {
      const hit = visit(children[i]);
      if (hit) return hit;
    }
    if (id === project.scene.root || id === excludeId || id === avoid || !interiorAttachable(id)) return null;
    return containsPoint(id, px, py) ? id : null;
  };
  return visit(project.scene.root);
}

/** 离鼠标 12 像素以内、最近的那个“边的中点”。任何节点（包括容器）都算，窗口和线条不算。 */
function nearestSideAnchor(px: number, py: number, excludeId: string | null, avoid: string | null): { node: string; side: Side; point: Point } | null {
  let best: { node: string; side: Side; point: Point } | null = null;
  let bestDistance = 12;
  for (const [id, n] of Object.entries(project.scene.nodes)) {
    if (id === project.scene.root || id === excludeId || id === avoid || n.type === "Line") continue;
    const r = absRect(id);
    if (px < r.x - 20 || px > r.x + r.width + 20 || py < r.y - 20 || py > r.y + r.height + 20) continue;
    for (const side of SIDES) {
      const p = sideAnchorOf(id, side);
      const d = Math.hypot(p.x - px, p.y - py);
      if (d <= bestDistance) {
        bestDistance = d;
        best = { node: id, side, point: p };
      }
    }
  }
  return best;
}

/** 离鼠标 10 像素以内、最近的那条外轮廓：挂在轮廓上的这一点。形状按真实轮廓，其余按方框。 */
function nearestEdge(px: number, py: number, excludeId: string | null, avoid: string | null): Anchor | null {
  let best: Anchor | null = null;
  let bestDistance = 10;
  for (const [id, n] of Object.entries(project.scene.nodes)) {
    if (id === project.scene.root || id === excludeId || id === avoid || n.type === "Line") continue;
    const r = absRect(id);
    if (px < r.x - 12 || px > r.x + r.width + 12 || py < r.y - 12 || py > r.y + r.height + 12) continue;
    const hit = nearestOnOutline(id, { x: px, y: py });
    if (hit.distance <= bestDistance) {
      bestDistance = hit.distance;
      const at = { x: (hit.point.x - r.x) / Math.max(1, r.width), y: (hit.point.y - r.y) / Math.max(1, r.height) };
      best = { point: hit.point, node: id, side: "outline", at };
    }
  }
  return best;
}

/**
 * 拖着线的一头时，它落在哪里：
 *   靠近某条边的中点（12 像素以内）：挂在那条边上；
 *   按在形状或控件里面：挂在它上面，朝着另一头自动选边；
 *   都不是：就停在鼠标的位置（会吸附到别的东西的边和中线）。
 * 按住 Ctrl 不挂也不吸附。avoid 是另一头挂着的节点，线的两头不挂在同一个东西上。
 */
function anchorAt(pt: Point, e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }, excludeId: string | null, from: Point | null, avoid: string | null = null): Anchor {
  if (!(e.ctrlKey || e.metaKey)) {
    const near = nearestSideAnchor(pt.x, pt.y, excludeId, avoid);
    if (near) return { point: near.point, node: near.node, side: near.side };
    const edge = nearestEdge(pt.x, pt.y, excludeId, avoid);
    if (edge) return edge;
    const target = attachableAt(pt.x, pt.y, excludeId, avoid);
    if (target) return { point: resolveAttach(target, "auto", null, from ?? pt).point, node: target, side: "auto" };
  }
  let point = pt;
  // 按住 Shift：角度按 45 度取整
  if (e.shiftKey && from) {
    const angle = Math.round(Math.atan2(pt.y - from.y, pt.x - from.x) / (Math.PI / 4)) * (Math.PI / 4);
    const length = Math.hypot(pt.x - from.x, pt.y - from.y);
    point = { x: from.x + Math.cos(angle) * length, y: from.y + Math.sin(angle) * length };
  }
  const snapped = snapPoint(point.x, point.y, snapTargets(excludeId), snapOptions(e));
  return { point: { x: snapped.x, y: snapped.y }, node: null, side: "auto" };
}

/** 把一头的落点写进线的属性（相对于线的父节点）。 */
function writeAnchor(props: Record<string, Value>, which: "start" | "end", anchor: Anchor, origin: Point): void {
  const [xKey, yKey, nodeKey, sideKey] = which === "start" ? ["x1", "y1", "startNode", "startSide"] : ["x2", "y2", "endNode", "endSide"];
  props[xKey] = Math.round(anchor.point.x - origin.x);
  props[yKey] = Math.round(anchor.point.y - origin.y);
  const atKey = which === "start" ? "startAt" : "endAt";
  if (anchor.node) {
    props[nodeKey] = anchor.node;
    props[sideKey] = anchor.side;
    if (anchor.side === "outline" && anchor.at) props[atKey] = `${anchor.at.x.toFixed(3)},${anchor.at.y.toFixed(3)}`;
    else delete props[atKey];
  } else {
    delete props[nodeKey];
    delete props[sideKey];
    delete props[atKey];
  }
}

// ---- 拖动、缩放、画图 ----

/** 整体移动时每个东西原来的位置；线条记它原来的属性（端点和拐点）。 */
interface MoveOrigin {
  id: string;
  x: number;
  y: number;
  props?: Record<string, Value>;
}

type Gesture =
  | {
      kind: "move";
      ids: string[];
      origins: MoveOrigin[];
      start: Point;
      abs: Rect;
      moved: boolean;
      targets: Rect[];
      /** Shift 点了一个已经选中的东西：如果没有拖动，松开时把它从选择里去掉 */
      toggleOnClick: string | null;
    }
  | { kind: "resize"; id: string; handle: string; start: Point; orig: Rect; abs: Rect; moved: boolean; targets: Rect[] }
  | { kind: "marquee"; start: Point; scope: string; base: string[]; clicked: string | null; moved: boolean }
  | { kind: "bend"; id: string; index: number; points: Point[]; start: Point; horizontal: boolean; moved: boolean }
  | { kind: "draw"; preset: ShapePreset | null; nodeType: string | null; start: Point; rect: Rect | null; parentId: string; targets: Rect[] }
  | { kind: "line"; preset: ShapePreset; start: Anchor; end: Anchor | null; parentId: string; rawStart: Point; rawEnd: Point | null }
  | { kind: "endpoint"; id: string; which: "start" | "end"; moved: boolean };
let gesture: Gesture | null = null;

/** 拖动期间鼠标移出设计窗口也继续收到事件。拿不到（例如不是真的鼠标）也不影响拖动。 */
function capturePointer(e: PointerEvent): void {
  try {
    overlay.setPointerCapture(e.pointerId);
  } catch {
    // 忽略
  }
}
const MIN_SIZE = 8;

/** 落在哪个能装东西的节点里：从鼠标下最里面的节点往外找。 */
function containerAt(px: number, py: number): string {
  for (let hit = hitTest(px, py); hit; hit = parentOf(hit)) {
    if (canHoldChildren(hit)) return hit;
  }
  return project.scene.root;
}

overlay.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  hideMenu();
  if (textEditor) commitTextEditor();
  const pt = stagePoint(e);
  const target = e.target as HTMLElement;

  if (tool.kind === "preset") {
    const preset = tool.preset;
    const parentId = containerAt(pt.x, pt.y);
    if (preset.type === "Line") {
      gesture = { kind: "line", preset, start: anchorAt(pt, e, null, null), end: null, parentId, rawStart: pt, rawEnd: null };
    } else {
      const snapped = snapPoint(pt.x, pt.y, snapTargets(null), snapOptions(e));
      gesture = { kind: "draw", preset, nodeType: null, start: { x: snapped.x, y: snapped.y }, rect: null, parentId, targets: snapTargets(null) };
    }
    capturePointer(e);
    return;
  }
  if (tool.kind === "node") {
    // 画容器、外部容器或控件：和画图形一样拖出大小
    const snapped = snapPoint(pt.x, pt.y, snapTargets(null), snapOptions(e));
    gesture = { kind: "draw", preset: null, nodeType: tool.type, start: { x: snapped.x, y: snapped.y }, rect: null, parentId: containerAt(pt.x, pt.y), targets: snapTargets(null) };
    capturePointer(e);
    return;
  }

  const endpoint = target.dataset.endpoint as "start" | "end" | undefined;
  if (endpoint && selectedId) {
    gesture = { kind: "endpoint", id: selectedId, which: endpoint, moved: false };
    capturePointer(e);
    return;
  }

  // 折线某一段中间的小把手
  const segment = target.dataset.segment;
  if (segment !== undefined && selectedId) {
    const props = designRuntime.view(selectedId).props;
    const points = lineLayoutOf(selectedId, props).geometry.points;
    const index = Number(segment);
    const a = points[index];
    const b = points[index + 1];
    if (a && b) {
      gesture = { kind: "bend", id: selectedId, index, points, start: pt, horizontal: Math.abs(a.y - b.y) < 0.5, moved: false };
      capturePointer(e);
    }
    return;
  }

  // 缩放：只有选中一个东西时才有手柄
  const handle = target.dataset.handle ?? null;
  if (handle && selectedId) {
    const n = node(selectedId);
    if (!n || n.type === "Line") return;
    const orig = { x: n.x ?? 0, y: n.y ?? 0, width: n.width, height: n.height };
    const isRoot = selectedId === project.scene.root;
    gesture = {
      kind: "resize", id: selectedId, handle, start: { x: e.clientX, y: e.clientY }, orig,
      abs: isRoot ? { ...orig, x: 0, y: 0 } : absRect(selectedId), moved: false, targets: isRoot ? [] : snapTargets(selectedId),
    };
    capturePointer(e);
    return;
  }

  const id = hitTest(pt.x, pt.y);
  const type = id ? node(id)?.type : undefined;
  // 框选：从空白处、或者从一个还没选中的容器上拖出去（和 Figma 在画框里拖的效果一样）。只点一下不拖，就是选中它
  if (!id || ((type === "Container" || type === "External") && !selectedIds.includes(id))) {
    gesture = { kind: "marquee", start: pt, scope: id ? id : project.scene.root, base: e.shiftKey ? [...selectedIds] : [], clicked: id, moved: false };
    capturePointer(e);
    return;
  }

  // Shift 点：加进选择，或者（松开时没拖动的话）从选择里去掉
  let toggleOnClick: string | null = null;
  if (e.shiftKey) {
    if (selectedIds.includes(id)) toggleOnClick = id;
    else select(id, true);
  } else if (!selectedIds.includes(id)) {
    select(id);
  }
  const ids = topSelection();
  if (ids.length === 0) return;
  // 只选中一条挂着的线时不能整条拖（和 FigJam 一样，要先把端点拖下来）；和别的东西一起选中时，它没挂的部分跟着走
  if (ids.length === 1) {
    const n = node(ids[0]);
    if (n?.type === "Line" && (attachedTarget(ids[0], n.props?.startNode) || attachedTarget(ids[0], n.props?.endNode))) {
      if (toggleOnClick) gesture = { kind: "move", ids: [], origins: [], start: { x: e.clientX, y: e.clientY }, abs: absRect(ids[0]), moved: false, targets: [], toggleOnClick };
      return;
    }
  }
  const origins: MoveOrigin[] = ids.map((each) => {
    const n = node(each)!;
    return { id: each, x: n.x ?? 0, y: n.y ?? 0, props: n.type === "Line" ? { ...n.props } : undefined };
  });
  gesture = {
    kind: "move", ids, origins, start: { x: e.clientX, y: e.clientY }, abs: unionRect(ids)!, moved: false,
    targets: snapTargets(ids), toggleOnClick,
  };
  capturePointer(e);
});

/** 节点的位置或大小在拖动中变了：只挪动它自己的元素，形状重画，挂着的线跟着走。 */
function applyLiveGeometry(id: string): void {
  const n = node(id);
  if (!n) return;
  if (id === project.scene.root) {
    $("stage").style.width = `${n.width}px`;
    $("stage").style.height = `${n.height}px`;
  } else {
    const entry = mounted.get(id);
    if (entry) {
      Object.assign(entry.wrapper.style, { left: `${n.x}px`, top: `${n.y}px`, width: `${n.width}px`, height: `${n.height}px` });
      if (n.type === "Shape") paintGraphic(id, entry, activeRuntime().view(id).props);
    }
  }
  refreshLines();
  updateSelectionBox();
}

overlay.addEventListener("pointermove", (e) => {
  if (!gesture) {
    // 没在拖动：画线工具悬停在节点上时，提示能挂到哪里
    if (tool.kind === "preset" && tool.preset.type === "Line") {
      clearGuides();
      drawAttachHint(anchorAt(stagePoint(e), e, null, null));
    }
    return;
  }
  const pt = stagePoint(e);
  const options = snapOptions(e);
  clearGuides();

  if (gesture.kind === "move") {
    let dx = Math.round((e.clientX - gesture.start.x) / viewZoom());
    let dy = Math.round((e.clientY - gesture.start.y) / viewZoom());
    if ((dx === 0 && dy === 0 && !gesture.moved) || gesture.ids.length === 0) return;
    gesture.moved = true;
    // 按住 Shift：只沿水平或竖直方向移动
    if (e.shiftKey) {
      if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    // 选中的东西合起来当成一个方框来吸附，所有东西挪同样的距离
    const { abs } = gesture;
    const snapped = snapMove({ x: abs.x + dx, y: abs.y + dy, width: abs.width, height: abs.height }, gesture.targets, options);
    const mx = Math.round(snapped.x - abs.x);
    const my = Math.round(snapped.y - abs.y);
    drawGuides(snapped.guides);
    for (const origin of gesture.origins) {
      const n = node(origin.id);
      if (!n) continue;
      if (n.type === "Line" && origin.props) {
        n.props = offsetLineProps(origin.id, origin.props, mx, my);
      } else {
        n.x = origin.x + mx;
        n.y = origin.y + my;
      }
    }
    for (const origin of gesture.origins) {
      const entry = mounted.get(origin.id);
      const n = node(origin.id);
      if (entry && n && n.type !== "Line") Object.assign(entry.wrapper.style, { left: `${n.x}px`, top: `${n.y}px` });
    }
    refreshLines();
    updateSelectionBox();
    return;
  }

  if (gesture.kind === "resize") {
    const n = node(gesture.id);
    if (!n) return;
    const dx = Math.round((e.clientX - gesture.start.x) / viewZoom());
    const dy = Math.round((e.clientY - gesture.start.y) / viewZoom());
    if (dx === 0 && dy === 0 && !gesture.moved) return;
    gesture.moved = true;
    const { orig, abs } = gesture;
    {
      const handle = gesture.handle;
      let width = orig.width;
      let height = orig.height;
      if (handle.includes("e")) width = orig.width + dx;
      if (handle.includes("w")) width = orig.width - dx;
      if (handle.includes("s")) height = orig.height + dy;
      if (handle.includes("n")) height = orig.height - dy;
      // 按住 Shift 拖角：保持长宽比
      if (e.shiftKey && handle.length === 2) {
        const ratio = orig.width / Math.max(1, orig.height);
        if (Math.abs(width / orig.width) >= Math.abs(height / Math.max(1, orig.height))) height = width / ratio;
        else width = height * ratio;
      }
      width = Math.max(MIN_SIZE, width);
      height = Math.max(MIN_SIZE, height);
      let box: Rect = {
        x: abs.x + (handle.includes("w") ? orig.width - width : 0),
        y: abs.y + (handle.includes("n") ? orig.height - height : 0),
        width,
        height,
      };
      if (gesture.id !== project.scene.root && !(e.shiftKey && handle.length === 2)) {
        const snapped = snapResize(box, handle, gesture.targets, options);
        box = snapped.rect;
        drawGuides(snapped.guides);
      }
      n.width = Math.max(MIN_SIZE, Math.round(box.width));
      n.height = Math.max(MIN_SIZE, Math.round(box.height));
      n.x = Math.round(orig.x + box.x - abs.x);
      n.y = Math.round(orig.y + box.y - abs.y);
      showSize(n.width, n.height);
    }
    applyLiveGeometry(gesture.id);
    return;
  }

  if (gesture.kind === "marquee") {
    const rect = {
      x: Math.min(gesture.start.x, pt.x),
      y: Math.min(gesture.start.y, pt.y),
      width: Math.abs(pt.x - gesture.start.x),
      height: Math.abs(pt.y - gesture.start.y),
    };
    if (!gesture.moved && rect.width < 3 && rect.height < 3) return;
    gesture.moved = true;
    Object.assign(marqueeBox.style, { display: "block", left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    // 框住的是起点所在的那一层里、和方框有交叠的东西
    const hits = childrenOf(node(gesture.scope)).filter((child) => {
      const r = absRect(child);
      return r.x < rect.x + rect.width && r.x + r.width > rect.x && r.y < rect.y + rect.height && r.y + r.height > rect.y;
    });
    const next = [...gesture.base];
    for (const hit of hits) if (!next.includes(hit)) next.push(hit);
    selectedIds = next;
    selectedId = next[next.length - 1] ?? null;
    updateSelectionBox();
    return;
  }

  if (gesture.kind === "bend") {
    const n = node(gesture.id);
    if (!n) return;
    // 拖的那一段只能沿着和它垂直的方向走；位置也吸附到别的东西的边和中线
    const snapped = snapPoint(pt.x, pt.y, snapTargets(gesture.id), options);
    drawGuides(snapped.guides.filter((guide) => guide.kind === "align" && guide.axis === (gesture!.kind === "bend" && gesture!.horizontal ? "y" : "x")));
    const a = gesture.points[gesture.index];
    const delta = gesture.horizontal ? snapped.y - a.y : snapped.x - a.x;
    if (Math.abs(delta) < 1 && !gesture.moved) return;
    gesture.moved = true;
    const inner = dragElbowSegment(gesture.points, gesture.index, delta);
    const origin = parentOrigin(gesture.id);
    n.props = { ...n.props, bends: formatBends(inner.map((p) => ({ x: p.x - origin.x, y: p.y - origin.y }))) };
    const entry = mounted.get(gesture.id);
    if (entry) paintGraphic(gesture.id, entry, { ...designRuntime.view(gesture.id).props, ...n.props });
    updateSelectionBox();
    return;
  }

  if (gesture.kind === "draw") {
    const snapped = snapPoint(pt.x, pt.y, gesture.targets, options);
    let x2 = snapped.x;
    let y2 = snapped.y;
    drawGuides(snapped.guides);
    let { x: x1, y: y1 } = gesture.start;
    // Shift：画正方形、正圆；Alt：从中心往外画
    if (e.shiftKey) {
      const side = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
      x2 = x1 + Math.sign(x2 - x1 || 1) * side;
      y2 = y1 + Math.sign(y2 - y1 || 1) * side;
    }
    if (e.altKey) {
      x1 = gesture.start.x - (x2 - gesture.start.x);
      y1 = gesture.start.y - (y2 - gesture.start.y);
    }
    const rect = { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
    if (rect.width < 2 && rect.height < 2) return;
    gesture.rect = rect;
    Object.assign(ghost.style, { display: "block", left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    if (gesture.preset) paintShape(ghost, Math.max(1, rect.width), Math.max(1, rect.height), presetProps(gesture.preset));
    else {
      const box = document.createElement("div");
      box.className = "node-ghost";
      box.textContent = declFor(project, gesture.nodeType ?? "")?.label ?? gesture.nodeType ?? "";
      ghost.replaceChildren(box);
    }
    showSize(rect.width, rect.height);
    return;
  }

  if (gesture.kind === "line") {
    // 终点不挂在起点挂着的那个东西上
    const end = anchorAt(pt, e, null, gesture.start.point, gesture.start.node);
    gesture.rawEnd = pt;
    gesture.end = end;
    drawAttachHint(gesture.start.node ? gesture.start : null);
    drawAttachHint(end);
    paintGhostLine(gesture.start, end, presetProps(gesture.preset));
    return;
  }

  if (gesture.kind === "endpoint") {
    const n = node(gesture.id);
    if (!n) return;
    gesture.moved = true;
    const props = { ...designRuntime.view(gesture.id).props, ...n.props };
    const layout = lineLayoutOf(gesture.id, props);
    const other = gesture.which === "start" ? layout.end.point : layout.start.point;
    const otherNode = attachedTarget(gesture.id, gesture.which === "start" ? props.endNode : props.startNode);
    const anchor = anchorAt(pt, e, gesture.id, other, otherNode);
    n.props = { ...n.props };
    writeAnchor(n.props, gesture.which, anchor, parentOrigin(gesture.id));
    drawAttachHint(anchor);
    const entry = mounted.get(gesture.id);
    if (entry) paintGraphic(gesture.id, entry, { ...designRuntime.view(gesture.id).props, ...n.props });
    updateSelectionBox();
  }
});

/** 画线时的预览：用真的线条画法画在编辑层上。 */
function paintGhostLine(start: Anchor, end: Anchor, props: Record<string, Value>): void {
  const toEndpoint = (anchor: Anchor, other: Point): Endpoint =>
    anchor.node ? resolveAttach(anchor.node, anchor.side, anchor.at ?? null, other) : { point: anchor.point, direction: null };
  const layout = layoutLine(toEndpoint(start, end.point), toEndpoint(end, start.point), props);
  Object.assign(ghost.style, { display: "block", left: `${layout.bbox.x}px`, top: `${layout.bbox.y}px`, width: `${layout.bbox.width}px`, height: `${layout.bbox.height}px` });
  paintLine(ghost, layout, { x: layout.bbox.x, y: layout.bbox.y }, props);
}

function endGesture(): void {
  gesture = null;
  clearGuides();
  sizeLabel.style.display = "none";
  ghost.style.display = "none";
  ghost.replaceChildren();
  marqueeBox.style.display = "none";
}

overlay.addEventListener("pointerup", (e) => {
  const finished = gesture;
  endGesture();
  if (!finished) return;
  if (finished.kind === "move") {
    if (finished.moved) void saveScene();
    else if (finished.toggleOnClick) select(finished.toggleOnClick, true);
    return;
  }
  if (finished.kind === "resize" || finished.kind === "endpoint" || finished.kind === "bend") {
    if (finished.moved) void saveScene();
    return;
  }
  if (finished.kind === "marquee") {
    if (finished.moved) {
      // 框选结束：把选择定下来，刷新图层和右侧
      setSelection(selectedIds);
    } else if (e.shiftKey && finished.clicked) {
      select(finished.clicked, true);
    } else {
      // 只是点了一下：选中点到的容器，点在空白处就取消选择
      select(finished.clicked);
    }
    return;
  }
  if (finished.kind === "draw") {
    setTool({ kind: "select" });
    const dragged = finished.rect && finished.rect.width >= 4 && finished.rect.height >= 4 ? finished.rect : null;
    if (finished.nodeType) {
      // 只点了一下没有拖：按它的默认大小，以点击处为中心放一个
      const size = (declFor(project, finished.nodeType) ?? CONTAINER_DECL).defaultSize ?? CONTAINER_DECL.defaultSize!;
      const rect = dragged ?? { x: finished.start.x - size.width / 2, y: finished.start.y - size.height / 2, width: size.width, height: size.height };
      void createNode(finished.nodeType, finished.parentId, rect);
      return;
    }
    // 只点了一下没有拖：按预设的大小，以点击处为中心放一个
    const preset = finished.preset!;
    const rect = finished.rect && finished.rect.width >= 4 && finished.rect.height >= 4
      ? finished.rect
      : { x: finished.start.x - preset.width / 2, y: finished.start.y - preset.height / 2, width: preset.width, height: preset.height };
    void createFromPreset(preset, rect, finished.parentId).then((id) => {
      if (preset.props.shape === "text") openTextEditor(id);
    });
    return;
  }
  if (finished.kind === "line") {
    let end = finished.end;
    // 只点了一下：从这里往右画一条默认长度的线
    // 鼠标几乎没动，才算只点了一下
    const rawEnd = finished.rawEnd;
    if (!end || !rawEnd || Math.hypot(rawEnd.x - finished.rawStart.x, rawEnd.y - finished.rawStart.y) < 4) {
      end = { point: { x: finished.start.point.x + 160, y: finished.start.point.y }, node: null, side: "auto" };
    }
    setTool({ kind: "select" });
    void createLine(finished.preset, finished.start, end, finished.parentId, e.shiftKey);
  }
});

overlay.addEventListener("dblclick", (e) => {
  if (tool.kind !== "select") return;
  const pt = stagePoint(e);
  const id = hitTest(pt.x, pt.y);
  if (id && isGraphic(id)) openTextEditor(id);
});

overlay.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  const pt = stagePoint(e);
  const id = hitTest(pt.x, pt.y);
  // 右键点在已经选中的东西上，保留整个选择
  if (!id || !selectedIds.includes(id)) select(id);
  if (id) showMenu(e.clientX, e.clientY, id);
  else if (clipMemory) openMenu(e.clientX, e.clientY, clipboardItems());
});

// ---- 在形状里写字、给线加文字 ----

let textEditor: { id: string; el: HTMLTextAreaElement; field: "text" | "label" } | null = null;

function openTextEditor(id: string): void {
  const n = node(id);
  const entry = mounted.get(id);
  if (!n || !entry || !isGraphic(id)) return;
  if (textEditor) commitTextEditor();
  select(id);
  const field = n.type === "Line" ? "label" : "text";
  const props = designRuntime.view(id).props;
  const el = document.createElement("textarea");
  el.className = "text-editor";
  el.value = str(n.props?.[field], "");
  el.spellcheck = false;
  if (n.type === "Shape") {
    const r = absRect(id);
    const box = entry.body.querySelector<HTMLElement>(".vf-shape-text");
    const left = r.x + (box?.offsetLeft ?? 0);
    const top = r.y + (box?.offsetTop ?? 0);
    Object.assign(el.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${Math.max(40, box?.offsetWidth ?? r.width)}px`,
      height: `${Math.max(24, box?.offsetHeight ?? r.height)}px`,
      textAlign: str(props.textAlign, "center"),
      fontSize: `${num(props.fontSize, 14)}px`,
      color: str(props.textColor, "#1f2430"),
    });
    if (box) box.style.visibility = "hidden";
  } else {
    const layout = lineLayoutOf(id, props);
    const mid = layout.geometry.points[Math.floor(layout.geometry.points.length / 2)];
    const first = layout.geometry.points[0];
    const center = layout.geometry.points.length === 2 ? { x: (first.x + mid.x) / 2, y: (first.y + mid.y) / 2 } : mid;
    Object.assign(el.style, { left: `${center.x - 70}px`, top: `${center.y - 14}px`, width: "140px", height: "28px", fontSize: `${num(props.fontSize, 12)}px`, textAlign: "center" });
  }
  el.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") commitTextEditor(true);
    else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) commitTextEditor();
  });
  el.addEventListener("blur", () => commitTextEditor());
  el.addEventListener("pointerdown", (e) => e.stopPropagation());
  overlay.append(el);
  textEditor = { id, el, field };
  el.focus();
  el.select();
}

function commitTextEditor(cancel = false): void {
  const editor = textEditor;
  if (!editor) return;
  textEditor = null;
  editor.el.remove();
  const n = node(editor.id);
  if (!n) return;
  const value = editor.el.value;
  if (cancel || value === str(n.props?.[editor.field], "")) {
    renderStage();
    return;
  }
  n.props = { ...n.props };
  if (value) n.props[editor.field] = value;
  else delete n.props[editor.field];
  void saveScene();
}

// ---- 键盘 ----

/** 工具的快捷键，和 Figma / FigJam 相同。 */
const TOOL_KEYS: Record<string, string> = { r: "rectangle", o: "ellipse", l: "line", x: "elbowConnector", t: "text" };

document.addEventListener("keydown", (e) => {
  const target = e.target as HTMLElement;
  if (mode !== "edit" || (target instanceof HTMLElement && (target.matches("input, textarea, select") || target.isContentEditable))) return;
  const ctrl = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();

  if (ctrl && key === "z") {
    e.preventDefault();
    void (e.shiftKey ? redo() : undo());
    return;
  }
  if (ctrl && key === "y") {
    e.preventDefault();
    void redo();
    return;
  }
  if (ctrl && key === "d") {
    e.preventDefault();
    void duplicateNodes(topSelection());
    return;
  }
  if (ctrl && key === "a") {
    e.preventDefault();
    // 全选：窗口里最外面一层的全部东西
    setSelection([...childrenOf(node(project.scene.root))]);
    return;
  }
  if (ctrl && e.key === "Enter") {
    e.preventDefault();
    if (selectedId) void quickCreate(selectedId);
    return;
  }
  if (!ctrl && !e.altKey) {
    if (key === "v") return setTool({ kind: "select" });
    if (key === "l" && e.shiftKey) return setTool({ kind: "preset", preset: presetById("arrow")! });
    if (TOOL_KEYS[key] && !e.shiftKey) return setTool({ kind: "preset", preset: presetById(TOOL_KEYS[key])! });
    if (e.key === "Escape") {
      if (tool.kind !== "select") setTool({ kind: "select" });
      else select(null);
      return;
    }
    if (e.key === "Enter" && selectedId && isGraphic(selectedId)) {
      e.preventDefault();
      openTextEditor(selectedId);
      return;
    }
  }

  const ids = topSelection();
  if (ids.length === 0) return;
  const step = e.shiftKey ? 10 : 1;
  const moves: Record<string, [number, number]> = {
    ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
  };
  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    void deleteNodes(ids);
  } else if (moves[e.key]) {
    e.preventDefault();
    const [dx, dy] = moves[e.key];
    for (const id of ids) {
      const n = node(id);
      if (!n) continue;
      // 线条挪动的是没挂着的那几头和拐点
      if (n.type === "Line") n.props = offsetLineProps(id, n.props ?? {}, dx, dy);
      else {
        n.x = (n.x ?? 0) + dx;
        n.y = (n.y ?? 0) + dy;
      }
    }
    void saveScene();
  }
});

// 预览模式下，设计窗口里的任何点击都会再触发一次全局事件 window.click
$("stage").addEventListener("click", (e) => {
  if (mode === "preview" && !e.altKey) previewRuntime?.dispatch(null, "window.click");
});

// ---------- 对节点的操作 ----------

function newId(type: string, idBase?: string): string {
  const base = idBase || (type === "Container" ? "box" : type === "External" ? "host" : type.charAt(0).toLowerCase() + type.slice(1));
  const taken = new Set([
    ...Object.keys(project.scene.nodes),
    ...Object.keys(project.logic.state ?? {}),
    ...Object.keys(project.logic.conditions ?? {}),
  ]);
  for (let i = 1; ; i++) {
    if (!taken.has(`${base}${i}`)) return `${base}${i}`;
  }
}

/** rect1 → rect：复制节点时，新 ID 沿用同样的前缀。 */
function idBaseOf(id: string): string {
  return id.replace(/\d+$/, "") || "node";
}

/** 放一个新节点进画布。rect 是设计窗口里的绝对坐标。 */
async function createNode(type: string, parentId: string, rect: Rect, props?: Record<string, Value>, idBase?: string): Promise<string> {
  const decl = declFor(project, type) ?? CONTAINER_DECL;
  const parentRect = absRect(parentId);
  const id = newId(type, idBase);
  const created: SceneNode = {
    type,
    x: Math.round(rect.x - (parentId === project.scene.root ? 0 : parentRect.x)),
    y: Math.round(rect.y - (parentId === project.scene.root ? 0 : parentRect.y)),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
  if (props && Object.keys(props).length > 0) created.props = props;
  if (decl.children) created.children = [];
  project.scene.nodes[id] = created;
  (project.scene.nodes[parentId].children ??= []).push(id);
  selectedId = id;
  await saveScene();
  return id;
}

async function addNode(type: string, px: number, py: number): Promise<void> {
  const decl = declFor(project, type) ?? CONTAINER_DECL;
  const size = decl.defaultSize ?? CONTAINER_DECL.defaultSize!;
  // 落点在能放子节点的控件里，就放进去；否则放在窗口里
  await createNode(type, containerAt(px, py), { x: px - size.width / 2, y: py - size.height / 2, width: size.width, height: size.height });
}

/** 预设的属性，加上上次用过的颜色和线型（工具自带的预设才沿用；文字和用户存的预设保持原样）。 */
function presetProps(preset: ShapePreset): Record<string, Value> {
  const props = { ...preset.props };
  const builtin = SHAPE_PRESETS.includes(preset);
  if (builtin && preset.type === "Shape" && preset.props.shape !== "text") {
    for (const key of ["fill", "stroke", "textColor", "strokeWidth", "strokeStyle"]) {
      if (lastShapeStyle[key] !== undefined) props[key] = lastShapeStyle[key];
    }
  }
  if (builtin && preset.type === "Line") {
    for (const key of ["stroke", "strokeWidth", "textColor"]) {
      if (lastLineStyle[key] !== undefined) props[key] = lastLineStyle[key];
    }
  }
  return props;
}

async function createFromPreset(preset: ShapePreset, rect: Rect, parentId: string): Promise<string> {
  if (preset.type === "Line") {
    const start: Anchor = { point: { x: rect.x, y: rect.y + rect.height / 2 }, node: null, side: "auto" };
    const end: Anchor = { point: { x: rect.x + Math.max(rect.width, 40), y: rect.y + rect.height / 2 }, node: null, side: "auto" };
    return createLine(preset, start, end, parentId, false);
  }
  return createNode("Shape", parentId, rect, presetProps(preset), preset.idBase);
}

async function createLine(preset: ShapePreset, start: Anchor, end: Anchor, parentId: string, _shift: boolean): Promise<string> {
  const props = presetProps(preset);
  const origin = parentId === project.scene.root ? { x: 0, y: 0 } : absRect(parentId);
  writeAnchor(props, "start", start, origin);
  writeAnchor(props, "end", end, origin);
  // 外框在写文件前按线的位置重新算，这里先给一个大概的
  const x = Math.min(start.point.x, end.point.x);
  const y = Math.min(start.point.y, end.point.y);
  return createNode("Line", parentId, { x, y, width: Math.abs(end.point.x - start.point.x) || 1, height: Math.abs(end.point.y - start.point.y) || 1 }, props, preset.idBase);
}

/** 复制一份，放在原来的右下方一点。线条复制出来是两头都没挂的。 */
/** 快速新建（FigJam 的 Ctrl+Enter）：在右边放一个同样的形状，用折线箭头连起来。 */
async function quickCreate(id: string): Promise<void> {
  const n = node(id);
  const parentId = parentOf(id);
  if (!n || n.type !== "Shape" || !parentId) return;
  const GAP = 80;
  const x = n.x ?? 0;
  const y = n.y ?? 0;
  // 右边放得下就放右边，放不下就放下面
  const container = node(parentId)!;
  const toRight = x + n.width * 2 + GAP <= container.width;
  const copyId = newId("Shape", idBaseOf(id));
  const props = { ...n.props };
  delete props.text;
  const copy = toRight ? { x: x + n.width + GAP, y } : { x, y: y + n.height + GAP };
  project.scene.nodes[copyId] = { type: "Shape", ...copy, width: n.width, height: n.height, props };
  const parent = node(parentId)!;
  parent.children!.push(copyId);
  const lineId = newId("Line", "connector");
  const lineProps: Record<string, Value> = {
    ...presetProps(presetById("elbowConnector")!),
    x1: x, y1: y, x2: copy.x, y2: copy.y,
    startNode: id, startSide: toRight ? "right" : "bottom", endNode: copyId, endSide: toRight ? "left" : "top",
  };
  project.scene.nodes[lineId] = { type: "Line", x: 0, y: 0, width: 1, height: 1, props: lineProps };
  parent.children!.push(lineId);
  selectedId = copyId;
  await saveScene();
}

// ---- 复制、剪切、粘贴、复制一份、删除（都作用在整个选择上） ----

/** 剪贴板里的内容：一组节点（连同里面的东西）。最外面一层的位置是设计窗口里的绝对坐标。 */
interface Clip {
  kind: "vibefrontend/nodes";
  version: 1;
  roots: string[];
  nodes: Record<string, SceneNode>;
}

/** 本窗口里最近一次复制的内容。系统剪贴板读不到时（例如右键菜单里点“粘贴”）用它。 */
let clipMemory: Clip | null = null;
/** 同一份内容连续粘贴的次数：每次往右下错开一点，免得叠在一起看不出来 */
let pasteCount = 0;
const PASTE_OFFSET = 16;

/** 线条的全部坐标（两端和拐点）一起平移，不管挂没挂着。 */
function shiftLineAll(props: Record<string, Value>, dx: number, dy: number): Record<string, Value> {
  const next: Record<string, Value> = { ...props, x1: num(props.x1, 0) + dx, y1: num(props.y1, 0) + dy, x2: num(props.x2, 160) + dx, y2: num(props.y2, 0) + dy };
  const bends = parseBends(props.bends);
  if (bends.length > 0) next.bends = formatBends(bends.map((p) => ({ x: p.x + dx, y: p.y + dy })));
  return next;
}

/** 把一组节点打包。挂在包外节点上的线头，改成停在它现在的位置。 */
function copyNodes(ids: string[]): Clip {
  const nodes: Record<string, SceneNode> = {};
  const collect = (id: string) => {
    const n = node(id);
    if (!n || nodes[id]) return;
    nodes[id] = JSON.parse(JSON.stringify(n)) as SceneNode;
    for (const child of childrenOf(n)) collect(child);
  };
  for (const id of ids) collect(id);
  const roots = ids.filter((id) => nodes[id]);

  for (const [id, copy] of Object.entries(nodes)) {
    if (copy.type !== "Line") continue;
    const isRoot = roots.includes(id);
    const origin = parentOrigin(id);
    // 包里的坐标：最外面一层的线用绝对坐标，里层的线仍然相对于它的父节点
    const frame = isRoot ? { x: 0, y: 0 } : origin;
    let props = { ...copy.props };
    if (isRoot) props = shiftLineAll(props, origin.x, origin.y);
    const layout = lineLayoutOf(id, designRuntime.view(id).props);
    for (const which of ["start", "end"] as const) {
      const target = attachedTarget(id, props[which === "start" ? "startNode" : "endNode"]);
      if (target && nodes[target]) continue;
      if (target) writeAnchor(props, which, { point: which === "start" ? layout.start.point : layout.end.point, node: null, side: "auto" }, frame);
    }
    copy.props = props;
  }
  for (const id of roots) {
    const copy = nodes[id];
    if (copy.type === "Line") continue;
    const r = absRect(id);
    copy.x = r.x;
    copy.y = r.y;
  }
  return { kind: "vibefrontend/nodes", version: 1, roots, nodes };
}

/**
 * 把一个包放进画布。placement 决定最外面一层的每个节点放进哪个父节点、排在第几个；
 * offset 是相对于原来位置的错开量。返回新放进去的最外面一层的 ID。
 */
function pasteClip(clip: Clip, placement: (rootId: string) => { parentId: string; index?: number }, offset: number): string[] {
  const idMap = new Map<string, string>();
  const order: string[] = [];
  const walk = (id: string) => {
    const n = clip.nodes[id];
    if (!n || idMap.has(id)) return;
    const fresh = newId(n.type, idBaseOf(id));
    idMap.set(id, fresh);
    // 先占住这个 ID，后面的 newId 才不会重复
    project.scene.nodes[fresh] = { type: n.type, width: 1, height: 1 };
    order.push(id);
    for (const child of childrenOf(n)) walk(child);
  };
  for (const root of clip.roots) walk(root);

  for (const oldId of order) {
    const source = clip.nodes[oldId];
    const copy = JSON.parse(JSON.stringify(source)) as SceneNode;
    remapNodeChildren(copy, (child) => idMap.get(child));
    if (copy.type === "Line" && copy.props) {
      for (const key of ["startNode", "endNode"]) {
        const target = copy.props[key];
        if (typeof target === "string" && target) {
          if (idMap.has(target)) copy.props[key] = idMap.get(target)!;
          else delete copy.props[key];
        }
      }
    }
    project.scene.nodes[idMap.get(oldId)!] = copy;
  }

  const placed: string[] = [];
  for (const root of clip.roots) {
    const fresh = idMap.get(root);
    if (!fresh) continue;
    const { parentId, index } = placement(root);
    const parent = node(parentId) ?? node(project.scene.root)!;
    const origin = parentId === project.scene.root ? { x: 0, y: 0 } : absRect(parentId);
    const copy = node(fresh)!;
    if (copy.type === "Line") copy.props = shiftLineAll(copy.props ?? {}, offset - origin.x, offset - origin.y);
    else {
      copy.x = (copy.x ?? 0) + offset - origin.x;
      copy.y = (copy.y ?? 0) + offset - origin.y;
    }
    if (copy.type === "Dock" && parentId === project.scene.root && isPartitionedWindow(parent)) {
      parent.docks ??= [];
      if (index === undefined || index < 0) parent.docks.push(fresh);
      else parent.docks.splice(index, 0, fresh);
    } else {
      parent.children ??= [];
      if (index === undefined || index < 0) parent.children.push(fresh);
      else parent.children.splice(index, 0, fresh);
    }
    placed.push(fresh);
  }
  return placed;
}

/** 复制一份（Ctrl+D）：每个都放在原来那个的后面，往右下错开一点。 */
async function duplicateNodes(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const clip = copyNodes(ids);
  const placed = pasteClip(clip, (rootId) => {
    const parentId = parentOf(rootId) ?? project.scene.root;
    const siblings = childrenOf(node(parentId));
    return { parentId, index: siblings.indexOf(rootId) + 1 };
  }, PASTE_OFFSET);
  selectedIds = placed;
  selectedId = placed[placed.length - 1] ?? null;
  await saveScene();
}

async function duplicateNode(id: string): Promise<void> {
  await duplicateNodes([id]);
}

/** 粘贴到哪里：选中的是能装东西的节点，就放进它里面；否则和选中的东西放在同一层；什么都没选就放进窗口。 */
function pasteParent(): string {
  if (!selectedId) return project.scene.root;
  if (selectedIds.length === 1 && canHoldChildren(selectedId)) return selectedId;
  return parentOf(selectedId) ?? project.scene.root;
}

async function pasteNodes(clip: Clip): Promise<void> {
  pasteCount++;
  const parentId = pasteParent();
  const placed = pasteClip(clip, () => ({ parentId }), PASTE_OFFSET * pasteCount);
  selectedIds = placed;
  selectedId = placed[placed.length - 1] ?? null;
  await saveScene();
  toast(`已粘贴 ${placed.length} 个`);
}

function rememberClip(clip: Clip): void {
  clipMemory = clip;
  pasteCount = 0;
}

async function deleteNodes(ids: string[]): Promise<void> {
  const removed = new Set<string>();
  const collect = (target: string) => {
    removed.add(target);
    for (const child of childrenOf(node(target))) collect(child);
  };
  for (const id of ids) if (id !== project.scene.root) collect(id);
  if (removed.size === 0) return;
  // 挂在被删节点上的线：把那一头停在原地，不再挂着
  for (const [lineId, line] of Object.entries(project.scene.nodes)) {
    if (line.type !== "Line" || removed.has(lineId)) continue;
    const startGone = removed.has(str(line.props?.startNode));
    const endGone = removed.has(str(line.props?.endNode));
    if (!startGone && !endGone) continue;
    const layout = lineLayoutOf(lineId, designRuntime.view(lineId).props);
    const origin = parentOrigin(lineId);
    line.props = { ...line.props };
    if (startGone) writeAnchor(line.props, "start", { point: layout.start.point, node: null, side: "auto" }, origin);
    if (endGone) writeAnchor(line.props, "end", { point: layout.end.point, node: null, side: "auto" }, origin);
  }
  removeNodeReferences(project.scene, removed);
  for (const target of removed) delete project.scene.nodes[target];
  selectedId = null;
  selectedIds = [];
  await saveScene();
}

async function deleteNode(id: string): Promise<void> {
  await deleteNodes([id]);
}

/** 复制、剪切、粘贴走浏览器的剪贴板事件：内容是一段 JSON，可以贴到另一个设计项目里。 */
function canvasHasFocus(e: Event): boolean {
  const target = e.target;
  return mode === "edit" && !(target instanceof HTMLElement && (target.matches("input, textarea, select") || target.isContentEditable));
}

function copySelection(e: ClipboardEvent | null): boolean {
  const ids = topSelection();
  if (ids.length === 0) return false;
  const clip = copyNodes(ids);
  rememberClip(clip);
  e?.clipboardData?.setData("text/plain", JSON.stringify(clip));
  e?.preventDefault();
  return true;
}

document.addEventListener("copy", (e) => {
  if (!canvasHasFocus(e)) return;
  if (copySelection(e)) toast(`已复制 ${topSelection().length} 个`);
});

document.addEventListener("cut", (e) => {
  if (!canvasHasFocus(e)) return;
  const ids = topSelection();
  if (copySelection(e)) void deleteNodes(ids);
});

document.addEventListener("paste", (e) => {
  if (!canvasHasFocus(e)) return;
  const text = e.clipboardData?.getData("text/plain") ?? "";
  let clip: Clip | null = null;
  try {
    const parsed = JSON.parse(text) as Clip;
    if (parsed?.kind === "vibefrontend/nodes" && Array.isArray(parsed.roots) && parsed.nodes) clip = parsed;
  } catch {
    // 不是画布里复制出来的内容
  }
  if (!clip) return;
  e.preventDefault();
  // 换了一份内容，错开量从头算
  if (JSON.stringify(clip) !== JSON.stringify(clipMemory)) rememberClip(clip);
  void pasteNodes(clip);
});

async function reorder(id: string, toFront: boolean): Promise<void> {
  const parentId = parentOf(id);
  if (!parentId) return;
  const parent = node(parentId)!;
  if (parent.docks?.includes(id)) {
    const rest = parent.docks.filter((child) => child !== id);
    parent.docks = toFront ? [...rest, id] : [id, ...rest];
  } else if (parent.children?.includes(id)) {
    const rest = parent.children.filter((child) => child !== id);
    parent.children = toFront ? [...rest, id] : [id, ...rest];
  }
  await saveScene();
}

async function revertToContainer(id: string): Promise<void> {
  const n = node(id);
  if (!n) return;
  n.type = "Container";
  delete n.props;
  n.children ??= [];
  await saveScene();
}

async function renameId(oldId: string, nextId: string): Promise<void> {
  if (nextId === oldId) return;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(nextId)) return toast("ID 只能用字母、数字和下划线，且不能以数字开头");
  if (node(nextId) || project.logic.state?.[nextId] !== undefined || project.logic.conditions?.[nextId]) {
    return toast(`“${nextId}”已经被别的控件、状态或条件使用`);
  }
  const doc = parseDocument(project.logicText);
  if (doc.errors.length > 0) return toast("YAML 有语法错误，请先修正再重命名");

  // 逻辑：改条目的键名，再把表达式里“旧 ID.条件名”的引用一起改掉
  const objects = doc.get("objects");
  if (isMap(objects)) {
    for (const pair of objects.items) {
      const key = pair.key as { value?: unknown };
      if (key.value === oldId) key.value = nextId;
    }
  }
  const escaped = oldId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const logicText = doc.toString(YAML_OUTPUT).replace(new RegExp(`(?<![\\w.])${escaped}\\.(?=[A-Za-z_])`, "g"), `${nextId}.`);

  const scene = project.scene;
  scene.nodes[nextId] = scene.nodes[oldId];
  delete scene.nodes[oldId];
  renameNodeReferences(scene, oldId, nextId);
  selectedId = nextId;
  yamlDirty = false;
  await writeText(LOGIC_PATH, logicText);
  await saveScene();
}

async function createDocSection(id: string): Promise<void> {
  const name = sectionNameFor(id);
  const path = project.pageDoc;
  const current = project.docs.get(path) ?? `# ${project.name}\n`;
  if (getSection(current, name) === null) await writeText(path, appendSection(current, name, id));
  await editLogic((doc) => {
    ensureObject(doc, id);
    doc.setIn(["objects", id, "doc"], `${path}#${name}`);
  });
}

async function addCondition(id: string): Promise<void> {
  const existing = project.logic.objects?.[id]?.conditions ?? {};
  let name = "cond1";
  for (let i = 1; existing[name]; i++) name = `cond${i + 1}`;
  const ok = await editLogic((doc) => {
    ensureObject(doc, id);
    doc.setIn(["objects", id, "conditions", name], doc.createNode({ type: "text", text: "在这里写一句话", preview: false }));
  });
  if (ok) {
    showRightTab("yaml");
    scrollYamlTo(`${name}:`);
  }
}

/** 把一段引用放进剪贴板。 */
async function copyReference(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const helper = document.createElement("textarea");
    helper.value = text;
    document.body.append(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
  }
  toast("已复制引用，可以贴给 Agent");
}

// ---------- 右键菜单 ----------

function hideMenu(): void {
  $("menu").hidden = true;
}

type MenuItem = { label: string; action: () => void } | "separator";

function openMenu(x: number, y: number, items: MenuItem[]): void {
  const menu = $("menu");
  menu.innerHTML = "";
  menu.classList.remove("shape-menu");
  for (const item of items) {
    if (item === "separator") {
      menu.append(document.createElement("hr"));
      continue;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = item.label;
    button.addEventListener("click", () => {
      hideMenu();
      item.action();
    });
    menu.append(button);
  }
  menu.hidden = false;
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, window.innerWidth - rect.width - 8)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - rect.height - 8)}px`;
}

/** 控件的右键菜单，画布和图层共用。 */
/** 剪贴板相关的菜单项，单选和多选都有。 */
function clipboardItems(): MenuItem[] {
  const ids = topSelection();
  const items: MenuItem[] = [];
  if (ids.length > 0) {
    items.push(
      { label: "复制（Ctrl+C）", action: () => void (copySelection(null) && toast(`已复制 ${ids.length} 个`)) },
      { label: "剪切（Ctrl+X）", action: () => void (copySelection(null) && deleteNodes(ids)) },
    );
  }
  if (clipMemory) items.push({ label: "粘贴（Ctrl+V）", action: () => void pasteNodes(clipMemory!) });
  return items;
}

function showMenu(x: number, y: number, id: string): void {
  // 多选时的菜单：只放对整组都有意义的操作
  if (selectedIds.length > 1 && selectedIds.includes(id)) {
    const ids = topSelection();
    openMenu(x, y, [
      ...clipboardItems(),
      "separator",
      { label: "复制一份（Ctrl+D）", action: () => void duplicateNodes(ids) },
      { label: `删除这 ${ids.length} 个`, action: () => void deleteNodes(ids) },
    ]);
    return;
  }
  const items: MenuItem[] = [{ label: "复制引用", action: () => void copyReference(controlReference(project, id)) }];
  if (id !== project.scene.root) {
    items.push(
      "separator",
      { label: "打开说明", action: () => showRightTab("doc") },
      { label: "编辑逻辑", action: () => showRightTab("yaml") },
      { label: "添加条件", action: () => void addCondition(id) },
      "separator",
    );
    if (isGraphic(id)) {
      items.push(
        { label: node(id)?.type === "Line" ? "编辑文字" : "编辑文字（双击）", action: () => openTextEditor(id) },
        { label: "存为预设", action: () => void saveAsPreset(id) },
      );
    } else if (node(id)?.type !== "Container") {
      items.push({ label: "还原为容器", action: () => void revertToContainer(id) });
    }
    if (node(id)?.type === "Shape") items.push({ label: "快速新建并连线（Ctrl+Enter）", action: () => void quickCreate(id) });
    items.push(...clipboardItems());
    items.push(
      { label: "复制一份（Ctrl+D）", action: () => void duplicateNode(id) },
      { label: "置于顶层", action: () => void reorder(id, true) },
      { label: "置于底层", action: () => void reorder(id, false) },
      { label: "删除", action: () => void deleteNode(id) },
    );
  }
  openMenu(x, y, items);
}

document.addEventListener("pointerdown", (e) => {
  if (!(e.target as Element).closest("#menu")) hideMenu();
});

// ---------- 画图工具栏 ----------

/** 图层、选中框上显示的类型名：形状显示它是哪种形状。 */
function typeLabel(id: string): string {
  const n = node(id);
  if (!n) return "";
  if (n.type === "Shape") return shapeKind(str(n.props?.shape, "rectangle")).label;
  if (n.type === "Line") return "线条";
  return n.type;
}

function toolButton(label: string, title: string, active: boolean, onClick: () => void, icon?: Element): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tool";
  button.title = title;
  button.setAttribute("aria-pressed", String(active));
  if (icon) button.append(icon);
  if (label) button.append(document.createTextNode(label));
  button.addEventListener("click", onClick);
  return button;
}

/**
 * 缩放控件旁边的一组按钮：吸附开关、网格、撤销和重做。只在编辑模式下出现。
 * 画图形、画线的工具在左侧素材栏里（点一下选为工具，或者直接拖进来），快捷键 V、R、O、L、Shift+L、X、T 照样能用。
 */
function renderToolbar(): void {
  const bar = $("tool-bar");
  bar.hidden = mode !== "edit";
  markActivePreset();
  if (mode !== "edit") return;
  const snap = toolButton("吸附", "移动、缩放、画图时吸附到其他东西的边和中线，以及等间距的位置。按住 Ctrl 临时关闭", snapSettings.objects, () => {
    snapSettings.objects = !snapSettings.objects;
    saveSetting("vf.snap", snapSettings);
    renderToolbar();
  });
  const grid = document.createElement("select");
  grid.className = "tool-select";
  grid.title = "吸附到网格";
  for (const [value, label] of [[0, "网格：关"], [4, "网格 4"], [8, "网格 8"], [10, "网格 10"], [16, "网格 16"]] as const) {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = label;
    option.selected = snapSettings.grid === value;
    grid.append(option);
  }
  grid.addEventListener("change", () => {
    snapSettings.grid = Number(grid.value);
    saveSetting("vf.snap", snapSettings);
    $("stage").style.setProperty("--grid", snapSettings.grid ? `${snapSettings.grid}px` : "0");
    $("stage").classList.toggle("show-grid", snapSettings.grid > 0);
  });
  const separator = document.createElement("span");
  separator.className = "tool-sep";
  bar.replaceChildren(
    snap,
    grid,
    separator,
    toolButton("↶", "撤销画布操作（Ctrl+Z）", false, () => void undo()),
    toolButton("↷", "重做（Ctrl+Shift+Z）", false, () => void redo()),
  );
  $("stage").style.setProperty("--grid", snapSettings.grid ? `${snapSettings.grid}px` : "0");
  $("stage").classList.toggle("show-grid", snapSettings.grid > 0);
}

/** 当前选为画图工具的那个预设，在素材栏里标出来。 */
function markActivePreset(): void {
  const current = tool.kind === "preset" ? tool.preset.id : null;
  for (const tile of document.querySelectorAll<HTMLElement>(".preset-tile")) {
    tile.classList.toggle("active", tile.dataset.preset === current);
  }
  const currentType = tool.kind === "node" ? tool.type : null;
  for (const item of document.querySelectorAll<HTMLElement>(".palette-item")) {
    item.classList.toggle("active", item.dataset.type === currentType);
  }
}

// ---------- 样式条：选中形状或线条时浮在它上方 ----------

const shapeBar = document.createElement("div");
shapeBar.id = "shape-bar";
shapeBar.hidden = true;
shapeBar.addEventListener("pointerdown", (e) => e.stopPropagation());
$("stage-frame").append(shapeBar);
onZoomChange(() => positionShapeBar());

/** 改形状或线条的属性并保存；样式类的改动记下来，下次新画的沿用。 */
async function setGraphicProps(id: string, patch: Record<string, Value | undefined>): Promise<void> {
  const n = node(id);
  if (!n) return;
  // 多选时，改动作用到选中的同一类图形上
  const targets = selectedIds.includes(id) ? selectedIds.filter((each) => node(each)?.type === n.type) : [id];
  for (const target of targets) {
    const t = node(target)!;
    t.props = { ...t.props };
    // 换了线的走法，手动调整过的拐点就不再适用
    if (patch.route !== undefined && patch.route !== t.props.route) delete t.props.bends;
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete t.props[key];
      else t.props[key] = value;
    }
  }
  const keys = n.type === "Shape" ? SHAPE_STYLE_KEYS : LINE_STYLE_KEYS;
  const remembered = n.type === "Shape" ? lastShapeStyle : lastLineStyle;
  for (const [key, value] of Object.entries(patch)) {
    if (keys.includes(key) && value !== undefined) remembered[key] = value;
  }
  if (n.type === "Shape") {
    lastShapeStyle = remembered;
    saveSetting("vf.lastShapeStyle", lastShapeStyle);
  } else {
    lastLineStyle = remembered;
    saveSetting("vf.lastLineStyle", lastLineStyle);
  }
  await saveScene();
}

function barSelect(title: string, options: Array<{ value: string; label: string }>, current: string, onChange: (value: string) => void): HTMLSelectElement {
  const select = document.createElement("select");
  select.title = title;
  for (const option of options) {
    const el = document.createElement("option");
    el.value = option.value;
    el.textContent = option.label;
    el.selected = option.value === current;
    select.append(el);
  }
  select.addEventListener("change", () => onChange(select.value));
  return select;
}

function barNumber(title: string, value: number, min: number, max: number, step: number, onChange: (value: number) => void): HTMLLabelElement {
  const label = document.createElement("label");
  label.className = "bar-number";
  label.textContent = title;
  const input = document.createElement("input");
  input.type = "number";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.addEventListener("change", () => {
    const next = Number(input.value);
    if (Number.isFinite(next)) onChange(Math.max(min, Math.min(max, next)));
  });
  label.append(input);
  return label;
}

function barColor(title: string, value: string, onChange: (value: string) => void): HTMLLabelElement {
  const label = document.createElement("label");
  label.className = "bar-color";
  label.title = title;
  const input = document.createElement("input");
  input.type = "color";
  input.value = /^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff";
  input.addEventListener("change", () => onChange(input.value));
  label.append(input);
  return label;
}

function barButton(label: string, title: string, onClick: () => void, pressed?: boolean): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.title = title;
  if (pressed !== undefined) button.setAttribute("aria-pressed", String(pressed));
  button.addEventListener("click", onClick);
  return button;
}

/** 配色色板：形状一次换填充、描边和文字三种颜色；线条只换线的颜色。 */
function swatches(id: string, isLine: boolean, props: Record<string, Value>): HTMLElement {
  const row = document.createElement("div");
  row.className = "swatches";
  for (const style of COLOR_STYLES) {
    if (isLine && (style.id === "white" || style.id === "outline")) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.title = style.label;
    button.className = "swatch";
    button.style.background = isLine ? style.stroke : style.fill === "none" ? "#ffffff" : style.fill;
    button.style.borderColor = style.stroke;
    if (style.fill === "none" && !isLine) button.classList.add("hollow");
    const active = isLine ? props.stroke === style.stroke : props.fill === style.fill && props.stroke === style.stroke;
    button.classList.toggle("active", active);
    button.addEventListener("click", () =>
      void setGraphicProps(id, isLine ? { stroke: style.stroke, textColor: style.stroke } : { fill: style.fill, stroke: style.stroke, textColor: style.textColor }),
    );
    row.append(button);
  }
  return row;
}

/** 颜色按钮：显示当前的颜色，点开是色板和自定义颜色。 */
let colorPopoverOpen = false;
function colorButton(color: string, ring: string, contents: HTMLElement[]): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "color-wrap";
  const button = document.createElement("button");
  button.type = "button";
  button.title = "颜色";
  button.className = "color-button";
  const dot = document.createElement("span");
  dot.className = "swatch";
  dot.style.background = color === "none" ? "#ffffff" : color;
  dot.style.borderColor = ring === "none" ? "#c4c9d2" : ring;
  button.append(dot, document.createTextNode("颜色 ▾"));
  const pop = document.createElement("div");
  pop.className = "color-pop";
  pop.hidden = !colorPopoverOpen;
  pop.append(...contents);
  button.addEventListener("click", () => {
    colorPopoverOpen = !colorPopoverOpen;
    pop.hidden = !colorPopoverOpen;
  });
  wrap.append(button, pop);
  return wrap;
}

/** 按当前选中的形状或线条重建样式条的内容。 */
function renderShapeBar(): void {
  const id = selectedId;
  const n = id ? node(id) : undefined;
  // 多选时，只有选中的全是同一类图形（全是形状，或者全是线条）才显示
  const sameKind = selectedIds.every((each) => node(each)?.type === n?.type);
  if (mode !== "edit" || !id || !n || !isGraphic(id) || !sameKind) {
    shapeBar.hidden = true;
    return;
  }
  const props = designRuntime.view(id).props;
  const items: HTMLElement[] = [];
  const strokeOptions = [...STROKE_STYLES.map((s) => ({ value: s.id, label: s.label })), ...(n.type === "Shape" ? [{ value: "none", label: "无描边" }] : [])];
  const strokeValue = n.type === "Shape" && props.stroke === "none" ? "none" : str(props.strokeStyle, "solid");
  const onStroke = (value: string) => {
    if (value === "none") void setGraphicProps(id, { stroke: "none" });
    else void setGraphicProps(id, { strokeStyle: value, ...(props.stroke === "none" ? { stroke: "#1f2430" } : {}) });
  };
  const widthSelect = barSelect("线宽", STROKE_WIDTHS.map((w) => ({ value: String(w.value), label: `线宽 ${w.label}` })), String(num(props.strokeWidth, 2)), (value) => void setGraphicProps(id, { strokeWidth: Number(value) }));
  const fontSelect = barSelect("字号", FONT_SIZES.map((f) => ({ value: String(f.value), label: `字 ${f.label}` })), String(num(props.fontSize, n.type === "Line" ? 12 : 14)), (value) => void setGraphicProps(id, { fontSize: Number(value) }));

  if (n.type === "Shape") {
    const kind = str(props.shape, "rectangle");
    items.push(
      barSelect("换成别的形状", SHAPE_KINDS.map((k) => ({ value: k.id, label: k.label })), kind, (value) => void setGraphicProps(id, { shape: value })),
      colorButton(str(props.fill, "#ffffff"), str(props.stroke, "#1f2430"), [
        swatches(id, false, props),
        barColor("自定义填充色", str(props.fill, "#ffffff"), (value) => void setGraphicProps(id, { fill: value })),
        barColor("自定义描边色", str(props.stroke, "#1f2430"), (value) => void setGraphicProps(id, { stroke: value })),
        barColor("自定义文字颜色", str(props.textColor, "#1f2430"), (value) => void setGraphicProps(id, { textColor: value })),
      ]),
      barSelect("描边", strokeOptions, strokeValue, onStroke),
      widthSelect,
    );
    if (kind === "rectangle") items.push(barNumber("圆角", num(props.radius, 0), 0, 999, 1, (value) => void setGraphicProps(id, { radius: value })));
    if (kind === "polygon") items.push(barNumber("边数", num(props.sides, 5), 3, 60, 1, (value) => void setGraphicProps(id, { sides: value })));
    if (kind === "star") {
      items.push(
        barNumber("角数", num(props.points, 5), 3, 60, 1, (value) => void setGraphicProps(id, { points: value })),
        barNumber("内径", num(props.ratio, 0.45), 0.05, 1, 0.05, (value) => void setGraphicProps(id, { ratio: value })),
      );
    }
    items.push(
      fontSelect,
      barSelect("文字对齐", [{ value: "left", label: "左对齐" }, { value: "center", label: "居中" }, { value: "right", label: "右对齐" }], str(props.textAlign, "center"), (value) => void setGraphicProps(id, { textAlign: value })),
      barButton("B", "粗体", () => void setGraphicProps(id, { fontWeight: props.fontWeight === "bold" ? "normal" : "bold" }), props.fontWeight === "bold"),
    );
  } else {
    items.push(
      barSelect("路径", ROUTES.map((r) => ({ value: r.id, label: r.label })), str(props.route, "straight"), (value) => void setGraphicProps(id, { route: value })),
      barSelect("起点端头", CAPS.map((c) => ({ value: c.id, label: `起点：${c.label}` })), str(props.startCap, "none"), (value) => void setGraphicProps(id, { startCap: value })),
      barSelect("终点端头", CAPS.map((c) => ({ value: c.id, label: `终点：${c.label}` })), str(props.endCap, "none"), (value) => void setGraphicProps(id, { endCap: value })),
      barButton("⇄", "交换起点和终点", () => void reverseLine(id)),
      colorButton(str(props.stroke, "#1f2430"), str(props.stroke, "#1f2430"), [
        swatches(id, true, props),
        barColor("自定义颜色", str(props.stroke, "#1f2430"), (value) => void setGraphicProps(id, { stroke: value })),
      ]),
      barSelect("线型", strokeOptions, strokeValue, onStroke),
      widthSelect,
      fontSelect,
    );
  }
  if (n.type === "Line" && props.route === "elbow" && parseBends(props.bends).length > 0) {
    items.push(barButton("重置折线", "去掉手动调整过的拐点，回到自动算出的走法", () => void setGraphicProps(id, { bends: undefined })));
  }
  items.push(barButton("文字", n.type === "Line" ? "给线加文字（双击线也可以）" : "编辑文字（双击形状也可以）", () => openTextEditor(id)));
  items.push(barButton("存为预设", "把这个样式存进素材栏的“我的预设”，存在 ui/presets.json", () => void saveAsPreset(id)));
  shapeBar.replaceChildren(...items);
  shapeBar.hidden = false;
  positionShapeBar();
}

/** 样式条放在选中的东西上方；上方放不下就放到下方。 */
function positionShapeBar(): void {
  if (shapeBar.hidden || !selectedId || !node(selectedId) || gesture) {
    shapeBar.style.visibility = gesture ? "hidden" : "";
    return;
  }
  shapeBar.style.visibility = "";
  const stage = $("stage");
  const r = selectedIds.length > 1 ? unionRect(topSelection())! : absRect(selectedId);
  // 样式条放在设计窗口里，会跟着视角一起缩放；反过来缩回去，让它在屏幕上始终是原来的大小
  const zoom = viewZoom();
  shapeBar.style.transform = zoom === 1 ? "" : `scale(${1 / zoom})`;
  shapeBar.style.transformOrigin = "0 0";
  const barHeight = (shapeBar.offsetHeight || 34) / zoom;
  const gap = 12 / zoom;
  let top = stage.offsetTop + r.y - barHeight - gap;
  if (top < 0) top = stage.offsetTop + r.y + r.height + gap;
  shapeBar.style.top = `${top}px`;
  shapeBar.style.left = `${Math.max(0, stage.offsetLeft + r.x)}px`;
}

/** 交换线的起点和终点（端头跟着位置走，所以箭头方向反过来）。 */
async function reverseLine(id: string): Promise<void> {
  const n = node(id);
  if (!n || n.type !== "Line") return;
  const p = { ...n.props };
  const swap: Array<[string, string]> = [["x1", "x2"], ["y1", "y2"], ["startNode", "endNode"], ["startSide", "endSide"]];
  for (const [a, b] of swap) {
    const va = p[a];
    const vb = p[b];
    if (vb === undefined) delete p[a];
    else p[a] = vb;
    if (va === undefined) delete p[b];
    else p[b] = va;
  }
  n.props = p;
  await saveScene();
}

// ---------- 用户的预设 ----------

async function writePresets(presets: ShapePreset[]): Promise<void> {
  await writeText(PRESETS_PATH, JSON.stringify({ version: 1, presets }, null, 2) + "\n");
  await reload();
}

/** 把选中的形状或线条的样式存成预设，出现在素材栏“我的预设”里。 */
async function saveAsPreset(id: string): Promise<void> {
  const n = node(id);
  if (!n || !isGraphic(id)) return;
  const props: Record<string, Value> = {};
  const keys = n.type === "Shape" ? ["shape", ...SHAPE_STYLE_KEYS] : LINE_STYLE_KEYS;
  for (const key of keys) {
    if (n.props?.[key] !== undefined) props[key] = n.props[key];
  }
  const color = COLOR_STYLES.find((style) => (n.type === "Line" ? style.stroke === props.stroke : style.fill === props.fill && style.stroke === props.stroke));
  const base = n.type === "Shape" ? typeLabel(id) : ROUTES.find((r) => r.id === str(props.route, "straight"))?.label ?? "线条";
  let label = color ? `${base} · ${color.label}` : base;
  const taken = new Set(project.presets.map((preset) => preset.label));
  for (let i = 2; taken.has(label); i++) label = `${color ? `${base} · ${color.label}` : base} ${i}`;
  const preset: ShapePreset = {
    id: `user-${Date.now().toString(36)}`,
    label,
    group: "我的预设",
    type: n.type === "Shape" ? "Shape" : "Line",
    idBase: n.type === "Shape" ? idBaseOf(id) : "line",
    width: n.type === "Shape" ? n.width : 160,
    height: n.type === "Shape" ? n.height : 0,
    props,
  };
  await writePresets([...project.presets, preset]);
  toast(`已存为预设“${label}”`);
}

async function deletePreset(presetId: string): Promise<void> {
  await writePresets(project.presets.filter((preset) => preset.id !== presetId));
}

/** 从素材栏拖一个预设到设计窗口里；只点一下不拖，就把它选为当前的画图工具。 */
function startPresetDrag(down: PointerEvent, preset: ShapePreset): void {
  if (down.button !== 0) return;
  if (mode !== "edit") setMode("edit");
  down.preventDefault();
  const size = { width: preset.type === "Line" ? preset.width : preset.width, height: preset.type === "Line" ? 24 : preset.height };
  const floating = document.createElement("div");
  floating.id = "drag-ghost";
  floating.style.width = `${size.width}px`;
  floating.style.height = `${size.height}px`;
  let moved = false;
  const place = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) > 4) moved = true;
    floating.style.left = `${e.clientX - size.width / 2}px`;
    floating.style.top = `${e.clientY - size.height / 2}px`;
    floating.style.display = moved ? "" : "none";
  };
  place(down);
  document.body.append(floating);
  const up = (e: PointerEvent) => {
    document.removeEventListener("pointermove", place);
    document.removeEventListener("pointerup", up);
    floating.remove();
    if (!moved) {
      setTool({ kind: "preset", preset });
      return;
    }
    const rect = $("stage").getBoundingClientRect();
    const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!inside) return;
    const px = (e.clientX - rect.left) / viewZoom();
    const py = (e.clientY - rect.top) / viewZoom();
    void createFromPreset(preset, { x: px - preset.width / 2, y: py - (preset.type === "Line" ? 0 : preset.height / 2), width: preset.width, height: preset.height }, containerAt(px, py));
  };
  document.addEventListener("pointermove", place);
  document.addEventListener("pointerup", up);
}

function presetTile(preset: ShapePreset, userPreset: boolean): HTMLElement {
  const tile = document.createElement("button");
  tile.type = "button";
  tile.className = "preset-tile";
  tile.dataset.preset = preset.id;
  tile.title = `${preset.label}\n拖进设计窗口；或者点一下，再在设计窗口里拖出来`;
  tile.append(presetIcon(preset, 26));
  tile.addEventListener("pointerdown", (e) => startPresetDrag(e, preset));
  if (userPreset) {
    tile.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      openMenu(e.clientX, e.clientY, [{ label: `删除预设“${preset.label}”`, action: () => void deletePreset(preset.id) }]);
    });
  }
  return tile;
}

function renderShapePalette(): void {
  $("palette-shapes").replaceChildren(...SHAPE_PRESETS.filter((p) => p.group === "基础图形").map((p) => presetTile(p, false)));
  $("palette-flow").replaceChildren(...SHAPE_PRESETS.filter((p) => p.group === "流程图").map((p) => presetTile(p, false)));
  $("palette-lines").replaceChildren(...SHAPE_PRESETS.filter((p) => p.group === "线条").map((p) => presetTile(p, false)));
  const user = project.presets.map((p) => presetTile(p, true));
  if (user.length === 0) {
    const empty = document.createElement("div");
    empty.className = "palette-empty";
    empty.textContent = "选中一个形状，在它上方的样式条里点“存为预设”";
    user.push(empty);
  }
  $("palette-user").replaceChildren(...user);
  markActivePreset();
}

// ---------- 素材栏与图层 ----------

function renderPalette(): void {
  const make = (type: string, label: string, title: string) => {
    const el = document.createElement("div");
    el.className = "palette-item";
    el.dataset.type = type;
    el.textContent = label;
    el.title = `${title}${title ? "\n" : ""}拖进设计窗口；或者点一下，再在设计窗口里拖出大小`;
    el.addEventListener("pointerdown", (e) => startPaletteDrag(e, type));
    if (!BUILTIN_TYPES.includes(type)) {
      el.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        openMenu(e.clientX, e.clientY, [
          { label: "复制引用", action: () => void copyReference(componentReference(project, type)) },
        ]);
      });
    }
    return el;
  };
  $("palette-basic").replaceChildren(
    make("Container", "□ 容器", "拖进设计窗口，再交给 Agent 做成具体控件"),
    make("External", "⧉ 外部容器", EXTERNAL_DECL.description ?? ""),
    make("VBox", "▤ 竖排布局", "子控件从上往下排列"),
    make("HBox", "▥ 横排布局", "子控件从左往右排列"),
    make("Grid", "⊞ 网格布局", "子控件按行列网格排列"),
    make("Form", "☰ 表单布局", "左列标签、右列控件的表单排列"),
    make("Stack", "❐ 层叠布局", "多个页面叠放，按 currentIndex 切换"),
    make("Dock", "◧ 停靠面板", "停靠在主窗口四侧的面板"),
    make("Dialog", "🗔 对话框", "弹出窗口或模态对话框"),
  );
  const stdItems = [...STANDARD_COMPONENTS.values()].map((component) =>
    make(component.decl.type, `${component.decl.label ?? component.decl.type}（标准）`, component.decl.description ?? ""),
  );
  const projectItems = [...project.components.values()]
    .filter((component) => !component.error)
    .map((component) => make(component.decl.type, component.decl.label ?? component.decl.type, component.decl.description ?? ""));
  const items = [...stdItems, ...projectItems];
  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "palette-empty";
    empty.textContent = "Agent 做好的控件会出现在这里";
    items.push(empty);
  }
  $("palette-project").replaceChildren(...items);
  renderShapePalette();
  void renderLibraryPalette();
}

function startPaletteDrag(down: PointerEvent, type: string): void {
  if (down.button !== 0) return;
  if (mode !== "edit") return toast("预览模式下不能添加控件，请先切回编辑模式");
  down.preventDefault();
  const size = (declFor(project, type) ?? CONTAINER_DECL).defaultSize ?? CONTAINER_DECL.defaultSize!;
  const ghost = document.createElement("div");
  ghost.id = "drag-ghost";
  ghost.style.width = `${size.width}px`;
  ghost.style.height = `${size.height}px`;
  const place = (e: PointerEvent) => {
    ghost.style.left = `${e.clientX - size.width / 2}px`;
    ghost.style.top = `${e.clientY - size.height / 2}px`;
  };
  place(down);
  document.body.append(ghost);
  const up = (e: PointerEvent) => {
    document.removeEventListener("pointermove", place);
    document.removeEventListener("pointerup", up);
    ghost.remove();
    // 只点了一下没有拖：把它选为工具，再在设计窗口里拖出大小
    if (Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) <= 4) {
      setTool(tool.kind === "node" && tool.type === type ? { kind: "select" } : { kind: "node", type });
      return;
    }
    const rect = $("stage").getBoundingClientRect();
    const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (inside) void addNode(type, (e.clientX - rect.left) / viewZoom(), (e.clientY - rect.top) / viewZoom());
  };
  document.addEventListener("pointermove", place);
  document.addEventListener("pointerup", up);
}

function renderLayers(): void {
  const rows: HTMLElement[] = [];
  const visit = (id: string, depth: number) => {
    const n = node(id);
    if (!n) return;
    const row = document.createElement("div");
    row.className = "layer" + (id === selectedId || selectedIds.includes(id) ? " selected" : "");
    row.style.paddingLeft = `${6 + depth * 14}px`;
    const name = document.createElement("span");
    name.textContent = id;
    const type = document.createElement("span");
    type.className = "type";
    type.textContent = typeLabel(id);
    row.append(name, type);
    const effectName = project.logic.objects?.[id]?.effects?.visible;
    if (effectName) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "需翻译";
      badge.title = `显示和隐藏时播放效果 ${effectName}；导出成 Qt 后要在界面效果层为它提供实现`;
      row.append(badge);
    }
    // 按住 Shift 或 Ctrl 点：多选
    row.addEventListener("click", (e) => select(id, e.shiftKey || e.ctrlKey || e.metaKey));
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (!selectedIds.includes(id)) select(id);
      showMenu(e.clientX, e.clientY, id);
    });
    rows.push(row);
    // 列表里越靠上的在画面里越靠前
    for (const child of [...childrenOf(n)].reverse()) visit(child, depth + 1);
  };
  for (const winId of allWindowIds(project.scene)) visit(winId, 0);
  $("layers").replaceChildren(...rows);
}


function syncSelection(): void {
  const root = project.scene.root;
  if (selectedId && !node(selectedId)) selectedId = null;
  selectedIds = selectedIds.filter((id) => node(id) && id !== root);
  if (!selectedId || selectedId === root) {
    selectedIds = [];
    if (selectedId === root) return;
  } else if (!selectedIds.includes(selectedId)) {
    selectedIds = [selectedId];
  }
}

/** 选中的东西里，祖先没有被选中的那些：整体移动、复制、删除时只处理它们。 */
function topSelection(): string[] {
  const chosen = new Set(selectedIds);
  return selectedIds.filter((id) => {
    for (let p = parentOf(id); p; p = parentOf(p)) if (chosen.has(p)) return false;
    return true;
  });
}

function afterSelectionChange(): void {
  applyViews();
  renderLayers();
  renderRight();
  renderShapeBar();
  updateSelectionBox();
  if (selectedId) scrollYamlTo(`  ${selectedId}:`);
}

/** 选中一个。additive 为真（按住 Shift 点）时，加进选择；已经选中的就去掉。 */
function select(id: string | null, additive = false): void {
  flushEditors();
  if (additive && id && id !== project.scene.root) {
    selectedIds = selectedIds.includes(id) ? selectedIds.filter((each) => each !== id) : [...selectedIds, id];
    selectedId = selectedIds[selectedIds.length - 1] ?? null;
  } else {
    if (id === selectedId && selectedIds.length <= 1) return;
    selectedId = id;
    selectedIds = id && id !== project.scene.root ? [id] : [];
  }
  afterSelectionChange();
}

function setSelection(ids: string[]): void {
  flushEditors();
  selectedIds = ids.filter((id) => node(id) && id !== project.scene.root);
  selectedId = selectedIds[selectedIds.length - 1] ?? null;
  afterSelectionChange();
}

// ---------- 右侧：文档与 YAML ----------

const docText = $<HTMLTextAreaElement>("doc-text");
const yamlText = $<HTMLTextAreaElement>("yaml-text");
let docDirty = false;
let yamlDirty = false;
/** 文档页签当前编辑的是哪份文件的哪个小节；section 为 null 表示整份文件 */
let docTarget: { path: string; section: string | null } | null = null;
let docTimer: number | undefined;
let yamlTimer: number | undefined;

function showRightTab(tab: "doc" | "yaml"): void {
  $("tab-doc").setAttribute("aria-selected", String(tab === "doc"));
  $("tab-yaml").setAttribute("aria-selected", String(tab === "yaml"));
  $("pane-doc").hidden = tab !== "doc";
  $("pane-yaml").hidden = tab !== "yaml";
  if (tab === "yaml" && selectedId) scrollYamlTo(`  ${selectedId}:`);
}

function noteWithButton(note: HTMLElement, text: string, label?: string, action?: () => void): void {
  note.replaceChildren(document.createTextNode(text));
  if (label && action) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", action);
    note.append(button);
  }
}

function setTextarea(area: HTMLTextAreaElement, value: string, enabled = true): void {
  if (area.value !== value) area.value = value;
  area.disabled = !enabled;
}

function renderRight(): void {
  const idInput = $<HTMLInputElement>("selection-id");
  const n = selectedId ? node(selectedId) : undefined;
  idInput.value = selectedId ?? "未选中控件";
  idInput.disabled = !selectedId;
  $("selection-type").textContent = n ? n.type : "";

  // 文档页签
  if (!docDirty) {
    const object = selectedId ? project.logic.objects?.[selectedId] : undefined;
    if (!selectedId) {
      docTarget = { path: project.pageDoc, section: null };
      noteWithButton($("doc-note"), `整份页面文档 ${project.pageDoc}`);
      setTextarea(docText, project.docs.get(project.pageDoc) ?? "");
    } else {
      const ref = object?.doc ? parseDocRef(object.doc) : null;
      const file = ref ? project.docs.get(ref.path) : undefined;
      const section = ref?.section && file !== undefined ? getSection(file, ref.section) : null;
      if (ref && file !== undefined && (ref.section === null || section !== null)) {
        docTarget = ref;
        const shared = Object.entries(project.logic.objects ?? {})
          .filter(([other, o]) => other !== selectedId && o?.doc === object!.doc)
          .map(([other]) => other);
        noteWithButton($("doc-note"), `${object!.doc}${shared.length ? `　也被 ${shared.join("、")} 引用` : ""}`);
        setTextarea(docText, ref.section === null ? file : section!);
      } else {
        docTarget = null;
        const id = selectedId;
        noteWithButton($("doc-note"), "这个控件还没有说明。", "创建说明", () => void createDocSection(id));
        setTextarea(docText, "", false);
      }
    }
  }

  // YAML 页签
  if (!yamlDirty) {
    setTextarea(yamlText, project.logicText);
    if (selectedId && !project.logic.objects?.[selectedId]) {
      const id = selectedId;
      noteWithButton($("yaml-note"), "这个控件还没有逻辑条目。", "添加逻辑条目", () => {
        void editLogic((doc) => ensureObject(doc, id)).then(() => scrollYamlTo(`  ${id}:`));
      });
    } else {
      noteWithButton($("yaml-note"), LOGIC_PATH);
    }
  }
  syncDocView();
}

/** 把 YAML 编辑器滚动到以 prefix 开头的那一行。 */
function scrollYamlTo(prefix: string): void {
  const lines = yamlText.value.split("\n");
  const index = lines.findIndex((line) => line.startsWith(prefix) || line.trim().startsWith(prefix.trim()));
  if (index < 0) return;
  yamlText.scrollTop = Math.max(0, index - 2) * 18;
}

async function saveDoc(): Promise<void> {
  window.clearTimeout(docTimer);
  if (!docDirty || !docTarget) return;
  const { path, section } = docTarget;
  const current = project.docs.get(path) ?? "";
  docDirty = false;
  await writeText(path, section === null ? docText.value : replaceSection(current, section, docText.value));
  await reload();
}

async function saveYaml(): Promise<void> {
  window.clearTimeout(yamlTimer);
  if (!yamlDirty) return;
  yamlDirty = false;
  await writeText(LOGIC_PATH, yamlText.value);
  await reload();
}

/** 切换选中对象之前，把还没保存的编辑先写入文件。 */
function flushEditors(): void {
  void saveDoc();
  void saveYaml();
}

docText.addEventListener("input", () => {
  docDirty = true;
  window.clearTimeout(docTimer);
  docTimer = window.setTimeout(() => void saveDoc(), 600);
});
docText.addEventListener("blur", () => void saveDoc());
yamlText.addEventListener("input", () => {
  yamlDirty = true;
  window.clearTimeout(yamlTimer);
  yamlTimer = window.setTimeout(() => void saveYaml(), 600);
});
yamlText.addEventListener("blur", () => void saveYaml());
// 在 YAML 中按 Tab 输入两个空格，而不是把焦点移走
yamlText.addEventListener("keydown", (e) => {
  if (e.key !== "Tab") return;
  e.preventDefault();
  yamlText.setRangeText("  ", yamlText.selectionStart, yamlText.selectionEnd, "end");
  yamlText.dispatchEvent(new Event("input"));
});

// “引用”：选中的控件；没有选中控件时引用整个项目
$("selection-quote").addEventListener("click", () => {
  void copyReference(selectedId ? controlReference(project, selectedId) : projectReference(project));
});

// 文档页签的“引用所选”：选中了文字就引用那几行，否则引用当前显示的整个小节或整份文档
$("doc-quote").addEventListener("click", async () => {
  if (!docTarget) return toast("这个控件还没有说明，先点“创建说明”");
  syncPreviewSelectionToTextarea();
  const selStart = docText.selectionStart;
  const selEnd = docText.selectionEnd;
  const textSnapshot = docText.value;
  await saveDoc();
  const { path, section } = docTarget;
  const file = project.docs.get(path) ?? "";
  const offsets = section ? sectionOffsets(file, section) : null;
  const context: [string, string] | undefined = section ? ["section", section] : undefined;
  if (selStart !== selEnd) {
    const firstLine = offsets ? lineAt(file, offsets.contentStart) : 1;
    const range = selectionRange(textSnapshot, selStart, selEnd, firstLine);
    void copyReference(linesReference(project, path, range, context));
  } else if (section) {
    const range = docSectionRange(file, section);
    void copyReference(range ? linesReference(project, path, range, context) : fileReference(project, path));
  } else {
    void copyReference(fileReference(project, path));
  }
});

// YAML 页签的“引用所选”：选中了文字就引用那几行；否则引用当前控件的条目，再否则引用光标所在的条目
$("yaml-quote").addEventListener("click", async () => {
  await saveYaml();
  const text = project.logicText;
  const { selectionStart, selectionEnd } = yamlText;
  if (selectionStart !== selectionEnd) {
    const range = selectionRange(yamlText.value, selectionStart, selectionEnd);
    const path = logicPathAt(text, range.start);
    return void copyReference(linesReference(project, LOGIC_PATH, range, path ? ["entry", path.join(".")] : undefined));
  }
  const selectedPath = selectedId ? ["objects", selectedId] : null;
  const path =
    selectedPath && logicEntryRange(text, selectedPath)
      ? selectedPath
      : logicPathAt(text, selectionRange(yamlText.value, selectionStart, selectionStart).start);
  const range = path ? logicEntryRange(text, path) : null;
  void copyReference(
    range ? linesReference(project, LOGIC_PATH, range, ["entry", path!.join(".")]) : fileReference(project, LOGIC_PATH),
  );
});

$("tab-doc").addEventListener("click", () => showRightTab("doc"));
$("tab-yaml").addEventListener("click", () => showRightTab("yaml"));

const idInput = $<HTMLInputElement>("selection-id");
idInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") idInput.blur();
  if (e.key === "Escape") {
    idInput.value = selectedId ?? "";
    idInput.blur();
  }
});
idInput.addEventListener("change", () => {
  if (selectedId) void renameId(selectedId, idInput.value.trim()).then(renderRight);
});

// ---------- 底部：问题与事件记录 ----------

function showBottomTab(tab: "problems" | "log"): void {
  $("tab-problems").setAttribute("aria-selected", String(tab === "problems"));
  $("tab-log").setAttribute("aria-selected", String(tab === "log"));
  $("problems").hidden = tab !== "problems";
  $("log").hidden = tab !== "log";
}
$("tab-problems").addEventListener("click", () => showBottomTab("problems"));
$("tab-log").addEventListener("click", () => showBottomTab("log"));

function renderProblems(): void {
  const errors = project.problems.filter((p) => p.level === "error").length;
  const hints = project.problems.length - errors;
  $("tab-problems").textContent = `问题（${errors} 个错误，${hints} 个提示）`;
  const rows = project.problems.map((problem) => {
    const row = document.createElement("div");
    row.className = `problem ${problem.level}` + (problem.nodeId ? " clickable" : "");
    row.textContent = `${problem.level === "error" ? "错误" : "提示"}　${problem.message}`;
    const id = problem.nodeId;
    if (id) row.addEventListener("click", () => node(id) && select(id));
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      openMenu(e.clientX, e.clientY, [
        {
          label: "复制引用",
          action: () => void copyReference(problemReference(project, problem.level, problem.message, problem.nodeId)),
        },
      ]);
    });
    return row;
  });
  if (rows.length === 0) {
    const ok = document.createElement("div");
    ok.className = "muted";
    ok.textContent = "没有问题。";
    rows.push(ok);
  }
  $("problems").replaceChildren(...rows);
}

function renderLog(): void {
  const rows = log.map((entry) => {
    const row = document.createElement("div");
    row.className = "log-entry";
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = entry.title;
    const lines = document.createElement("div");
    lines.className = "lines";
    lines.textContent = entry.lines.join("\n");
    row.append(title, lines);
    return row;
  });
  const pane = $("log");
  pane.replaceChildren(...rows);
  pane.scrollTop = pane.scrollHeight;
  $("tab-log").textContent = `事件记录（${log.length}）`;
}

// ---------- 预览 ----------

function renderConditions(): void {
  const chips: HTMLElement[] = (previewRuntime?.conditions() ?? []).map((condition) => {
    const isText = condition.kind === "text";
    const chip = document.createElement(isText ? "button" : "span");
    chip.className = "condition" + (condition.value ? " on" : "");
    chip.textContent = `${condition.text || condition.id}：${condition.value ? "是" : "否"}`;
    chip.title = isText ? `文字条件 ${condition.id}，点击切换` : `符号条件 ${condition.id}，由表达式计算`;
    if (isText) chip.addEventListener("click", () => previewRuntime?.toggleTextCondition(condition.id));
    return chip;
  });
  for (const action of previewRuntime?.actions() ?? []) {
    const wrap = document.createElement("label");
    wrap.className = "condition";
    wrap.title = `动作 ${action.name} 的模拟方式`;
    wrap.textContent = `动作 ${action.name}：`;
    const sel = document.createElement("select");
    sel.style.cssText = "margin-left:4px;font-size:11px;";
    for (const [val, label] of [
      ["real", "真实实现"],
      ["success", "模拟成功"],
      ["error", "模拟失败"],
    ] as const) {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = label;
      opt.selected = action.sim.mode === val;
      sel.append(opt);
    }
    sel.addEventListener("change", () => {
      previewRuntime?.setActionSimulation(action.name, { mode: sel.value as "real" | "success" | "error" });
    });
    wrap.append(sel);
    chips.push(wrap);
  }
  $("conditions").replaceChildren(...chips);
}

function startPreviewRuntime(): void {
  previewRuntime = new Runtime(project, {
    onChange: () => {
      applyViews();
      renderConditions();
    },
    onLog: (entry) => {
      log.push(entry);
      if (log.length > 300) log.shift();
      renderLog();
    },
  });
  previewRuntime.start();
}

function setMode(next: "edit" | "preview"): void {
  if (next === mode) return;
  flushEditors();
  hideMenu();
  if (textEditor) commitTextEditor();
  if (tool.kind !== "select") {
    tool = { kind: "select" };
    overlay.classList.remove("drawing");
  }
  mode = next;
  document.body.classList.toggle("preview", mode === "preview");
  $("mode-edit").setAttribute("aria-pressed", String(mode === "edit"));
  $("mode-preview").setAttribute("aria-pressed", String(mode === "preview"));
  $("preview-bar").hidden = mode !== "preview";
  if (mode === "preview") {
    // 第一次进入预览从初始状态开始；之后保持上次离开时的状态
    if (!previewRuntime) startPreviewRuntime();
    showBottomTab("log");
  } else {
    showBottomTab("problems");
  }
  renderToolbar();
  renderStage();
  renderShapeBar();
  renderConditions();
}

$("mode-edit").addEventListener("click", () => setMode("edit"));
$("mode-preview").addEventListener("click", () => setMode("preview"));
$("restart").addEventListener("click", () => {
  log.length = 0;
  startPreviewRuntime();
  renderLog();
  renderStage();
  renderConditions();
});

// ---------- 启动 ----------

function renderAll(): void {
  syncSelection();
  $("project-name").textContent = project.name;
  $("project-root").textContent = project.root;
  renderPalette();
  renderLayers();
  renderToolbar();
  renderStage();
  renderShapeBar();
  renderRight();
  renderProblems();
  renderConditions();
  syncStandalonePreviewTitle(project);
}

async function main(): Promise<void> {
  project = await loadProject(null);
  designRuntime = new Runtime(project);
  initLibrary({
    getProject: () => project,
    getMode: () => mode,
    getZoom: () => viewZoom(),
    readText,
    writeText,
    listDir,
    reload,
    toast,
    openMenu,
    copyComponentRef: (type) => void copyReference(componentReference(project, type)),
    setSelection,
    setNodeTool: (type) => setTool(tool.kind === "node" && tool.type === type ? { kind: "select" } : { kind: "node", type }),
    getActiveNodeTool: () => (tool.kind === "node" ? tool.type : null),
    addNodeAt: addNode,
    renderProblems,
  });
  initDocView({
    getProject: () => project,
    getSelectedId: () => selectedId,
    onViewFullDoc: () => select(null),
  });
  initPreviewLauncher(
    () => project,
    (id) => {
      if (node(id)) {
        select(id);
        showRightTab("doc");
      }
    },
  );
  renderAll();
  renderLog();
  initStandalonePreviewWindow({
    getProject: () => project,
    enterPreviewMode: () => setMode("preview"),
  });
  watchProject(() => void reload());
}

main().catch((e) => {
  document.body.textContent = `启动失败：${(e as Error).message}`;
});
