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
import { currentRootId, listDir, localWriteCount, projectBaseUrl, projectPageUrl, projectUrl, readText, removeFile, watchProject, writeText, writesSettled } from "./fs";
import { askFields } from "./dialogs";
import { carveOutPart, partFolderName, partRefOf, PARTS_DIR, ROOT_PREFIX } from "./parts";
import { initProjectPanel } from "./projectpanel";
import { partNodeElement, renderPartContent, type RenderContext } from "./render";
import { cssLength, formatLength, fromPx, linesAvailable, toPx, type DesignKind, type UnitSpec } from "./kinds";
import { applyBoard, applyGroupClass, applyNodeBox, createStageServices, createWaitTracker, SHAPE_STAGE_CSS, stageBaseCssFor } from "./stage";
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
import { initEventEdit, refreshEventPane, renderEventPane } from "./eventedit";
import { addPage, coverWrapId, movePage, pageGeometry, pageGuideRects, pageIds, pageLabel, removePage, subtreeIds } from "./pages";
import { openGraphicExportModal } from "./graphicexport";
import { initPropsEdit, invalidatePropsAssets, renderPropsPane } from "./propsedit";
import { serializeEdited } from "./richtext";
import { overflowBar } from "./overflowbar";
import { initAssetBrowser } from "./assetbrowser";
import { registerCommand } from "./commands";
import { initMenuBar, openCommandPalette, openShortcutSheet } from "./menubar";
import { createWorkspace, type Workspace } from "./workspace";
import { initPreviewLauncher, initStandalonePreviewWindow, isStandalonePreview, notifyMainWindowSelect, sendPreviewSettingsToMain, syncStandalonePreviewTitle } from "./previewwindow";
import {
  allSceneMenuIds,
  allWindowIds,
  appendSection,
  boardOfNode,
  BUILTIN_TYPES,
  childrenOfNode,
  computeSceneLayout,
  CONTAINER_DECL,
  declFor,
  defaultSizeFor,
  effectsForComponent,
  effectsForNode,
  EXTERNAL_DECL,
  getSection,
  isLayoutPositionedNode,
  isPartitionedWindow,
  isValidIdentifier,
  kindOfProject,
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
  roundInScene,
  SCENE_PATH,
  sectionNameFor,
  sectionOffsets,
  standardComponentsOf,
  setStageStyleTarget,
  syncResizedNodeDimensions,
  unitOf,
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
  controlsReference,
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
import { activePage, hiddenPages, pagesToReveal } from "./stackview";
import { centerView, onZoomChange, panToSelection, restoreViewState, setSelectionRectSource, setZoom, viewState, viewZoom, zoomToFit, zoomToRect, zoomToSelection } from "./viewport";
import { boardAnchor, bookViewIndexOfBoard, bookViews, deviceViews, screenIndexForAnchor, sheetPiece as bookSheetPiece, type ScreenView } from "./bookview";
import { desktopClient, desktopWorkArea, isDeviceId, PHONE_MODELS, phoneModel, previewChoiceLabel, previewChoices, resolvePreviewChoice, type DeviceId, type PreviewChoice, type Rect as DeviceRect, type Size } from "./devices";
import { iconColorFor, mountBook, mountDesktop, mountPhone, placeSheets, playSlide, playTurn, turnSnapshot, type DeviceStage } from "./deviceframe";
import { boardGap, boardWorldBounds } from "./boardlayout";
import { presetsPath } from "./loader";
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

// ---------- 设计类型、单位、当前画板 ----------

/** 这个项目是哪一类设计。素材栏、右侧页签、画板、导出都按它来，见 kinds.ts。 */
function kind(): DesignKind {
  return kindOfProject(project);
}

/** 画布的单位（像素或毫米），写在 scene.json 的 unit 里。 */
function unit(): UnitSpec {
  return unitOf(project.scene);
}

/** 把坐标或尺寸取整到画布单位的步长：像素取整数，毫米取到 0.01。 */
function R(value: number): number {
  return roundInScene(project.scene, value);
}

/** 按屏幕像素定的手感（最小尺寸、吸附距离、错开的距离）换成画布单位。像素画布上原样返回。 */
function feel(px: number): number {
  return fromPx(unit(), px);
}

/** 屏幕上的距离除以它，就是画布上的距离：视角缩放 × 单位换算。 */
function unitZoom(): number {
  return viewZoom() * unit().px;
}

/** 画布上的长度写成设计窗口里的 CSS 长度，例如 12px、14.5mm。 */
function len(value: number): string {
  return cssLength(unit(), value);
}

/** 一次只看一个画板的设计类型（平面设计）里，现在看的是哪一页。只影响看，不写进文件。 */
let currentBoardId: string | null = null;

/**
 * 现在“在看”的画板。界面设计始终是主窗口，对话框叠在它上面；平面设计是当前这一页：
 * 编辑时全部页面摊开在画布上，它是最近点过、选中的东西所在的那一页（属性页签的页面设置、翻页条、页面文档跟着它）；
 * 预览时它是正在看的那一页。
 */
function stageRootId(): string {
  if (kind().board.arrange !== "spread") return project.scene.root;
  const boards = allWindowIds(project.scene);
  if (currentBoardId && boards.includes(currentBoardId)) return currentBoardId;
  return boards[0] ?? project.scene.root;
}

/** 平面设计编辑时，全部页面一页页摊开在一张无限画布上（排法见 boardlayout.ts）；预览时一次看一屏 */
function spreadOut(): boolean {
  return kind().board.arrange === "spread" && mode === "edit";
}

/** 设计窗口铺开的范围（画布单位）：摊开时是全部页面合起来的外包框（可能从负坐标开始），否则是当前画板 */
function stageWorld(): Rect {
  if (spreadOut()) {
    const bounds = boardWorldBounds(project.scene);
    // 四周留出一圈（和页与页之间一样宽）：最上面那页的名字、纸的阴影都在里面，不被设计窗口的边裁掉
    if (bounds) {
      const pad = Math.max(boardGap(project.scene), feel(24));
      return { x: bounds.x - pad, y: bounds.y - pad, width: bounds.width + pad * 2, height: bounds.height + pad * 2 };
    }
  }
  const root = node(stageRootId());
  return { x: 0, y: 0, width: root?.width ?? 0, height: root?.height ?? 0 };
}

/** 屏幕上的一点 → 设计窗口里的坐标（画布单位；摊开时就是无限画布上的坐标） */
function clientToStage(clientX: number, clientY: number): Point {
  const rect = $("stage").getBoundingClientRect();
  const zoom = unitZoom();
  const world = stageWorld();
  return { x: (clientX - rect.left) / zoom + world.x, y: (clientY - rect.top) / zoom + world.y };
}

/** 摊开时这一点落在哪一页上（叠在上面的优先）；落在页面外面返回 null。不摊开时就是当前画板 */
function boardAt(px: number, py: number): string | null {
  if (!spreadOut()) return stageRootId();
  const pages = pageIds(project.scene);
  for (let i = pages.length - 1; i >= 0; i--) {
    const r = absRect(pages[i]);
    if (px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height) return pages[i];
  }
  return null;
}

/** 节点在哪个画板上 */
function boardOf(id: string): string {
  return boardOfNode(project.scene, id) ?? stageRootId();
}

/** 换一个“在看”的页面（摊开时不重画画布，只换翻页条、页面标签、属性页签） */
function focusBoard(id: string): void {
  if (!node(id) || currentBoardId === id) return;
  currentBoardId = id;
  rememberBoard();
  renderBoardBar();
  renderPageLabels();
}

/** 是不是画板本身：不能移动、删除、旋转、锁进多选，只能改尺寸。界面设计只有主窗口算，平面设计的每一页都算。 */
function isBoardRoot(id: string | null | undefined): boolean {
  if (!id) return false;
  return id === project.scene.root || node(id)?.type === "Page";
}

/** 这类设计自带的标准控件。 */
function standardComponents() {
  return standardComponentsOf(project.kind);
}

/** 给控件的环境：单位、是不是只画静帧、项目文件的地址。编辑模式下只画静帧，预览时才动。 */
const stageWaits = createWaitTracker();
function stageServicesNow() {
  return createStageServices({ unit: unit(), still: mode !== "preview", baseUrl: projectBaseUrl(), tracker: stageWaits });
}
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

/** 编辑模式下正在看层叠容器的哪一页，键是容器，值是页。只影响看，不写进文件。 */
const revealedPages = new Map<string, string>();

/** 层叠容器现在显示哪一页。 */
function shownPage(stackId: string): string | null {
  const children = childrenOf(node(stackId));
  const revealed = mode === "edit" ? revealedPages.get(stackId) : undefined;
  if (revealed && children.includes(revealed)) return revealed;
  return activePage(children, activeRuntime().view(stackId).props);
}

function layoutHooks(runtime: Runtime) {
  const revealed = new Set(mode === "edit" ? revealedPages.values() : []);
  return {
    // 电脑预览里拖过窗口大小（或最大化）：主窗口按窗口的内容区重新排版
    ...(mode === "preview" && previewRootSize ? { rootSize: previewRootSize } : {}),
    isVisible: (nid: string) => runtime.view(nid).visible || revealed.has(nid),
    getProp: (nid: string, prop: string) =>
      prop === "currentPage" && mode === "edit" && revealedPages.has(nid) ? shownPage(nid) : (runtime.view(nid).props[prop] ?? null),
    getDockLayout: (wid: string) => runtime.getDockLayout(wid),
  };
}

/** 一次点选要查很多节点，这段时间里排版只算一遍。 */
let frozenBoxes: ReturnType<typeof computeSceneLayout> | null = null;

function currentLayoutBoxes() {
  return frozenBoxes ?? computeSceneLayout(project.scene, layoutHooks(activeRuntime()));
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
  const hidden = hiddenPages(project.scene, shownPage);
  const visit = (id: string): string | null => {
    const n = node(id);
    if (!n || hidden.has(id)) return null;
    if (mode === "preview" && !runtime.view(id).visible) return null;
    const children = childrenOf(n);
    for (let i = children.length - 1; i >= 0; i--) {
      const hit = visit(children[i]);
      if (hit) return hit;
    }
    if (isBoardRoot(id)) return null;
    return containsPoint(id, px, py) ? id : null;
  };
  // 平面设计：编辑时全部页面都在画布上；预览时只有正在看的那一页。界面设计：主窗口和叠在上面显示的对话框
  const winIds = spreadOut() ? pageIds(project.scene) : kind().board.arrange === "spread" ? [stageRootId()] : allWindowIds(project.scene);
  frozenBoxes = currentLayoutBoxes();
  try {
    for (let i = winIds.length - 1; i >= 0; i--) {
      const winId = winIds[i];
      if (!spreadOut() && winId !== stageRootId() && !isDialogShownInStage(winId)) continue;
      const hit = visit(winId);
      if (hit) return hit;
    }
    return null;
  } finally {
    frozenBoxes = null;
  }
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
    changes.push({ path: presetsPath(project.partOf), next: target.presetsText, prev: currentPresetsText() });
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
  // 拖动的时候项目脚本变了：松手后再给设计窗口换运行环境
  if (stageRealmStale) {
    renderPending = false;
    void reload(true);
    return;
  }
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
/** 项目里有脚本变了：下次重新加载前，给设计窗口换一个干净的运行环境 */
let stageRealmStale = false;

/**
 * 换一个新的设计窗口文档。项目的脚本是在设计窗口自己的环境里加载的，浏览器按地址记着加载过的模块，
 * 脚本改了之后只有换一个新环境才会重新读：这里把 iframe 换掉，控件随后在新环境里重新加载、重新建。
 */
function resetStageRealm(): void {
  for (const entry of mounted.values()) {
    try {
      entry.instance?.destroy();
    } catch {
      // 控件的清理出错不影响重建
    }
  }
  mounted.clear();
  overlay.remove();
  document.getElementById("stage-iframe")?.remove();
  ensureStageIframe();
}

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
      // 鼠标按住时不换运行环境（会把编辑层和正在拖的手势一起拆掉），松手后再换，见 onPointerReleased
      const staleRealm = stageRealmStale && !pointerHeld;
      if (staleRealm) {
        stageRealmStale = false;
        resetStageRealm();
      }
      const next = await loadProject(project);
      if (writesBefore !== localWriteCount()) {
        // 设计窗口刚换过运行环境、还空着：重读一遍之后一定要重画
        reloadForce ||= mustRender || staleRealm;
        reloadAgain = true;
        continue;
      }
      if (!mustRender && !staleRealm && next.signature === project.signature) continue;
      // 预览中项目换了能用的看法（project.json 的 preview.devices）：换过去时停在同一页
      const deviceBefore = mode === "preview" ? previewDevice() : null;
      const anchorBefore = deviceBefore ? previewViews(deviceBefore)[previewIndex] : undefined;
      project = next;
      if (deviceBefore && previewDevice() !== deviceBefore) {
        const device = previewDevice();
        previewIndex = anchorBefore ? previewIndexForAnchor(device, anchorBefore) : previewIndexForFocus(device);
        desktopState.minimized = false;
      }
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

/** 画布显示的运行状态。预览过之后编辑模式也接着看预览留下的状态，“恢复初始状态”才回到 designRuntime。 */
function activeRuntime(): Runtime {
  return previewRuntime ?? designRuntime;
}

function showNodeError(body: HTMLElement, message: string): void {
  body.innerHTML = "";
  const box = document.createElement("div");
  box.className = "vf-error";
  box.textContent = message;
  body.append(box);
}

/**
 * 子项目节点：子项目那一页的内容画在方框里，和播放页、导出用的是同一份画法（render.ts）。
 * 只看不改：画布上点它选中的是整个子项目节点，双击打开子项目去改。
 */
function mountPart(id: string, n: SceneNode, body: HTMLElement): ComponentInstance {
  const instances: ComponentInstance[] = [];
  const ctx: RenderContext = {
    types: (type) => project.components.get(type) ?? standardComponents().get(type),
    services: stageServicesNow(),
    instances,
    parts: (ref) => project.parts?.get(ref)?.scene ?? undefined,
    // 找不到、套了自己这些问题，检查已经在问题栏里报了
    onError: () => undefined,
    stack: project.partOf?.part ? [project.partOf.part] : [],
  };
  renderPartContent(body, n, id, ctx);
  return {
    update() {
      // 子项目的内容只跟着子项目的文件变，文件一变整个画布重画
    },
    destroy() {
      for (const instance of instances) {
        try {
          instance.destroy();
        } catch {
          // 控件的清理出错不影响重建
        }
      }
    },
  };
}

function buildNode(id: string, parentEl: HTMLElement): void {
  const n = node(id);
  if (!n) return;
  const wrapper = document.createElement("div");
  wrapper.className = "vf-node";
  wrapper.dataset.vfId = id;
  wrapper.dataset.vfType = n.type;
  applyNodeBox(wrapper, unit(), { x: n.x ?? 0, y: n.y ?? 0, width: n.width, height: n.height }, n.rotation);
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
  } else if (n.type === "Group" && kind().id === "graphic") {
    // 组不画东西，样式类加在外框上；空的组在编辑时显示自己的 ID，免得找不到
    applyGroupClass(wrapper, n);
    if (!childrenOf(n).length) {
      body.textContent = id;
      body.classList.add("vf-placeholder");
    }
  } else if (n.type === "Part" && kind().id === "graphic") {
    entry.instance = mountPart(id, n, body);
  } else if (n.type === "Container" || n.type in LAYOUT_TYPE_KINDS) {
    // 未转换的容器或布局容器：没有子节点时显示自己的 ID，作为占位
    if (!childrenOf(n).length) {
      body.textContent = id;
      body.classList.add("vf-placeholder");
    }
  } else if (n.type === "External") {
    // 外部容器：工具里只是占位，导出后由业务把自己的控件放进来
    body.textContent = `外部容器 ${id}\n导出后由业务放入控件`;
  } else if (n.type === "Shape" || n.type === "Line") {
    paintGraphic(id, entry, activeRuntime().view(id).props);
  } else {
    const component = project.components.get(n.type) ?? standardComponents().get(n.type);
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
          stage: stageServicesNow(),
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
  const boxes = computeSceneLayout(project.scene, layoutHooks(runtime));
  const hidden = hiddenPages(project.scene, shownPage);
  const rootId = stageRootId();
  const rootNode = node(rootId);
  // 主画板放在哪：平时是设计窗口的画布，预览成电脑、手机时是外框里的“屏幕”
  const stageEl = boardHost ?? ensureStageIframe();

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
    getWindowSize: () => rootLayoutSize(rootNode),
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
      previewRuntime?.dockResizeSplit(area, idx, size, rootId, rootLayoutSize(rootNode));
      persistPreviewDockLayout("调整并排分栏大小", commit);
    },
  };

  if (rootNode && isPartitionedWindow(rootNode)) {
    const menuH = rootNode.menuBar ? Math.max(0, Math.round(rootNode.menuBar.height ?? 28)) : 0;
    const statusNode = rootNode.statusBar ? project.scene.nodes[rootNode.statusBar] : undefined;
    const statusVis = statusNode && rootNode.statusBar ? runtime.view(rootNode.statusBar).visible : false;
    const statusH = statusNode && statusVis ? Math.round(statusNode.height ?? 28) : 0;
    const midY = menuH;
    const windowSize = rootLayoutSize(rootNode);
    const midH = Math.max(0, windowSize.height - menuH - statusH);
    const dockRes = computeDockWindowLayout(
      project.scene,
      rootId,
      rootNode,
      windowSize.width,
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
        const windowSize = rootLayoutSize(rootNode);
        // 电脑里把窗口拖得比对话框还小时，对话框从左上角摆，标题栏和按钮不被裁到窗口外面
        const clampToWindow = previewRootSize && mode === "preview" ? (v: number) => Math.max(0, v) : (v: number) => v;
        const dx = clampToWindow(Math.round((windowSize.width - box.width) / 2));
        const dy = clampToWindow(Math.round((windowSize.height - box.height) / 2));
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
        applyNodeBox(entry.wrapper, unit(), { x: useAbs ? box.absX : box.x, y: useAbs ? box.absY : box.y, width: box.width, height: box.height }, n?.rotation);
      }
    }
    const effectiveVis = box ? box.visible : view.visible;
    if (mode === "preview") {
      setShown(id, entry, effectiveVis);
      entry.wrapper.classList.remove("vf-ghost");
    } else {
      entry.wrapper.style.display = hidden.has(id) || (n?.type === "Dialog" && !isDialogShownInStage(id)) ? "none" : "";
      entry.wrapper.classList.toggle("vf-ghost", !effectiveVis && !hidden.has(id));
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
      paintGraphic(id, entry, view.props, box);
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

/** x、y 是设计窗口（iframe）里的坐标：换成编辑器窗口里的（设计窗口有缩放和偏移，套了设备外框更明显） */
function showPreviewPopupMenu(x: number, y: number, specs: MenuItemSpec[]): void {
  const items = flattenMenuSpecsToPopupItems(specs);
  if (items.length === 0) return;
  const iframe = document.getElementById("stage-iframe") as HTMLIFrameElement | null;
  const frame = iframe?.getBoundingClientRect();
  const k = frame && iframe!.offsetWidth ? frame.width / iframe!.offsetWidth : 1;
  openMenu((frame?.left ?? 0) + x * k, (frame?.top ?? 0) + y * k, items);
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
${SHAPE_STAGE_CSS}
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

/** 平面设计的设计窗口里，只有编辑器才要的样式：占位的容器、出错的控件、编辑时不让选中文字。 */
const STAGE_EDITOR_ONLY_CSS = `
html, body {
  width: 100%;
  height: 100%;
  background: transparent;
  overflow: hidden;
}
body.edit {
  user-select: none;
}
#stage-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
/* 平面设计编辑：全部页面摊开，每一页是一张带阴影的纸；拖出页面的东西在拖动时露出来 */
#stage-canvas.vf-spread {
  background: transparent;
}
.vf-spread > .vf-board {
  box-shadow: 0 0 0 0.5px rgba(15, 23, 42, 0.18), 0 2px 6px rgba(15, 23, 42, 0.08), 0 12px 32px rgba(15, 23, 42, 0.10);
}
.vf-spread > .vf-board.vf-dragging-out {
  overflow: visible;
  z-index: 5;
}
body.edit .vf-node[data-vf-type="Container"] > .vf-body:empty,
body.edit .vf-node[data-vf-type="Container"] > .vf-body.vf-placeholder,
body.edit .vf-node[data-vf-type="Group"] > .vf-body.vf-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed #9aa1ad;
  color: #8a909b;
  font: 12px/1.3 "Segoe UI", "Microsoft YaHei UI", system-ui, sans-serif;
  overflow: hidden;
}
body.preview .vf-placeholder {
  visibility: hidden;
}
/* 子项目：内容只看不改，编辑时用虚线框标出它是一整块（双击进去改） */
.vf-body.vf-part {
  pointer-events: none;
}
body.edit .vf-node[data-vf-type="Part"] > .vf-body.vf-part {
  outline: 1px dashed rgba(100, 116, 139, 0.5);
  outline-offset: -0.5px;
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
  border: 1px solid #c62828;
  background: #fdecec;
  color: #c62828;
  font: 12px/1.3 "Segoe UI", "Microsoft YaHei UI", system-ui, sans-serif;
  overflow: hidden;
  text-align: center;
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
    doc.head.prepend(baseStyle);
  }
  // 平面设计的基础样式和播放页、导出的网页是同一份（stage.ts），再加上只在编辑器里要的那几条
  const kindCss = project ? stageBaseCssFor(kind().id) : null;
  const baseCss = kindCss === null ? STAGE_IFRAME_BASE_CSS : kindCss + STAGE_EDITOR_ONLY_CSS;
  if (baseStyle.textContent !== baseCss) baseStyle.textContent = baseCss;
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
        const wrapper = partNodeElement(e.target as Element | null);
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

  deviceStage?.destroy();
  deviceStage = null;
  boardHost = null;
  previewRootSize = null;
  const rootId = stageRootId();
  const root = node(rootId);
  const stage = $("stage");
  const stageCanvas = ensureStageIframe();
  stageCanvas.innerHTML = "";
  // 外框量过的尺寸不能留下来：从手机换回原样时，界面设计的画布还是手机那么宽
  stageCanvas.style.removeProperty("width");
  stageCanvas.style.removeProperty("height");
  overlay.remove();
  if (!root) return;
  boardEls.clear();
  const device = mode === "preview" ? previewDevice() : "plain";
  $("stage-frame").classList.toggle("spread", spreadOut());
  $("stage-frame").classList.toggle("device", device !== "plain");
  // 独立预览窗口套外框时，设备按窗口缩放（和编辑器的预览一样由 viewport.ts 摆）；原样时照旧 1:1 摆在正中
  const wasFramed = document.body.classList.contains("standalone-device");
  document.body.classList.toggle("standalone-device", isStandalonePreview() && device !== "plain");
  if (device !== "plain") {
    renderDeviceStage(stageCanvas, device);
    return;
  }
  // 原样：下次再套外框时重新缩放到装下整个设备（中间可能缩放、平移过，独立预览窗口里排法也换了）
  fittedDevice = "";
  if (wasFramed) {
    // 独立预览窗口从外框换回原样：外框时为了居中滚过去的位置不能留着，从左上角看起
    $("stage-scroll").scrollLeft = 0;
    $("stage-scroll").scrollTop = 0;
  }
  sizeStageTo(stageWorld());
  if (spreadOut()) {
    // 平面设计编辑：每一页一个画板元素，按排好的位置摆在画布上；页面的样式类（纸色、纸纹）加在各自的画板元素上
    stageCanvas.removeAttribute("class");
    delete stageCanvas.dataset.vfBoard;
    delete stageCanvas.dataset.vfType;
    stageCanvas.classList.add("vf-spread");
    stageCanvas.style.width = "100%";
    stageCanvas.style.height = "100%";
    const world = stageWorld();
    for (const pageId of pageIds(project.scene)) {
      const page = node(pageId);
      if (!page) continue;
      const el = stageCanvas.ownerDocument.createElement("div");
      applyBoard(el, pageId, page, unit());
      const r = absRect(pageId);
      el.style.position = "absolute";
      el.style.left = len(r.x - world.x);
      el.style.top = len(r.y - world.y);
      boardEls.set(pageId, el);
      stageCanvas.append(el);
    }
  } else if (root.type === "Page") {
    // 页面的样式类加在画布上：纸色、纸纹这些整页的样式由项目的样式表决定
    applyBoard(stageCanvas, rootId, root, unit());
    stageCanvas.style.width = "100%";
    stageCanvas.style.height = "100%";
  } else {
    stageCanvas.removeAttribute("class");
    delete stageCanvas.dataset.vfBoard;
    delete stageCanvas.dataset.vfType;
  }
  $("stage-title").textContent = boardTitle(rootId) + (mode === "preview" ? "　·　预览中" : "");
  $("stage-title").hidden = spreadOut();
  $("window-size").textContent =
    unit().css === "px" ? `${kind().board.noun} ${root.width}×${root.height}` : `${kind().board.noun} ${formatLength(unit(), root.width)}×${formatLength(unit(), root.height)} ${unit().css}`;

  boardHost = stageCanvas;
  if (spreadOut()) {
    for (const [pageId, el] of boardEls) for (const child of childrenOf(node(pageId))) buildNode(child, el);
  } else {
    buildRootBoard(stageCanvas, rootId);
  }
  applyViews();
  if (mode === "edit") {
    stage.append(overlay);
    syncOverlayScale();
    renderPageGuides();
    renderPageLabels();
    updateSelectionBox();
  }
}


/** 主画板（界面设计的主窗口连同菜单栏和叠在上面的对话框；平面设计的一页）里的东西建进 host */
function buildRootBoard(host: HTMLElement, rootId: string): void {
  const root = node(rootId);
  if (!root) return;
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
    host.append(bar);
  }

  for (const child of childrenOf(root)) buildNode(child, host);
  // 界面设计：对话框叠在主窗口上；平面设计预览时别的页面不建
  if (kind().board.arrange === "overlay") {
    for (const winId of allWindowIds(project.scene)) {
      if (winId !== rootId) buildNode(winId, host);
    }
  }
}

// ---------- 预览的设备：书、电脑、手机，或者原样 ----------

/** 网页的文档类型（这个文件里的 Document 是 YAML 库的） */
type DomDocument = typeof document;

/**
 * 预览时用的设备和它的选项。存在 .designer/preview.json（这台机器上的预览设置，不进项目的设计）。
 * 这个文件有几个窗口在写：编辑器、界面设计的独立预览窗口、平面设计的播放页（player/host.ts）。
 * 所以存的时候先读文件再只改动过的那几项；文件被别的窗口改了，这里跟着换（预览中按同一页重画）。
 */
interface PreviewSettings {
  device?: DeviceId | "plain";
  phone?: string;
  landscape?: boolean;
}
const PREVIEW_SETTINGS_PATH = ".designer/preview.json";
let previewSettings: PreviewSettings = {};
/** 存设置排着队一个一个写 */
let previewSettingsWrite: Promise<void> = Promise.resolve();
/** 这个窗口开始写设置的次数：读文件期间又写了，读到的可能是旧的，不拿它盖内存 */
let previewSettingsWrites = 0;

async function readPreviewSettingsFile(): Promise<PreviewSettings & Record<string, unknown>> {
  try {
    const text = await readText(PREVIEW_SETTINGS_PATH);
    const parsed = text ? (JSON.parse(text) as unknown) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as PreviewSettings & Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function loadPreviewSettings(): Promise<void> {
  previewSettings = await readPreviewSettingsFile();
}

/** 内存里的设置换成 next；在预览中而设备、型号、横竖变了，就按同一页重画 */
function adoptPreviewSettings(next: PreviewSettings): void {
  const same = next.device === previewSettings.device && next.phone === previewSettings.phone && Boolean(next.landscape) === Boolean(previewSettings.landscape);
  if (same || !project || mode !== "preview") {
    previewSettings = next;
    return;
  }
  const before = previewDevice();
  const anchor = previewViews(before)[previewIndex];
  previewSettings = next;
  const device = previewDevice();
  if (device !== before) {
    previewIndex = anchor ? previewIndexForAnchor(device, anchor) : previewIndexForFocus(device);
    desktopState.minimized = false;
  }
  renderStage();
  renderBoardBar();
}

/**
 * 桌面版的独立预览窗口交给主窗口写、还没在文件里看到的改动。主窗口写得比这里读得慢时，
 * 读到的文件还是旧的，不能拿它把用户刚选的盖回去；文件里出现了就不再等它。
 */
let previewSettingsForwarded: PreviewSettings = {};

/** 文件可能被别的窗口改了：读进来。这个窗口自己还有没写完的就等写完；读的期间这里又写了就不管这一次（那次写完会再来） */
async function refreshPreviewSettings(): Promise<void> {
  const writes = previewSettingsWrites;
  await previewSettingsWrite;
  const next = await readPreviewSettingsFile();
  if (writes !== previewSettingsWrites) return;
  const waiting = previewSettingsForwarded as Record<string, unknown>;
  for (const key of Object.keys(waiting)) if ((next as Record<string, unknown>)[key] === waiting[key]) delete waiting[key];
  adoptPreviewSettings({ ...next, ...previewSettingsForwarded });
}

/** 存一处改动（只写改了的那几项）。桌面版的独立预览窗口不能写盘，交给主窗口写 */
function savePreviewSettings(patch: PreviewSettings): Promise<void> {
  previewSettings = { ...previewSettings, ...patch };
  previewSettingsWrites++;
  const forward = isStandalonePreview() && isInTauri();
  if (forward) previewSettingsForwarded = { ...previewSettingsForwarded, ...patch };
  previewSettingsWrite = previewSettingsWrite.then(async () => {
    if (forward && (await sendPreviewSettingsToMain(patch))) return;
    try {
      const merged = { ...(await readPreviewSettingsFile()), ...patch };
      await writeText(PREVIEW_SETTINGS_PATH, JSON.stringify(merged, null, 2) + "\n");
    } catch (e) {
      toast(`预览设置没存上：${(e as Error).message}`);
    }
  });
  return previewSettingsWrite;
}

/** 预览用哪种设备：平面设计默认是书，界面设计默认是电脑；“原样”是不套外框、1:1。独立预览窗口和这里用同一份设置 */
function previewDevice(): PreviewChoice {
  // 项目在 project.json 里限定了看法时，选过的不在里面就用项目写的第一个
  return resolvePreviewChoice(previewSettings.device, kindName(), project.previewDevices);
}

/** 设计类型的名字（预览设备那边只分平面设计和界面设计） */
function kindName(): "ui" | "graphic" {
  return project.kind === "graphic" ? "graphic" : "ui";
}

/**
 * 电脑预览里拖过窗口大小（或最大化）时，界面设计的主窗口按窗口的内容区重新排版：这里记着内容区多大。
 * 只在套着电脑外框时有，renderStage 每次先清掉，renderDeviceStage 再按需要设上。
 */
let previewRootSize: Size | null = null;

/** 主窗口现在按多大排版：电脑预览里拖过大小（或最大化）时是窗口的内容区，平时是设计的尺寸 */
function rootLayoutSize(rootNode: SceneNode | undefined): Size {
  if (mode === "preview" && previewRootSize) return previewRootSize;
  return { width: rootNode?.width ?? 1280, height: rootNode?.height ?? 800 };
}

/** 预览里的一屏：书和电脑是一屏两页（跨页）、手机是一页、原样是一个画板。board 是切回编辑时“在看”的画板 */
type PreviewView = ScreenView;

function previewViews(device: DeviceId | "plain"): PreviewView[] {
  if (kind().board.arrange !== "spread") {
    const root = project.scene.root;
    const piece = bookSheetPiece(project.scene, root, 0);
    return [{ label: boardTitle(root), left: null, right: piece, board: root, pages: [] }];
  }
  // 原样的一屏是一个页面；页码从小到大，包封换到书上时落在封面
  if (device === "plain") return pageIds(project.scene).map((id) => ({ label: boardTitle(id), left: null, right: null, ...boardAnchor(project.scene, id) }));
  // 配页和播放页（独立预览、导出的网页）是同一份：书和电脑一屏两页，手机一屏一页
  return deviceViews(project.scene, device);
}

/** 预览看到第几屏 */
let previewIndex = 0;
/** 现在的设备外框 */
let deviceStage: DeviceStage | null = null;
/** 主画板放在哪个元素里（设计窗口的画布，或外框里的屏幕） */
let boardHost: HTMLElement | null = null;
/** 电脑预览里窗口的状态 */
/** frame：拖过大小的外框；design：拖的时候界面设计的主窗口多大（设计尺寸改了，拖过的就不算了） */
const desktopState: { maximized: boolean; minimized: boolean; frame: DeviceRect | null; design: Size | null } = { maximized: false, minimized: false, frame: null, design: null };
/** 上一次按哪种设备摆的视角：换设备、换手机型号、横竖切换时重新缩放到装下整个设备 */
let fittedDevice = "";

/** 预览到这一屏时，回到编辑“在看”它的页面 */
function syncFocusFromPreview(): void {
  const view = previewViews(previewDevice())[previewIndex];
  if (view && kind().board.arrange === "spread") currentBoardId = view.board;
}

/** 换设备时停在同一页：先按页码找，找不到再按画板找 */
function previewIndexForAnchor(device: DeviceId | "plain", anchor: PreviewView): number {
  return screenIndexForAnchor(previewViews(device), anchor);
}

/** 预览从“在看”的页面所在的那一屏开始 */
function previewIndexForFocus(device: DeviceId | "plain"): number {
  const views = previewViews(device);
  const focus = stageRootId();
  const index = views.findIndex((v) => v.board === focus || v.left?.board === focus || v.right?.board === focus);
  if (index >= 0) return index;
  return device === "plain" ? 0 : bookViewIndexOfBoard(bookViews(project.scene), focus);
}

/** 软件的名字和图标（电脑预览的窗口和任务栏用） */
function appIdentity(): { title: string; icon: { src?: string; letter: string; color: string } } {
  const rootNode = node(project.scene.root);
  const title = kind().board.arrange === "overlay" ? (rootNode?.title || project.name) : project.name;
  const letter = [...(project.name.trim() || "?")][0].toUpperCase();
  return { title, icon: { src: project.icon ? projectUrl(project.icon) : undefined, letter, color: iconColorFor(project.name) } };
}

/** 一个画板的元素：页面的样式类（纸色、纸纹）加在它上面，里面的东西建进去 */
function buildBoardElement(doc: DomDocument, boardId: string): HTMLElement {
  const n = node(boardId)!;
  const el = doc.createElement("div");
  applyBoard(el, boardId, n, unit());
  el.style.position = "absolute";
  el.style.left = "0";
  el.style.top = "0";
  for (const child of childrenOf(n)) buildNode(child, el);
  return el;
}

/** 预览：设计窗口里画设备外框，画板放进外框的屏幕（书是翻开的两页） */
function renderDeviceStage(canvas: HTMLElement, device: DeviceId): void {
  const doc = canvas.ownerDocument;
  canvas.removeAttribute("class");
  delete canvas.dataset.vfBoard;
  delete canvas.dataset.vfType;
  canvas.classList.add("vf-device-canvas");
  const views = previewViews(device);
  previewIndex = Math.max(0, Math.min(views.length - 1, previewIndex));
  const view = views[previewIndex];
  if (!view) return;
  const graphic = kind().board.arrange === "spread";
  const identity = appIdentity();
  const contentOf = (v: PreviewView) => ({ width: (v.left?.width ?? 0) + (v.right?.width ?? 0), height: Math.max(v.left?.height ?? 0, v.right?.height ?? 0) });
  let frame: DeviceStage;
  if (device === "book") {
    // 读过几页、还剩几页：书两边纸的厚度
    const before = graphic ? views.slice(0, previewIndex).reduce((n, v) => n + (v.left ? 1 : 0) + (v.right ? 1 : 0), 0) : 0;
    const after = graphic ? views.slice(previewIndex + 1).reduce((n, v) => n + (v.left ? 1 : 0) + (v.right ? 1 : 0), 0) : 0;
    // 合着的书只在最前面（只有封面）和最后面（只有封底）；中间少一面的是翻开的书、那面空白
    // 只有一屏（一张三折页、界面设计）就是翻开的；没有包封的册子最后单独一个左手页，右边是空白的纸
    const closed =
      views.length > 1 && previewIndex === 0 && !view.left
        ? "front"
        : views.length > 1 && previewIndex === views.length - 1 && !view.right && coverWrapId(project.scene)
          ? "back"
          : null;
    frame = mountBook(doc, { left: view.left, right: view.right }, { before, after }, closed);
    if (graphic) {
      for (const [board, slot] of frame.slots) {
        const el = buildBoardElement(doc, board);
        slot.append(el);
        boardEls.set(board, el);
      }
    } else {
      const slot = frame.slots.get(project.scene.root)!;
      const host = doc.createElement("div");
      host.style.cssText = `position:relative;width:${view.right!.width}px;height:${view.right!.height}px;`;
      slot.append(host);
      buildRootBoard(host, project.scene.root);
      boardHost = host;
    }
  } else {
    const design = contentOf(view);
    // 界面设计的主窗口改了尺寸：拖过的大小不算了，按新的设计尺寸摆
    if (!graphic && desktopState.frame && (desktopState.design?.width !== design.width || desktopState.design?.height !== design.height)) desktopState.frame = null;
    // 电脑里拖过窗口大小（或最大化）：界面设计按窗口的内容区重新排版，平面设计的纸按比例放进窗口
    const client = device === "desktop" ? (desktopState.maximized ? desktopClient(desktopWorkArea()) : desktopState.frame ? desktopClient(desktopState.frame) : null) : null;
    const relayout = !graphic && client !== null;
    const content = relayout ? client : design;
    previewRootSize = relayout ? client : null;
    let host: HTMLElement | null = null;
    frame =
      device === "desktop"
        ? mountDesktop(doc, {
            app: { title: graphic ? `${identity.title} — ${view.label}` : identity.title, icon: identity.icon },
            content,
            maximized: desktopState.maximized,
            minimized: desktopState.minimized,
            frame: desktopState.frame,
            paper: graphic,
            // 拖边、拖角改窗口大小：界面设计每一帧按新的内容区重新排版（只挪位置、改尺寸，不重建控件）
            onResize: (next, done) => {
              desktopState.frame = next;
              desktopState.design = design;
              if (graphic) return design;
              const size = desktopClient(next);
              previewRootSize = size;
              if (host) {
                host.style.width = `${size.width}px`;
                host.style.height = `${size.height}px`;
              }
              applyViews();
              if (done) renderBoardBar();
              return size;
            },
            onMinimize: () => {
              desktopState.minimized = true;
              renderStage();
            },
            onMaximize: () => {
              desktopState.maximized = !desktopState.maximized;
              renderStage();
            },
            onRestore: () => {
              desktopState.minimized = false;
              renderStage();
            },
          })
        : mountPhone(doc, phoneModel(previewSettings.phone), { content, landscape: Boolean(previewSettings.landscape) });
    const screen = frame.slots.get("screen")!;
    if (graphic) {
      screen.style.background = "#fff";
      placeSheets(doc, screen, view, (board) => buildBoardElement(doc, board));
    } else {
      host = doc.createElement("div");
      host.style.cssText = `position:relative;width:${content.width}px;height:${content.height}px;`;
      screen.append(host);
      buildRootBoard(host, project.scene.root);
      boardHost = host;
    }
  }
  canvas.append(frame.root);
  canvas.style.width = `${frame.size.width}px`;
  canvas.style.height = `${frame.size.height}px`;
  const stage = $("stage");
  stage.style.width = `${frame.size.width}px`;
  stage.style.height = `${frame.size.height}px`;
  syncOverlayScale();
  deviceStage = frame;
  $("stage-title").hidden = true;
  applyViews();
  // 换了设备（或型号、横竖）：缩放到装下整个设备
  const key = `${device}:${device === "phone" ? `${previewSettings.phone ?? ""}:${previewSettings.landscape ? 1 : 0}` : ""}`;
  if (key !== fittedDevice) {
    fittedDevice = key;
    requestAnimationFrame(() => zoomToFit());
  }
}

/** 翻到下一屏（delta 为 1）或上一屏（-1）：书是纸从书脊翻过去，电脑和手机是新的一屏滑进来 */
function flipPreview(delta: number): void {
  if (mode !== "preview") return;
  const device = previewDevice();
  const views = previewViews(device);
  const next = previewIndex + delta;
  if (next < 0 || next >= views.length) return;
  const snapshot = device === "book" ? turnSnapshot(deviceStage) : null;
  previewIndex = next;
  syncFocusFromPreview();
  renderStage();
  renderBoardBar();
  if (!deviceStage) return;
  if (device === "book" && snapshot) playTurn(deviceStage.root.ownerDocument, deviceStage, snapshot, delta > 0);
  else if (device !== "plain") playSlide(deviceStage, delta > 0);
}

/** 预览时翻页条换成：设备（书、电脑、手机、原样）、设备的选项、翻页 */
function renderPreviewBar(bar: HTMLElement): void {
  const device = previewDevice();
  const views = previewViews(device);
  const segmented = document.createElement("div");
  segmented.className = "segmented device-switch";
  segmented.setAttribute("role", "group");
  segmented.setAttribute("aria-label", "预览的设备");
  const titles: Record<PreviewChoice, string> = {
    book: "翻开的书，一屏两页，像翻书一样翻页",
    desktop: "16:9 的电脑桌面：软件的窗口（拖边、拖角改大小）、底部任务栏（图标停一下看缩略图）",
    phone: "手机：软件在屏幕里，按屏幕宽度缩放",
    plain: kindName() === "graphic" ? "不套外框，按纸张原大一页一页看（和导出的 PDF 一样）" : "不套外框，按设计的尺寸 1:1 看",
  };
  // 项目在 project.json 的 preview.devices 里限定了看法时只列那几种，按它写的顺序
  const choices = previewChoices(project.previewDevices);
  for (const id of choices) {
    const label = previewChoiceLabel(id, kindName());
    const title = titles[id];
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.title = title;
    b.dataset.device = id;
    b.setAttribute("aria-pressed", String(device === id));
    b.addEventListener("click", () => {
      if (previewDevice() === id) return;
      const anchor = previewViews(previewDevice())[previewIndex];
      void savePreviewSettings({ device: id });
      previewIndex = anchor ? previewIndexForAnchor(id, anchor) : previewIndexForFocus(id);
      desktopState.minimized = false;
      renderStage();
      renderBoardBar();
    });
    segmented.append(b);
  }
  // 只有一种看法时不用选
  const parts: HTMLElement[] = choices.length > 1 ? [segmented] : [];
  if (device === "phone") {
    const select = document.createElement("select");
    select.className = "tool-select";
    select.title = "手机型号";
    select.dataset.board = "phone-model";
    for (const model of PHONE_MODELS) select.append(new Option(`${model.label}（${model.width}×${model.height}）`, model.id));
    select.value = phoneModel(previewSettings.phone).id;
    select.addEventListener("change", () => {
      void savePreviewSettings({ phone: select.value });
      renderStage();
    });
    const rotate = document.createElement("button");
    rotate.type = "button";
    rotate.className = "tool";
    rotate.textContent = previewSettings.landscape ? "竖放" : "横放";
    rotate.title = "横过来看 / 竖过来看";
    rotate.dataset.board = "rotate";
    rotate.addEventListener("click", () => {
      void savePreviewSettings({ landscape: !previewSettings.landscape });
      renderStage();
      renderBoardBar();
    });
    parts.push(select, rotate);
  }
  if (views.length > 1) {
    const button = (text: string, title: string, enabled: boolean, onClick: () => void, action: string) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "tool";
      el.textContent = text;
      el.title = title;
      el.disabled = !enabled;
      el.dataset.board = action;
      el.addEventListener("click", onClick);
      return el;
    };
    const label = document.createElement("span");
    label.className = "preview-page-label";
    label.dataset.board = "label";
    label.textContent = `${views[previewIndex]?.label ?? ""}`;
    label.title = `共 ${views.length} 屏`;
    parts.push(
      button("◀", "上一屏（← 或 PageUp）", previewIndex > 0, () => flipPreview(-1), "prev"),
      label,
      button("▶", "下一屏（→ 或 PageDown）", previewIndex < views.length - 1, () => flipPreview(1), "next"),
    );
  }
  bar.replaceChildren(...parts);
  // 只有一种看法、又只有一屏：栏上什么都没有，不留一个空框
  bar.hidden = parts.length === 0;
}

/** 摊开时每一页的画板元素（在设计窗口里） */
const boardEls = new Map<string, HTMLElement>();

/**
 * 页面尺寸变了（拖页面的边、改页面设置）：后面的页面挪位置，画布跟着变大变小。
 * 拖动途中每一帧都可能调，所以只挪元素，不重建。
 */
function syncSpreadLayout(): void {
  if (!spreadOut()) return;
  const world = stageWorld();
  sizeStageTo(world);
  for (const [pageId, el] of boardEls) {
    const page = node(pageId);
    if (!page) continue;
    const r = absRect(pageId);
    el.style.left = len(r.x - world.x);
    el.style.top = len(r.y - world.y);
    el.style.width = len(page.width);
    el.style.height = len(page.height);
  }
  renderPageGuides();
  renderPageLabels();
}

/** 画板的说明文档：project.json 里给这个画板写了就用它，否则用第一个画板的。 */
function docOfBoard(boardId: string | null): string {
  return (boardId && project.boardDocs?.[boardId]) || project.pageDoc;
}

/** 画板在标题条和翻页条上的名字：写了 title 用 title；页面没写时用它是第几页。 */
function boardTitle(id: string): string {
  const n = node(id);
  if (n?.title) return n.title;
  if (n?.type !== "Page") return id;
  return pageLabel(project.scene, id);
}

/** 把设计窗口的尺寸定成这么大（按画布单位）：一个画板，或者摊开的全部页面。 */
function sizeStageTo(root: { width: number; height: number }): void {
  const stage = $("stage");
  stage.style.width = len(root.width);
  stage.style.height = len(root.height);
  syncOverlayScale();
}

/**
 * 编辑层里的坐标一律按画布单位写（写成 px），再整层放大“1 个单位合多少像素”倍，盖在设计窗口上。
 * 像素画布上倍数是 1，什么都不变；毫米画布上，编辑层里写 14 就是 14 毫米。
 * 手柄、细线除以 --vf-zoom 保持屏幕上的大小，所以这里把单位换算也乘进去。
 */
/** 编辑层的底：铺满整个画布（画布从负坐标开始时，编辑层的方框盖不全，见 syncOverlayScale） */
const overlayHitArea = document.createElement("div");
overlayHitArea.id = "overlay-hit";

function syncOverlayScale(): void {
  // 项目还没读完时视角就可能变（缩放快捷键），这时没什么可摆的
  if (!project) return;
  const scale = unit().px;
  const root = node(stageRootId());
  // 编辑层里的坐标是画布坐标；摊开时画布从 (world.x, world.y) 开始，整层往回挪这么多
  const world = stageWorld();
  if ((scale === 1 && world.x === 0 && world.y === 0) || !root) {
    overlayHitArea.remove();
    overlay.style.transform = "";
    overlay.style.transformOrigin = "";
    overlay.style.width = "";
    overlay.style.height = "";
    overlay.style.inset = "";
    overlay.style.removeProperty("--vf-zoom");
    overlay.style.removeProperty("--vf-unit");
    overlay.classList.remove("unit-scaled");
    return;
  }
  overlay.classList.toggle("unit-scaled", scale !== 1);
  overlay.style.inset = "0 auto auto 0";
  overlay.style.width = `${world.width}px`;
  overlay.style.height = `${world.height}px`;
  overlay.style.transformOrigin = "0 0";
  overlay.style.transform = `scale(${scale}) translate(${-world.x}px, ${-world.y}px)`;
  // 往回挪了以后，编辑层自己的方框不再盖住设计窗口的左上角那一条：垫一块铺满画布的底，鼠标落在哪里都由编辑层接住
  overlayHitArea.style.cssText = `position:absolute;left:${world.x}px;top:${world.y}px;width:${world.width}px;height:${world.height}px;`;
  if (overlayHitArea.parentElement !== overlay) overlay.prepend(overlayHitArea);
  overlay.style.setProperty("--vf-zoom", String(viewZoom() * scale));
  overlay.style.setProperty("--vf-unit", String(scale));
}

onZoomChange(syncOverlayScale);

/** 页面的参考线：每张纸的边、版心、中缝。只在编辑时画，不进导出。 */
const pageGuidesLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
pageGuidesLayer.id = "page-guides";

function renderPageGuides(): void {
  pageGuidesLayer.replaceChildren();
  const pages = (spreadOut() ? pageIds(project.scene) : [stageRootId()]).filter((id) => node(id)?.type === "Page");
  if (pages.length === 0 || !kind().has.pageGuides) {
    pageGuidesLayer.remove();
    return;
  }
  if (pageGuidesLayer.parentElement !== overlay) overlay.prepend(pageGuidesLayer);
  // 和编辑层一样用画布坐标：摊开时从 world 的左上角开始
  const world = stageWorld();
  pageGuidesLayer.setAttribute("viewBox", `${world.x} ${world.y} ${world.width} ${world.height}`);
  pageGuidesLayer.setAttribute("width", String(world.width));
  pageGuidesLayer.setAttribute("height", String(world.height));
  pageGuidesLayer.style.left = `${world.x}px`;
  pageGuidesLayer.style.top = `${world.y}px`;
  const add = (tag: string, attrs: Record<string, string | number>, cls: string) => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
    el.setAttribute("class", cls);
    pageGuidesLayer.append(el);
  };
  for (const pageId of pages) {
    const page = node(pageId)!;
    // 预览时、不摊开时，这一页就在原点
    const o = spreadOut() ? absRect(pageId) : { x: 0, y: 0 };
    const geo = pageGeometry(page);
    for (const live of geo.liveAreas) {
      if (live.width < page.width / geo.sheets || live.height < page.height) add("rect", { ...live, x: live.x + o.x, y: live.y + o.y }, "page-margin");
    }
    for (const x of geo.folds) add("line", { x1: x + o.x, y1: o.y, x2: x + o.x, y2: o.y + page.height }, "page-fold");
  }
}

/**
 * 摊开时每一页上方的名字（第 2–3 页、封底 + 封面……）：点它就“在看”这一页、属性页签显示它的页面设置。
 * 字的大小不跟着缩放变（除以 --vf-zoom）。
 */
const pageLabelsLayer = document.createElement("div");
pageLabelsLayer.id = "page-labels";

function renderPageLabels(): void {
  if (!spreadOut()) {
    pageLabelsLayer.remove();
    return;
  }
  if (pageLabelsLayer.parentElement !== overlay) overlay.append(pageLabelsLayer);
  const focus = stageRootId();
  pageLabelsLayer.replaceChildren(
    ...pageIds(project.scene).map((pageId) => {
      const r = absRect(pageId);
      const label = document.createElement("button");
      label.type = "button";
      label.className = "page-label" + (pageId === focus ? " current" : "");
      label.dataset.page = pageId;
      label.textContent = boardTitle(pageId);
      label.title = "点一下：在看这一页（属性页签里是它的页面设置）";
      label.style.left = `${r.x}px`;
      label.style.top = `${r.y}px`;
      label.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        e.preventDefault();
      });
      label.addEventListener("click", (e) => {
        e.stopPropagation();
        focusBoard(pageId);
        select(null);
      });
      return label;
    }),
  );
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
  return n && target !== lineId && n.type !== "Line" && !isBoardRoot(target) ? target : null;
}

// ---- 节点的真实外轮廓：线头挂在形状上时按它算，不按方框 ----

// 量路径用的隐藏 SVG：形状的轮廓是 SVG 路径（有圆弧、曲线），用浏览器量出路径上的点
const measureSvg = document.createElementNS(SVG_NS, "svg");
measureSvg.setAttribute("style", "position:absolute;left:-9999px;top:-9999px;width:0;height:0;visibility:hidden");
const measurePath = document.createElementNS(SVG_NS, "path");
measureSvg.append(measurePath);
document.body.append(measureSvg);
const outlineCache = new Map<string, Point[]>();

/**
 * 节点外轮廓上的一圈点，相对于节点左上角。形状按真实轮廓（描边的中线），其余按方框。
 * 尺寸按排出来的方框：放在排版容器里被拉伸的形状（或者电脑预览里拖过窗口大小），画出来的、挂线用的和导出的 Qt 是同一个轮廓。
 */
function outlineOf(id: string): Point[] {
  const n = node(id);
  if (!n) return [];
  const props = activeRuntime().view(id).props;
  const kind = str(props.shape, "rectangle");
  const isShape = n.type === "Shape" && kind !== "text";
  const stroke = props.stroke === "none" ? 0 : num(props.strokeWidth, 2);
  const laid = n.type === "Shape" ? absRect(id) : null;
  const width = laid?.width ?? n.width;
  const height = laid?.height ?? n.height;
  const key = isShape
    ? JSON.stringify([kind, width, height, stroke, props.radius, props.sides, props.points, props.ratio])
    : `box|${width}|${height}`;
  const cached = outlineCache.get(key);
  if (cached) return cached;
  let points: Point[];
  if (isShape) {
    measurePath.setAttribute("d", shapeGeometry(kind, width, height, stroke, props).body);
    const total = measurePath.getTotalLength();
    const count = Math.max(32, Math.min(800, Math.round(total / 2)));
    points = [];
    for (let i = 0; i < count; i++) {
      const p = measurePath.getPointAtLength((total * i) / count);
      points.push({ x: p.x, y: p.y });
    }
  } else {
    points = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
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
function paintGraphic(id: string, entry: Mounted, props: Record<string, Value>, box?: { width: number; height: number }): void {
  const n = node(id);
  if (!n) return;
  if (n.type === "Shape") {
    // 形状的线宽、字号、圆角是按像素定的：把方框换成像素来画，毫米画布上线才不会粗好几倍。
    // 放在排版容器里的形状按排出来的方框画（容器拉伸、电脑预览里拖过窗口大小时外框变了，图形跟着变）
    entry.hit = paintShape(entry.body, toPx(unit(), box?.width ?? n.width), toPx(unit(), box?.height ?? n.height), props);
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
  // 写进文件的线条位置按设计的尺寸排版来算：电脑预览里拖过窗口大小时，排版是按窗口的大小，那些位置不能落盘
  const resized = previewRootSize;
  previewRootSize = null;
  try {
    normalizeLinesAtDesignSize();
  } finally {
    previewRootSize = resized;
  }
}

function normalizeLinesAtDesignSize(): void {
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
    // 形状是按像素画的，点也换成像素再判断
    const local = new DOMPoint(toPx(unit(), localPt.x), toPx(unit(), localPt.y));
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
  // 吸附距离是屏幕上的手感，换成画布单位；网格间距不在这种单位的可选项里时当作没开
  const grid = unit().grids.includes(snapSettings.grid) ? snapSettings.grid : 0;
  return { threshold: feel(6), objects: snapSettings.objects && !off, grid: off ? 0 : grid };
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
  // 平面设计只参考同一页里的东西（摊开时别的页也在画布上，但吸过去没有意义）：正在动的东西所在的页，或者“在看”的页
  const first = exclude === null ? null : typeof exclude === "string" ? exclude : exclude[0];
  const board = first && node(first) ? boardOf(first) : stageRootId();
  const scope = kind().board.arrange === "spread" ? subtreeIds(project.scene, board) : null;
  for (const [id, n] of Object.entries(project.scene.nodes)) {
    if (excluded.has(id) || n.type === "Line") continue;
    if (scope && !scope.has(id)) continue;
    rects.push(isBoardRoot(id) ? absRect(id) : visualRect(id));
  }
  // 页面的版心和每张纸的边：东西能吸到版心线和中缝上（换到这一页在画布上的位置）
  const o = spreadOut() ? absRect(board) : { x: 0, y: 0 };
  rects.push(...pageGuideRects(project.scene, board).map((r) => ({ ...r, x: r.x + o.x, y: r.y + o.y })));
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
// 鼠标指着的控件的细框，画布和图层互相提示
const hoverOutline = document.createElement("div");
hoverOutline.id = "hover-outline";
overlay.append(ghost, guidesLayer, hoverOutline, outlines, selectionBox, bendHandles, ...endpointHandles, marqueeBox);

let hoveredId: string | null = null;

function layerRow(id: string): HTMLElement | null {
  return $("layers").querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
}

function isOnHiddenPage(id: string): boolean {
  const hidden = hiddenPages(project.scene, shownPage);
  for (let cur: string | null = id; cur; cur = parentOf(cur)) if (hidden.has(cur)) return true;
  return false;
}

function setHover(id: string | null): void {
  if (id === hoveredId) return;
  if (hoveredId) layerRow(hoveredId)?.classList.remove("hovered");
  hoveredId = id;
  if (id) layerRow(id)?.classList.add("hovered");
  if (!id || !node(id) || mode !== "edit" || isOnHiddenPage(id)) {
    hoverOutline.style.display = "none";
    return;
  }
  const r = absRect(id);
  const rotation = worldRotation(id);
  Object.assign(hoverOutline.style, {
    display: "block",
    left: `${r.x}px`,
    top: `${r.y}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
    transform: rotation ? `rotate(${rotation}deg)` : "",
  });
}

let hoverFrame = 0;

overlay.addEventListener("pointermove", (e) => {
  cancelAnimationFrame(hoverFrame);
  if (gesture || mode !== "edit" || tool.kind !== "select") {
    setHover(null);
    return;
  }
  const pt = stagePoint(e);
  hoverFrame = requestAnimationFrame(() => setHover(hitTest(pt.x, pt.y)));
});

overlay.addEventListener("pointerleave", () => {
  cancelAnimationFrame(hoverFrame);
  setHover(null);
});

// 视角按像素算，选中的范围是画布单位，换成像素再给它
setSelectionRectSource(() => {
  const rect = mode === "edit" && selectedIds.length > 0 ? unionRect(topSelection()) : null;
  return rect ? stageRectToPx(rect) : null;
});

/** 画布坐标的一块 → 设计窗口里的 CSS 像素（视角按它缩放、平移） */
function stageRectToPx(rect: Rect): Rect {
  const scale = unit().px;
  const world = stageWorld();
  return { x: (rect.x - world.x) * scale, y: (rect.y - world.y) * scale, width: rect.width * scale, height: rect.height * scale };
}

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
  const isRoot = isBoardRoot(selectedId);
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
  selectionTag.style.transformOrigin = flipLabels ? "center" : "";
  sizeLabel.style.transformOrigin = flipLabels ? "center" : "";
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
  return clientToStage(e.clientX, e.clientY);
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
      // 刻度和数字的大小是屏幕上的手感，换成画布单位
      const tickHalf = feel(4);
      for (const p of [a, b]) {
        const tick = horizontal ? { x1: p.x, y1: p.y - tickHalf, x2: p.x, y2: p.y + tickHalf } : { x1: p.x - tickHalf, y1: p.y, x2: p.x + tickHalf, y2: p.y };
        svgChild(guidesLayer, "line", { ...tick, class: "guide-gap" });
      }
      const label = svgChild(guidesLayer, "text", { x: (a.x + b.x) / 2 + (horizontal ? 0 : feel(6)), y: (a.y + b.y) / 2 + (horizontal ? -feel(6) : feel(4)), class: "guide-label" });
      label.textContent = formatLength(unit(), guide.size);
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
  sizeLabel.textContent = `${formatLength(unit(), width)} × ${formatLength(unit(), height)}`;
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
  return !!type && type !== "Container" && type !== "External" && type !== "Window" && type !== "Page" && type !== "Line";
}

/** 鼠标下面能从内部挂线的节点：最上面、最里面的那个。avoid 是线另一头挂着的节点，不让线两头挂在同一个东西上。 */
function attachableAt(px: number, py: number, excludeId: string | null, avoid: string | null): string | null {
  const visit = (id: string): string | null => {
    const children = childrenOf(node(id));
    for (let i = children.length - 1; i >= 0; i--) {
      const hit = visit(children[i]);
      if (hit) return hit;
    }
    if (isBoardRoot(id) || id === excludeId || id === avoid || !interiorAttachable(id)) return null;
    return containsPoint(id, px, py) ? id : null;
  };
  const board = boardAt(px, py);
  return board ? visit(board) : null;
}

/** 离鼠标 12 像素以内、最近的那个“边的中点”。任何节点（包括容器）都算，窗口和线条不算。 */
function nearestSideAnchor(px: number, py: number, excludeId: string | null, avoid: string | null): { node: string; side: Side; point: Point } | null {
  let best: { node: string; side: Side; point: Point } | null = null;
  let bestDistance = 12;
  for (const [id, n] of Object.entries(project.scene.nodes)) {
    if (isBoardRoot(id) || id === excludeId || id === avoid || n.type === "Line") continue;
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
    if (isBoardRoot(id) || id === excludeId || id === avoid || n.type === "Line") continue;
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
/** 节点最小能缩到多小。按屏幕像素定的手感，用的时候经 minSize() 换成画布单位。 */
const MIN_SIZE = 8;
function minSize(): number {
  return feel(MIN_SIZE);
}

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
  // 摊开时落在哪一页就放进哪一页；落在页面外面放进“在看”的那一页
  return boardAt(px, py) ?? stageRootId();
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
    if (spreadOut()) focusBoard(boardOf(parentId));
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
    if (spreadOut() && parentId) focusBoard(boardOf(parentId));
    const snapped = snapPoint(pt.x, pt.y, snapTargets(null), snapOptions(e));
    gesture = { kind: "draw", preset: null, nodeType: tool.type, start: { x: snapped.x, y: snapped.y }, rect: null, parentId, targets: snapTargets(null) };
    capturePointer(e);
    return;
  }

  // 旋转把手
  if (target.dataset.rotate && selectedId && selectedIds.length === 1) {
    const n = node(selectedId);
    if (!n || n.type === "Line" || isBoardRoot(selectedId) || isNodeLocked(project.scene, selectedId)) return;
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
    const isRoot = isBoardRoot(selectedId);
    const at = absRect(selectedId);
    gesture = {
      kind: "resize", id: selectedId, handle, start: { x: e.clientX, y: e.clientY }, orig,
      abs: isRoot ? { ...orig, x: at.x, y: at.y } : at, moved: false, targets: isRoot ? [] : snapTargets(selectedId),
    };
    capturePointer(e);
    return;
  }

  const stageDoc = (document.getElementById("stage-iframe") as HTMLIFrameElement | null)?.contentDocument;
  const menuBtn = stageDoc?.elementFromPoint(toPx(unit(), pt.x), toPx(unit(), pt.y))?.closest<HTMLElement>("[data-vf-menu-item]");
  if (menuBtn?.dataset.vfMenuItem) {
    focusMenuItemInEditor(menuBtn.dataset.vfMenuItem);
    return;
  }

  const id = hitTest(pt.x, pt.y);
  const type = id ? node(id)?.type : undefined;
  // 框选：从空白处、或者从一个还没选中的容器上拖出去（和 Figma 在画框里拖的效果一样）。只点一下不拖，就是选中它
  if (!id || ((type === "Container" || type === "External" || type === "Group") && !selectedIds.includes(id))) {
    // 框在哪一层里选：点到的容器里；摊开时点在某一页的空白处就是这一页，点在页面外面就是全部页面（scope 写空）
    const board = boardAt(pt.x, pt.y);
    if (board && spreadOut()) focusBoard(board);
    gesture = { kind: "marquee", start: pt, scope: id ? id : spreadOut() ? (board ?? "") : stageRootId(), base: e.shiftKey ? [...selectedIds] : [], clicked: id, moved: false };
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

/**
 * 摊开时把东西拖到了另一页上：直接放在页面上的东西（不在组里的），中心落在哪一页就挪进哪一页，
 * 在画布上的位置不变（换算成新页面里的坐标）。落在页面外面的留在原来那一页。
 */
function movePagesOnDrop(ids: string[]): void {
  let moved = false;
  for (const id of ids) {
    const n = node(id);
    const from = parentOf(id);
    if (!n || !from || node(from)?.type !== "Page") continue;
    const r = visualRect(id);
    const to = boardAt(r.x + r.width / 2, r.y + r.height / 2);
    if (!to || to === from || isNodeLocked(project.scene, to)) continue;
    const at = absRect(id);
    const source = absRect(from);
    const target = absRect(to);
    node(from)!.children = childrenOf(node(from)).filter((child) => child !== id);
    node(to)!.children = [...childrenOf(node(to)), id];
    if (n.type === "Line") n.props = shiftLineAll(n.props ?? {}, R(source.x - target.x), R(source.y - target.y));
    n.x = R(at.x - target.x);
    n.y = R(at.y - target.y);
    moved = true;
  }
  if (moved) {
    const board = boardOf(ids[0]);
    focusBoard(board);
  }
}

/** 节点的位置或大小在拖动中变了：只挪动它自己的元素（排版或分区节点重算排版），形状重画，挂着的线跟着走。 */
function applyLiveGeometry(id: string): void {
  const n = node(id);
  if (!n) return;
  if (isBoardRoot(id)) {
    if (spreadOut()) syncSpreadLayout();
    else sizeStageTo(n);
  }
  if (isBoardRoot(id) || isLayoutPositionedNode(project.scene, id) || layoutOf(n) !== null || isPartitionedWindow(n)) {
    applyViews();
  } else {
    const entry = mounted.get(id);
    if (entry) {
      applyNodeBox(entry.wrapper, unit(), { x: n.x ?? 0, y: n.y ?? 0, width: n.width, height: n.height }, n.rotation);
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
    let dx = R((e.clientX - gesture.start.x) / unitZoom());
    let dy = R((e.clientY - gesture.start.y) / unitZoom());
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
    const mx = R(snapped.x - abs.x);
    const my = R(snapped.y - abs.y);
    drawGuides(snapped.guides);
    for (const origin of gesture.origins) {
      const n = node(origin.id);
      if (!n) continue;
      const d = worldToParentDeltaInScene(project.scene, origin.id, mx, my);
      if (n.type === "Line" && origin.props) {
        n.props = offsetLineProps(origin.id, origin.props, R(d.x), R(d.y));
      } else {
        n.x = R(origin.x + d.x);
        n.y = R(origin.y + d.y);
      }
    }
    for (const origin of gesture.origins) {
      const entry = mounted.get(origin.id);
      const n = node(origin.id);
      if (entry && n && n.type !== "Line") Object.assign(entry.wrapper.style, { left: len(n.x ?? 0), top: len(n.y ?? 0) });
    }
    // 摊开时拖出这一页：拖着的东西露在页面外面（页面平时裁掉外面的部分），松手时放进落到的那一页
    if (spreadOut()) for (const origin of gesture.origins) boardEls.get(boardOf(origin.id))?.classList.add("vf-dragging-out");
    refreshLines();
    updateSelectionBox();
    return;
  }

  if (gesture.kind === "resize") {
    const n = node(gesture.id);
    if (!n) return;
    const dx = R((e.clientX - gesture.start.x) / unitZoom());
    const dy = R((e.clientY - gesture.start.y) / unitZoom());
    if (dx === 0 && dy === 0 && !gesture.moved) return;
    gesture.moved = true;
    const { abs, handle } = gesture;
    const isRoot = isBoardRoot(gesture.id);
    const rot = isRoot ? 0 : worldRotation(gesture.id);
    const keepAspect = e.shiftKey && handle.length === 2;
    let box = computeResizeBox(abs, handle, dx, dy, keepAspect, minSize(), rot, R);
    if (!isRoot && rot === 0 && !keepAspect) {
      const snapped = snapResize(box, handle, gesture.targets, options);
      box = snapped.rect;
      drawGuides(snapped.guides);
    }
    const nextW = R(Math.max(minSize(), box.width));
    const nextH = R(Math.max(minSize(), box.height));
    syncResizedNodeDimensions(n, nextW, nextH, minSize(), project.scene, gesture.id);
    if (n.type === "Dock") {
      const rootNode = node(project.scene.root);
      if (rootNode?.dockLayout) activeRuntime().setDockLayout(rootNode.dockLayout, project.scene.root);
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
    const dx = R((e.clientX - gesture.start.x) / unitZoom());
    const dy = R((e.clientY - gesture.start.y) / unitZoom());
    if (dx === 0 && dy === 0 && !gesture.moved) return;
    gesture.moved = true;
    const { origBox, handle } = gesture;
    // 多选整体缩放：四角拖拽默认保持长宽比（按比例缩放），按住 Shift 可自由变形
    const keepAspect = handle.length === 2 ? !e.shiftKey : false;
    let box = computeResizeBox(origBox, handle, dx, dy, keepAspect, minSize(), 0, R);
    if (!keepAspect) {
      const snapped = snapResize(box, handle, gesture.targets, options);
      box = snapped.rect;
      drawGuides(snapped.guides);
    }
    box = {
      x: R(box.x),
      y: R(box.y),
      width: R(Math.max(minSize(), box.width)),
      height: R(Math.max(minSize(), box.height)),
    };
    const scaledList = scaleGroupItems(gesture.items, origBox, box, minSize(), project.scene);
    let needReflow = false;
    for (const [id, scaled] of scaledList) {
      const eachNode = node(id);
      if (!eachNode) continue;
      if (eachNode.type === "Line" && scaled.props) {
        eachNode.props = scaled.props;
      } else {
        syncResizedNodeDimensions(eachNode, scaled.width, scaled.height, minSize(), project.scene, id);
        if (eachNode.type === "Dock") {
          const rootNode = node(project.scene.root);
          if (rootNode?.dockLayout) activeRuntime().setDockLayout(rootNode.dockLayout, project.scene.root);
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
              left: len(eachNode.x ?? 0),
              top: len(eachNode.y ?? 0),
              width: len(eachNode.width),
              height: len(eachNode.height),
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
    if (!gesture.moved && rect.width < feel(3) && rect.height < feel(3)) return;
    gesture.moved = true;
    Object.assign(marqueeBox.style, { display: "block", left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    // 框住的是起点所在的那一层里、未锁定且和方框（含旋转后精确有向矩形）有交叠的东西
    const hidden = hiddenPages(project.scene, shownPage);
    const pool = gesture.scope ? childrenOf(node(gesture.scope)) : pageIds(project.scene).flatMap((page) => childrenOf(node(page)));
    const hits = pool.filter((child) => {
      if (isNodeLocked(project.scene, child) || hidden.has(child)) return false;
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
    if (rect.width < feel(2) && rect.height < feel(2)) return;
    gesture.rect = rect;
    Object.assign(ghost.style, { display: "block", left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    if (gesture.preset) paintShapeGhost(rect.width, rect.height, presetProps(gesture.preset));
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

/**
 * 拖出一个形状时的预览。形状是按像素画的，编辑层里的坐标是画布单位：
 * 在预览框里放一个按像素大小画的内层，再缩回去，线宽才和画出来的一样。
 */
function paintShapeGhost(width: number, height: number, props: Record<string, Value>): void {
  const scale = unit().px;
  if (scale === 1) {
    paintShape(ghost, Math.max(1, width), Math.max(1, height), props);
    return;
  }
  const inner = document.createElement("div");
  Object.assign(inner.style, { position: "absolute", left: "0", top: "0", transformOrigin: "0 0", transform: `scale(${1 / scale})` });
  paintShape(inner, Math.max(1, width * scale), Math.max(1, height * scale), props);
  ghost.replaceChildren(inner);
}

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
    for (const el of boardEls.values()) el.classList.remove("vf-dragging-out");
    if (finished.moved) {
      if (finished.ids.length === 1) {
        tryDropFreeNodeIntoLayoutContainer(finished.ids[0], stagePoint(e));
      }
      if (spreadOut()) movePagesOnDrop(finished.ids);
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
    const dragged = finished.rect && finished.rect.width >= feel(4) && finished.rect.height >= feel(4) ? finished.rect : null;
    if (finished.nodeType) {
      // 只点了一下没有拖：按它的默认大小，以点击处为中心放一个
      const size = defaultSizeFor(project, finished.nodeType);
      const rect = dragged ?? { x: finished.start.x - size.width / 2, y: finished.start.y - size.height / 2, width: size.width, height: size.height };
      void createNode(finished.nodeType, finished.parentId, rect);
      return;
    }
    // 只点了一下没有拖：按预设的大小，以点击处为中心放一个
    const preset = finished.preset!;
    // 预设的大小是按像素定的，换成画布单位
    const presetW = R(feel(preset.width));
    const presetH = R(feel(preset.height));
    const rect = dragged ?? { x: finished.start.x - presetW / 2, y: finished.start.y - presetH / 2, width: presetW, height: presetH };
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
  if (id && node(id)?.type === "Part") void openPart(id, e.ctrlKey || e.metaKey);
  else if (id && isGraphic(id)) openTextEditor(id);
  else if (id && kind().has.richText && node(id)?.type === "Text") openRichTextEditor(id);
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
    // 文字区域是在设计窗口里按像素量的，编辑层里按画布单位摆
    const left = r.x + feel(box?.offsetLeft ?? 0);
    const top = r.y + feel(box?.offsetTop ?? 0);
    Object.assign(el.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${Math.max(feel(40), box ? feel(box.offsetWidth) : r.width)}px`,
      height: `${Math.max(feel(24), box ? feel(box.offsetHeight) : r.height)}px`,
      textAlign: str(props.textAlign, "center"),
      fontSize: `${feel(num(props.fontSize, 14))}px`,
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

// ---- 文本框：在画布上直接改字 ----

let richEditor: { id: string; box: HTMLElement; original: string; cleanup: () => void } | null = null;

/**
 * 双击文本框：让它的内容在设计窗口里直接可编辑。编辑期间编辑层不拦鼠标，点击落到文字上放光标；
 * 点到文本框外面、按 Ctrl+Enter 都算改完，Esc 放弃。
 */
function openRichTextEditor(id: string): void {
  const n = node(id);
  const entry = mounted.get(id);
  if (!n || !entry || mode !== "edit" || isNodeLocked(project.scene, id)) return;
  const box = entry.body.querySelector<HTMLElement>(".vf-text");
  if (!box) return;
  if (richEditor) commitRichTextEditor();
  if (textEditor) commitTextEditor();
  select(id);
  const original = str(n.props?.html, "");
  box.contentEditable = "true";
  box.spellcheck = false;
  overlay.classList.add("text-editing");
  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      commitRichTextEditor(true);
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commitRichTextEditor();
    }
  };
  // 粘贴只收纯文字：从别处带来的字体、颜色不进文件，样子由样式类决定
  const onPaste = (e: ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData?.getData("text/plain") ?? "";
    box.ownerDocument.execCommand("insertText", false, text);
  };
  const onBlur = () => commitRichTextEditor();
  box.addEventListener("keydown", onKey);
  box.addEventListener("paste", onPaste);
  box.addEventListener("blur", onBlur);
  richEditor = {
    id,
    box,
    original,
    cleanup: () => {
      box.removeEventListener("keydown", onKey);
      box.removeEventListener("paste", onPaste);
      box.removeEventListener("blur", onBlur);
      box.removeAttribute("contenteditable");
      box.removeAttribute("spellcheck");
      overlay.classList.remove("text-editing");
    },
  };
  box.focus();
  // 整段选中，直接打字就是替换；想改其中几个字就再点一下
  const selection = box.ownerDocument.getSelection();
  if (selection) {
    const range = box.ownerDocument.createRange();
    range.selectNodeContents(box);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

function commitRichTextEditor(cancel = false): void {
  const editor = richEditor;
  if (!editor) return;
  richEditor = null;
  const html = serializeEdited(editor.box);
  editor.cleanup();
  const n = node(editor.id);
  if (!n) return;
  if (cancel || html === editor.original) {
    editor.box.innerHTML = editor.original;
    return;
  }
  n.props = { ...n.props, html };
  void saveScene({ label: "修改文字" });
}

// ---- 翻页条：一次只看一个画板的设计类型（平面设计）用 ----

function boardStorageKey(): string {
  return `vf.board:${project.root}`;
}

function rememberBoard(): void {
  try {
    if (currentBoardId) localStorage.setItem(boardStorageKey(), currentBoardId);
  } catch {
    // 存不下只是下次打开回到第一页
  }
}

function restoreBoard(): void {
  try {
    const saved = localStorage.getItem(boardStorageKey());
    if (saved && node(saved)) currentBoardId = saved;
  } catch {
    // 读不到就从第一页开始
  }
}

/** 翻到某一页。摊开时不用翻：在看这一页，视角挪过去装下它。 */
function showBoard(id: string): void {
  if (spreadOut()) {
    if (!node(id)) return;
    focusBoard(id);
    if (selectedId && boardOf(selectedId) !== id) select(null);
    zoomToRect(stageRectToPx(absRect(id)));
    return;
  }
  if (!node(id) || id === stageRootId()) return;
  if (richEditor) commitRichTextEditor();
  if (textEditor) commitTextEditor();
  currentBoardId = id;
  rememberBoard();
  // 选中的东西留在上一页，带不过来
  selectedId = null;
  selectedIds = [];
  renderAll();
}

async function addPageAfterCurrent(): Promise<void> {
  const after = stageRootId();
  const id = newId("Page", "page");
  addPage(project.scene, id, node(after)?.type === "Page" ? after : null);
  currentBoardId = id;
  rememberBoard();
  selectedId = null;
  selectedIds = [];
  await saveScene({ label: "添加页面" });
}

async function removeCurrentPage(): Promise<void> {
  const id = stageRootId();
  const boards = pageIds(project.scene);
  if (boards.length <= 1) return toast("只剩一页，不能删除");
  const count = subtreeIds(project.scene, id).size - 1;
  if (count > 0 && !window.confirm(`删除${pageLabel(project.scene, id)}和它里面的 ${count} 个控件？可以用撤销恢复。`)) return;
  const at = boards.indexOf(id);
  if (!removePage(project.scene, id)) return;
  currentBoardId = pageIds(project.scene)[Math.max(0, at - 1)] ?? null;
  rememberBoard();
  selectedId = null;
  selectedIds = [];
  await saveScene({ label: "删除页面" });
}

async function moveCurrentPage(delta: number): Promise<void> {
  if (!movePage(project.scene, stageRootId(), delta)) return;
  await saveScene({ label: "调整页序" });
}

function renderBoardBar(): void {
  const bar = document.getElementById("board-bar");
  if (!bar) return;
  if (mode === "preview") {
    bar.hidden = false;
    renderPreviewBar(bar);
    return;
  }
  const boards = kind().board.arrange === "spread" ? allWindowIds(project.scene) : [];
  bar.hidden = boards.length === 0;
  if (bar.hidden) {
    bar.replaceChildren();
    return;
  }
  const current = stageRootId();
  const at = boards.indexOf(current);
  const button = (text: string, title: string, enabled: boolean, onClick: () => void, action: string) => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "tool";
    el.textContent = text;
    el.title = title;
    el.disabled = !enabled;
    el.dataset.board = action;
    el.addEventListener("click", onClick);
    return el;
  };
  const select = document.createElement("select");
  select.className = "tool-select";
  select.title = `切换${kind().board.noun}`;
  select.dataset.board = "select";
  for (const id of boards) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = boardTitle(id);
    option.selected = id === current;
    select.append(option);
  }
  select.addEventListener("change", () => showBoard(select.value));
  const editing = mode === "edit";
  // 摊开时全部页面都在画布上，不用一页页翻：下拉框是“跳到哪一页”，PageUp / PageDown 也是跳
  if (spreadOut()) select.title = "跳到哪一页（PageUp / PageDown）";
  bar.replaceChildren(
    ...(spreadOut() ? [] : [button("◀", `上一${kind().board.noun === "页面" ? "页" : "个"}（PageUp）`, at > 0, () => showBoard(boards[at - 1]), "prev")]),
    select,
    ...(spreadOut() ? [] : [button("▶", `下一${kind().board.noun === "页面" ? "页" : "个"}（PageDown）`, at >= 0 && at < boards.length - 1, () => showBoard(boards[at + 1]), "next")]),
    button("＋", "在这一页后面加一页（尺寸和版心照这一页）", editing, () => void addPageAfterCurrent(), "add"),
    button("⋯", "这一页的其他操作", editing, () => {
      const rect = bar.getBoundingClientRect();
      // 做不了的操作不列出来：第一页不能往前挪，只剩一页不能删
      const items: MenuItem[] = [
        { label: "页面设置…", action: openPageSettings },
        { label: "复制引用", action: () => void copyReference(controlReference(project, stageRootId())) },
      ];
      const moves: MenuItem[] = [];
      if (at > 0) moves.push({ label: "往前挪一页", action: () => void moveCurrentPage(-1) });
      if (at >= 0 && at < boards.length - 1) moves.push({ label: "往后挪一页", action: () => void moveCurrentPage(1) });
      if (moves.length > 0) items.push("separator", ...moves);
      if (boards.length > 1) items.push("separator", { label: "删除这一页", action: () => void removeCurrentPage() });
      openMenu(rect.left, rect.bottom + 4, items);
    }, "more"),
  );
}

/** 页面设置在右侧“属性”页签里：什么都不选时，属性页签显示的就是当前页面。 */
function openPageSettings(): void {
  select(null);
  showRightTab("props");
}

// 独立预览窗口套着外框时，放设计窗口的地方大小变了（窗口变了、打开事件记录、收起工具条）就重新缩放到装下整个设备
let standaloneRefit = 0;
if (isStandalonePreview()) {
  new ResizeObserver(() => {
    if (!project || mode !== "preview" || !document.body.classList.contains("standalone-device")) return;
    cancelAnimationFrame(standaloneRefit);
    standaloneRefit = requestAnimationFrame(() => zoomToFit());
  }).observe($("stage-scroll"));
}

// PageUp / PageDown 翻页
document.addEventListener("keydown", (e) => {
  if (!project) return;
  const target = e.target as HTMLElement | null;
  if (target && (target.matches("input, textarea, select") || target.isContentEditable)) return;
  // 预览时：← → 和 PageUp / PageDown 翻一屏（按键落在设计窗口里时是给软件自己的，到不了这里）
  if (mode === "preview") {
    const delta = e.key === "PageDown" || e.key === "ArrowRight" ? 1 : e.key === "PageUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (delta !== 0 && previewViews(previewDevice()).length > 1) {
      e.preventDefault();
      flipPreview(delta);
    }
    return;
  }
  if (kind().board.arrange !== "spread" || (e.key !== "PageUp" && e.key !== "PageDown")) return;
  const boards = allWindowIds(project.scene);
  const next = boards[boards.indexOf(stageRootId()) + (e.key === "PageDown" ? 1 : -1)];
  if (next) {
    e.preventDefault();
    showBoard(next);
  }
});

/** 项目里可以当素材用的文件（图片），给属性页签的路径输入框做候选。 */
async function listProjectAssets(): Promise<string[]> {
  const found: string[] = [];
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > 4 || found.length > 2000) return;
    for (const entry of await listDir(dir)) {
      const path = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDir) {
        if (!entry.name.startsWith(".") && entry.name !== "node_modules") await walk(path, depth + 1);
      } else if (/\.(png|jpe?g|webp|gif|svg|avif)$/i.test(entry.name)) {
        found.push(path);
      }
    }
  };
  await walk("assets", 0);
  return found.sort();
}

/** 编辑器外框上随设计类型变的东西：素材栏的分区、导出按钮的名字。 */
function syncKindChrome(): void {
  const k = kind();
  document.body.dataset.kind = k.id;
  const toggle = (id: string, shown: boolean) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.hidden = !shown;
    const heading = el.previousElementSibling;
    if (heading instanceof HTMLElement && heading.tagName === "H3") heading.hidden = !shown;
  };
  toggle("palette-shapes", k.palette.shapes);
  toggle("palette-flow", k.palette.flow);
  toggle("palette-lines", linesAvailable(k, unit()));
  const exportBtn = document.getElementById("export-qt-btn");
  if (exportBtn) {
    const web = !k.exports.includes("qt") && k.exports.includes("web");
    exportBtn.textContent = web ? "导出" : "导出成 Qt";
    exportBtn.title = web ? "把这份设计导出成网页、PDF 或图片" : "将当前设计项目导出成 Qt 工程";
    exportBtn.hidden = k.exports.length === 0;
  }
  syncRightTabs();
}

// ---- 键盘 ----

/** 工具的快捷键，和 Figma / FigJam 相同。 */
const TOOL_KEYS: Record<string, string> = { r: "rectangle", o: "ellipse", l: "line", x: "elbowConnector", t: "text" };

/** 这个预设在当前的设计类型和单位下能不能用：线条目前只在像素画布上有。 */
function toolPresetAvailable(presetId: string): boolean {
  const preset = presetById(presetId);
  if (!preset) return false;
  if (preset.type === "Line") return linesAvailable(kind(), unit());
  return kind().palette.shapes;
}

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
    setSelection(childrenOf(node(stageRootId())).filter((id) => !isNodeLocked(project.scene, id)));
    return;
  }
  if (ctrl && e.key === "Enter") {
    e.preventDefault();
    if (selectedId) void quickCreate(selectedId);
    return;
  }
  if (!ctrl && !e.altKey) {
    if (key === "v") return setTool({ kind: "select" });
    if (key === "l" && e.shiftKey && linesAvailable(kind(), unit())) return setTool({ kind: "preset", preset: presetById("arrow")! });
    if (TOOL_KEYS[key] && !e.shiftKey && toolPresetAvailable(TOOL_KEYS[key])) return setTool({ kind: "preset", preset: presetById(TOOL_KEYS[key])! });
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
    if (e.key === "Enter" && selectedId && kind().has.richText && node(selectedId)?.type === "Text") {
      e.preventDefault();
      openRichTextEditor(selectedId);
      return;
    }
  }

  const ids = topSelection();
  if (ids.length === 0) return;
  const step = unit().nudge[e.shiftKey ? 1 : 0];
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
        n.props = offsetLineProps(id, n.props ?? {}, R(d.x), R(d.y));
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
    { width: R(Math.max(feel(1), rect.width)), height: R(Math.max(feel(1), rect.height)) },
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
  const origin = absRect(parentId);
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
  // 快速新建会画一条连接线，线条只在有线条的设计类型里有
  if (!linesAvailable(kind(), unit())) return;
  if (isNodeLocked(project.scene, id)) return toast("控件已锁定");
  const n = node(id);
  const parentId = parentOf(id);
  if (!n || n.type !== "Shape" || !parentId || isNodeLocked(project.scene, parentId)) return;
  const GAP = R(feel(80));
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
  /** 复制时每个最外层的东西所在那一页在画布上的左上角（平面设计）：粘到哪一页都按在页面里的位置放 */
  boardOrigins?: Record<string, { x: number; y: number }>;
}

/** 本窗口里最近一次复制的内容。系统剪贴板读不到时（例如右键菜单里点“粘贴”）用它。 */
let clipMemory: Clip | null = null;
/** 同一份内容连续粘贴的次数：每次往右下错开一点，免得叠在一起看不出来 */
let pasteCount = 0;
/** 粘贴和复制一份时往右下错开多少。按屏幕像素定，用的时候经 pasteOffset() 换成画布单位。 */
const PASTE_OFFSET = 16;
function pasteOffset(): number {
  return R(feel(PASTE_OFFSET));
}

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
  const boardOrigins =
    kind().board.arrange === "spread" ? Object.fromEntries(roots.map((id) => [id, { x: absRect(boardOf(id)).x, y: absRect(boardOf(id)).y }])) : undefined;
  return { kind: "vibefrontend/nodes", version: 1, roots, nodes, ...(boardOrigins ? { boardOrigins } : {}) };
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
    while (parentId !== stageRootId() && isNodeLocked(project.scene, parentId)) {
      parentId = parentOf(parentId) ?? stageRootId();
      index = undefined;
    }
    const parent = node(parentId) ?? node(stageRootId())!;
    const origin = absRect(parentId);
    // 包里存的是复制时的画布坐标：换算到要放进的那一页，在页面里的位置和原来一样
    const from = clip.boardOrigins?.[root];
    const targetBoard = kind().board.arrange === "spread" ? boardOf(parentId) : null;
    const shift = from && targetBoard ? { x: absRect(targetBoard).x - from.x, y: absRect(targetBoard).y - from.y } : { x: 0, y: 0 };
    const copy = node(fresh)!;
    const isDockInPartition = copy.type === "Dock" && parentId === project.scene.root && isPartitionedWindow(parent);
    if (copy.type === "Line") copy.props = shiftLineAll(copy.props ?? {}, offset + shift.x - origin.x, offset + shift.y - origin.y);
    else if (layoutOf(parent) !== null || isDockInPartition) {
      delete copy.x;
      delete copy.y;
    } else {
      copy.x = (copy.x ?? 0) + offset + shift.x - origin.x;
      copy.y = (copy.y ?? 0) + offset + shift.y - origin.y;
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
    const parentId = parentOf(rootId) ?? stageRootId();
    const siblings = childrenOf(node(parentId));
    return { parentId, index: siblings.indexOf(rootId) + 1 };
  }, pasteOffset());
  selectedIds = placed;
  selectedId = placed[placed.length - 1] ?? null;
  await saveScene();
}

async function duplicateNode(id: string): Promise<void> {
  await duplicateNodes([id]);
}

/** 粘贴到哪里：选中的是能装东西且未锁定的节点，就放进它里面；否则往外找未锁定的父容器；什么都没选就放进窗口。 */
function pasteParent(): string {
  if (!selectedId) return stageRootId();
  if (selectedIds.length === 1 && canHoldChildren(selectedId) && !isNodeLocked(project.scene, selectedId)) {
    return selectedId;
  }
  for (let p = parentOf(selectedId); p; p = parentOf(p)) {
    if (canHoldChildren(p) && !isNodeLocked(project.scene, p)) return p;
  }
  return stageRootId();
}

async function pasteNodes(clip: Clip): Promise<void> {
  pasteCount++;
  const parentId = pasteParent();
  const placed = pasteClip(clip, () => ({ parentId }), pasteOffset() * pasteCount);
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
  const candidates = ids.filter((id) => !isBoardRoot(id));
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
    (id) => !isBoardRoot(id) && !!node(id),
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
  // 新的说明小节写进控件所在画板的说明文档
  const path = docOfBoard(boardOfNode(project.scene, id));
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

function selectionReference(): string {
  return controlsReference(project, selectedIds);
}

function showMenu(x: number, y: number, id: string): void {
  // 多选时的菜单：只放对整组都有意义的操作
  if (selectedIds.length > 1 && selectedIds.includes(id)) {
    const ids = topSelection();
    const anyUnlocked = ids.some((each) => !isNodeLocked(project.scene, each));
    const alignableCount = alignableSelection().length;
    const items: MenuItem[] = [
      { label: `复制 ${selectedIds.length} 条引用`, action: () => void copyReference(selectionReference()) },
      { label: "缩放到所选（Shift+2）", action: zoomToSelection },
      "separator",
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
    if (canCarvePart(ids)) items.push("separator", { label: `把这 ${ids.length} 个拆成子项目……`, action: () => void carvePart(ids) });
    items.push(
      "separator",
      { label: "复制一份（Ctrl+D）", action: () => void duplicateNodes(ids) },
      { label: `删除这 ${ids.length} 个`, action: () => void deleteNodes(ids) },
    );
    openMenu(x, y, items);
    return;
  }
  const items: MenuItem[] = [{ label: "复制引用", action: () => void copyReference(controlReference(project, id)) }];
  if (!isBoardRoot(id)) {
    const locked = isNodeLocked(project.scene, id);
    items.push(
      { label: "缩放到所选（Shift+2）", action: zoomToSelection },
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
    } else if (node(id)?.type === "Part") {
      items.push(
        { label: "打开子项目（双击）", action: () => void openPart(id, false) },
        { label: "在新标签页打开子项目", action: () => void openPart(id, true) },
      );
    } else if (node(id)?.type !== "Container") {
      items.push({ label: "还原为容器", action: () => void revertToContainer(id) });
    }
    if (canCarvePart([id])) items.push({ label: "拆成子项目……", action: () => void carvePart([id]) });
    if (node(id)?.type === "Shape" && linesAvailable(kind(), unit())) items.push({ label: "快速新建并连线（Ctrl+Enter）", action: () => void quickCreate(id) });
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
  const activeGrid = unit().grids.includes(snapSettings.grid) ? snapSettings.grid : 0;
  for (const value of unit().grids) {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = value === 0 ? "网格：关" : unit().css === "px" ? `网格 ${value}` : `网格 ${value} ${unit().css}`;
    option.selected = activeGrid === value;
    grid.append(option);
  }
  grid.addEventListener("change", () => {
    snapSettings.grid = Number(grid.value);
    saveSetting("vf.snap", snapSettings);
    $("stage").style.setProperty("--grid", snapSettings.grid ? len(snapSettings.grid) : "0");
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
  const lockIds = tops.length > 0 ? tops : selectedId && !isBoardRoot(selectedId) ? [selectedId] : [];
  const allLocked = lockIds.length > 0 && lockIds.every((id) => isNodeLocked(project.scene, id));
  const lockBtn = toolButton(allLocked ? "🔒" : "🔓", `${allLocked ? "解锁" : "锁定"}选中控件（Ctrl+L）`, allLocked, () => void toggleLock());
  lockBtn.dataset.action = "lock";
  lockBtn.disabled = lockIds.length === 0;

  const singleRotatableId =
    selectedIds.length === 1 && selectedId && !isBoardRoot(selectedId) && node(selectedId)?.type !== "Line"
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
  fitToolbar();
  $("stage").style.setProperty("--grid", activeGrid ? len(activeGrid) : "0");
  $("stage").classList.toggle("show-grid", activeGrid > 0);
}

/** 工具栏夹在模式选择和缩放中间，比这还窄就不如换到第二行。 */
const MIN_TOOLBAR_WIDTH = 150;

const fitToolbar = overflowBar($("tool-bar"), {
  limit: () => {
    const bar = $("center-bar");
    const style = getComputedStyle(bar);
    const inner = bar.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const left = $("bar-left").offsetWidth;
    const right = $("zoom-bar").offsetWidth;
    const gaps = 2 * parseFloat(style.columnGap);
    // 两边按较宽的一侧留出一样的空间，工具栏才在正中；放不下才退一步，用两边之间实际的空隙
    const centered = inner - 2 * Math.max(left, right) - gaps;
    const between = inner - left - right - gaps;
    const narrow = between < MIN_TOOLBAR_WIDTH;
    bar.classList.toggle("narrow", narrow);
    if (narrow) return inner;
    return centered >= MIN_TOOLBAR_WIDTH ? centered : between;
  },
  watch: $("center-bar"),
});

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
  // 样式条在设计窗口的外框里，按像素摆；选中框是画布单位，换成像素
  // 画布坐标 → 设计窗口里的位置（摊开时画布从 world 的左上角开始）
  const world = stageWorld();
  const ry = toPx(unit(), r.y - world.y);
  let top = stage.offsetTop + ry - barHeight - gap;
  if (top < 0) top = stage.offsetTop + ry + toPx(unit(), r.height) + gap;
  shapeBar.style.top = `${top}px`;
  shapeBar.style.left = `${Math.max(0, stage.offsetLeft + toPx(unit(), r.x - world.x))}px`;
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
    await writeText(presetsPath(project.partOf), nextText);
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
    const { x: px, y: py } = clientToStage(e.clientX, e.clientY);
    const pw = R(feel(preset.width));
    const ph = R(feel(preset.height));
    void createFromPreset(preset, { x: px - pw / 2, y: py - (preset.type === "Line" ? 0 : ph / 2), width: pw, height: ph }, containerAt(px, py));
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
  // 基础素材里列哪些，由设计类型决定（kinds.ts 的 paletteBasics）
  const BASICS: Record<string, [string, string]> = {
    Container: ["□ 容器", "拖进设计窗口，再交给 Agent 做成具体控件"],
    Group: ["▣ 组", "把几样东西归在一起，一起移动；可以带样式类"],
    External: ["⧉ 外部容器", EXTERNAL_DECL.description ?? ""],
    VBox: ["▤ 竖排布局", "子控件从上往下排列"],
    HBox: ["▥ 横排布局", "子控件从左往右排列"],
    Flow: ["⇶ 换行布局", "子控件从左往右排列，放不下时自动换到下一行"],
    Grid: ["⊞ 网格布局", "子控件按行列网格排列"],
    Form: ["☰ 表单布局", "左列标签、右列控件的表单排列"],
    Stack: ["❐ 层叠布局", "多个页面叠放，按 currentIndex 切换"],
    Dock: ["◧ 停靠面板", "停靠在主窗口四侧的面板"],
    Dialog: ["🗔 对话框", "弹出窗口或模态对话框"],
  };
  $("palette-basic").replaceChildren(
    ...kind().paletteBasics.filter((type) => BASICS[type]).map((type) => make(type, BASICS[type][0], BASICS[type][1])),
  );
  const stdItems = [...standardComponents().values()].map((component) =>
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
  // 拖着走的虚框按屏幕像素画，默认尺寸是画布单位
  const natural = defaultSizeFor(project, type);
  const size = { width: toPx(unit(), natural.width), height: toPx(unit(), natural.height) };
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
      if (inside) {
        const pt = clientToStage(e.clientX, e.clientY);
        previewPaletteDropOnStage(type, pt.x, pt.y);
      }
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
    if (inside) {
      const pt = clientToStage(e.clientX, e.clientY);
      void addNode(type, pt.x, pt.y);
    }
  };
  document.addEventListener("pointermove", place);
  document.addEventListener("pointerup", up);
}

/** 图层里折叠起来的节点。 */
const collapsedLayers = new Set<string>();

function renderLayers(): void {
  const rows: HTMLElement[] = [];
  const visit = (id: string, depth: number) => {
    const n = node(id);
    if (!n) return;
    const locked = isNodeLocked(project.scene, id);
    const row = document.createElement("div");
    row.className = "layer" + (id === selectedId || selectedIds.includes(id) ? " selected" : "") + (locked ? " locked" : "") + (id === hoveredId ? " hovered" : "");
    row.dataset.id = id;
    row.style.paddingLeft = `${6 + depth * 14}px`;
    const children = childrenOf(n);
    const collapsed = collapsedLayers.has(id);
    const caret = document.createElement("button");
    caret.type = "button";
    caret.className = "layer-caret";
    caret.disabled = children.length === 0;
    if (children.length > 0) {
      caret.textContent = collapsed ? "▸" : "▾";
      caret.title = collapsed ? "展开" : "折叠";
      caret.addEventListener("click", (e) => {
        e.stopPropagation();
        if (collapsed) collapsedLayers.delete(id);
        else collapsedLayers.add(id);
        renderLayers();
      });
    }
    row.append(caret);
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
    if (!isBoardRoot(id)) {
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
    row.addEventListener("click", (e) => {
      select(id, e.shiftKey || e.ctrlKey || e.metaKey);
      panToSelection();
    });
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (!selectedIds.includes(id)) select(id);
      showMenu(e.clientX, e.clientY, id);
    });
    row.addEventListener("mouseenter", () => setHover(id));
    row.addEventListener("mouseleave", () => setHover(null));
    rows.push(row);
    // 列表里越靠上的在画面里越靠前
    if (!collapsed) for (const child of [...children].reverse()) visit(child, depth + 1);
  };
  for (const winId of allWindowIds(project.scene)) visit(winId, 0);
  $("layers").replaceChildren(...rows);
}

/** 让选中的控件看得见：切到它所在的层叠页，展开图层里它的上级。 */
function revealSelection(): void {
  if (!selectedId) return;
  for (const { stack, page } of pagesToReveal(project.scene, selectedId)) revealedPages.set(stack, page);
  for (let parent = parentOf(selectedId); parent; parent = parentOf(parent)) collapsedLayers.delete(parent);
}

// 全部折叠：页面（窗口）也收起来，一个页面只剩一行。以前页面不收、还把选中的东西所在的那一层展开，
// 平面设计里东西大多直接放在页面上，点了看不出任何变化。之后再选中别的东西时，它所在的那一层照旧自动展开
$("layers-collapse").addEventListener("click", () => {
  for (const id of Object.keys(project.scene.nodes)) {
    if (childrenOf(node(id)).length > 0) collapsedLayers.add(id);
  }
  renderLayers();
});

$("layers-expand").addEventListener("click", () => {
  collapsedLayers.clear();
  renderLayers();
});




function syncSelection(): void {
  if (selectedId && !node(selectedId)) selectedId = null;
  selectedIds = selectedIds.filter((id) => node(id) && !isBoardRoot(id));
  if (!selectedId || isBoardRoot(selectedId)) {
    selectedIds = [];
    if (isBoardRoot(selectedId)) return;
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

/** 选中的东西在别的页上：翻到那一页。返回有没有翻页。 */
function followSelectionToBoard(): boolean {
  if (kind().board.arrange !== "spread" || !selectedId) return false;
  const board = boardOfNode(project.scene, selectedId);
  if (!board) return false;
  // 预览套着设备外框时：已经在这一屏上就只换“在看”的页，不在就翻到它那一屏
  if (mode === "preview" && previewDevice() !== "plain") {
    const views = previewViews(previewDevice());
    const here = views[previewIndex];
    currentBoardId = board;
    if (here && (here.board === board || here.left?.board === board || here.right?.board === board)) return false;
    const index = views.findIndex((v) => v.board === board || v.left?.board === board || v.right?.board === board);
    if (index < 0) return false;
    previewIndex = index;
    return true;
  }
  if (board === stageRootId()) return false;
  // 摊开时全部页面都在画布上，不用翻页重画：只换“在看”的页
  if (spreadOut()) {
    focusBoard(board);
    return false;
  }
  currentBoardId = board;
  rememberBoard();
  return true;
}

function afterSelectionChange(): void {
  revealSelection();
  if (followSelectionToBoard()) {
    renderStage();
    renderBoardBar();
  }
  applyViews();
  renderLayers();
  if (selectedId) layerRow(selectedId)?.scrollIntoView({ block: "nearest" });
  renderToolbar();
  renderRight();
  renderShapeBar();
  updateSelectionBox();
  if (selectedId) scrollYamlTo(`  ${selectedId}:`);
}

/** 选中一个。additive 为真（按住 Shift 点）时，加进选择；已经选中的就去掉。 */
function select(id: string | null, additive = false): void {
  void flushEditors();
  if (additive && id && !isBoardRoot(id)) {
    selectedIds = selectedIds.includes(id) ? selectedIds.filter((each) => each !== id) : [...selectedIds, id];
    selectedId = selectedIds[selectedIds.length - 1] ?? null;
  } else {
    if (id === selectedId && selectedIds.length <= 1) return;
    selectedId = id;
    selectedIds = id && !isBoardRoot(id) ? [id] : [];
  }
  afterSelectionChange();
}

function setSelection(ids: string[]): void {
  void flushEditors();
  selectedIds = ids.filter((id) => node(id) && !isBoardRoot(id));
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

/** 页签都建好之后才有，放不下时收进“…”。 */
let fitRightTabs: (() => void) | null = null;

/** 右侧全部页签的代号。每类设计用其中的几个，见 kinds.ts 的 tabs。 */
const RIGHT_TABS = ["props", "layout", "menu", "state", "doc", "yaml", "events"] as const;

function showRightTab(tab: string): void {
  const allowed: readonly string[] = kind().tabs;
  // 要切到的页签这类设计没有，就留在第一个有的页签上
  const target = allowed.includes(tab) ? tab : (allowed[0] ?? "doc");
  for (const id of RIGHT_TABS) {
    const t = document.getElementById(`tab-${id}`);
    const p = document.getElementById(`pane-${id}`);
    const shown = allowed.includes(id);
    if (t) {
      t.hidden = !shown;
      t.setAttribute("aria-selected", String(target === id));
    }
    if (p) p.hidden = target !== id;
  }
  fitRightTabs?.();
  if (target === "yaml" && selectedId) scrollYamlTo(`  ${selectedId}:`);
}

/** 现在开着的是右侧哪个页签。 */
function currentRightTab(): string {
  for (const id of RIGHT_TABS) {
    if (document.getElementById(`tab-${id}`)?.getAttribute("aria-selected") === "true") return id;
  }
  return "doc";
}

/** 按设计类型摆好页签的顺序和显隐。项目的设计类型变了（改了 project.json）也调用它。 */
function syncRightTabs(): void {
  const tabs = document.querySelector<HTMLElement>("#right .tabs");
  if (!tabs) return;
  const anchor = tabs.querySelector(".overflow-more");
  for (const id of kind().tabs) {
    const t = document.getElementById(`tab-${id}`);
    if (!t) continue;
    if (anchor) anchor.before(t);
    else tabs.append(t);
  }
  showRightTab(currentRightTab());
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
      target: { path: docOfBoard(stageRootId()), section: null },
      text: project.docs.get(docOfBoard(stageRootId())) ?? "",
      note: () => noteWithButton($("doc-note"), `整份页面文档 ${docOfBoard(stageRootId())}`),
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
  renderPropsPane();
  renderLayoutEditPane();
  renderMenuEditPane();
  renderStateEditPane();
  renderEventPane();
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
  void copyReference(selectedIds.length > 0 ? selectionReference() : selectedId ? controlReference(project, selectedId) : projectReference(project));
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

/** 切到问题或事件记录（它们是两个停靠面板，默认叠在一起）；用户关掉了的不去打开 */
function showBottomTab(tab: "problems" | "log"): void {
  const id = tab === "problems" ? "panel-problems" : "panel-log";
  if (workspace?.isOpen(id)) workspace.focus(id);
}

function renderProblems(): void {
  const errors = project.problems.filter((p) => p.level === "error").length;
  const hints = project.problems.length - errors;
  workspace?.setTitle("panel-problems", errors + hints === 0 ? "问题" : `问题（${errors} 个错误，${hints} 个提示）`);
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
  workspace?.setTitle("panel-log", log.length === 0 ? "事件记录" : `事件记录（${log.length}）`);
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
      refreshEventPane();
    },
    onLog: (entry) => {
      log.push(entry);
      if (log.length > 300) log.shift();
      renderLog();
    },
  });
  previewRuntime.start();
  syncResetButton();
}

function syncResetButton(): void {
  $("reset-state").hidden = mode === "preview" || !previewRuntime;
  fitToolbar();
}

/** 回到初始状态：丢掉预览留下的运行状态。下次进预览或触发事件时再从头开始。 */
function resetLiveState(): void {
  stopPreviewClockTimer();
  previewRuntime = null;
  log.length = 0;
  revealedPages.clear();
  renderLog();
  renderStage();
  renderConditions();
  renderEventPane();
  syncResetButton();
}

/** 在编辑模式里触发控件的事件：作用在画布显示的状态上，还没有运行状态时先从初始状态开一份。 */
function fireEvent(id: string, event: string, value?: Value): void {
  const fresh = !previewRuntime;
  if (fresh) startPreviewRuntime();
  const runtime = previewRuntime!;
  const pageOf = (stack: string) => activePage(childrenOf(node(stack)), runtime.view(stack).props);
  const before = [...revealedPages.keys()].map((stack) => [stack, pageOf(stack)] as const);
  runtime.dispatch(id, event, value);
  // 事件真的换了页，就听状态的，不再停在之前看的那一页
  for (const [stack, page] of before) if (pageOf(stack) !== page) revealedPages.delete(stack);
  if (fresh) renderStage();
  applyViews();
  updateSelectionBox();
  renderEventPane();
  showBottomTab("log");
}

/** 进预览前编辑的视角 */
let editView: { zoom: number; left: number; top: number } | null = null;

function setMode(next: "edit" | "preview"): void {
  if (next === mode) return;
  flushEditors();
  hideMenu();
  if (textEditor) commitTextEditor();
  if (tool.kind !== "select") {
    tool = { kind: "select" };
    overlay.classList.remove("drawing");
  }
  // 编辑的视角记下来，切回编辑时原样回来；预览从“在看”的页面所在的那一屏开始
  if (next === "preview") {
    editView = viewState();
    previewIndex = previewIndexForFocus(previewDevice());
    fittedDevice = "";
    // 每次进预览，电脑里的窗口先按设计的尺寸摆（上次拖过的大小不留着）
    desktopState.frame = null;
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
    // 预览里切到哪一页，回到编辑就看哪一页
    revealedPages.clear();
  }
  renderToolbar();
  renderStage();
  renderBoardBar();
  renderShapeBar();
  renderConditions();
  renderEventPane();
  syncResetButton();
  if (mode === "edit" && editView) {
    const saved = editView;
    editView = null;
    requestAnimationFrame(() => restoreViewState(saved));
  }
  if (mode === "edit" && selectedId && isOnHiddenPage(selectedId)) select(null);
}

$("mode-edit").addEventListener("click", () => setMode("edit"));
$("mode-preview").addEventListener("click", () => setMode("preview"));
$("reset-state").addEventListener("click", resetLiveState);
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
  renderProjectName();
  $("project-root").textContent = project.partOf?.part ? `${project.root} ▸ ${project.partOf.part}` : project.root;
  projectPanel?.refresh();
  syncKindChrome();
  renderBoardBar();
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
  // 按钮在顶栏只有一个，导出成什么由设计类型决定：界面设计导出成 Qt，平面设计导出成网页、PDF 和图片
  if (kind().exports.includes("qt")) void openExportQtModal();
  else openGraphicExportModal({ getProject: () => project, flush: flushEditors, toast });
});

// ---------- 工作区：停靠面板、菜单、命令 ----------

let workspace: Workspace | null = null;
let projectPanel: { refresh(): void } | null = null;

// ---------- 子项目 ----------

/** 顶栏的项目名：在子项目里时是“总项目 › 子项目”，点总项目的名字回去 */
function renderProjectName(): void {
  const host = $("project-name");
  if (!project.partOf) {
    host.textContent = project.name;
    host.title = "";
    return;
  }
  const back = document.createElement("button");
  back.type = "button";
  back.className = "project-crumb";
  back.textContent = project.partOf.name;
  back.title = "回到总项目";
  back.addEventListener("click", () => void leaveTo(projectPageUrl(currentRootId(), null), false));
  const sep = document.createElement("span");
  sep.className = "project-crumb-sep";
  sep.textContent = "›";
  const here = document.createElement("span");
  here.textContent = project.name;
  host.replaceChildren(back, sep, here);
  host.title = "正在编辑子项目：改完总项目里的这一块跟着变";
}

/** 离开这个页面去另一个项目或子项目：先把没存的存上 */
async function leaveTo(url: string, newTab: boolean): Promise<void> {
  if (newTab) {
    window.open(url, "_blank", "noopener");
    return;
  }
  if (!(await flushEditors())) {
    toast("有内容还没存上，先没有离开");
    return;
  }
  await writesSettled();
  location.assign(url);
}

async function openPart(id: string, newTab: boolean): Promise<void> {
  const ref = partRefOf(node(id));
  if (!ref) return toast(`子项目 ${id} 没写是哪个子项目`);
  if (!project.parts?.get(ref.part)?.scene) return toast(`找不到子项目 ${ref.part}`);
  await leaveTo(projectPageUrl(currentRootId(), ref.part), newTab);
}

/**
 * 平面设计里，页面上的一样或几样东西（不是页面本身、不是子项目、没锁）可以拆成子项目；
 * 几样东西要在同一个页面或同一个组里。
 */
function canCarvePart(ids: string[]): boolean {
  if (kind().id !== "graphic" || ids.length === 0) return false;
  const ok = ids.every((id) => {
    const n = node(id);
    return !!n && !isBoardRoot(id) && n.type !== "Part" && n.type !== "Line" && !isNodeLocked(project.scene, id);
  });
  return ok && ids.every((id) => parentOf(id) === parentOf(ids[0]));
}

/** 现在选中的、可以一起拆的东西（多选时去掉被选中的组里面又选中的） */
function carveSelection(): string[] {
  return selectedIds.length > 1 ? topSelection() : selectedId ? [selectedId] : [];
}

/**
 * 这几样东西实际画出来的范围（父节点坐标，画布单位）：方框，加上项目样式画在方框外面的描边（outline）
 * 和 ::before / ::after 画的框；外面有一层裁掉超出部分的（overflow 不是 visible），只算裁剩下的。
 * 拆成子项目时子项目的页面要把这一圈包进去，不然在子项目里会被页面边裁掉。
 * 转过的、还没画出来的量不了，返回 null（就按方框算）。编辑器自己加的虚线（.vf-node / .vf-body 上的）不算。
 */
function paintedBounds(ids: string[]): { x: number; y: number; width: number; height: number } | null {
  const doc = stageIframeDoc;
  const win = doc?.defaultView;
  const canvas = doc?.getElementById("stage-canvas");
  const world = stageWorld();
  if (!doc || !win || !canvas || !world.width || ids.some((id) => worldRotation(id) !== 0)) return null;
  const board = canvas.getBoundingClientRect();
  if (!board.width) return null;
  type Box = { x1: number; y1: number; x2: number; y2: number };
  let box: Box | null = null;
  const grow = (b: Box) => {
    box = box ? { x1: Math.min(box.x1, b.x1), y1: Math.min(box.y1, b.y1), x2: Math.max(box.x2, b.x2), y2: Math.max(box.y2, b.y2) } : b;
  };
  for (const id of ids) {
    const wrapper = mounted.get(id)?.wrapper;
    if (!wrapper) return null;
    for (const el of [wrapper, ...wrapper.querySelectorAll<Element>("*")]) {
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      let clip: Box | null = null;
      for (let up = el.parentElement; up && wrapper.contains(up); up = up.parentElement) {
        const ucs = win.getComputedStyle(up);
        if (ucs.overflowX === "visible" && ucs.overflowY === "visible") continue;
        const ur = up.getBoundingClientRect();
        clip = clip
          ? { x1: Math.max(clip.x1, ur.left), y1: Math.max(clip.y1, ur.top), x2: Math.min(clip.x2, ur.right), y2: Math.min(clip.y2, ur.bottom) }
          : { x1: ur.left, y1: ur.top, x2: ur.right, y2: ur.bottom };
      }
      const add = (b: Box) => {
        const c = clip ? { x1: Math.max(b.x1, clip.x1), y1: Math.max(b.y1, clip.y1), x2: Math.min(b.x2, clip.x2), y2: Math.min(b.y2, clip.y2) } : b;
        if (c.x2 > c.x1 || c.y2 > c.y1) grow(c);
      };
      add({ x1: r.left, y1: r.top, x2: r.right, y2: r.bottom });
      const chrome = el.classList.contains("vf-node") || el.classList.contains("vf-body");
      const cs = win.getComputedStyle(el);
      // 设计窗口的缩放：样式里的 px 换成屏幕上的 px。节点外框是编辑器窗口建好再放进设计窗口的，
      // 不是设计窗口那边的 HTMLElement（instanceof 不认），所以按有没有 offsetWidth 认
      const html = typeof (el as HTMLElement).offsetWidth === "number" ? (el as HTMLElement) : null;
      const k = html?.offsetWidth ? r.width / html.offsetWidth : 1;
      if (!chrome && cs.outlineStyle !== "none") {
        const o = Math.max(0, (parseFloat(cs.outlineWidth) || 0) + (parseFloat(cs.outlineOffset) || 0)) * k;
        add({ x1: r.left - o, y1: r.top - o, x2: r.right + o, y2: r.bottom + o });
      }
      if (cs.position === "static" || !html) continue;
      for (const pseudo of ["::before", "::after"]) {
        const ps = win.getComputedStyle(el, pseudo);
        if (ps.content === "none" || ps.display === "none" || (ps.position !== "absolute" && ps.position !== "fixed")) continue;
        const left = r.left + (html.clientLeft + (parseFloat(ps.left) || 0)) * k;
        const top = r.top + (html.clientTop + (parseFloat(ps.top) || 0)) * k;
        const w = (parseFloat(ps.width) || 0) * k;
        const h = (parseFloat(ps.height) || 0) * k;
        const o = ps.outlineStyle !== "none" ? Math.max(0, (parseFloat(ps.outlineWidth) || 0) + (parseFloat(ps.outlineOffset) || 0)) * k : 0;
        add({ x1: left - o, y1: top - o, x2: left + w + o, y2: top + h + o });
      }
    }
  }
  if (!box) return null;
  // 只量“出头多少像素”，再加到场景数据里的方框上：方框本身照数据，不从屏幕坐标换算回来（那样会带进取整的零头）。
  // 不到半个像素的出头也是排版的零头，不算。
  const zoom = canvas.offsetWidth ? board.width / canvas.offsetWidth : 1;
  const tol = 0.5 * zoom;
  const rects = ids.map((id) => mounted.get(id)!.wrapper.getBoundingClientRect());
  const shown = { x1: Math.min(...rects.map((r) => r.left)), y1: Math.min(...rects.map((r) => r.top)), x2: Math.max(...rects.map((r) => r.right)), y2: Math.max(...rects.map((r) => r.bottom)) };
  const b = box as Box;
  const over = (d: number) => (d > tol ? d : 0);
  const scale = world.width / board.width;
  const left = over(shown.x1 - b.x1) * scale;
  const top = over(shown.y1 - b.y1) * scale;
  const right = over(b.x2 - shown.x2) * scale;
  const bottom = over(b.y2 - shown.y2) * scale;
  const boxes = ids.map((id) => node(id)!);
  const x = Math.min(...boxes.map((n) => n.x ?? 0));
  const y = Math.min(...boxes.map((n) => n.y ?? 0));
  const x2 = Math.max(...boxes.map((n) => (n.x ?? 0) + n.width));
  const y2 = Math.max(...boxes.map((n) => (n.y ?? 0) + n.height));
  return { x: x - left, y: y - top, width: x2 - x + left + right, height: y2 - y + top + bottom };
}

/** 名字 → 总项目里子项目节点的 ID（几样东西一起拆时才要新 ID）：times-23 → times23，重名往后编号 */
function partNodeIdFor(folder: string): string {
  const camel = folder.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
  const base = /^[A-Za-z]/.test(camel) && isValidIdentifier(camel) ? camel : "part";
  const taken = new Set(Object.keys(project.scene.nodes));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}${i}`)) return `${base}${i}`;
}

/**
 * 把一样或几样东西（连同它们里面的）拆成子项目：parts/<名字>/ 下写好子项目的文件，画布里原地换成子项目节点。
 * 撤销只把画布换回去，子项目的文件夹留着（项目面板里还看得到，可以再放回来或者删掉）。
 */
async function carvePart(ids: string[]): Promise<void> {
  if (!canCarvePart(ids) || !(await flushEditors())) return;
  const single = ids.length === 1;
  const values = await askFields({
    title: "拆成子项目",
    message: single
      ? `把“${ids[0]}”连同它里面的东西拆出去单独做。拆完这里显示子项目的内容，在子项目里改，这里跟着变。样式表、控件和素材两边共用。`
      : `把选中的 ${ids.length} 样东西一起拆出去单独做，这里换成一块子项目（大小是它们合起来的范围）。在子项目里改，这里跟着变。样式表、控件和素材两边共用。`,
    fields: [{ key: "name", label: "子项目的名字", value: single ? ids[0] : "" }],
    ok: "拆出来",
    validate: (v) => (v.name.trim() ? null : "起个名字"),
  });
  // 对话框开着的时候项目可能重读过（文件监听）：东西还在、还能拆，才往下走
  if (!values || !canCarvePart(ids) || !(await flushEditors())) return;
  const name = values.name.trim();
  // parts/ 下已有的文件夹都不用（包括没有 project.json 的半截文件夹，免得把里面的东西盖掉）
  let taken: Set<string>;
  try {
    taken = new Set((await listDir(`${ROOT_PREFIX}${PARTS_DIR}`)).map((entry) => entry.name));
  } catch (e) {
    return toast(`拆成子项目失败：读不到 ${PARTS_DIR}/ 文件夹（${(e as Error).message}）`);
  }
  const folder = partFolderName(/[A-Za-z0-9]/.test(name) || !single ? name : ids[0], taken);
  const part = `${PARTS_DIR}/${folder}`;
  const partNodeId = single ? ids[0] : partNodeIdFor(folder);
  const board = boardOfNode(project.scene, ids[0]);
  const boardClass = board ? String(node(board)?.props?.class ?? "") : "";
  const scene = structuredClone(project.scene);
  let result: ReturnType<typeof carveOutPart>;
  try {
    result = carveOutPart(scene, ids, { part, name, boardClass, id: crypto.randomUUID(), partNodeId, box: paintedBounds(ids) ?? undefined });
  } catch (e) {
    return toast((e as Error).message);
  }
  const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
  const files = [
    { path: `${ROOT_PREFIX}${part}/project.json`, next: json(result.partConfig), prev: null },
    { path: `${ROOT_PREFIX}${part}/ui/scene.json`, next: json(result.partScene), prev: null },
    { path: `${ROOT_PREFIX}${part}/docs/part.md`, next: result.partDoc, prev: null },
  ];
  const failure = await writeFilesTogether(files);
  if (failure !== null) return toast(`拆成子项目失败：${failure}`);
  // 新的子项目先放进内存，画布马上就能画出它；文件监听随后会整个重读
  const before = { parts: project.parts, partList: project.partList };
  project.parts = new Map(project.parts ?? []).set(part, { name, scene: result.partScene });
  project.partList = [...(project.partList ?? []), { part, name }];
  project.scene = scene;
  if (!single) selectedIds = [];
  await saveScene({ label: `拆成子项目 ${name}` });
  if (node(partNodeId)?.type !== "Part") {
    // 画布没存上（saveScene 已经把画布退回去、报了错）：刚写的子项目文件也拿掉，内存回到拆之前
    project.parts = before.parts;
    project.partList = before.partList;
    for (const file of files) await removeFile(file.path).catch(() => undefined);
    renderAll();
    return;
  }
  select(partNodeId);
  toast(`已拆成子项目“${name}”（${part}）：双击它打开`);
}

/** 面板的 ID 存进了用户的排列里，改名会丢掉用户的排列 */
const PANELS = {
  project: "panel-project",
  assets: "panel-assets",
  layers: "panel-layers",
  details: "panel-details",
  problems: "panel-problems",
  log: "panel-log",
} as const;

function initWorkspaceShell(): void {
  // 独立预览窗口只有设计窗口，没有面板
  if (isStandalonePreview()) return;
  workspace = createWorkspace(
    $("workspace"),
    $("center"),
    [
      { id: PANELS.project, title: "项目", content: $("project-panel"), area: "left", width: 240, height: 320 },
      { id: PANELS.assets, title: "素材", content: $("palette-section"), area: "left", width: 240, height: 380 },
      { id: PANELS.layers, title: "图层", content: $("layers-section"), area: "left", width: 240, height: 300 },
      { id: PANELS.details, title: "详细信息", content: $("right"), area: "right", width: 360, height: 600 },
      { id: PANELS.problems, title: "问题", content: $("problems"), area: "bottom", width: 600, height: 150 },
      { id: PANELS.log, title: "事件记录", content: $("log"), area: "bottom", width: 600, height: 150 },
    ],
    {
      areas: {
        left: {
          size: 240,
          splitOrientation: "vertical",
          groups: [{ tabs: [PANELS.assets, PANELS.project], active: PANELS.assets }, { tabs: [PANELS.layers] }],
        },
        right: { size: 360, groups: [{ tabs: [PANELS.details] }] },
        bottom: { size: 150, groups: [{ tabs: [PANELS.problems, PANELS.log], active: PANELS.problems }] },
        top: { groups: [] },
      },
      floating: [],
    },
  );
  // 素材面板：按组进入、能搜索（参考 PromptCut 的素材库）
  initAssetBrowser($("palette-section"), [
    { id: "basic", title: "基础素材", category: "controls", container: $("palette-basic"), preview: "list" },
    { id: "library", title: "收藏的素材", category: "controls", container: $("palette-library"), preview: "list", emptyHint: "项目控件右键 ▸ 收藏素材，以后在别的项目里也能用" },
    { id: "project", title: "项目控件", category: "controls", container: $("palette-project"), preview: "list", emptyHint: "Agent 做好的控件会出现在这里" },
    { id: "shapes", title: "基础图形", category: "graphics", container: $("palette-shapes"), preview: "grid" },
    { id: "flow", title: "流程图", category: "graphics", container: $("palette-flow"), preview: "grid" },
    { id: "lines", title: "线条", category: "graphics", container: $("palette-lines"), preview: "grid" },
    { id: "user", title: "我的预设", category: "graphics", container: $("palette-user"), preview: "grid", emptyHint: "画布上的图形右键 ▸ 存为预设，会出现在这里" },
  ]);
  registerShellCommands();
  initMenuBar($("menubar"));
}

/** 菜单里的命令。快捷键已经由别处处理的只写出来给人看（bind 不设） */
function registerShellCommands(): void {
  const click = (id: string) => () => document.getElementById(id)?.click();
  registerCommand({ id: "file.open-project", label: "项目……", menu: "file", group: "project", keywords: "打开 切换 子项目", run: () => workspace?.focus(PANELS.project) });
  registerCommand({
    id: "file.open-master",
    label: "回到总项目",
    menu: "file",
    group: "project",
    keywords: "子项目 返回 上一级",
    enabled: () => Boolean(project?.partOf),
    run: () => void leaveTo(projectPageUrl(currentRootId(), null), false),
  });
  registerCommand({
    id: "edit.carve-part",
    label: "拆成子项目……",
    menu: "edit",
    group: "part",
    keywords: "子项目 单独 施工 part",
    enabled: () => canCarvePart(carveSelection()),
    run: () => void carvePart(carveSelection()),
  });
  registerCommand({ id: "file.export", label: "导出……", menu: "file", group: "out", run: click("export-qt-btn") });
  registerCommand({ id: "file.preview-window", label: "独立预览", menu: "file", group: "out", run: click("open-preview-window") });
  registerCommand({ id: "edit.undo", label: "撤销", menu: "edit", group: "history", shortcut: "Ctrl+Z", run: () => void undo() });
  registerCommand({ id: "edit.redo", label: "重做", menu: "edit", group: "history", shortcut: "Ctrl+Y", run: () => void redo() });
  registerCommand({ id: "view.edit", label: "编辑模式", menu: "view", group: "mode", checked: () => mode === "edit", run: () => setMode("edit") });
  registerCommand({ id: "view.preview", label: "预览模式", menu: "view", group: "mode", checked: () => mode === "preview", run: () => setMode("preview") });
  registerCommand({ id: "view.fit", label: "适应窗口", menu: "view", group: "zoom", shortcut: "Shift+1", run: zoomToFit });
  registerCommand({ id: "view.actual", label: "实际大小（100%）", menu: "view", group: "zoom", shortcut: "Ctrl+0", run: () => setZoom(1) });
  registerCommand({ id: "view.selection", label: "缩放到所选", menu: "view", group: "zoom", shortcut: "Shift+2", run: zoomToSelection });
  registerCommand({ id: "view.center", label: "居中", menu: "view", group: "zoom", run: centerView });
  for (const panel of workspace?.panels ?? []) {
    registerCommand({
      id: `window.${panel.id}`,
      label: panel.title,
      menu: "window",
      group: "panels",
      keywords: "面板 显示 隐藏",
      checked: () => workspace?.isOpen(panel.id) ?? false,
      run: () => (workspace?.isOpen(panel.id) ? workspace.setOpen(panel.id, false) : workspace?.focus(panel.id)),
    });
  }
  registerCommand({ id: "window.reset", label: "重置布局", menu: "window", group: "layout", keywords: "面板 默认", run: () => workspace?.reset() });
  registerCommand({ id: "help.palette", label: "命令面板", menu: "help", group: "help", shortcut: "Ctrl+K", bind: true, run: () => openCommandPalette() });
  registerCommand({
    id: "help.shortcuts",
    label: "快捷键",
    menu: "help",
    group: "help",
    run: () =>
      openShortcutSheet([
        ["V", "选择"],
        ["R / O / T", "矩形、椭圆、文字"],
        ["L / X", "直线、折线连接线"],
        ["方向键", "挪一点；Shift 挪多一点"],
        ["Ctrl+C / Ctrl+V", "复制、粘贴"],
        ["Ctrl+D", "原地复制一份"],
        ["Delete", "删除所选"],
        ["空格 + 拖动", "平移画布"],
        ["Ctrl + 滚轮", "缩放画布"],
        ["PageUp / PageDown", "平面设计翻页"],
        ["Ctrl+Enter", "从所选画出连接的下一个图形"],
      ]),
  });
}

async function main(): Promise<void> {
  initWorkspaceShell();
  ensureStageIframe();
  project = await loadProject(null);
  await loadPreviewSettings();
  if (workspace) {
    projectPanel = initProjectPanel($("project-panel"), {
      getProject: () => project,
      flush: flushEditors,
      select: (id) => {
        select(id);
        zoomToSelection();
      },
      toast,
    });
  }
  // 设计窗口的基础样式随设计类型不同，项目读出来之后再定一次
  ensureStageIframe();
  designRuntime = new Runtime(project);
  initLibrary({
    getProject: () => project,
    getMode: () => mode,
    clientToStage,
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
        // 和 saveScene 一样先把线条按设计的尺寸整理好（预览里拖过窗口大小时，画的线是按窗口的大小摆的）
        normalizeLines();
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
    getPageDoc: () => docOfBoard(stageRootId()),
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
  initPropsEdit({
    getProject: () => project,
    getSelectedId: () => selectedId,
    getBoardId: stageRootId,
    isLocked: (id) => isNodeLocked(project.scene, id),
    isLayoutPositioned: (id) => isLayoutPositionedNode(project.scene, id),
    saveScene,
    toast,
    activateRightTab: showRightTab,
    listAssets: listProjectAssets,
    effectiveProps: (id) => mounted.get(id)?.instance?.effective?.() ?? null,
  });
  initEventEdit({
    getProject: () => project,
    getSelectedId: () => selectedId,
    getRuntime: activeRuntime,
    isLive: () => previewRuntime !== null,
    fire: fireEvent,
    toggleCondition: (id) => {
      if (!previewRuntime) startPreviewRuntime();
      previewRuntime!.toggleTextCondition(id);
      renderEventPane();
    },
    resetState: resetLiveState,
    activateRightTab: showRightTab,
  });
  const rightTabs = document.querySelector<HTMLElement>("#right .tabs")!;
  fitRightTabs = overflowBar(rightTabs, {
    limit: () => {
      const style = getComputedStyle(rightTabs);
      return rightTabs.clientWidth - parseFloat(style.paddingRight);
    },
    watch: rightTabs,
    keep: (item) => item.getAttribute("aria-selected") === "true",
    closeOnPick: true,
  });
  initPreviewLauncher(
    () => project,
    (id) => {
      if (node(id)) {
        select(id);
        showRightTab("doc");
      }
    },
    previewDevice,
    // 桌面版的独立预览窗口换了预览设备，交给这里写
    (patch) => {
      const typed: PreviewSettings = {};
      if (patch.device === "plain" || isDeviceId(patch.device)) typed.device = patch.device;
      if (patch.phone !== undefined) typed.phone = patch.phone;
      if (patch.landscape !== undefined) typed.landscape = patch.landscape;
      adoptPreviewSettings({ ...previewSettings, ...typed });
      void savePreviewSettings(typed);
    },
  );
  restoreBoard();
  syncRightTabs();
  showRightTab(kind().defaultTab);
  renderAll();
  renderLog();
  initStandalonePreviewWindow({
    getProject: () => project,
    enterPreviewMode: () => setMode("preview"),
  });
  watchProject((paths) => {
    // 别的窗口（独立预览、播放页）可能换了预览设备。系统有时不说是哪个文件变了（一批里混着没名字的），
    // 所以每次都读一下这个小文件，没变就什么都不做
    void refreshPreviewSettings();
    // 项目里的脚本（控件、效果和它们引用的别的脚本）变了，设计窗口要换一个干净的环境才读得到新的
    if (paths.some((path) => /\.m?js$/i.test(path) && !path.startsWith(".designer/"))) stageRealmStale = true;
    invalidatePropsAssets();
    void reload();
  });
}

main().catch((e) => {
  document.body.textContent = `启动失败：${(e as Error).message}`;
});
