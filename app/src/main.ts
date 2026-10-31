// 编辑器界面：素材栏、图层、设计窗口（编辑模式 / 预览模式）、文档与 YAML 页签、问题栏。
import { isMap, parseDocument, type Document } from "yaml";
import {
  computeDockWindowLayout,
  dockFindLocation,
  isDockArea,
  syncDockHeaderDom,
  syncDockSplittersDom,
  syncSceneNodesFromDockLayout,
  type DockPreviewCallbacks,
} from "./dock";
import { listDir, localWriteCount, readText, removeFile, watchProject, writeText, writesSettled } from "./fs";
import { initDocView, syncDocView, syncPreviewSelectionToTextarea } from "./docview";
import { initLibrary, renderLibraryPalette } from "./library";
import { invoke } from "@tauri-apps/api/core";
import { exportQt, type Manifest } from "./export/qt";
import { getQtTemplates } from "./export/qt-templates-browser";
import {
  commitPaletteDropOnStage,
  hideLayoutDropIndicator,
  initLayoutEdit,
  placeNewNodeInScene,
  previewPaletteDropOnStage,
  renderLayoutEditPane,
  tryDropFreeNodeIntoLayoutContainer,
  tryStartLayoutCanvasDrag,
} from "./layoutedit";
import { focusMenuItemInEditor, initMenuEdit, renderMenuEditPane } from "./menuedit";
import { initStateEdit, renderStateEditPane } from "./stateedit";
import { initPreviewLauncher, initStandalonePreviewWindow, isStandalonePreview, notifyMainWindowSelect, syncStandalonePreviewTitle } from "./previewwindow";
import {
  allSceneMenuIds,
  allWindowIds,
  appendSection,
  BUILTIN_TYPES,
  childrenOfNode,
  computeSceneLayout,
  CONTAINER_DECL,
  declFor,
  effectsForComponent,
  effectsForNode,
  EXTERNAL_DECL,
  getSection,
  isLayoutPositionedNode,
  isPartitionedWindow,
  isValidIdentifier,
  layoutOf,
  LAYOUT_TYPE_KINDS,
  loadProject,
  LOGIC_PATH,
  MOUSE_EVENTS,
  paintEffectForNode,
  parentOfNode,
  parseDocRef,
  remapNodeChildren,
  renameNodeReferences,
  replaceSection,
  SCENE_PATH,
  sectionNameFor,
  sectionOffsets,
  STANDARD_COMPONENTS,
  setStageStyleTarget,
  syncResizedNodeDimensions,
  visibleEffectForNode,
  walkMenuItems,
  type ComponentInstance,
  type MenuItemSpec,
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
  lineSegmentMidpoints,
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
import {
  applyDeleteFromScene,
  applyMoveToScene,
  applyPropsToScene,
  canRedo,
  canUndo,
  collectSubtreeIds,
  createHistory,
  nodesWithYamlEntries,
  pushHistory,
  redoHistory,
  renameComponentTypeInHistory,
  restoreHistoryVersion,
  undoHistory,
  type HistorySnapshot,
} from "./history";
import {
  absRectInScene,
  addBendToLine,
  alignSceneNodes,
  computeResizeBox,
  computeRotationAngle,
  deleteBendFromLine,
  distributeSceneNodes,
  filterUnlocked,
  hasLockedInSubtree,
  isNodeLocked,
  lockedAncestorInScene,
  moveBendOnLine,
  nodeLocalToWorldInScene,
  normalizeRotation,
  pointInRotatedRect,
  rectIntersectsRotatedRect,
  rotatePoint,
  scaleGroupItems,
  setNodeRotation,
  setNodesLocked,
  visualBoundsInScene,
  worldRectToNodeLocalInScene,
  worldRotationInScene,
  worldToNodeLocalInScene,
  worldToParentDeltaInScene,
  type AlignKind,
  type DistributeAxis,
  type MultiResizeItem,
} from "./transform";
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

function currentLayoutBoxes() {
  const runtime = activeRuntime();
  return computeSceneLayout(project.scene, {
    isVisible: (nid) => runtime.view(nid).visible,
    getProp: (nid, prop) => runtime.view(nid).props[prop] ?? null,
    getDockLayout: (wid) => runtime.getDockLayout(wid),
  });
}

/** 节点相对于设计窗口左上角的位置（含排版计算与旋转父容器对子节点中心位置的变换）。根窗口在 (0, 0)。 */
function absRect(id: string): { x: number; y: number; width: number; height: number } {
  return absRectInScene(project.scene, id, currentLayoutBoxes());
}

/** 节点在设计窗口里的视觉外包围盒（含自身与祖先容器旋转后的轴对齐外框）。 */
function visualRect(id: string): { x: number; y: number; width: number; height: number } {
  return visualBoundsInScene(project.scene, id, currentLayoutBoxes());
}

/** 节点在设计窗口世界坐标系下的总旋转角（度）。 */
function worldRotation(id: string): number {
  return worldRotationInScene(project.scene, id);
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

// 画布、逻辑、说明文档与预设操作的撤销和重做
const HISTORY_LIMIT = 200;
let history = createHistory(HISTORY_LIMIT);

function currentPresetsText(presets = project.presets): string {
  return JSON.stringify({ version: 1, presets }, null, 2) + "\n";
}

function currentSnapshot(): HistorySnapshot {
  return {
    sceneText: project.sceneText,
    logicText: project.logicText,
    docs: Object.fromEntries(project.docs),
    presetsText: currentPresetsText(),
  };
}

interface FileChange {
  path: string;
  next: string;
  /** 写之前的内容；null 表示文件原来不存在 */
  prev: string | null;
}

let fileBatch: Promise<unknown> | null = null;

/**
 * 一次操作要改几个文件时，依次写入。中途失败就把已写的写回原内容，磁盘不留半截。
 * 成功返回 null；失败返回给用户看的说明，写回也失败时说明里列出哪些文件停在了新内容。
 */
function writeFilesTogether(changes: FileChange[]): Promise<string | null> {
  const run = (async () => {
    const written: FileChange[] = [];
    for (const change of changes) {
      try {
        await writeText(change.path, change.next);
        written.push(change);
      } catch (e) {
        const reason = (e as Error).message ?? String(e);
        const stuck: string[] = [];
        for (const done of written.reverse()) {
          try {
            if (done.prev === null) await removeFile(done.path);
            else await writeText(done.path, done.prev);
          } catch {
            stuck.push(done.path);
          }
        }
        if (stuck.length === 0) return reason;
        return `${reason}。${stuck.join("、")} 已是新内容但写不回去，磁盘上的文件现在不一致，修好写入问题后请检查这些文件`;
      }
    }
    return null;
  })();
  const tracked = run.finally(() => {
    if (fileBatch === tracked) fileBatch = null;
  });
  fileBatch = tracked;
  return tracked;
}

/** 从磁盘版本的文本还原内存里的场景，丢掉没存上的修改。 */
function rollbackScene(sceneText: string): void {
  project.sceneText = sceneText;
  project.scene = JSON.parse(sceneText) as Project["scene"];
  designRuntime = new Runtime(project);
  previewRuntime?.adopt(project);
  if (selectedId && !node(selectedId)) selectedId = null;
  renderAll();
}

/** 写成功才提交 nextHistory；失败时内存、界面和历史都保持操作之前的样子。 */
async function applyHistorySnapshot(target: HistorySnapshot, nextHistory: typeof history): Promise<boolean> {
  const sceneChanged = target.sceneText !== project.sceneText;
  const logicChanged = target.logicText !== project.logicText;
  const prevLogicText = project.logicText;
  const changes: FileChange[] = [];
  if (logicChanged) changes.push({ path: LOGIC_PATH, next: target.logicText, prev: prevLogicText });
  if (sceneChanged) changes.push({ path: SCENE_PATH, next: target.sceneText, prev: project.sceneText });
  for (const [docPath, content] of Object.entries(target.docs ?? {})) {
    const prevDoc = project.docs.get(docPath);
    if ((prevDoc ?? "") !== content) changes.push({ path: docPath, next: content, prev: prevDoc ?? null });
  }
  if (target.presetsText !== undefined && target.presetsText !== currentPresetsText()) {
    changes.push({ path: PRESETS_PATH, next: target.presetsText, prev: currentPresetsText() });
  }
  window.clearTimeout(yamlTimer);
  project.logicText = target.logicText;
  const failure = await writeFilesTogether(changes);
  if (failure !== null) {
    if (project.logicText === target.logicText) project.logicText = prevLogicText;
    toast(`写入快照失败：${failure}`);
    return false;
  }
  history = nextHistory;
  if (logicChanged) {
    yamlDirty = false;
    yamlBaseContent = target.logicText;
    yamlConflictNotified = false;
  }
  if (sceneChanged) {
    try {
      rollbackScene(target.sceneText);
    } catch {
      // 由后续 reload 兜底
    }
  }
  await reload(true);
  return true;
}

async function saveScene(options: { history?: boolean; nextLogicText?: string; label?: string } = {}): Promise<void> {
  normalizeLines();
  const rootWin = project.scene.nodes[project.scene.root];
  if (rootWin?.dockLayout) {
    designRuntime?.setDockLayout(rootWin.dockLayout, project.scene.root);
    previewRuntime?.setDockLayout(rootWin.dockLayout, project.scene.root);
  }
  const text = JSON.stringify(project.scene, null, 2) + "\n";
  if (hasUnsavedEditors() && !(await flushEditors())) {
    // 调用方已经改了内存里的场景，存不下去就要退回去，否则下一次修改会把它带进文件
    if (text !== project.sceneText) rollbackScene(project.sceneText);
    return;
  }
  const nextLogic = options.nextLogicText ?? project.logicText;
  const logicChanged = nextLogic !== project.logicText;
  const sceneChanged = text !== project.sceneText;
  if (!sceneChanged && !logicChanged) return;
  const prevSceneText = project.sceneText;
  const prevLogicText = project.logicText;
  const before = currentSnapshot();
  const changes: FileChange[] = [];
  if (logicChanged) changes.push({ path: LOGIC_PATH, next: nextLogic, prev: prevLogicText });
  if (sceneChanged) changes.push({ path: SCENE_PATH, next: text, prev: prevSceneText });
  project.sceneText = text;
  project.logicText = nextLogic;
  if (sceneChanged && !logicChanged) {
    designRuntime = new Runtime(project);
    previewRuntime?.adopt(project);
    if (selectedId && !node(selectedId)) selectedId = null;
    renderAll();
  }
  if (logicChanged) window.clearTimeout(yamlTimer);
  const failure = await writeFilesTogether(changes);
  if (failure !== null) {
    // 只有这次保存还是最新的才退回去，否则后面的修改已经在这份内容上继续了
    if (project.sceneText === text && project.logicText === nextLogic) {
      project.logicText = prevLogicText;
      rollbackScene(prevSceneText);
    }
    toast(`保存画布失败：${failure}`);
    return;
  }
  if (logicChanged) {
    yamlDirty = false;
    yamlBaseContent = nextLogic;
    yamlConflictNotified = false;
  }
  if (options.history !== false) {
    history = pushHistory(
      history,
      before,
      { ...before, sceneText: text, logicText: nextLogic },
      options.label ?? "画布修改",
    );
  }
  await reload(true);
}

async function undo(): Promise<void> {
  if (!(await flushEditors())) return;
  const res = undoHistory(history, currentSnapshot());
  if (!res.snapshot) return toast("没有可以撤销的画布操作");
  await applyHistorySnapshot(res.snapshot, res.stack);
}

async function redo(): Promise<void> {
  if (!(await flushEditors())) return;
  const res = redoHistory(history, currentSnapshot());
  if (!res.snapshot) return toast("没有可以重做的画布操作");
  await applyHistorySnapshot(res.snapshot, res.stack);
}

async function restoreVersion(index: number): Promise<void> {
  if (!(await flushEditors())) return;
  const res = restoreHistoryVersion(history, index, currentSnapshot());
  if (!res.snapshot) return;
  if (await applyHistorySnapshot(res.snapshot, res.stack)) toast("已恢复到所选版本");
}

/** 用保留注释和格式的方式修改 YAML。 */
async function editLogic(mutate: (doc: Document) => void, label = "修改逻辑"): Promise<boolean> {
  if (!(await flushEditors())) return false;
  const doc = parseDocument(project.logicText);
  if (doc.errors.length > 0) {
    toast("YAML 有语法错误，请先在 YAML 页签中修正");
    return false;
  }
  mutate(doc);
  const nextText = doc.toString(YAML_OUTPUT);
  const prevText = project.logicText;
  const prevBase = yamlBaseContent;
  const before = currentSnapshot();
  window.clearTimeout(yamlTimer);
  yamlDirty = false;
  yamlBaseContent = nextText;
  yamlConflictNotified = false;
  // 先更新内存再写盘：紧接着的下一次修改要以这次的结果为基准，不能等 reload 读回来
  project.logicText = nextText;
  try {
    await writeText(LOGIC_PATH, nextText);
  } catch (e) {
    if (project.logicText === nextText) {
      project.logicText = prevText;
      yamlBaseContent = prevBase;
    }
    toast(`保存 ${LOGIC_PATH} 失败：${(e as Error).message ?? String(e)}`);
    return false;
  }
  if (nextText !== prevText) {
    history = pushHistory(
      history,
      before,
      { ...before, logicText: nextText },
      label,
    );
  }
  await reload();
  return true;
}

function ensureObject(doc: Document, id: string): void {
  if (!isMap(doc.getIn(["objects", id]))) doc.setIn(["objects", id], doc.createNode({}));
}

// 重载可能在任何时候到来（外部工具改了文件）。鼠标按住时重绘会换掉按着的控件，这次点击或拖动就丢了，
// 所以等松开再画；click 在松开之后才发，排到下一轮
let pointerHeld = false;
let pointerHeldInIframe = false;
let stageIframeDoc: globalThis.Document | null = null;
let stageIframeCleanup: (() => void) | null = null;
let renderPending = false;

function renderAfterReload(): void {
  if (pointerHeld) renderPending = true;
  else renderAll();
}

function onPointerReleased(): void {
  pointerHeld = false;
  pointerHeldInIframe = false;
  if (!renderPending) return;
  renderPending = false;
  window.setTimeout(renderAll, 0);
}

document.addEventListener("pointerdown", () => (pointerHeld = true), true);
document.addEventListener("pointerup", onPointerReleased, true);
document.addEventListener("pointercancel", onPointerReleased, true);
window.addEventListener("blur", () => {
  const iframe = document.getElementById("stage-iframe") as HTMLIFrameElement | null;
  if (iframe && (document.activeElement === iframe || iframe.contentDocument?.hasFocus())) return;
  onPointerReleased();
});

let loading = false;
let reloadAgain = false;
let reloadForce = false;
async function reload(force = false): Promise<void> {
  if (force) reloadForce = true;
  if (loading) {
    reloadAgain = true;
    return;
  }
  loading = true;
  try {
    do {
      reloadAgain = false;
      const mustRender = reloadForce;
      reloadForce = false;
      // 磁盘要追上内存才能读：文件监听触发的重载如果读到自己还没写完的文件，会用旧内容盖掉内存
      if (docSavingPromise || yamlSavingPromise || fileBatch) {
        await Promise.all([docSavingPromise, yamlSavingPromise, fileBatch]);
      }
      await writesSettled();
      const writesBefore = localWriteCount();
      const next = await loadProject(project);
      if (writesBefore !== localWriteCount()) {
        reloadForce ||= mustRender;
        reloadAgain = true;
        continue;
      }
      if (!mustRender && next.signature === project.signature) continue;
      project = next;
      designRuntime = new Runtime(project);
      previewRuntime?.adopt(project);
      if (selectedId && !node(selectedId)) selectedId = null;
      renderAfterReload();
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
    transform: n.rotation ? `rotate(${n.rotation}deg)` : "",
    transformOrigin: "center center",
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
      if (name === "click" && n.popupMenu?.length) {
        const rect = wrapper.getBoundingClientRect();
        showPreviewPopupMenu(rect.left, rect.bottom + 2, n.popupMenu);
      }
    });
  }

  if (n.contextMenu?.length) {
    wrapper.addEventListener("contextmenu", (e) => {
      if (mode !== "preview" || !previewRuntime) return;
      if ((e.target as Element).closest(".vf-node") !== wrapper) return;
      e.preventDefault();
      e.stopPropagation();
      showPreviewPopupMenu(e.clientX, e.clientY, n.contextMenu!);
    });
  }

  const extraMenuItems: MenuItemSpec[] = [];
  if (n.contextMenu?.length) walkMenuItems(n.contextMenu, (it) => extraMenuItems.push(it));
  if (n.popupMenu?.length) walkMenuItems(n.popupMenu, (it) => extraMenuItems.push(it));
  if (extraMenuItems.length > 0) {
    const hiddenMenuHost = document.createElement("div");
    hiddenMenuHost.style.display = "none";
    for (const item of extraMenuItems) {
      if (item.kind === "separator" || item.items?.length) continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.vfMenuItem = item.id;
      btn.addEventListener("click", () => triggerPreviewMenuItem(item.id));
      hiddenMenuHost.append(btn);
    }
    wrapper.append(hiddenMenuHost);
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
  const effectName = visibleEffectForNode(project, id);
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
    getDockLayout: (wid) => runtime.getDockLayout(wid),
  });
  const rootId = project.scene.root;
  const rootNode = node(rootId);
  const stageEl = ensureStageIframe();

  let dockInfoMap:
    | Map<string, { groupTabs: string[]; activeTab: string; isFloating: boolean; area?: "left" | "right" | "top" | "bottom" }>
    | undefined;
  const persistPreviewDockLayout = (label: string, commit = true) => {
    if (!previewRuntime || !rootNode) return;
    const nextLayout = syncSceneNodesFromDockLayout(project.scene, rootNode, previewRuntime.getDockLayout(rootId));
    previewRuntime.setDockLayout(nextLayout, rootId);
    designRuntime.setDockLayout(nextLayout, rootId);
    if (commit) void saveScene({ label });
  };
  const dockCallbacks: DockPreviewCallbacks = {
    getMode: () => mode,
    getScene: () => project.scene,
    getDockLayout: () => runtime.getDockLayout(rootId),
    getWindowSize: () => ({ width: rootNode?.width ?? 1280, height: rootNode?.height ?? 800 }),
    getDockTitle: (did) => String(runtime.view(did).props.title ?? node(did)?.title ?? did),
    onActivateTab: (did) => {
      previewRuntime?.dockActivateTab(did);
      persistPreviewDockLayout("切换停靠页签", true);
    },
    onTabify: (targetId, did) => {
      previewRuntime?.dockTabify(targetId, did);
      persistPreviewDockLayout("叠入停靠页签", true);
    },
    onSplit: (targetId, did, pos, orient) => {
      previewRuntime?.dockSplit(targetId, did, pos, orient);
      persistPreviewDockLayout("分栏并排停靠", true);
    },
    onMoveToArea: (did, area) => {
      previewRuntime?.dockMoveToArea(did, area);
      persistPreviewDockLayout("移动停靠区", true);
    },
    onFloat: (did, rect, commit = true) => {
      previewRuntime?.dockFloat(did, rect);
      persistPreviewDockLayout("浮出停靠面板", commit);
    },
    onRestore: (did) => {
      previewRuntime?.dockRestore(did);
      persistPreviewDockLayout("恢复停靠面板", true);
    },
    onClose: (did) => {
      previewRuntime?.dockSetVisible(did, false);
      persistPreviewDockLayout("关闭停靠面板", false);
    },
    onResizeArea: (area, size, commit = true) => {
      previewRuntime?.dockResizeArea(area, size);
      persistPreviewDockLayout("调整停靠区大小", commit);
    },
    onResizeSplit: (area, idx, size, commit = true) => {
      previewRuntime?.dockResizeSplit(area, idx, size);
      persistPreviewDockLayout("调整并排分栏大小", commit);
    },
  };

  if (rootNode && isPartitionedWindow(rootNode)) {
    const menuH = rootNode.menuBar ? Math.max(0, Math.round(rootNode.menuBar.height ?? 28)) : 0;
    const statusNode = rootNode.statusBar ? project.scene.nodes[rootNode.statusBar] : undefined;
    const statusVis = statusNode && rootNode.statusBar ? runtime.view(rootNode.statusBar).visible : false;
    const statusH = statusNode && statusVis ? Math.round(statusNode.height ?? 28) : 0;
    const midY = menuH;
    const midH = Math.max(0, (rootNode.height ?? 800) - menuH - statusH);
    const dockRes = computeDockWindowLayout(
      project.scene,
      rootId,
      rootNode,
      rootNode.width ?? 1280,
      midY,
      midH,
      true,
      (nid) => runtime.view(nid).visible,
      runtime.getDockLayout(rootId),
    );
    dockInfoMap = dockRes.activeTabByDock;
    syncDockSplittersDom(stageEl, dockRes.splitters, dockCallbacks);
  }

  if (rootNode?.menuBar) {
    for (const menu of rootNode.menuBar.menus ?? []) {
      for (const item of menu.items ?? []) {
        const btn = stageEl.querySelector<HTMLButtonElement>(`[data-vf-menu-item="${item.id}"]`);
        if (btn) {
          const mView = runtime.view(item.id);
          const prefix = item.checkable || item.dock ? (mView.props.checked ? "✓ " : "  ") : "";
          btn.textContent = prefix + String(mView.props.text ?? item.text);
        }
      }
    }
  }

  for (const [id, entry] of mounted) {
    const view = runtime.view(id);
    const n = node(id);
    const box = boxes.get(id);
    if (n?.type === "FloatBox") {
      const wantFloat = Boolean(view.props.floating);
      if (wantFloat && entry.wrapper.parentElement !== stageEl) {
        stageEl.append(entry.wrapper);
      } else if (!wantFloat) {
        const origPid = parentOf(id);
        const origParentEl = origPid && origPid !== rootId ? mounted.get(origPid)?.wrapper : stageEl;
        if (origParentEl && entry.wrapper.parentElement !== origParentEl) {
          origParentEl.append(entry.wrapper);
        }
      }
    }
    if (box && n?.type !== "Line") {
      if (n?.type === "Dialog" && id !== project.scene.root && rootNode) {
        const dx = Math.round((rootNode.width - box.width) / 2);
        const dy = Math.round((rootNode.height - box.height) / 2);
        Object.assign(entry.wrapper.style, {
          left: `${dx}px`,
          top: `${dy}px`,
          width: `${box.width}px`,
          height: `${box.height}px`,
          transform: n?.rotation ? `rotate(${n.rotation}deg)` : "",
          transformOrigin: "center center",
        });
      } else {
        const useAbs = n?.type === "FloatBox" && Boolean(view.props.floating) && entry.wrapper.parentElement === stageEl;
        Object.assign(entry.wrapper.style, {
          left: `${useAbs ? box.absX : box.x}px`,
          top: `${useAbs ? box.absY : box.y}px`,
          width: `${box.width}px`,
          height: `${box.height}px`,
          transform: n?.rotation ? `rotate(${n.rotation}deg)` : "",
          transformOrigin: "center center",
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
      const header = entry.wrapper.querySelector<HTMLElement>(".vf-dock-header");
      const info = dockInfoMap?.get(id);
      if (header) {
        syncDockHeaderDom(entry.wrapper, header, id, n?.headerHeight ?? 26, info, stageEl, dockCallbacks);
      }
      entry.wrapper.style.zIndex = info?.isFloating ? "30" : "";
    } else if (type === "FloatBox") {
      entry.wrapper.style.zIndex = view.props.floating ? "35" : "";
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
    const paintName = paintEffectForNode(project, id);
    if (paintName) {
      const paintEffect = project.effects.get(paintName);
      const w = Math.max(1, box?.width ?? n?.width ?? 100);
      const h = Math.max(1, box?.height ?? n?.height ?? 100);
      if (paintEffect?.paint) {
        try {
          paintEffect.paint(entry.body, { props: view.props, width: w, height: h });
        } catch (e) {
          showNodeError(entry.body, `绘制效果 ${paintName} 运行出错：${(e as Error).message}`);
        }
      } else {
        let placeholder = entry.body.querySelector<HTMLElement>(".vf-paint-placeholder");
        if (!placeholder) {
          placeholder = document.createElement("div");
          placeholder.className = "vf-paint-placeholder";
          placeholder.style.cssText =
            "width:100%;height:100%;box-sizing:border-box;border:1px dashed #94a3b8;border-radius:6px;background:rgba(248,250,252,0.85);color:#475569;font-size:12px;display:flex;align-items:center;justify-content:center;text-align:center;padding:6px;";
          entry.body.replaceChildren(placeholder);
        }
        placeholder.textContent = `[绘制效果占位：${paintName}]`;
      }
    }
  }

  // 同步菜单项按钮的可见、可用、文本和勾选标记
  const stageDoc = (document.getElementById("stage-iframe") as HTMLIFrameElement | null)?.contentDocument ?? document;
  for (const btn of stageDoc.querySelectorAll<HTMLButtonElement>("[data-vf-menu-item]")) {
    const itemId = btn.dataset.vfMenuItem;
    if (!itemId) continue;
    const view = runtime.view(itemId);
    btn.disabled = !view.enabled;
    if (btn.parentElement?.style.display !== "none") {
      btn.style.display = view.visible ? "" : "none";
    }
    const checkable = btn.dataset.vfMenuCheckable === "1";
    const isRadio = btn.dataset.vfMenuRadio === "1";
    const checked = Boolean(view.props.checked);
    const labelText = String(view.props.text ?? btn.dataset.vfMenuBaseText ?? "");
    const prefix = checkable ? (checked ? (isRadio ? "● " : "✓ ") : "") : "";
    btn.textContent = prefix + labelText;
    if (checkable) {
      btn.style.borderColor = checked ? "#38bdf8" : "#334155";
      btn.style.color = checked ? "#f8fafc" : "#e2e8f0";
    }
  }
}

function triggerPreviewMenuItem(itemId: string): void {
  if (mode === "preview" && previewRuntime) {
    previewRuntime.dispatch(itemId, "mousedown");
    previewRuntime.dispatch(itemId, "mouseup");
    previewRuntime.dispatch(itemId, "click");
    previewRuntime.dispatch(null, "window.click");
  }
}

function flattenMenuSpecsToPopupItems(specs: MenuItemSpec[], prefix = ""): MenuItem[] {
  const runtime = activeRuntime();
  const out: MenuItem[] = [];
  for (const spec of specs) {
    if (spec.kind === "separator") {
      out.push("separator");
      continue;
    }
    const view = runtime.view(spec.id);
    if (!view.visible) continue;
    const text = String(view.props.text ?? spec.text ?? spec.id);
    if (spec.items?.length) {
      out.push(...flattenMenuSpecsToPopupItems(spec.items, `${prefix}${text} ▸ `));
      continue;
    }
    const isRadio = spec.kind === "radio" || Boolean(spec.group);
    const isCheck = isRadio || spec.kind === "check" || Boolean(spec.checkable) || Boolean(spec.dock);
    const checked = Boolean(view.props.checked);
    const mark = isCheck ? (checked ? (isRadio ? "● " : "✓ ") : "   ") : "";
    const sc = spec.shortcut ? `　(${spec.shortcut})` : "";
    out.push({
      label: `${mark}${prefix}${text}${sc}`,
      action: () => {
        if (view.enabled) triggerPreviewMenuItem(spec.id);
      },
    });
  }
  return out;
}

function showPreviewPopupMenu(x: number, y: number, specs: MenuItemSpec[]): void {
  const items = flattenMenuSpecsToPopupItems(specs);
  if (items.length > 0) openMenu(x, y, items);
}

const STAGE_IFRAME_BASE_CSS = `
:root {
  --bg: #f3f4f6;
  --panel: #ffffff;
  --line: #d9dce1;
  --text: #1f2430;
  --muted: #6b7280;
  --accent: #2563eb;
  --accent-soft: #dbe7ff;
  --preview: #d9480f;
  --error: #c62828;
  --hint: #8a6d1a;
  font-family: "Segoe UI", "Microsoft YaHei UI", system-ui, sans-serif;
  font-size: 13px;
  color: var(--text);
}
* {
  box-sizing: border-box;
}
html, body {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  background: transparent;
  overflow: hidden;
  user-select: none;
}
body.preview {
  user-select: auto;
}
button, input, textarea, select {
  font: inherit;
  color: inherit;
}
#stage-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.vf-node {
  position: absolute;
}
.vf-body {
  position: absolute;
  inset: 0;
}
.vf-node[data-vf-type="Container"] > .vf-body,
.vf-node[data-vf-type="VBox"] > .vf-body:not(:empty),
.vf-node[data-vf-type="HBox"] > .vf-body:not(:empty),
.vf-node[data-vf-type="Grid"] > .vf-body:not(:empty),
.vf-node[data-vf-type="Form"] > .vf-body:not(:empty),
.vf-node[data-vf-type="Stack"] > .vf-body:not(:empty) {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed #9aa1ad;
  color: #8a909b;
  font-size: 12px;
  overflow: hidden;
}
body.preview .vf-node[data-vf-type="Container"] > .vf-body {
  border-color: #dfe2e7;
  color: #c3c7ce;
}
.vf-node[data-vf-type="External"] > .vf-body {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #9aa1ad;
  background: repeating-linear-gradient(45deg, #f4f5f7 0 10px, #eceef1 10px 20px);
  color: #6b7280;
  font-size: 12px;
  text-align: center;
  white-space: pre-line;
  overflow: hidden;
}
.vf-node.vf-ghost {
  opacity: 0.35;
  outline: 1px dashed #9aa1ad;
}
.vf-error {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border: 1px solid var(--error);
  background: #fdecec;
  color: var(--error);
  font-size: 12px;
  overflow: hidden;
  text-align: center;
}
.vf-node[data-vf-type="Shape"],
.vf-node[data-vf-type="Line"] {
  pointer-events: none;
}
.vf-shape-svg .vf-hit {
  pointer-events: all;
}
.vf-line-svg .vf-hit {
  pointer-events: stroke;
}
.vf-shape-svg,
.vf-line-svg {
  position: absolute;
  left: 0;
  top: 0;
  display: block;
  overflow: visible;
}
.vf-shape-text {
  position: absolute;
  display: flex;
  align-items: center;
  overflow: hidden;
  line-height: 1.3;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  pointer-events: none;
}
.vf-line-label {
  position: absolute;
  transform: translate(-50%, -50%);
  padding: 1px 5px;
  border-radius: 3px;
  background: #fff;
  line-height: 1.3;
  white-space: pre;
}
.vf-dock-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 26px;
  padding: 0 4px 0 8px;
  background: #232834;
  border-bottom: 1px solid #2e3440;
  color: #cdd5e0;
  font-size: 11px;
  font-weight: 600;
  user-select: none;
  cursor: grab;
  box-sizing: border-box;
}
.vf-dock-header:active {
  cursor: grabbing;
}
.vf-dock-header .dock-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  overflow: hidden;
  flex: 1;
  min-width: 0;
}
.vf-dock-header .dock-tab {
  appearance: none;
  border: 0;
  border-radius: 3px 3px 0 0;
  background: transparent;
  color: #8b95a5;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.vf-dock-header .dock-tab:hover {
  color: #dbe3ef;
  background: rgba(255, 255, 255, 0.05);
}
.vf-dock-header .dock-tab.active {
  color: #e5e9f0;
  background: #2e3545;
  border-bottom: 2px solid #5e81ac;
}
.vf-dock-header .dock-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.vf-dock-header .dock-action-btn {
  appearance: none;
  border: 0;
  border-radius: 3px;
  width: 20px;
  height: 18px;
  padding: 0;
  background: transparent;
  color: #9aa5b4;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
  cursor: pointer;
}
.vf-dock-header .dock-action-btn:hover {
  background: #353d4f;
  color: #ffffff;
}
.vf-node.dock-floating {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  border: 1px solid #4c566a !important;
  border-radius: 4px;
}
.dock-float-resizer {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 12px;
  height: 12px;
  cursor: nwse-resize;
  z-index: 5;
  background: linear-gradient(135deg, transparent 50%, rgba(160, 174, 192, 0.55) 50%);
}
.dock-splitter {
  position: absolute;
  z-index: 40;
  background: transparent;
  transition: background 0.12s ease;
}
.dock-splitter.vertical,
.dock-splitter-vertical {
  cursor: col-resize;
}
.dock-splitter.horizontal,
.dock-splitter-horizontal {
  cursor: row-resize;
}
.dock-splitter:hover {
  background: rgba(94, 129, 172, 0.55);
}
.dock-drop-overlay {
  position: absolute;
  pointer-events: none;
  z-index: 120;
  border: 2px dashed #5e81ac;
  background: rgba(94, 129, 172, 0.22);
  border-radius: 4px;
  box-sizing: border-box;
}
.dock-drag-ghost {
  position: absolute;
  pointer-events: none;
  z-index: 125;
  padding: 3px 8px;
  border-radius: 4px;
  background: rgba(35, 40, 52, 0.92);
  border: 1px solid #5e81ac;
  color: #e5e9f0;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
}
`;

function ensureStageIframe(): HTMLElement {
  const stage = $("stage");
  let iframe = document.getElementById("stage-iframe") as HTMLIFrameElement | null;
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = "stage-iframe";
    iframe.title = "设计窗口";
    stage.prepend(iframe);
  } else if (iframe.parentElement !== stage) {
    stage.prepend(iframe);
  }
  const doc = iframe.contentDocument!;
  if (stageIframeDoc && stageIframeDoc !== doc) {
    stageIframeCleanup?.();
    stageIframeCleanup = null;
    if (pointerHeldInIframe) onPointerReleased();
  }
  stageIframeDoc = doc;
  if (!(iframe as unknown as { __vfLoadBound?: boolean }).__vfLoadBound) {
    (iframe as unknown as { __vfLoadBound?: boolean }).__vfLoadBound = true;
    iframe.addEventListener("load", () => {
      ensureStageIframe();
    });
  }
  let baseStyle = doc.getElementById("vf-stage-base-styles") as HTMLStyleElement | null;
  if (!baseStyle) {
    baseStyle = doc.createElement("style");
    baseStyle.id = "vf-stage-base-styles";
    baseStyle.textContent = STAGE_IFRAME_BASE_CSS;
    doc.head.prepend(baseStyle);
  }
  setStageStyleTarget(doc);
  doc.body.classList.toggle("preview", mode === "preview");
  doc.body.classList.toggle("edit", mode === "edit");
  let canvas = doc.getElementById("stage-canvas") as HTMLElement | null;
  if (!canvas) {
    canvas = doc.createElement("div");
    canvas.id = "stage-canvas";
    doc.body.append(canvas);
  }
  if (!(doc as unknown as { __vfStageEventsBound?: boolean }).__vfStageEventsBound) {
    (doc as unknown as { __vfStageEventsBound?: boolean }).__vfStageEventsBound = true;
    const onIframePointerDown = () => {
      pointerHeld = true;
      pointerHeldInIframe = true;
    };
    const onIframeWindowBlur = () => {
      if (!document.hasFocus()) onPointerReleased();
    };
    doc.addEventListener("pointerdown", onIframePointerDown, true);
    doc.addEventListener("pointerup", onPointerReleased, true);
    doc.addEventListener("pointercancel", onPointerReleased, true);
    doc.defaultView?.addEventListener("blur", onIframeWindowBlur);
    stageIframeCleanup = () => {
      doc.removeEventListener("pointerdown", onIframePointerDown, true);
      doc.removeEventListener("pointerup", onPointerReleased, true);
      doc.removeEventListener("pointercancel", onPointerReleased, true);
      doc.defaultView?.removeEventListener("blur", onIframeWindowBlur);
    };
    doc.addEventListener(
      "click",
      (e) => {
        if (!e.altKey || mode !== "preview") return;
        const wrapper = (e.target as Element | null)?.closest<HTMLElement>(".vf-node");
        const id = wrapper?.dataset.vfId;
        if (id) {
          e.preventDefault();
          e.stopPropagation();
          if (isStandalonePreview()) {
            void notifyMainWindowSelect(id);
          } else if (node(id)) {
            select(id);
            showRightTab("doc");
          }
        }
      },
      true,
    );
    doc.addEventListener("click", (e) => {
      if (mode === "preview" && !e.altKey) previewRuntime?.dispatch(null, "window.click");
    });
  }
  return canvas;
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
  const stageCanvas = ensureStageIframe();
  stageCanvas.innerHTML = "";
  overlay.remove();
  if (!root) return;
  stage.style.width = `${root.width}px`;
  stage.style.height = `${root.height}px`;
  $("stage-title").textContent = (root.title ?? project.scene.root) + (mode === "preview" ? "　·　预览中" : "");
  $("window-size").textContent = `窗口 ${root.width}×${root.height}`;

  if (root.menuBar) {
    const bar = document.createElement("div");
    const mh = root.menuBar.height ?? 28;
    bar.style.cssText = `position:absolute;left:0;top:0;width:100%;height:${mh}px;display:flex;align-items:center;gap:6px;padding:0 10px;background:#111827;border-bottom:1px solid #263042;box-sizing:border-box;z-index:20;font-size:12px;color:#e2e8f0;overflow:hidden;`;
    for (const menu of root.menuBar.menus ?? []) {
      const group = document.createElement("div");
      group.style.cssText = "display:flex;align-items:center;gap:2px;flex-shrink:0;";
      const titleSpan = document.createElement("button");
      titleSpan.type = "button";
      titleSpan.dataset.vfMenuTitle = menu.id;
      titleSpan.style.cssText = "font-weight:600;color:#cbd5e1;background:#1e293b;border:1px solid #334155;padding:2px 8px;border-radius:4px;font-size:12px;cursor:pointer;";
      titleSpan.textContent = menu.title;
      titleSpan.addEventListener("click", () => {
        if (mode === "preview" && menu.items?.length) {
          const rect = titleSpan.getBoundingClientRect();
          showPreviewPopupMenu(rect.left, rect.bottom + 2, menu.items);
        }
      });
      const hiddenItems = document.createElement("div");
      hiddenItems.style.display = "none";
      walkMenuItems(menu.items, (item) => {
        if (item.kind === "separator" || item.items?.length) return;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.dataset.vfMenuItem = item.id;
        btn.dataset.vfMenuBaseText = item.text;
        const isRadio = item.kind === "radio" || Boolean(item.group);
        const isCheck = isRadio || item.kind === "check" || Boolean(item.checkable) || Boolean(item.dock);
        if (isCheck) btn.dataset.vfMenuCheckable = "1";
        if (isRadio) btn.dataset.vfMenuRadio = "1";
        if (item.shortcut) btn.title = `${item.text} (${item.shortcut})`;
        btn.textContent = item.text;
        btn.addEventListener("click", () => {
          if (mode === "preview" && previewRuntime) {
            triggerPreviewMenuItem(item.id);
          } else if (mode === "edit") {
            focusMenuItemInEditor(item.id);
          }
        });
        hiddenItems.append(btn);
      });
      group.append(titleSpan, hiddenItems);
      bar.append(group);
    }
    stageCanvas.append(bar);
  }

  for (const child of childrenOf(root)) buildNode(child, stageCanvas);
  for (const winId of allWindowIds(project.scene)) {
    if (winId !== project.scene.root) buildNode(winId, stageCanvas);
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

/** 节点外轮廓在设计窗口世界坐标系下的顶点序列（含自身与父容器旋转）。 */
function worldOutlineOf(id: string): Point[] {
  return outlineOf(id).map((pt) => nodeLocalToWorldInScene(project.scene, id, pt));
}

/** 外轮廓上离 p 最近的点（设计窗口里的绝对坐标）。 */
function nearestOnOutline(id: string, p: Point): { point: Point; distance: number } {
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
}

/** 从节点中心朝 direction 射出去，和外轮廓最远的那个交点。用来放形状四条“边”的中点：三角形的左边中点在斜边上，不在方框上。 */
function outlineRayHit(id: string, direction: Point): Point | null {
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
}

/** 节点某一边在世界坐标系下的法向方向（含旋转）。 */
function sideDirectionOf(id: string, side: Side): Point {
  const dir = sideDirection(side);
  const rot = worldRotation(id);
  return rot ? rotatePoint(dir, { x: 0, y: 0 }, rot) : dir;
}

/** 节点某一边的“中点”：形状按真实轮廓，其余按方框（均含旋转变换）。 */
function sideAnchorOf(id: string, side: Side): Point {
  const rotDir = sideDirectionOf(id, side);
  if (node(id)?.type === "Shape") {
    const hit = outlineRayHit(id, rotDir);
    if (hit) return hit;
  }
  const r = absRect(id);
  const localAnchor = sideAnchor({ x: 0, y: 0, width: r.width, height: r.height }, side);
  return nodeLocalToWorldInScene(project.scene, id, localAnchor);
}

/** "0.250,1.000" → 相对于节点方框的位置（0 到 1）。 */
function parseAt(value: Value | undefined): Point | null {
  if (typeof value !== "string") return null;
  const [x, y] = value.split(",").map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/**
 * 线的一头挂在节点上时，它在哪里、朝哪个方向出去。
 * side 为 outline 时挂在外轮廓的某一点（at 记着它在方框里的相对位置，节点缩放或旋转后跟着走，再贴回轮廓上）；
 * 为 top、right、bottom、left 时挂在那一边的中点；为 auto 时朝着另一头自动选边。
 */
function resolveAttach(id: string, sideValue: string, at: Point | null, other: Point): Endpoint {
  const rect = absRect(id);
  const localRect = { x: 0, y: 0, width: rect.width, height: rect.height };
  if (sideValue === "outline" && at) {
    const guess = nodeLocalToWorldInScene(project.scene, id, { x: at.x * rect.width, y: at.y * rect.height });
    const point = nearestOnOutline(id, guess).point;
    const localPt = worldToNodeLocalInScene(project.scene, id, point);
    const localSide = autoSide(localRect, localPt);
    return { point, direction: sideDirectionOf(id, localSide) };
  }
  const localOther = worldToNodeLocalInScene(project.scene, id, other);
  const side: Side = SIDES.includes(sideValue as Side) ? (sideValue as Side) : autoSide(localRect, localOther);
  return { point: sideAnchorOf(id, side), direction: sideDirectionOf(id, side) };
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
  // 手动调整过的拐点存的是相对于父节点的坐标（直线、曲线、折线都支持拐点）
  const origin = parentOrigin(id);
  const bends = parseBends(props.bends).map((p) => ({ x: p.x + origin.x, y: p.y + origin.y }));
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

/** 一个点在不在节点上。形状和线条按图形本身判断，别的按方框（支持自身及父容器旋转后的方框）。 */
function containsPoint(id: string, px: number, py: number): boolean {
  const n = node(id);
  if (!n) return false;
  const entry = mounted.get(id);
  const localPt = worldToNodeLocalInScene(project.scene, id, { x: px, y: py });
  if (entry?.hit && (n.type === "Shape" || n.type === "Line")) {
    if (n.type === "Line") return entry.hit.isPointInStroke(new DOMPoint(px, py));
    const local = new DOMPoint(localPt.x, localPt.y);
    return entry.hit.isPointInFill(local) || entry.hit.isPointInStroke(local);
  }
  return pointInRotatedRect({ x: px, y: py }, absRect(id), worldRotation(id));
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

/** 吸附时参考的方框：除了正在动的这些（和它们里面的东西）以外的全部节点（按旋转后的视觉外包围盒计算），以及窗口本身。线条不算。 */
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
    rects.push(id === project.scene.root ? { x: 0, y: 0, width: n.width, height: n.height } : visualRect(id));
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
// 旋转把手：单选非线条、非根窗口、未锁定时显示在选中框正上方
const rotateHandle = document.createElement("div");
rotateHandle.className = "rotate-handle";
rotateHandle.dataset.rotate = "true";
rotateHandle.title = "拖动旋转（按住 Shift 按 15° 对齐）";
selectionBox.append(rotateHandle);
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
// 折线、直线、曲线的拐点把手
const bendHandles = document.createElement("div");
bendHandles.id = "bend-handles";
overlay.append(ghost, guidesLayer, outlines, selectionBox, bendHandles, ...endpointHandles, marqueeBox);

/** 多选时的外框：所有选中的东西（按旋转后的视觉外包围盒）合起来的方框。 */
function unionRect(ids: string[]): Rect | null {
  let box: Rect | null = null;
  for (const id of ids) {
    const r = visualRect(id);
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

/** 选中的线条：折线每段中间放平移把手；直线和曲线在每段中点放添加拐点把手、在每个拐点上放拖动/双击删除把手。 */
function updateBendHandles(): void {
  bendHandles.replaceChildren();
  const id = selectedIds.length === 1 ? selectedId : null;
  const n = id ? node(id) : undefined;
  if (!id || n?.type !== "Line" || mode !== "edit" || isNodeLocked(project.scene, id)) return;
  const props = designRuntime.view(id).props;
  if (props.route === "elbow") {
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
    return;
  }
  // 直线（straight）和曲线（curved）：在相邻折点中点提供添加拐点把手，在已有拐点上提供拖动与双击删除把手
  const origin = parentOrigin(id);
  const bends = parseBends(props.bends).map((p) => ({ x: p.x + origin.x, y: p.y + origin.y }));
  const layout = lineLayoutOf(id, props);
  const waypoints = [layout.start.point, ...bends, layout.end.point];
  const mids = lineSegmentMidpoints(str(props.route, "straight"), layout.start, layout.end, bends);
  for (let i = 0; i < mids.length; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 20) continue;
    const mid = mids[i];
    const handle = document.createElement("div");
    handle.className = "bend-handle bend-add";
    handle.dataset.bendInsert = String(i);
    handle.dataset.segment = String(i);
    handle.title = "拖动添加拐点";
    Object.assign(handle.style, { left: `${mid.x}px`, top: `${mid.y}px` });
    bendHandles.append(handle);
  }
  for (let i = 0; i < bends.length; i++) {
    const p = bends[i];
    const handle = document.createElement("div");
    handle.className = "bend-handle bend-point";
    handle.dataset.bendIndex = String(i);
    handle.title = "拖动调整拐点，双击删除拐点";
    Object.assign(handle.style, { left: `${p.x}px`, top: `${p.y}px` });
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
    selectionBox.style.transform = "";
    selectionTag.style.transform = "";
    sizeLabel.style.transform = "";
    selectionBox.classList.remove("locked");
    rotateHandle.style.display = "none";
    positionShapeBar();
    return;
  }
  if (selectedIds.length > 1) {
    // 多选：每个东西一个细框，外面一个合起来的框，支持整体移动和整体按比例缩放
    for (const id of selectedIds) {
      const r = absRect(id);
      const eachRot = worldRotation(id);
      const box = document.createElement("div");
      box.className = "multi-outline";
      Object.assign(box.style, {
        left: `${r.x}px`,
        top: `${r.y}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
        transform: eachRot ? `rotate(${eachRot}deg)` : "",
        transformOrigin: "center center",
      });
      outlines.append(box);
    }
    const tops = topSelection();
    const unlockedIds = filterUnlocked(project.scene, tops);
    const allLocked = unlockedIds.length === 0;
    const all = unionRect(tops)!;
    Object.assign(selectionBox.style, {
      display: "",
      left: `${all.x}px`,
      top: `${all.y}px`,
      width: `${all.width}px`,
      height: `${all.height}px`,
      transform: "",
    });
    selectionTag.style.transform = "";
    sizeLabel.style.transform = "";
    selectionBox.classList.remove("line");
    selectionBox.classList.add("multi");
    selectionBox.classList.toggle("locked", allLocked);
    selectionTag.textContent = `已选中 ${selectedIds.length} 个${allLocked ? "（已锁定）" : ""}`;
    selectionTag.style.display = "";
    rotateHandle.style.display = "none";
    for (const handle of selectionBox.querySelectorAll<HTMLElement>(".handle")) {
      handle.style.display = allLocked ? "none" : "";
    }
    positionShapeBar();
    return;
  }
  selectionBox.classList.remove("multi");
  const r = absRect(selectedId);
  const isRoot = selectedId === project.scene.root;
  const locked = isNodeLocked(project.scene, selectedId);
  const rot = worldRotation(selectedId);
  const nodeRot = n.rotation ?? 0;
  const flipLabels = Math.abs(normalizeRotation(rot)) > 90;
  Object.assign(selectionBox.style, {
    display: "",
    left: `${r.x}px`,
    top: `${r.y}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
    transform: rot ? `rotate(${rot}deg)` : "",
    transformOrigin: "center center",
  });
  selectionTag.style.transform = flipLabels ? "rotate(180deg)" : "";
  sizeLabel.style.transform = flipLabels ? "translateX(-50%) rotate(180deg)" : "";
  selectionBox.classList.toggle("line", isLine);
  selectionBox.classList.toggle("locked", locked);
  selectionTag.textContent = `${selectedId} · ${typeLabel(selectedId)}${nodeRot ? ` · ${nodeRot}°` : ""}${locked ? " · 已锁定" : ""}`;
  selectionTag.style.display = isRoot ? "none" : "";
  // 根窗口只能从右边和下边调整尺寸；线条用两端的圆点调整；已锁定的节点不显示缩放和旋转把手
  for (const handle of selectionBox.querySelectorAll<HTMLElement>(".handle")) {
    handle.style.display = locked || isLine ? "none" : !isRoot || ["e", "s", "se"].includes(handle.dataset.handle!) ? "" : "none";
  }
  rotateHandle.style.display = locked || isLine || isRoot ? "none" : "";
  if (isLine) {
    const layout = lineLayoutOf(selectedId, designRuntime.view(selectedId).props);
    for (const handle of endpointHandles) {
      const point = handle.dataset.endpoint === "start" ? layout.start.point : layout.end.point;
      Object.assign(handle.style, { display: locked ? "none" : "", left: `${point.x}px`, top: `${point.y}px` });
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
  const rot = worldRotation(anchor.node);
  if (node(anchor.node)?.type === "Shape" || rot !== 0) {
    // 形状或旋转后的节点：把真实的外轮廓描出来
    const points = worldOutlineOf(anchor.node).map((p) => `${p.x},${p.y}`).join(" ");
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
    const r = visualRect(id);
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
    const vr = visualRect(id);
    if (px < vr.x - 12 || px > vr.x + vr.width + 12 || py < vr.y - 12 || py > vr.y + vr.height + 12) continue;
    const hit = nearestOnOutline(id, { x: px, y: py });
    if (hit.distance <= bestDistance) {
      bestDistance = hit.distance;
      const r = absRect(id);
      const localHit = worldToNodeLocalInScene(project.scene, id, hit.point);
      const at = { x: localHit.x / Math.max(1, r.width), y: localHit.y / Math.max(1, r.height) };
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
  | {
      kind: "groupResize";
      ids: string[];
      items: MultiResizeItem[];
      handle: string;
      start: Point;
      origBox: Rect;
      moved: boolean;
      targets: Rect[];
    }
  | { kind: "rotate"; id: string; center: Point; startPointer: Point; startRotation: number; moved: boolean }
  | { kind: "marquee"; start: Point; scope: string; base: string[]; clicked: string | null; moved: boolean }
  | { kind: "bend"; id: string; index: number; points: Point[]; start: Point; horizontal: boolean; moved: boolean }
  | { kind: "waybend"; id: string; index: number; start: Point; moved: boolean }
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

/** 落在哪个能装东西的节点里：从鼠标下最里面的节点往外找（不穿透已锁定的容器，由调用方统一拒绝向锁定容器放入控件）。 */
function containerAt(px: number, py: number, excludeId?: string): string {
  for (let hit = hitTest(px, py); hit; hit = parentOf(hit)) {
    if (excludeId) {
      let insideExcluded = false;
      for (let p: string | null = hit; p; p = parentOf(p)) {
        if (p === excludeId) {
          insideExcluded = true;
          break;
        }
      }
      if (insideExcluded) continue;
    }
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
    if (isNodeLocked(project.scene, parentId)) {
      toast("目标容器已锁定，无法放入控件");
      return;
    }
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
    const parentId = containerAt(pt.x, pt.y);
    if (parentId && isNodeLocked(project.scene, parentId)) {
      toast("目标容器已锁定，无法放入控件");
      return;
    }
    const snapped = snapPoint(pt.x, pt.y, snapTargets(null), snapOptions(e));
    gesture = { kind: "draw", preset: null, nodeType: tool.type, start: { x: snapped.x, y: snapped.y }, rect: null, parentId, targets: snapTargets(null) };
    capturePointer(e);
    return;
  }

  // 旋转把手
  if (target.dataset.rotate && selectedId && selectedIds.length === 1) {
    const n = node(selectedId);
    if (!n || n.type === "Line" || selectedId === project.scene.root || isNodeLocked(project.scene, selectedId)) return;
    const r = absRect(selectedId);
    const center = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    gesture = {
      kind: "rotate",
      id: selectedId,
      center,
      startPointer: pt,
      startRotation: n.rotation ?? 0,
      moved: false,
    };
    capturePointer(e);
    return;
  }

  const endpoint = target.dataset.endpoint as "start" | "end" | undefined;
  if (endpoint && selectedId && !isNodeLocked(project.scene, selectedId)) {
    gesture = { kind: "endpoint", id: selectedId, which: endpoint, moved: false };
    capturePointer(e);
    return;
  }

  // 直线或曲线：在某段中点把手按下添加新拐点并拖动
  const bendInsert = target.dataset.bendInsert;
  if (bendInsert !== undefined && selectedId && !isNodeLocked(project.scene, selectedId)) {
    const n = node(selectedId);
    if (!n || n.type !== "Line") return;
    const insertIdx = Number(bendInsert);
    const origin = parentOrigin(selectedId);
    n.props = addBendToLine(n.props ?? {}, insertIdx, pt, origin);
    const entry = mounted.get(selectedId);
    if (entry) paintGraphic(selectedId, entry, { ...designRuntime.view(selectedId).props, ...n.props });
    updateSelectionBox();
    gesture = { kind: "waybend", id: selectedId, index: insertIdx, start: pt, moved: true };
    capturePointer(e);
    return;
  }

  // 直线或曲线：拖动已有拐点（不在 pointerdown 立即捕获指针，保留浏览器原生双击目标以支持双击删除拐点）
  const bendIndex = target.dataset.bendIndex;
  if (bendIndex !== undefined && selectedId && !isNodeLocked(project.scene, selectedId)) {
    gesture = { kind: "waybend", id: selectedId, index: Number(bendIndex), start: pt, moved: false };
    return;
  }

  // 折线某一段中间的小把手
  const segment = target.dataset.segment;
  if (segment !== undefined && selectedId && !isNodeLocked(project.scene, selectedId)) {
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

  // 缩放：单选缩放 或 多选整体按比例缩放
  const handle = target.dataset.handle ?? null;
  if (handle && selectedId) {
    if (selectedIds.length > 1) {
      const ids = filterUnlocked(project.scene, topSelection());
      if (ids.length === 0) return;
      const items: MultiResizeItem[] = ids.map((each) => {
        const eachNode = node(each)!;
        return {
          id: each,
          abs: absRect(each),
          parentOrigin: parentOrigin(each),
          isLine: eachNode.type === "Line",
          lineProps: eachNode.type === "Line" ? { ...eachNode.props } : undefined,
        };
      });
      const origBox = unionRect(ids)!;
      gesture = {
        kind: "groupResize",
        ids,
        items,
        handle,
        start: { x: e.clientX, y: e.clientY },
        origBox,
        moved: false,
        targets: snapTargets(ids),
      };
      capturePointer(e);
      return;
    }
    const n = node(selectedId);
    if (!n || n.type === "Line" || isNodeLocked(project.scene, selectedId)) return;
    const orig = { x: n.x ?? 0, y: n.y ?? 0, width: n.width, height: n.height };
    const isRoot = selectedId === project.scene.root;
    gesture = {
      kind: "resize", id: selectedId, handle, start: { x: e.clientX, y: e.clientY }, orig,
      abs: isRoot ? { ...orig, x: 0, y: 0 } : absRect(selectedId), moved: false, targets: isRoot ? [] : snapTargets(selectedId),
    };
    capturePointer(e);
    return;
  }

  const stageDoc = (document.getElementById("stage-iframe") as HTMLIFrameElement | null)?.contentDocument;
  const menuBtn = stageDoc?.elementFromPoint(pt.x, pt.y)?.closest<HTMLElement>("[data-vf-menu-item]");
  if (menuBtn?.dataset.vfMenuItem) {
    focusMenuItemInEditor(menuBtn.dataset.vfMenuItem);
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
  const ids = filterUnlocked(project.scene, topSelection()).filter((each) => !isLayoutPositionedNode(project.scene, each));
  if (ids.length === 0) {
    if (!toggleOnClick && selectedIds.length === 1 && selectedId && tryStartLayoutCanvasDrag(selectedId, e)) {
      return;
    }
    if (toggleOnClick) gesture = { kind: "move", ids: [], origins: [], start: { x: e.clientX, y: e.clientY }, abs: absRect(id), moved: false, targets: [], toggleOnClick };
    return;
  }
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

/** 节点的位置或大小在拖动中变了：只挪动它自己的元素（排版或分区节点重算排版），形状重画，挂着的线跟着走。 */
function applyLiveGeometry(id: string): void {
  const n = node(id);
  if (!n) return;
  if (id === project.scene.root) {
    $("stage").style.width = `${n.width}px`;
    $("stage").style.height = `${n.height}px`;
  }
  if (id === project.scene.root || isLayoutPositionedNode(project.scene, id) || layoutOf(n) !== null || isPartitionedWindow(n)) {
    applyViews();
  } else {
    const entry = mounted.get(id);
    if (entry) {
      Object.assign(entry.wrapper.style, {
        left: `${n.x ?? 0}px`,
        top: `${n.y ?? 0}px`,
        width: `${n.width}px`,
        height: `${n.height}px`,
        transform: n.rotation ? `rotate(${n.rotation}deg)` : "",
        transformOrigin: "center center",
      });
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
      const d = worldToParentDeltaInScene(project.scene, origin.id, mx, my);
      if (n.type === "Line" && origin.props) {
        n.props = offsetLineProps(origin.id, origin.props, Math.round(d.x), Math.round(d.y));
      } else {
        n.x = Math.round(origin.x + d.x);
        n.y = Math.round(origin.y + d.y);
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
    const { abs, handle } = gesture;
    const isRoot = gesture.id === project.scene.root;
    const rot = isRoot ? 0 : worldRotation(gesture.id);
    const keepAspect = e.shiftKey && handle.length === 2;
    let box = computeResizeBox(abs, handle, dx, dy, keepAspect, MIN_SIZE, rot);
    if (!isRoot && rot === 0 && !keepAspect) {
      const snapped = snapResize(box, handle, gesture.targets, options);
      box = snapped.rect;
      drawGuides(snapped.guides);
    }
    const nextW = Math.max(MIN_SIZE, Math.round(box.width));
    const nextH = Math.max(MIN_SIZE, Math.round(box.height));
    syncResizedNodeDimensions(n, nextW, nextH, MIN_SIZE, project.scene, gesture.id);
    if (n.type === "Dock") {
      const rootNode = node(project.scene.root);
      if (rootNode?.dockLayout) designRuntime.setDockLayout(rootNode.dockLayout, project.scene.root);
    }
    if (!isRoot && !isLayoutPositionedNode(project.scene, gesture.id)) {
      const local = worldRectToNodeLocalInScene(project.scene, gesture.id, {
        x: box.x,
        y: box.y,
        width: n.width,
        height: n.height,
      }, currentLayoutBoxes());
      n.x = local.x;
      n.y = local.y;
    } else if (isLayoutPositionedNode(project.scene, gesture.id)) {
      delete n.x;
      delete n.y;
    }
    showSize(n.width, n.height);
    applyLiveGeometry(gesture.id);
    return;
  }

  if (gesture.kind === "groupResize") {
    const dx = Math.round((e.clientX - gesture.start.x) / viewZoom());
    const dy = Math.round((e.clientY - gesture.start.y) / viewZoom());
    if (dx === 0 && dy === 0 && !gesture.moved) return;
    gesture.moved = true;
    const { origBox, handle } = gesture;
    // 多选整体缩放：四角拖拽默认保持长宽比（按比例缩放），按住 Shift 可自由变形
    const keepAspect = handle.length === 2 ? !e.shiftKey : false;
    let box = computeResizeBox(origBox, handle, dx, dy, keepAspect, MIN_SIZE, 0);
    if (!keepAspect) {
      const snapped = snapResize(box, handle, gesture.targets, options);
      box = snapped.rect;
      drawGuides(snapped.guides);
    }
    box = {
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.max(MIN_SIZE, Math.round(box.width)),
      height: Math.max(MIN_SIZE, Math.round(box.height)),
    };
    const scaledList = scaleGroupItems(gesture.items, origBox, box, MIN_SIZE, project.scene);
    let needReflow = false;
    for (const [id, scaled] of scaledList) {
      const eachNode = node(id);
      if (!eachNode) continue;
      if (eachNode.type === "Line" && scaled.props) {
        eachNode.props = scaled.props;
      } else {
        syncResizedNodeDimensions(eachNode, scaled.width, scaled.height, MIN_SIZE, project.scene, id);
        if (eachNode.type === "Dock") {
          const rootNode = node(project.scene.root);
          if (rootNode?.dockLayout) designRuntime.setDockLayout(rootNode.dockLayout, project.scene.root);
        }
        if (isLayoutPositionedNode(project.scene, id)) {
          delete eachNode.x;
          delete eachNode.y;
          needReflow = true;
        } else {
          eachNode.x = scaled.x;
          eachNode.y = scaled.y;
          if (layoutOf(eachNode) !== null || isPartitionedWindow(eachNode)) {
            needReflow = true;
          }
          const entry = mounted.get(id);
          if (entry) {
            Object.assign(entry.wrapper.style, {
              left: `${eachNode.x}px`,
              top: `${eachNode.y}px`,
              width: `${eachNode.width}px`,
              height: `${eachNode.height}px`,
            });
            if (eachNode.type === "Shape") paintGraphic(id, entry, activeRuntime().view(id).props);
          }
        }
      }
    }
    if (needReflow) applyViews();
    showSize(box.width, box.height);
    refreshLines();
    updateSelectionBox();
    return;
  }

  if (gesture.kind === "rotate") {
    const n = node(gesture.id);
    if (!n) return;
    const deg = computeRotationAngle(gesture.center, pt, gesture.startPointer, gesture.startRotation, e.shiftKey);
    if (deg === (n.rotation ?? 0) && !gesture.moved) return;
    gesture.moved = true;
    setNodeRotation(n, deg);
    sizeLabel.textContent = `${deg}°`;
    sizeLabel.style.display = "";
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
    // 框住的是起点所在的那一层里、未锁定且和方框（含旋转后精确有向矩形）有交叠的东西
    const hits = childrenOf(node(gesture.scope)).filter((child) => {
      if (isNodeLocked(project.scene, child)) return false;
      const r = absRect(child);
      return rectIntersectsRotatedRect(rect, r, worldRotation(child));
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

  if (gesture.kind === "waybend") {
    const n = node(gesture.id);
    if (!n) return;
    if (!gesture.moved && Math.hypot(pt.x - gesture.start.x, pt.y - gesture.start.y) < 2) return;
    if (!gesture.moved) capturePointer(e);
    const snapped = snapPoint(pt.x, pt.y, snapTargets(gesture.id), options);
    drawGuides(snapped.guides);
    gesture.moved = true;
    n.props = moveBendOnLine(n.props ?? {}, gesture.index, { x: snapped.x, y: snapped.y }, parentOrigin(gesture.id));
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
    if (finished.moved) {
      if (finished.ids.length === 1) {
        tryDropFreeNodeIntoLayoutContainer(finished.ids[0], stagePoint(e));
      }
      void saveScene();
    } else if (finished.toggleOnClick) select(finished.toggleOnClick, true);
    return;
  }
  if (
    finished.kind === "resize" ||
    finished.kind === "groupResize" ||
    finished.kind === "rotate" ||
    finished.kind === "endpoint" ||
    finished.kind === "bend" ||
    finished.kind === "waybend"
  ) {
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
  if (selectedId && !isNodeLocked(project.scene, selectedId)) {
    const n = node(selectedId);
    if (n && n.type === "Line") {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-bend-index]");
      let idx = target?.dataset.bendIndex !== undefined ? Number(target.dataset.bendIndex) : -1;
      if (idx < 0) {
        const origin = parentOrigin(selectedId);
        const bends = parseBends(n.props?.bends).map((p) => ({ x: p.x + origin.x, y: p.y + origin.y }));
        idx = bends.findIndex((b) => Math.hypot(b.x - pt.x, b.y - pt.y) <= 10);
      }
      if (idx >= 0) {
        n.props = deleteBendFromLine(n.props ?? {}, idx);
        void saveScene({ label: "删除拐点" });
        return;
      }
    }
  }
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
  if (!n || !entry || !isGraphic(id) || isNodeLocked(project.scene, id)) return;
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
  if (document.getElementById("delete-confirm")) return;
  const target = e.target as HTMLElement;
  const ctrl = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  const inDocPreview = target instanceof HTMLElement && Boolean(target.closest("#doc-preview"));
  if (mode === "edit" && inDocPreview && ctrl && (key === "z" || key === "y")) {
    e.preventDefault();
    void (key === "y" || e.shiftKey ? redo() : undo());
    return;
  }
  if (mode !== "edit" || (target instanceof HTMLElement && (target.matches("input, textarea, select") || target.isContentEditable))) return;

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
  if (ctrl && key === "l") {
    e.preventDefault();
    void toggleLock();
    return;
  }
  if (ctrl && key === "d") {
    e.preventDefault();
    void duplicateNodes(topSelection());
    return;
  }
  if (ctrl && key === "a") {
    e.preventDefault();
    // 全选：窗口里最外面一层未锁定的全部东西
    setSelection(childrenOf(node(project.scene.root)).filter((id) => !isNodeLocked(project.scene, id)));
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
    const unlocked = filterUnlocked(project.scene, ids);
    if (unlocked.length === 0) return toast("选中的控件已锁定");
    const [dx, dy] = moves[e.key];
    const lineIds = unlocked.filter((id) => node(id)?.type === "Line");
    const boxIds = unlocked.filter((id) => node(id)?.type !== "Line" && !isLayoutPositionedNode(project.scene, id));
    if (boxIds.length === 0 && lineIds.length === 0) return;
    if (boxIds.length > 0) {
      project.scene = applyMoveToScene(project.scene, boxIds, dx, dy);
    }
    for (const id of lineIds) {
      const n = node(id);
      if (n) {
        const d = worldToParentDeltaInScene(project.scene, id, dx, dy);
        n.props = offsetLineProps(id, n.props ?? {}, Math.round(d.x), Math.round(d.y));
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
    ...allSceneMenuIds(project.scene),
    ...Object.keys(project.logic.state ?? {}),
    ...Object.keys(project.logic.conditions ?? {}),
  ]);
  for (let i = 1; ; i++) {
    if (!taken.has(`${base}${i}`) && isValidIdentifier(`${base}${i}`)) return `${base}${i}`;
  }
}

/** rect1 → rect：复制节点时，新 ID 沿用同样的前缀。 */
function idBaseOf(id: string): string {
  return id.replace(/\d+$/, "") || "node";
}

/** 放一个新节点进画布。rect 是设计窗口里的绝对坐标。 */
async function createNode(type: string, parentId: string, rect: Rect, props?: Record<string, Value>, idBase?: string): Promise<string> {
  if (isNodeLocked(project.scene, parentId)) {
    toast("目标容器已锁定，无法放入控件");
    return "";
  }
  const decl = declFor(project, type) ?? CONTAINER_DECL;
  const id = newId(type, idBase);
  const ok = placeNewNodeInScene(
    project.scene,
    type,
    id,
    rect.x + rect.width / 2,
    rect.y + rect.height / 2,
    { width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) },
    {
      targetContainerId: parentId,
      exactTopLeft: { x: rect.x, y: rect.y },
      props,
      canHaveChildren: Boolean(decl.children),
      boxes: currentLayoutBoxes(),
    },
  );
  if (!ok) {
    toast("目标容器已锁定，无法放入控件");
    return "";
  }
  selectedId = id;
  await saveScene();
  return id;
}

async function addNode(type: string, px: number, py: number): Promise<void> {
  await commitPaletteDropOnStage(type, px, py);
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
  if (isNodeLocked(project.scene, id)) return toast("控件已锁定");
  const n = node(id);
  const parentId = parentOf(id);
  if (!n || n.type !== "Shape" || !parentId || isNodeLocked(project.scene, parentId)) return;
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
    delete copy.locked;
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
    let { parentId, index } = placement(root);
    while (parentId !== project.scene.root && isNodeLocked(project.scene, parentId)) {
      parentId = parentOf(parentId) ?? project.scene.root;
      index = undefined;
    }
    const parent = node(parentId) ?? node(project.scene.root)!;
    const origin = parentId === project.scene.root ? { x: 0, y: 0 } : absRect(parentId);
    const copy = node(fresh)!;
    const isDockInPartition = copy.type === "Dock" && parentId === project.scene.root && isPartitionedWindow(parent);
    if (copy.type === "Line") copy.props = shiftLineAll(copy.props ?? {}, offset - origin.x, offset - origin.y);
    else if (layoutOf(parent) !== null || isDockInPartition) {
      delete copy.x;
      delete copy.y;
    } else {
      copy.x = (copy.x ?? 0) + offset - origin.x;
      copy.y = (copy.y ?? 0) + offset - origin.y;
    }
    if (isDockInPartition) {
      parent.docks ??= [];
      const sourceDockIdx = parent.docks.indexOf(root);
      const dockInsertIdx = sourceDockIdx >= 0 ? sourceDockIdx + 1 : index;
      if (dockInsertIdx === undefined || dockInsertIdx < 0 || dockInsertIdx > parent.docks.length) {
        parent.docks.push(fresh);
      } else {
        parent.docks.splice(dockInsertIdx, 0, fresh);
      }
      if (parent.dockLayout) {
        const loc = dockFindLocation(parent.dockLayout, root);
        if (loc?.kind === "area") {
          parent.dockLayout.areas[loc.area].groups.splice(loc.groupIndex + 1, 0, { tabs: [fresh], active: fresh });
        } else {
          const area = isDockArea(copy.dockArea) ? copy.dockArea : "left";
          parent.dockLayout.areas[area].groups.push({ tabs: [fresh], active: fresh });
        }
      }
      if (parent.children) {
        const childIdx = parent.children.indexOf(root);
        if (childIdx >= 0) parent.children.splice(childIdx + 1, 0, fresh);
        else if (!parent.children.includes(fresh)) parent.children.push(fresh);
      }
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
  const unlocked = filterUnlocked(project.scene, ids);
  if (unlocked.length === 0) return toast("选中的控件已锁定");
  const clip = copyNodes(unlocked);
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

/** 粘贴到哪里：选中的是能装东西且未锁定的节点，就放进它里面；否则往外找未锁定的父容器；什么都没选就放进窗口。 */
function pasteParent(): string {
  if (!selectedId) return project.scene.root;
  if (selectedIds.length === 1 && canHoldChildren(selectedId) && !isNodeLocked(project.scene, selectedId)) {
    return selectedId;
  }
  for (let p = parentOf(selectedId); p; p = parentOf(p)) {
    if (canHoldChildren(p) && !isNodeLocked(project.scene, p)) return p;
  }
  return project.scene.root;
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

/** 询问用户是否把被删控件在 YAML 中的条目一并删除：返回 "both" | "scene-only" | "cancel"。 */
function askDeleteYamlEntries(yamlIds: string[]): Promise<"both" | "scene-only" | "cancel"> {
  return new Promise((resolve) => {
    const existing = document.getElementById("delete-confirm");
    if (existing) existing.remove();
    const backdrop = document.createElement("div");
    backdrop.id = "delete-confirm";
    const card = document.createElement("div");
    card.className = "confirm-card";
    const title = document.createElement("div");
    title.className = "confirm-title";
    title.textContent = "删除控件";
    const msg = document.createElement("div");
    msg.className = "confirm-msg";
    msg.textContent = `控件 ${yamlIds.join("、")} 在 ${LOGIC_PATH} 中有逻辑条目，是否一并删除这些 YAML 条目？`;
    const actions = document.createElement("div");
    actions.className = "confirm-actions";

    const finish = (choice: "both" | "scene-only" | "cancel") => {
      document.removeEventListener("keydown", onKey, true);
      backdrop.remove();
      resolve(choice);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        finish("cancel");
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const active = document.activeElement as HTMLElement | null;
        const choice = active?.dataset.choice as "both" | "scene-only" | "cancel" | undefined;
        finish(choice ?? "both");
        return;
      }
      if (e.key !== "Tab") {
        e.stopPropagation();
      }
    };
    document.addEventListener("keydown", onKey, true);

    const btnBoth = document.createElement("button");
    btnBoth.type = "button";
    btnBoth.className = "primary";
    btnBoth.dataset.choice = "both";
    btnBoth.textContent = "一并删除 YAML 条目";
    btnBoth.addEventListener("click", () => finish("both"));

    const btnSceneOnly = document.createElement("button");
    btnSceneOnly.type = "button";
    btnSceneOnly.dataset.choice = "scene-only";
    btnSceneOnly.textContent = "只删除控件";
    btnSceneOnly.addEventListener("click", () => finish("scene-only"));

    const btnCancel = document.createElement("button");
    btnCancel.type = "button";
    btnCancel.dataset.choice = "cancel";
    btnCancel.textContent = "取消";
    btnCancel.addEventListener("click", () => finish("cancel"));

    actions.append(btnBoth, btnSceneOnly, btnCancel);
    card.append(title, msg, actions);
    backdrop.append(card);
    backdrop.addEventListener("pointerdown", (e) => {
      if (e.target === backdrop) finish("cancel");
    });
    document.body.append(backdrop);
    btnBoth.focus();
  });
}

async function deleteNodes(ids: string[], options: { askYaml?: boolean; removeYaml?: boolean } = {}): Promise<void> {
  const candidates = ids.filter((id) => id !== project.scene.root);
  if (candidates.length === 0) return;
  const unlockedRoots = candidates.filter((id) => !hasLockedInSubtree(project.scene, id));
  if (unlockedRoots.length === 0) {
    toast("选中的控件（或其子控件）已锁定，解锁后才能删除");
    return;
  }
  const removed = collectSubtreeIds(project.scene, unlockedRoots);
  if (removed.size === 0) return;

  const yamlIds = nodesWithYamlEntries(project.logicText, removed);
  let deleteYaml = options.removeYaml ?? false;
  if (yamlIds.length > 0 && options.askYaml !== false && options.removeYaml === undefined) {
    const choice = await askDeleteYamlEntries(yamlIds);
    if (choice === "cancel") return;
    deleteYaml = choice === "both";
  }

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
  const delRes = applyDeleteFromScene(project.scene, unlockedRoots, project.logicText, deleteYaml);
  project.scene = delRes.scene;
  selectedId = null;
  selectedIds = [];
  const nextLogicText = deleteYaml && yamlIds.length > 0 ? delRes.logicText : undefined;
  await saveScene({ nextLogicText, label: "删除控件" });
}

async function deleteNode(id: string): Promise<void> {
  await deleteNodes([id]);
}

async function toggleLock(targetIds?: string[]): Promise<void> {
  const ids = (targetIds ?? (selectedIds.length > 0 ? topSelection() : selectedId ? [selectedId] : [])).filter(
    (id) => id !== project.scene.root && !!node(id),
  );
  if (ids.length === 0) return;
  const shouldLock = ids.some((id) => !isNodeLocked(project.scene, id));
  if (!shouldLock) {
    const chosen = new Set(ids);
    const lockedParent = ids
      .map((id) => lockedAncestorInScene(project.scene, id))
      .find((anc): anc is string => anc !== null && !chosen.has(anc));
    const changed = setNodesLocked(project.scene, ids, false);
    if (changed) {
      await saveScene({ label: "解锁控件" });
    }
    if (lockedParent) {
      toast(`父容器 ${lockedParent} 已锁定，请先解锁父容器`);
      return;
    }
    toast(`已解锁 ${ids.length} 个控件`);
    return;
  }
  setNodesLocked(project.scene, ids, true);
  await saveScene({ label: "锁定控件" });
  toast(`已锁定 ${ids.length} 个控件`);
}

function alignableSelection(): string[] {
  return filterUnlocked(project.scene, topSelection()).filter((id) => {
    const n = node(id);
    return !!n && n.type !== "Line" && !isLayoutPositionedNode(project.scene, id);
  });
}

async function alignSelected(kind: AlignKind): Promise<void> {
  const ids = alignableSelection();
  if (ids.length < 2) return toast("至少需要 2 个未锁定的控件才能对齐");
  const changed = alignSceneNodes(project.scene, ids, kind);
  if (!changed) return toast("选中的控件已锁定或无需对齐");
  await saveScene({ label: "对齐控件" });
}

async function distributeSelected(axis: DistributeAxis): Promise<void> {
  const ids = alignableSelection();
  if (ids.length < 3) return toast("至少需要 3 个未锁定的控件才能等距分布");
  const changed = distributeSceneNodes(project.scene, ids, axis);
  if (!changed) return toast("至少需要 3 个未锁定的控件才能等距分布");
  await saveScene({ label: "分布控件" });
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
  if (copySelection(e)) void deleteNodes(ids, { askYaml: false });
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
  if (isNodeLocked(project.scene, id)) return toast("控件已锁定");
  const parentId = parentOf(id);
  if (!parentId) return;
  const parent = node(parentId)!;
  if (parent.docks?.includes(id)) {
    const rest = parent.docks.filter((child) => child !== id);
    parent.docks = toFront ? [...rest, id] : [id, ...rest];
  }
  if (parent.dockLayout) {
    const loc = dockFindLocation(parent.dockLayout, id);
    if (loc?.kind === "area") {
      const areaSpec = parent.dockLayout.areas[loc.area];
      const grp = areaSpec.groups[loc.groupIndex];
      if (grp && grp.tabs.length > 1) {
        const restTabs = grp.tabs.filter((t) => t !== id);
        grp.tabs = toFront ? [...restTabs, id] : [id, ...restTabs];
      } else if (areaSpec.groups.length > 1) {
        const [movedGrp] = areaSpec.groups.splice(loc.groupIndex, 1);
        if (toFront) areaSpec.groups.push(movedGrp);
        else areaSpec.groups.unshift(movedGrp);
      }
    } else if (loc?.kind === "floating" && parent.dockLayout.floating && parent.dockLayout.floating.length > 1) {
      const [movedFloat] = parent.dockLayout.floating.splice(loc.index, 1);
      if (toFront) parent.dockLayout.floating.push(movedFloat);
      else parent.dockLayout.floating.unshift(movedFloat);
    }
  }
  if (parent.children?.includes(id)) {
    const rest = parent.children.filter((child) => child !== id);
    parent.children = toFront ? [...rest, id] : [id, ...rest];
  }
  await saveScene();
}

async function revertToContainer(id: string): Promise<void> {
  if (isNodeLocked(project.scene, id)) return toast("控件已锁定");
  const n = node(id);
  if (!n) return;
  n.type = "Container";
  delete n.props;
  n.children ??= [];
  await saveScene();
}

async function renameId(oldId: string, nextId: string): Promise<void> {
  if (nextId === oldId) return;
  if (isNodeLocked(project.scene, oldId)) return toast("控件已锁定，解锁后才能重命名");
  if (!isValidIdentifier(nextId)) return toast("ID 只能用字母、数字和下划线，不能以数字开头且不能使用保留字");
  if (
    node(nextId) ||
    allSceneMenuIds(project.scene).has(nextId) ||
    project.logic.state?.[nextId] !== undefined ||
    project.logic.conditions?.[nextId]
  ) {
    return toast(`“${nextId}”已经被别的控件、菜单、状态或条件使用`);
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
  await saveScene({ nextLogicText: logicText, label: `重命名 ${oldId} → ${nextId}` });
  if (!node(nextId) && node(oldId)) {
    selectedId = oldId;
    selectedIds = [oldId];
    afterSelectionChange();
  }
}

async function createDocSection(id: string): Promise<void> {
  if (!(await flushEditors())) return;
  const doc = parseDocument(project.logicText);
  if (doc.errors.length > 0) {
    toast("YAML 有语法错误，请先在 YAML 页签中修正");
    return;
  }
  const name = sectionNameFor(id);
  const path = project.pageDoc;
  const current = project.docs.get(path) ?? `# ${project.name}\n`;
  const nextDocContent = getSection(current, name) === null ? appendSection(current, name, id) : current;
  ensureObject(doc, id);
  doc.setIn(["objects", id, "doc"], `${path}#${name}`);
  const nextLogicText = doc.toString(YAML_OUTPUT);

  const before = currentSnapshot();
  const nextDocs = { ...(before.docs ?? {}), [path]: nextDocContent };
  const changes: FileChange[] = [];
  if (nextDocContent !== current) changes.push({ path, next: nextDocContent, prev: project.docs.get(path) ?? null });
  if (nextLogicText !== project.logicText) changes.push({ path: LOGIC_PATH, next: nextLogicText, prev: project.logicText });
  window.clearTimeout(docTimer);
  window.clearTimeout(yamlTimer);
  const failure = await writeFilesTogether(changes);
  if (failure !== null) {
    toast(`创建说明失败：${failure}`);
    return;
  }
  yamlDirty = false;
  yamlBaseContent = nextLogicText;
  yamlConflictNotified = false;
  history = pushHistory(
    history,
    before,
    { ...before, logicText: nextLogicText, docs: nextDocs },
    "创建说明",
  );
  await reload();
}

async function addCondition(id: string): Promise<void> {
  const existing = project.logic.objects?.[id]?.conditions ?? {};
  let name = "cond1";
  for (let i = 1; existing[name]; i++) name = `cond${i + 1}`;
  const ok = await editLogic((doc) => {
    ensureObject(doc, id);
    doc.setIn(["objects", id, "conditions", name], doc.createNode({ type: "text", text: "在这里写一句话", preview: false }));
  }, "添加条件");
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
      { label: "剪切（Ctrl+X）", action: () => void (copySelection(null) && deleteNodes(ids, { askYaml: false })) },
    );
  }
  if (clipMemory) items.push({ label: "粘贴（Ctrl+V）", action: () => void pasteNodes(clipMemory!) });
  return items;
}

function showMenu(x: number, y: number, id: string): void {
  // 多选时的菜单：只放对整组都有意义的操作
  if (selectedIds.length > 1 && selectedIds.includes(id)) {
    const ids = topSelection();
    const anyUnlocked = ids.some((each) => !isNodeLocked(project.scene, each));
    const alignableCount = alignableSelection().length;
    const items: MenuItem[] = [
      ...clipboardItems(),
      "separator",
      { label: anyUnlocked ? "锁定所选（Ctrl+L）" : "解锁所选（Ctrl+L）", action: () => void toggleLock(ids) },
    ];
    if (alignableCount >= 2) {
      items.push(
        "separator",
        { label: "左对齐", action: () => void alignSelected("left") },
        { label: "水平居中对齐", action: () => void alignSelected("centerH") },
        { label: "右对齐", action: () => void alignSelected("right") },
        { label: "顶对齐", action: () => void alignSelected("top") },
        { label: "垂直居中对齐", action: () => void alignSelected("centerV") },
        { label: "底对齐", action: () => void alignSelected("bottom") },
      );
    }
    if (alignableCount >= 3) {
      items.push(
        { label: "水平等距分布", action: () => void distributeSelected("horizontal") },
        { label: "垂直等距分布", action: () => void distributeSelected("vertical") },
      );
    }
    items.push(
      "separator",
      { label: "复制一份（Ctrl+D）", action: () => void duplicateNodes(ids) },
      { label: `删除这 ${ids.length} 个`, action: () => void deleteNodes(ids) },
    );
    openMenu(x, y, items);
    return;
  }
  const items: MenuItem[] = [{ label: "复制引用", action: () => void copyReference(controlReference(project, id)) }];
  if (id !== project.scene.root) {
    const locked = isNodeLocked(project.scene, id);
    items.push(
      "separator",
      { label: "打开说明", action: () => showRightTab("doc") },
      { label: "编辑逻辑", action: () => showRightTab("yaml") },
      { label: "添加条件", action: () => void addCondition(id) },
      "separator",
      { label: locked ? "解锁（Ctrl+L）" : "锁定（Ctrl+L）", action: () => void toggleLock([id]) },
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

function sep(): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = "tool-sep";
  return s;
}

/**
 * 缩放控件旁边的一组按钮：吸附开关、网格、撤销和重做、锁定、旋转角度、对齐与分布。只在编辑模式下出现。
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

  const undoBtn = toolButton("↶", "撤销画布操作（Ctrl+Z）", false, () => void undo());
  undoBtn.dataset.action = "undo";
  undoBtn.disabled = !canUndo(history);
  const redoBtn = toolButton("↷", "重做（Ctrl+Y / Ctrl+Shift+Z）", false, () => void redo());
  redoBtn.dataset.action = "redo";
  redoBtn.disabled = !canRedo(history);

  const versionBtn = toolButton("历史", "恢复到之前的版本", false, () => {
    const total = history.past.length + history.future.length;
    if (total === 0) return toast("暂无历史版本可恢复");
    const rect = versionBtn.getBoundingClientRect();
    const items: MenuItem[] = [];
    for (let i = total; i >= 0; i--) {
      const isCurrent = i === history.past.length;
      const label = i === 0 ? "初始状态" : i <= history.past.length ? history.past[i - 1].label : history.future[history.future.length - (i - history.past.length)].label;
      items.push({
        label: `${isCurrent ? "● " : "   "}#${i} ${label}`,
        action: () => void restoreVersion(i),
      });
    }
    openMenu(rect.left, rect.bottom + 4, items);
  });
  versionBtn.dataset.action = "versions";
  versionBtn.disabled = history.past.length === 0 && history.future.length === 0;

  const tops = topSelection();
  const lockIds = tops.length > 0 ? tops : selectedId && selectedId !== project.scene.root ? [selectedId] : [];
  const allLocked = lockIds.length > 0 && lockIds.every((id) => isNodeLocked(project.scene, id));
  const lockBtn = toolButton(allLocked ? "🔒" : "🔓", `${allLocked ? "解锁" : "锁定"}选中控件（Ctrl+L）`, allLocked, () => void toggleLock());
  lockBtn.dataset.action = "lock";
  lockBtn.disabled = lockIds.length === 0;

  const singleRotatableId =
    selectedIds.length === 1 && selectedId && selectedId !== project.scene.root && node(selectedId)?.type !== "Line"
      ? selectedId
      : null;
  const rotLabel = document.createElement("label");
  rotLabel.className = "bar-number tool-rotate";
  rotLabel.title = "旋转角度（度），填 0 归零";
  rotLabel.textContent = "旋转°";
  const rotInput = document.createElement("input");
  rotInput.type = "number";
  rotInput.dataset.action = "rotation";
  rotInput.min = "-360";
  rotInput.max = "360";
  rotInput.step = "1";
  rotInput.value = singleRotatableId ? String(node(singleRotatableId)?.rotation ?? 0) : "0";
  rotInput.disabled = !singleRotatableId || isNodeLocked(project.scene, singleRotatableId);
  rotInput.addEventListener("change", () => {
    if (!singleRotatableId) return;
    if (isNodeLocked(project.scene, singleRotatableId)) return toast("控件已锁定");
    const targetNode = node(singleRotatableId);
    const nextVal = Number(rotInput.value);
    if (!targetNode || !Number.isFinite(nextVal)) return;
    setNodeRotation(targetNode, Math.max(-360, Math.min(360, nextVal)));
    void saveScene({ label: "旋转控件" });
  });
  rotLabel.append(rotInput);

  const alignableCount = alignableSelection().length;
  const canAlign = alignableCount >= 2;
  const canDistribute = alignableCount >= 3;
  const alignDefs: Array<[AlignKind, string, string]> = [
    ["left", "⫷", "左对齐"],
    ["centerH", "⫿", "水平居中对齐"],
    ["right", "⫸", "右对齐"],
    ["top", "⫯", "顶对齐"],
    ["centerV", "⫾", "垂直居中对齐"],
    ["bottom", "⫰", "底对齐"],
  ];
  const alignBtns = alignDefs.map(([kind, label, title]) => {
    const btn = toolButton(label, title, false, () => void alignSelected(kind));
    btn.dataset.align = kind;
    btn.disabled = !canAlign;
    return btn;
  });
  const distH = toolButton("⇔", "水平等距分布", false, () => void distributeSelected("horizontal"));
  distH.dataset.distribute = "horizontal";
  distH.disabled = !canDistribute;
  const distV = toolButton("⇕", "垂直等距分布", false, () => void distributeSelected("vertical"));
  distV.dataset.distribute = "vertical";
  distV.disabled = !canDistribute;

  bar.replaceChildren(
    snap,
    grid,
    sep(),
    undoBtn,
    redoBtn,
    versionBtn,
    sep(),
    lockBtn,
    rotLabel,
    sep(),
    ...alignBtns,
    distH,
    distV,
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
  // 多选时，改动作用到选中的同一类且未锁定的图形上
  const rawTargets = selectedIds.includes(id) ? selectedIds.filter((each) => node(each)?.type === n.type) : [id];
  const targets = filterUnlocked(project.scene, rawTargets);
  if (targets.length === 0) return toast("选中的图形已锁定");
  for (const target of targets) {
    const t = node(target)!;
    // 换了线的走法，手动调整过的拐点就不再适用
    if (patch.route !== undefined && patch.route !== t.props?.route && t.props) {
      t.props = { ...t.props };
      delete t.props.bends;
    }
  }
  project.scene = applyPropsToScene(project.scene, targets, patch);
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
    if (selectedIds.length === 1) {
      items.push(
        barNumber("旋转°", n.rotation ?? 0, -360, 360, 1, (value) => {
          if (isNodeLocked(project.scene, id)) return toast("控件已锁定");
          setNodeRotation(n, value);
          void saveScene({ label: "旋转控件" });
        }),
      );
    }
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
  if (n.type === "Line" && parseBends(props.bends).length > 0) {
    items.push(barButton(props.route === "elbow" ? "重置折线" : "重置拐点", "去掉手动添加或调整过的拐点，回到默认走法", () => void setGraphicProps(id, { bends: undefined })));
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
  const r = selectedIds.length > 1 ? unionRect(topSelection())! : visualRect(selectedId);
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
  if (isNodeLocked(project.scene, id)) return toast("线条已锁定");
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
  const bends = parseBends(p.bends);
  if (bends.length > 0) p.bends = formatBends([...bends].reverse());
  n.props = p;
  await saveScene();
}

// ---------- 用户的预设 ----------

async function writePresets(presets: ShapePreset[]): Promise<boolean> {
  if (!(await flushEditors())) return false;
  const nextText = currentPresetsText(presets);
  const before = currentSnapshot();
  try {
    await writeText(PRESETS_PATH, nextText);
  } catch (e) {
    toast(`保存预设失败：${(e as Error).message ?? String(e)}`);
    return false;
  }
  if (nextText !== before.presetsText) {
    history = pushHistory(history, before, { ...before, presetsText: nextText }, "修改预设");
  }
  await reload();
  return true;
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
  if (await writePresets([...project.presets, preset])) toast(`已存为预设“${label}”`);
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
  const make = (type: string, label: string, title: string, effectNames: string[] = []) => {
    const el = document.createElement("div");
    el.className = "palette-item";
    el.dataset.type = type;
    const textSpan = document.createElement("span");
    textSpan.textContent = label;
    el.append(textSpan);
    if (effectNames.length > 0) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "需翻译";
      badge.title = `包含需要翻译的效果（${effectNames.join("、")}）；导出成 Qt 后要在界面效果层为它提供实现`;
      el.append(badge);
    }
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
    make("Flow", "⇶ 换行布局", "子控件从左往右排列，放不下时自动换到下一行"),
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
    .map((component) =>
      make(
        component.decl.type,
        component.decl.label ?? component.decl.type,
        component.decl.description ?? "",
        effectsForComponent(component.decl),
      ),
    );
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
    if (Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) > 4) {
      const rect = $("stage").getBoundingClientRect();
      const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (inside) previewPaletteDropOnStage(type, (e.clientX - rect.left) / viewZoom(), (e.clientY - rect.top) / viewZoom());
      else hideLayoutDropIndicator();
    }
  };
  place(down);
  document.body.append(ghost);
  const up = (e: PointerEvent) => {
    document.removeEventListener("pointermove", place);
    document.removeEventListener("pointerup", up);
    ghost.remove();
    hideLayoutDropIndicator();
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
    const locked = isNodeLocked(project.scene, id);
    const row = document.createElement("div");
    row.className = "layer" + (id === selectedId || selectedIds.includes(id) ? " selected" : "") + (locked ? " locked" : "");
    row.dataset.id = id;
    row.style.paddingLeft = `${6 + depth * 14}px`;
    const name = document.createElement("span");
    name.textContent = id;
    const type = document.createElement("span");
    type.className = "type";
    type.textContent = typeLabel(id);
    row.append(name, type);
    const nodeEffects = effectsForNode(project, id);
    const effectList: string[] = [];
    if (nodeEffects.visible) effectList.push(`过渡效果 ${nodeEffects.visible}`);
    if (nodeEffects.paint) effectList.push(`绘制效果 ${nodeEffects.paint}`);
    if (effectList.length > 0) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "需翻译";
      badge.title = `包含${effectList.join("、")}；导出成 Qt 后要在界面效果层为它提供实现`;
      row.append(badge);
    }
    if (id !== project.scene.root) {
      const lockBtn = document.createElement("button");
      lockBtn.type = "button";
      lockBtn.className = "layer-lock" + (locked ? " active" : "");
      lockBtn.textContent = locked ? "🔒" : "🔓";
      lockBtn.title = locked ? "解锁（Ctrl+L）" : "锁定（Ctrl+L）";
      lockBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        void toggleLock([id]);
      });
      row.append(lockBtn);
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
  renderToolbar();
  renderRight();
  renderShapeBar();
  updateSelectionBox();
  if (selectedId) scrollYamlTo(`  ${selectedId}:`);
}

/** 选中一个。additive 为真（按住 Shift 点）时，加进选择；已经选中的就去掉。 */
function select(id: string | null, additive = false): void {
  void flushEditors();
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
  void flushEditors();
  selectedIds = ids.filter((id) => node(id) && id !== project.scene.root);
  selectedId = selectedIds[selectedIds.length - 1] ?? null;
  afterSelectionChange();
}

// ---------- 右侧：文档与 YAML ----------

const docText = $<HTMLTextAreaElement>("doc-text");
const yamlText = $<HTMLTextAreaElement>("yaml-text");
let yamlDirty = false;

/**
 * 一份还没存下来的说明，绑定它开始时的文件和小节。保存只看这里的字段，不看当前选中了什么：
 * 选中随时会变，内容不能跟着写到新控件的小节里。
 */
interface DocDraft {
  path: string;
  /** null 表示整份文件 */
  section: string | null;
  text: string;
  /** 开始编辑时文件的内容，用来发现外部修改 */
  base: string;
  conflictNotified: boolean;
  /** 改过几次、存到了第几次，保存途中继续打字时靠它接着存 */
  edits: number;
  savedEdits: number;
  failed: boolean;
}

/** 文档框里正在编辑的草稿 */
let activeDocDraft: DocDraft | null = null;
/** 选中切走后留下的草稿，按先后保存；保存失败的留在这里，等重试或回到它的目标 */
const detachedDocDrafts: DocDraft[] = [];
let yamlBaseContent: string | null = null;
let yamlConflictNotified = false;
let yamlEditSeq = 0;
/** 文档页签当前编辑的是哪份文件的哪个小节；section 为 null 表示整份文件 */
let docTarget: { path: string; section: string | null } | null = null;
let docTimer: number | undefined;
let yamlTimer: number | undefined;

function showRightTab(tab: string): void {
  for (const id of ["doc", "yaml", "layout", "menu", "state"]) {
    const t = document.getElementById(`tab-${id}`);
    const p = document.getElementById(`pane-${id}`);
    if (t) t.setAttribute("aria-selected", String(tab === id));
    if (p) p.hidden = tab !== id;
  }
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

/** 当前选中对应的文档目标、文档框内容和说明文字。 */
function docViewForSelection(): {
  target: { path: string; section: string | null } | null;
  text: string;
  note: () => void;
} {
  if (!selectedId) {
    return {
      target: { path: project.pageDoc, section: null },
      text: project.docs.get(project.pageDoc) ?? "",
      note: () => noteWithButton($("doc-note"), `整份页面文档 ${project.pageDoc}`),
    };
  }
  const id = selectedId;
  const object = project.logic.objects?.[id];
  const ref = object?.doc ? parseDocRef(object.doc) : null;
  const file = ref ? project.docs.get(ref.path) : undefined;
  const section = ref?.section && file !== undefined ? getSection(file, ref.section) : null;
  if (!ref || file === undefined || (ref.section !== null && section === null)) {
    return {
      target: null,
      text: "",
      note: () => noteWithButton($("doc-note"), "这个控件还没有说明。", "创建说明", () => void createDocSection(id)),
    };
  }
  const shared = Object.entries(project.logic.objects ?? {})
    .filter(([other, o]) => other !== id && o?.doc === object!.doc)
    .map(([other]) => other);
  return {
    target: ref,
    text: ref.section === null ? file : section!,
    note: () => noteWithButton($("doc-note"), `${object!.doc}${shared.length ? `　也被 ${shared.join("、")} 引用` : ""}`),
  };
}

function isDocDraftFor(draft: DocDraft, target: { path: string; section: string | null } | null): boolean {
  return target !== null && draft.path === target.path && draft.section === target.section;
}

/** 有切走后没存上的说明时，在文档页给一个重试的入口。说明行放不下，单独占一行。 */
function syncDocRetryButton(): void {
  document.querySelector("[data-doc-retry-row]")?.remove();
  const failed = detachedDocDrafts.filter((draft) => draft.failed).length;
  if (failed === 0) return;
  const row = document.createElement("div");
  row.className = "note";
  row.dataset.docRetryRow = "true";
  row.style.flex = "none";
  row.textContent = `${failed} 处说明没存上`;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.docRetry = "true";
  button.textContent = "重试保存";
  button.addEventListener("click", () => void saveDoc());
  row.append(button);
  $("doc-note").parentElement!.after(row);
}

function hasUnsavedEditors(): boolean {
  return Boolean(activeDocDraft || detachedDocDrafts.length > 0 || yamlDirty || docSavingPromise || yamlSavingPromise);
}

function renderRight(): void {
  const idInput = $<HTMLInputElement>("selection-id");
  const n = selectedId ? node(selectedId) : undefined;
  const locked = selectedId ? isNodeLocked(project.scene, selectedId) : false;
  idInput.value = selectedId ?? "未选中控件";
  idInput.disabled = !selectedId || locked;
  $("selection-type").textContent = n ? `${n.type}${locked ? "（已锁定）" : ""}` : "";

  // 文档页签：界面总是跟着选中走，没存完的内容留在自己的草稿里继续保存
  const view = docViewForSelection();
  if (activeDocDraft && !isDocDraftFor(activeDocDraft, view.target)) {
    detachedDocDrafts.push(activeDocDraft);
    activeDocDraft = null;
    void saveDoc();
  }
  docTarget = view.target;
  view.note();
  if (!activeDocDraft) {
    const returning = detachedDocDrafts.findIndex((draft) => isDocDraftFor(draft, view.target));
    if (returning >= 0) activeDocDraft = detachedDocDrafts.splice(returning, 1)[0];
  }
  if (activeDocDraft) {
    setTextarea(docText, activeDocDraft.text);
    const latest = project.docs.get(activeDocDraft.path) ?? "";
    if (!activeDocDraft.conflictNotified && latest !== activeDocDraft.base) {
      activeDocDraft.conflictNotified = true;
      toast(`已忽略 ${activeDocDraft.path} 的外部修改，保留当前编辑内容`);
    }
  } else {
    setTextarea(docText, view.text, view.target !== null);
  }
  syncDocRetryButton();

  // YAML 页签只有一个目标，切换选中不影响正在编辑的内容，备注跟着选中走
  if (selectedId && !project.logic.objects?.[selectedId]) {
    const id = selectedId;
    noteWithButton($("yaml-note"), "这个控件还没有逻辑条目。", "添加逻辑条目", () => {
      void editLogic((doc) => ensureObject(doc, id)).then(() => scrollYamlTo(`  ${id}:`));
    });
  } else {
    noteWithButton($("yaml-note"), LOGIC_PATH);
  }
  if (!yamlDirty) {
    setTextarea(yamlText, project.logicText);
    yamlBaseContent = project.logicText;
    yamlConflictNotified = false;
  } else if (!yamlConflictNotified && yamlBaseContent !== null && project.logicText !== yamlBaseContent) {
    yamlConflictNotified = true;
    toast(`已忽略 ${LOGIC_PATH} 的外部修改，保留当前编辑内容`);
  }
  syncDocView();
  renderLayoutEditPane();
  renderMenuEditPane();
  renderStateEditPane();
}

/** 把 YAML 编辑器滚动到以 prefix 开头的那一行。 */
function scrollYamlTo(prefix: string): void {
  const lines = yamlText.value.split("\n");
  const index = lines.findIndex((line) => line.startsWith(prefix) || line.trim().startsWith(prefix.trim()));
  if (index < 0) return;
  yamlText.scrollTop = Math.max(0, index - 2) * 18;
}

let docSavingPromise: Promise<boolean> | null = null;
let yamlSavingPromise: Promise<boolean> | null = null;

/** 把一份草稿写进它自己的文件和小节。保存途中继续打字时接着存。 */
async function writeDocDraft(draft: DocDraft): Promise<boolean> {
  draft.failed = false;
  while (draft.savedEdits !== draft.edits) {
    const { path, section } = draft;
    const edits = draft.edits;
    const text = draft.text;
    let diskNow: string | null = null;
    if (!draft.conflictNotified) {
      try {
        diskNow = await readText(path);
      } catch (e) {
        toast(`读取 ${path} 失败：${(e as Error).message ?? String(e)}`);
        draft.failed = true;
        return false;
      }
      if (edits !== draft.edits) continue;
    }
    const current = project.docs.get(path) ?? "";
    if (section !== null && getSection(current, section) === null) {
      // replaceSection 找不到小节时什么也不做，内容会悄悄丢掉
      toast(`${path} 里已经没有小节 ${section}，这段说明没有保存`);
      draft.failed = true;
      return false;
    }
    const nextDocContent = section === null ? text : replaceSection(current, section, text);
    const externalConflict = diskNow !== null && diskNow !== draft.base && diskNow !== nextDocContent;
    try {
      await writeText(path, nextDocContent);
    } catch (e) {
      toast(`保存 ${path} 失败：${(e as Error).message ?? String(e)}`);
      draft.failed = true;
      return false;
    }
    if (externalConflict) toast(`已忽略 ${path} 的外部修改，保留当前编辑内容`);
    for (const other of [...detachedDocDrafts, activeDocDraft]) {
      if (other && other !== draft && other.path === path && other.base === current) other.base = nextDocContent;
    }
    draft.base = nextDocContent;
    draft.conflictNotified = false;
    draft.savedEdits = edits;
    if (nextDocContent !== current) {
      const before = currentSnapshot();
      const nextDocs = { ...(before.docs ?? {}), [path]: nextDocContent };
      history = pushHistory(history, before, { ...before, docs: nextDocs }, "编辑说明");
      project.docs.set(path, nextDocContent);
      renderToolbar();
    }
  }
  return true;
}

/** 按先后保存切走的草稿和正在编辑的草稿，一份失败不影响其它的。 */
async function saveDocDrafts(): Promise<boolean> {
  const attempted = new Set<DocDraft>();
  let ok = true;
  for (;;) {
    const draft = [...detachedDocDrafts, ...(activeDocDraft ? [activeDocDraft] : [])].find((each) => !attempted.has(each));
    if (!draft) break;
    attempted.add(draft);
    if (await writeDocDraft(draft)) {
      const index = detachedDocDrafts.indexOf(draft);
      if (index >= 0) detachedDocDrafts.splice(index, 1);
      if (activeDocDraft === draft) activeDocDraft = null;
    } else {
      ok = false;
    }
  }
  syncDocRetryButton();
  return ok;
}

async function saveDoc(): Promise<boolean> {
  window.clearTimeout(docTimer);
  if (!activeDocDraft && detachedDocDrafts.length === 0) {
    return docSavingPromise ? await docSavingPromise : true;
  }
  const run = (docSavingPromise ?? Promise.resolve(true)).then(saveDocDrafts);
  const tracked = run.finally(() => {
    if (docSavingPromise === tracked) docSavingPromise = null;
  });
  docSavingPromise = tracked;
  const ok = await tracked;
  if (ok) await reload();
  return ok;
}

async function performSaveYaml(): Promise<boolean> {
  while (yamlDirty) {
    window.clearTimeout(yamlTimer);
    const yamlBase = yamlBaseContent;
    const yamlNotified = yamlConflictNotified;
    const yamlSeq = yamlEditSeq;
    const nextYaml = yamlText.value;
    let externalConflict = false;
    if (!yamlNotified && yamlBase !== null) {
      try {
        const diskNow = await readText(LOGIC_PATH);
        if (yamlSeq !== yamlEditSeq) continue;
        if (diskNow !== null && diskNow !== yamlBase && diskNow !== nextYaml) {
          externalConflict = true;
        }
      } catch (e) {
        toast(`读取 ${LOGIC_PATH} 失败：${(e as Error).message ?? String(e)}`);
        return false;
      }
    }
    if (yamlSeq !== yamlEditSeq) continue;
    try {
      await writeText(LOGIC_PATH, nextYaml);
    } catch (e) {
      toast(`保存 ${LOGIC_PATH} 失败：${(e as Error).message ?? String(e)}`);
      return false;
    }
    if (externalConflict) {
      toast(`已忽略 ${LOGIC_PATH} 的外部修改，保留当前编辑内容`);
    }
    yamlBaseContent = nextYaml;
    yamlConflictNotified = false;
    if (nextYaml !== project.logicText) {
      const before = currentSnapshot();
      history = pushHistory(
        history,
        before,
        { ...before, logicText: nextYaml },
        "编辑 YAML",
      );
      project.logicText = nextYaml;
      renderToolbar();
    }
    if (yamlSeq === yamlEditSeq) {
      yamlDirty = false;
      break;
    }
  }
  return true;
}

async function saveYaml(): Promise<boolean> {
  window.clearTimeout(yamlTimer);
  if (!yamlDirty) {
    return yamlSavingPromise ? await yamlSavingPromise : true;
  }
  if (!yamlSavingPromise) {
    yamlSavingPromise = performSaveYaml().finally(() => {
      yamlSavingPromise = null;
    });
  }
  const ok = await yamlSavingPromise;
  if (ok) await reload();
  return ok;
}

/** 切换选中对象或执行撤销/重做之前，把还没保存的编辑先写入文件。 */
async function flushEditors(): Promise<boolean> {
  const [docOk, yamlOk] = await Promise.all([saveDoc(), saveYaml()]);
  return docOk && yamlOk;
}

docText.addEventListener("input", () => {
  if (!docTarget) return;
  activeDocDraft ??= {
    ...docTarget,
    text: docText.value,
    base: project.docs.get(docTarget.path) ?? "",
    conflictNotified: false,
    edits: 0,
    savedEdits: 0,
    failed: false,
  };
  activeDocDraft.text = docText.value;
  activeDocDraft.edits++;
  window.clearTimeout(docTimer);
  docTimer = window.setTimeout(() => void saveDoc(), 600);
});
docText.addEventListener("blur", () => void saveDoc());
yamlText.addEventListener("input", () => {
  yamlEditSeq++;
  if (!yamlDirty) {
    yamlBaseContent = project.logicText;
    yamlConflictNotified = false;
  }
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
  const { path, section } = docTarget;
  if (!(await saveDoc())) return;
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
  if (!(await saveYaml())) return;
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

let previewClockTimer: number | null = null;
let previewClockManual = false;

function stopPreviewClockTimer(): void {
  if (previewClockTimer !== null) {
    window.clearInterval(previewClockTimer);
    previewClockTimer = null;
  }
  previewClockManual = false;
}

function startPreviewClockInterval(manual: boolean): void {
  if (previewClockTimer !== null) return;
  previewClockManual = manual;
  previewClockTimer = window.setInterval(() => {
    if (mode === "preview" && previewRuntime) {
      previewRuntime.setClock(previewRuntime.getClock() + 100);
    } else {
      stopPreviewClockTimer();
    }
  }, 100);
}

function matchesMenuShortcut(e: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut
    .split("+")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) return false;
  const needCtrl = parts.includes("ctrl") || parts.includes("control") || parts.includes("cmd");
  const needShift = parts.includes("shift");
  const needAlt = parts.includes("alt");
  if ((e.ctrlKey || e.metaKey) !== needCtrl) return false;
  if (e.shiftKey !== needShift) return false;
  if (e.altKey !== needAlt) return false;
  const keyPart = parts[parts.length - 1];
  return e.key.toLowerCase() === keyPart;
}

document.addEventListener("keydown", (e) => {
  if (mode !== "preview" || !previewRuntime) return;
  const target = e.target;
  const inInput =
    target instanceof HTMLElement && (target.matches("input, textarea, select") || target.isContentEditable);
  if (inInput && !e.ctrlKey && !e.metaKey && !e.altKey) return;
  const root = node(project.scene.root);
  let matchedId: string | null = null;
  for (const menu of root?.menuBar?.menus ?? []) {
    walkMenuItems(menu.items, (item) => {
      if (matchedId || item.kind === "separator" || !item.shortcut) return;
      if (matchesMenuShortcut(e, item.shortcut)) {
        const view = previewRuntime!.view(item.id);
        if (view.visible && view.enabled) matchedId = item.id;
      }
    });
  }
  if (matchedId) {
    e.preventDefault();
    e.stopPropagation();
    triggerPreviewMenuItem(matchedId);
  }
});

function renderConditions(): void {
  const chips: HTMLElement[] = [];
  if (previewRuntime) {
    const clockChip = document.createElement("span");
    clockChip.className = "condition" + (previewClockTimer !== null ? " on" : "");
    clockChip.title = "预览时钟（clock / clock.ms / clock.sec），可在条件和函数里直接引用";
    clockChip.style.cssText = "display:inline-flex;align-items:center;gap:4px;";
    const clockLabel = document.createElement("span");
    clockLabel.textContent = "时钟(ms)：";
    const clockInput = document.createElement("input");
    clockInput.type = "number";
    clockInput.dataset.vfClockInput = "1";
    clockInput.min = "0";
    clockInput.step = "100";
    clockInput.value = String(previewRuntime.getClock());
    clockInput.style.cssText = "width:64px;font-size:11px;padding:1px 4px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:3px;";
    clockInput.addEventListener("change", () => {
      previewRuntime?.setClock(Number(clockInput.value) || 0);
    });
    const stepBtn = document.createElement("button");
    stepBtn.type = "button";
    stepBtn.dataset.vfClockStep = "1";
    stepBtn.textContent = "+100ms";
    stepBtn.style.cssText = "font-size:11px;padding:1px 6px;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:3px;cursor:pointer;";
    stepBtn.addEventListener("click", () => {
      if (previewRuntime) previewRuntime.setClock(previewRuntime.getClock() + 100);
    });
    const playBtn = document.createElement("button");
    playBtn.type = "button";
    playBtn.dataset.vfClockPlay = "1";
    playBtn.textContent = previewClockTimer !== null ? "⏸" : "▶";
    playBtn.title = previewClockTimer !== null ? "暂停时钟自动推进" : "自动推进预览时钟（每 100ms +100ms）";
    playBtn.style.cssText = "font-size:11px;padding:1px 6px;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:3px;cursor:pointer;";
    playBtn.addEventListener("click", () => {
      if (previewClockTimer !== null) {
        stopPreviewClockTimer();
      } else {
        startPreviewClockInterval(true);
      }
      renderConditions();
    });
    clockChip.append(clockLabel, clockInput, stepBtn, playBtn);
    chips.push(clockChip);
  }
  for (const condition of previewRuntime?.conditions() ?? []) {
    const isText = condition.kind === "text";
    const chip = document.createElement(isText ? "button" : "span");
    chip.className = "condition" + (condition.value ? " on" : "");
    chip.textContent = `${condition.text || condition.id}：${condition.value ? "是" : "否"}`;
    chip.title = isText ? `文字条件 ${condition.id}，点击切换` : `符号条件 ${condition.id}，由表达式计算`;
    if (isText) chip.addEventListener("click", () => previewRuntime?.toggleTextCondition(condition.id));
    chips.push(chip);
  }
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
  stopPreviewClockTimer();
  previewRuntime = new Runtime(project, {
    onChange: () => {
      if (previewRuntime) {
        const playing = Boolean(previewRuntime.getState("timeline.playing") || previewRuntime.getState("project.playing"));
        if (playing && previewClockTimer === null) {
          startPreviewClockInterval(false);
        } else if (!playing && previewClockTimer !== null && !previewClockManual) {
          stopPreviewClockTimer();
        }
      }
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

/** 右侧“新增”表单（data-new-*）里填了但还没提交的内容。这些输入框每次重绘都重建。 */
function readFormDrafts(): Array<[string, string]> {
  const drafts: Array<[string, string]> = [];
  for (const el of document.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")) {
    for (const key of Object.keys(el.dataset)) {
      if (/^new[A-Z]/.test(key)) drafts.push([key, el.value]);
    }
  }
  return drafts;
}

function restoreFormDrafts(drafts: Array<[string, string]>): void {
  for (const [key, value] of drafts) {
    const attr = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    const el = document.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-${attr}]`);
    if (el) el.value = value;
  }
}

function renderAll(): void {
  const formDrafts = readFormDrafts();
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
  restoreFormDrafts(formDrafts);
}

// ---------- 导出成 Qt ----------

interface WriteQtExportReport {
  outDir: string;
  totalFiles: number;
  written: number;
  scaffolded: number;
  removed: number;
}

function isInTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function openExportQtModal(): Promise<void> {
  if (hasUnsavedEditors() && !(await flushEditors())) return;
  document.getElementById("export-qt-modal")?.remove();

  const inTauri = isInTauri();
  let defaultDir = project.qtExportDir || "../qt/ui";
  if (inTauri) {
    try {
      defaultDir = await invoke<string>("default_qt_export_dir", {
        configured: project.qtExportDir ?? null,
      });
    } catch {
      // 回退到相对路径
    }
  }

  const backdrop = document.createElement("div");
  backdrop.id = "export-qt-modal";
  backdrop.className = "vf-modal-backdrop";

  const modal = document.createElement("div");
  modal.className = "vf-modal";
  modal.style.width = "min(680px, 92vw)";

  const header = document.createElement("div");
  header.className = "vf-modal-header";
  const title = document.createElement("strong");
  title.textContent = `导出成 Qt · ${project.name}`;
  const closeTopBtn = document.createElement("button");
  closeTopBtn.id = "export-qt-close";
  closeTopBtn.type = "button";
  closeTopBtn.textContent = "关闭";
  closeTopBtn.addEventListener("click", () => backdrop.remove());
  header.append(title, closeTopBtn);

  const body = document.createElement("div");
  body.className = "export-qt-body";

  const dirRow = document.createElement("div");
  dirRow.className = "export-qt-row";
  const dirLabel = document.createElement("label");
  dirLabel.htmlFor = "export-qt-dir";
  dirLabel.textContent = "导出目录";
  const dirInput = document.createElement("input");
  dirInput.id = "export-qt-dir";
  dirInput.type = "text";
  dirInput.value = defaultDir;
  dirInput.placeholder = "例如 ../qt/ui 或完整绝对路径";
  dirInput.spellcheck = false;

  const browseBtn = document.createElement("button");
  browseBtn.id = "export-qt-browse";
  browseBtn.type = "button";
  browseBtn.textContent = "选择文件夹…";

  dirRow.append(dirLabel, dirInput, browseBtn);
  body.append(dirRow);

  const modeNotice = document.createElement("div");
  modeNotice.id = "export-qt-mode-notice";
  modeNotice.className = `export-qt-notice ${inTauri ? "" : "warn"}`;
  modeNotice.textContent = inTauri
    ? "桌面版模式：点击“执行导出”会将生成的 Qt 工程文件写入上方选定目录（ui_effects/ 仅在不存在时写入起始文件）。"
    : "当前在浏览器模式下运行，无法直接写入本地磁盘。您仍可点击“执行导出”预览导出检查结果与接口变化清单（changes）；实际写入磁盘请使用桌面版（Tauri）或运行命令行：npm run export:qt -- <设计项目文件夹> [导出文件夹]。";
  body.append(modeNotice);

  const resultBox = document.createElement("div");
  resultBox.id = "export-qt-result";
  resultBox.style.display = "flex";
  resultBox.style.flexDirection = "column";
  resultBox.style.gap = "10px";
  body.append(resultBox);

  const renderResultView = (
    statusKind: "error" | "warn" | "success",
    statusText: string,
    summaryText: string | null,
    changes: string[] | null,
    problems: Array<{ level: "error" | "hint"; message: string }>,
    hasPrevious = false,
  ) => {
    resultBox.replaceChildren();

    const banner = document.createElement("div");
    banner.id = "export-qt-status";
    banner.className = `export-qt-notice ${statusKind}`;
    banner.textContent = statusText;
    resultBox.append(banner);

    if (summaryText) {
      const summarySec = document.createElement("div");
      summarySec.id = "export-qt-summary";
      summarySec.className = "export-qt-section";
      const h4 = document.createElement("h4");
      h4.textContent = "导出接口概览";
      const p = document.createElement("div");
      p.style.fontSize = "12px";
      p.style.lineHeight = "1.55";
      p.textContent = summaryText;
      summarySec.append(h4, p);
      resultBox.append(summarySec);
    }

    if (changes !== null) {
      const changeSec = document.createElement("div");
      changeSec.id = "export-qt-changes";
      changeSec.className = "export-qt-section";
      const h4 = document.createElement("h4");
      h4.textContent = "接口变化清单（changes）";
      changeSec.append(h4);
      if (changes.length === 0) {
        const empty = document.createElement("div");
        empty.className = "muted";
        empty.style.fontSize = "12px";
        empty.textContent = !isInTauri()
          ? "浏览器模式下无法读取目标目录的导出记录 vf-export.json，按第一次导出预览。"
          : !hasPrevious
            ? "这是第一次导出到这个文件夹。"
            : "接口和上一次导出相同（无新增、删除或签名变化）。";
        changeSec.append(empty);
      } else {
        const ul = document.createElement("ul");
        ul.className = "export-qt-list";
        for (const ch of changes) {
          const li = document.createElement("li");
          li.textContent = ch;
          ul.append(li);
        }
        changeSec.append(ul);
      }
      resultBox.append(changeSec);
    }

    if (problems.length > 0) {
      const probSec = document.createElement("div");
      probSec.id = "export-qt-problems";
      probSec.className = "export-qt-section";
      const h4 = document.createElement("h4");
      h4.textContent = `检查与导出提示（${problems.length} 条）`;
      const ul = document.createElement("ul");
      ul.className = "export-qt-list";
      for (const prob of problems) {
        const li = document.createElement("li");
        li.className = prob.level;
        li.textContent = `${prob.level === "error" ? "错误" : "提示"}：${prob.message}`;
        ul.append(li);
      }
      probSec.append(h4, ul);
      resultBox.append(probSec);
    }
  };

  browseBtn.addEventListener("click", async () => {
    if (!isInTauri()) {
      renderResultView(
        "warn",
        "浏览器模式下无法调用系统原生文件夹选择框，请在桌面版（Tauri）中使用，或直接在输入框中填写目标路径。",
        null,
        null,
        [],
      );
      return;
    }
    try {
      const picked = await invoke<string | null>("pick_export_dir", {
        initialDir: dirInput.value.trim() || null,
      });
      if (picked) {
        dirInput.value = picked;
      }
    } catch (e) {
      renderResultView("error", `选择文件夹失败：${(e as Error).message}`, null, null, []);
    }
  });

  const runExport = async () => {
    const outDir = dirInput.value.trim();
    if (!outDir) {
      renderResultView("error", "请先填写导出目录路径。", null, null, []);
      return;
    }
    if (project.problems.some((p) => p.level === "error")) {
      renderResultView(
        "error",
        "设计项目里有错误，没有导出。请先修正以下问题：",
        null,
        null,
        project.problems,
      );
      return;
    }

    let previous: Manifest | null = null;
    const tauriActive = isInTauri();
    if (tauriActive) {
      try {
        const rawManifest = await invoke<string | null>("read_qt_export_manifest", { outDir });
        if (rawManifest) {
          previous = JSON.parse(rawManifest) as Manifest;
        }
      } catch {
        previous = null;
      }
    }

    const result = exportQt(project, getQtTemplates(), previous);
    const allProblems = [...project.problems, ...result.problems];
    if (result.problems.some((p) => p.level === "error")) {
      renderResultView(
        "error",
        "导出时发现错误，没有导出：",
        null,
        null,
        allProblems,
      );
      return;
    }

    const iface = result.manifest.interface;
    const effectsSummary =
      iface.effects.length > 0
        ? `${iface.effects.length} 个需要翻译的效果（${iface.effects.map((e) => `${e.name}=${e.hash}`).join("、")}）`
        : "0 个需要翻译的效果";
    const summaryText = `业务接口：${iface.events.length} 个事件，${iface.states.length} 个业务管的状态，${iface.externals.length} 个外部容器；界面接口：${effectsSummary}。`;

    if (!tauriActive) {
      renderResultView(
        "warn",
        `浏览器模式预览完成：已通过 exportQt 生成 ${result.files.size} 个文件（目标路径：${outDir}），但浏览器模式不能直接写入本地磁盘。请使用桌面版（Tauri）写入目录，或在命令行执行 npm run export:qt。`,
        summaryText,
        result.changes,
        allProblems,
      );
      return;
    }

    try {
      const obsolete = (previous?.generated ?? []).filter((rel) => !result.files.has(rel));
      const report = await invoke<WriteQtExportReport>("write_qt_export", {
        outDir,
        files: Array.from(result.files, ([path, content]) => ({ path, content })),
        scaffoldIfMissing: Array.from(result.scaffold, ([path, content]) => ({ path, content })),
        obsolete,
      });
      renderResultView(
        "success",
        `导出成功：${report.outDir}（生成的文件 ${report.totalFiles} 个，其中内容有变化的 ${report.written} 个；删除不再需要的 ${report.removed} 个；新放入的起始文件 ${report.scaffolded} 个）`,
        summaryText,
        result.changes,
        allProblems,
        previous !== null,
      );
    } catch (e) {
      renderResultView(
        "error",
        `写入导出目录失败：${(e as Error).message}`,
        summaryText,
        result.changes,
        allProblems,
        previous !== null,
      );
    }
  };

  const footer = document.createElement("div");
  footer.className = "vf-modal-footer";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.textContent = "取消";
  cancelBtn.addEventListener("click", () => backdrop.remove());
  const runBtn = document.createElement("button");
  runBtn.id = "export-qt-run";
  runBtn.type = "button";
  runBtn.className = "primary";
  runBtn.textContent = "执行导出";
  runBtn.addEventListener("click", () => void runExport());
  footer.append(cancelBtn, runBtn);

  modal.append(header, body, footer);
  backdrop.append(modal);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.remove();
  });
  document.body.append(backdrop);
}

document.getElementById("export-qt-btn")?.addEventListener("click", () => {
  void openExportQtModal();
});

async function main(): Promise<void> {
  ensureStageIframe();
  project = await loadProject(null);
  designRuntime = new Runtime(project);
  initLibrary({
    getProject: () => project,
    getMode: () => mode,
    getZoom: () => viewZoom(),
    readText,
    writeText,
    removeFile,
    onComponentRenamed: async (oldTypes, nextType) => {
      if (!(await flushEditors())) throw new Error("编辑器里有内容没存上");
      const oldSet = new Set(oldTypes.filter(Boolean));
      const prevSceneText = project.sceneText;
      let sceneChanged = false;
      for (const n of Object.values(project.scene.nodes)) {
        if (oldSet.has(n.type)) {
          n.type = nextType;
          sceneChanged = true;
        }
      }
      if (sceneChanged) {
        const nextSceneText = JSON.stringify(project.scene, null, 2) + "\n";
        project.sceneText = nextSceneText;
        const failure = await writeFilesTogether([{ path: SCENE_PATH, next: nextSceneText, prev: prevSceneText }]);
        if (failure !== null) {
          rollbackScene(prevSceneText);
          throw new Error(failure);
        }
      }
      history = renameComponentTypeInHistory(history, oldSet, nextType);
    },
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
    onCommitDoc: () => void saveDoc(),
  });
  initLayoutEdit({
    getProject: () => project,
    getMode: () => mode,
    getSelectedId: () => selectedId,
    selectNode: (id) => select(id),
    saveScene,
    editLogic,
    newNodeId: newId,
    containerAtPoint: containerAt,
    currentBoxes: currentLayoutBoxes,
    stagePoint,
    overlay,
    toast,
    activateRightTab: showRightTab,
  });
  initMenuEdit({
    getProject: () => project,
    getMode: () => mode,
    saveScene,
    toast,
    activateRightTab: showRightTab,
  });
  initStateEdit({
    getProject: () => project,
    editLogic,
    toast,
    activateRightTab: showRightTab,
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
