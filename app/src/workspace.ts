// 编辑器自己的工作区：项目、素材、图层、详细信息、问题、事件记录都是停靠面板，中间是设计窗口。
// 停靠用的是设计窗口里同一套停靠排列（dock.ts），AnimeAn 的面板也是它：拖标题栏停到四边、叠成页签、
// 并排、浮出成小窗、关掉之后从“窗口”菜单打开，拖分隔条改大小。
// 排列记在 localStorage（vf.workspace），只是这台机器上的习惯；“窗口 ▸ 重置布局”回到默认。
//
// 做法：把工作区当成一个看不见的设计：一个窗口节点、每个面板一个停靠节点、中央区一个节点。
// 排列的计算（computeDockWindowLayout）和拖动交互（syncDockHeaderDom / syncDockSplittersDom）原样复用，
// 这里只负责把面板的元素放进停靠框、把中央区放到算出来的位置、把排列存起来。
import {
  computeDockWindowLayout,
  dockActivateTab,
  dockFloat,
  dockFindLocation,
  dockMoveToArea,
  dockResizeArea,
  dockResizeSplit,
  dockRestore,
  dockSplit,
  dockTabify,
  normalizeDockLayout,
  syncDockHeaderDom,
  syncDockSplittersDom,
  type DockArea,
  type DockLayoutSpec,
  type DockPreviewCallbacks,
} from "./dock.ts";
import type { Scene, SceneNode } from "./model.ts";

export interface PanelDef {
  /** 停靠节点的 ID，也是存排列时用的名字，改了会丢掉用户存的排列 */
  id: string;
  title: string;
  /** 面板里的内容：已有的元素，挪进停靠框 */
  content: HTMLElement;
  /** 第一次打开时停在哪边 */
  area: DockArea;
  width: number;
  height: number;
  /** 默认关着（从“窗口”菜单打开） */
  closed?: boolean;
}

export interface Workspace {
  readonly panels: readonly PanelDef[];
  /** 窗口大小或面板内容变了之后重排 */
  relayout(): void;
  isOpen(id: string): boolean;
  setOpen(id: string, open: boolean): void;
  /** 打开这个面板，如果它和别的面板叠在一起，切到它那一页 */
  focus(id: string): void;
  setTitle(id: string, title: string): void;
  /** 回到默认排列 */
  reset(): void;
  /** 排列或开关变了（用来刷新“窗口”菜单的勾） */
  onChange(listener: () => void): void;
}

const WIN = "vf-workspace";
const CENTER = "vf-workspace-center";
const HEADER = 26;
const STORAGE_KEY = "vf.workspace";
const VERSION = 1;

interface Saved {
  version: number;
  layout: DockLayoutSpec;
  closed: string[];
}

function load(): Saved | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Saved | null;
    return raw && raw.version === VERSION && raw.layout?.areas ? raw : null;
  } catch {
    return null;
  }
}

function store(saved: Saved): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // 存不下只是下次打开回到默认
  }
}

/**
 * 建工作区。frame 是面板和中央区所在的容器（铺满顶栏以下），center 是设计窗口所在的元素；
 * defaults 是默认排列（只写分组和页签，尺寸不写就按面板的 width / height）。
 */
export function createWorkspace(frame: HTMLElement, center: HTMLElement, panels: PanelDef[], defaults: DockLayoutSpec): Workspace {
  const titles = new Map(panels.map((p) => [p.id, p.title]));
  const listeners: Array<() => void> = [];
  const size = () => ({ width: Math.max(1, frame.clientWidth), height: Math.max(1, frame.clientHeight) });

  const sceneFor = (layout: DockLayoutSpec): Scene => {
    const { width, height } = size();
    const nodes: Record<string, SceneNode> = {
      [WIN]: { type: "Window", width, height, docks: panels.map((p) => p.id), central: CENTER, dockLayout: layout, children: [] },
      [CENTER]: { type: "Container", width: 400, height: 300 },
    };
    for (const p of panels) {
      nodes[p.id] = { type: "Dock", width: p.width, height: p.height, dockArea: p.area, headerHeight: HEADER } as SceneNode;
    }
    return { version: 1, root: WIN, nodes };
  };
  const normalized = (layout: DockLayoutSpec) => {
    const scene = sceneFor(layout);
    return normalizeDockLayout(scene, scene.nodes[WIN]);
  };

  const saved = load();
  let layout = normalized(saved?.layout ?? defaults);
  const closed = new Set<string>(saved ? saved.closed.filter((id) => titles.has(id)) : panels.filter((p) => p.closed).map((p) => p.id));
  const persist = () => store({ version: VERSION, layout, closed: [...closed] });
  const changed = () => {
    for (const listener of listeners) listener();
  };

  // 每个面板一个停靠框：标题栏（由 dock.ts 画页签、浮出、关闭按钮）+ 内容
  const wrappers = new Map<string, { wrapper: HTMLElement; header: HTMLElement; body: HTMLElement }>();
  for (const p of panels) {
    const wrapper = document.createElement("section");
    wrapper.className = "ws-dock";
    wrapper.dataset.panel = p.id;
    // 停靠引擎找“拖到哪个面板上”时认这个（设计窗口里的停靠节点认 data-vf-id）
    wrapper.dataset.dockId = p.id;
    const header = document.createElement("div");
    header.className = "vf-dock-header";
    const body = document.createElement("div");
    body.className = "ws-dock-body";
    body.append(p.content);
    wrapper.append(header, body);
    frame.append(wrapper);
    wrappers.set(p.id, { wrapper, header, body });
  }
  frame.append(center);

  /** 一次操作：用 dock.ts 的纯函数改排列；commit 为 false 时是拖动途中，只重排不存 */
  const apply = (change: (layout: DockLayoutSpec, scene: Scene, win: SceneNode) => DockLayoutSpec, commit = true) => {
    const scene = sceneFor(layout);
    layout = change(layout, scene, scene.nodes[WIN]);
    relayout();
    if (commit) {
      persist();
      changed();
    }
  };

  const callbacks: DockPreviewCallbacks = {
    // 工作区一直是“可以拖”的状态
    getMode: () => "preview",
    getScene: () => sceneFor(layout),
    getDockLayout: () => layout,
    getWindowSize: size,
    getDockTitle: (id) => titles.get(id) ?? id,
    onActivateTab: (id) => apply((l, s, w) => dockActivateTab(l, s, w, id)),
    onTabify: (target, id) => apply((l, s, w) => dockTabify(l, s, w, target, id)),
    onSplit: (target, id, position, orientation) => apply((l, s, w) => dockSplit(l, s, w, target, id, position, orientation)),
    onMoveToArea: (id, area) => apply((l, s, w) => dockMoveToArea(l, s, w, id, area)),
    onFloat: (id, rect, commit = true) => apply((l, s, w) => dockFloat(l, s, w, id, rect), commit),
    onRestore: (id) => apply((l, s, w) => dockRestore(l, s, w, id)),
    onClose: (id) => setOpen(id, false),
    onResizeArea: (area, value, commit = true) => apply((l, s, w) => dockResizeArea(l, s, w, area, value), commit),
    onResizeSplit: (area, index, value, commit = true) => apply((l, s, w) => dockResizeSplit(l, s, w, area, index, value), commit),
  };

  function relayout(): void {
    const scene = sceneFor(layout);
    const { width, height } = size();
    const result = computeDockWindowLayout(scene, WIN, scene.nodes[WIN], width, 0, height, true, (id) => !closed.has(id), layout);
    for (const p of panels) {
      const parts = wrappers.get(p.id)!;
      const box = result.dockBoxes.get(p.id);
      const shown = Boolean(box?.visible) && !closed.has(p.id);
      parts.wrapper.hidden = !shown;
      parts.wrapper.style.display = shown ? "" : "none";
      if (!shown || !box) continue;
      Object.assign(parts.wrapper.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.width}px`, height: `${box.height}px` });
      const info = result.activeTabByDock.get(p.id);
      parts.wrapper.style.zIndex = info?.isFloating ? "40" : "";
      syncDockHeaderDom(parts.wrapper, parts.header, p.id, HEADER, info, frame, callbacks);
    }
    const c = result.centralBox;
    Object.assign(center.style, { left: `${c.x}px`, top: `${c.y}px`, width: `${c.width}px`, height: `${c.height}px` });
    syncDockSplittersDom(frame, result.splitters, callbacks);
  }

  function setOpen(id: string, open: boolean): void {
    if (!titles.has(id) || open === !closed.has(id)) return;
    if (open) closed.delete(id);
    else closed.add(id);
    relayout();
    persist();
    changed();
  }

  let pending = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(relayout);
  }).observe(frame);
  relayout();

  return {
    panels,
    relayout,
    isOpen: (id) => titles.has(id) && !closed.has(id),
    setOpen,
    focus(id) {
      if (!titles.has(id)) return;
      if (closed.has(id)) setOpen(id, true);
      if (dockFindLocation(layout, id)) apply((l, s, w) => dockActivateTab(l, s, w, id));
    },
    setTitle(id, title) {
      if (titles.get(id) === title) return;
      titles.set(id, title);
      const parts = wrappers.get(id);
      if (parts) relayout();
    },
    reset() {
      layout = normalized(defaults);
      closed.clear();
      for (const p of panels) if (p.closed) closed.add(p.id);
      relayout();
      persist();
      changed();
    },
    onChange(listener) {
      listeners.push(listener);
    },
  };
}
