// 编辑模式支持布局容器、尺寸规则与停靠面板：
// 1) 往布局容器里拖入新控件或已有控件，自动计算插入下标或网格行列并显示插入指示线；
// 2) 调整布局内子控件顺序（画布直接拖拽排序或面板上移/下移）与主轴伸缩因子（stretch）；
// 3) 设置控件尺寸规则（SizePolicy：horizontal / vertical / preferred / min / max / fixed / stretch）与容器排版参数（LayoutSpec）；
// 4) 摆放与配置主窗口停靠面板（Dock：left / right / top / bottom、标题、标题栏高度、主窗口分区 central / statusBar / docks）；
// 5) 所有修改均受锁定保护（节点自身或祖先鎖定时禁止修改）并记录进撤销/重做历史。
import { isMap, isSeq, type Document } from "yaml";
import type { Value } from "./expr.ts";
import {
  canNodeHoldChildren,
  childrenOfNode,
  clampHeight,
  clampWidth,
  computeDockDropTarget,
  computeLayoutDropTarget,
  computeSceneLayout,
  CONTAINER_DECL,
  declFor,
  findStateLeaf,
  isBusinessState,
  isLayoutPositionedNode,
  isSceneNodeLocked,
  layoutOf,
  LAYOUT_TYPE_KINDS,
  parentOfNode,
  type ComputedBox,
  type DockArea,
  type DockDropTarget,
  type LayoutDropTarget,
  type LayoutKind,
  type LayoutSpec,
  type Project,
  type Scene,
  type SceneNode,
  type SizeMode,
  type SizePolicy,
} from "./model.ts";

const LAYOUT_KIND_TO_TYPE: Record<LayoutKind, string> = {
  vbox: "VBox",
  hbox: "HBox",
  flow: "Flow",
  grid: "Grid",
  form: "Form",
  stack: "Stack",
};

function defaultLayoutSpecForKind(kind: LayoutKind): LayoutSpec {
  if (kind === "grid") return { kind: "grid", columns: 2, padding: 0, gap: 8 };
  if (kind === "form") return { kind: "form", labelWidth: 96, padding: 0, gap: 8 };
  return { kind, padding: 0, gap: 8 };
}

function clearMenuDockReference(scene: Scene, dockId: string): void {
  for (const n of Object.values(scene.nodes)) {
    for (const menu of n.menuBar?.menus ?? []) {
      for (const item of menu.items ?? []) {
        if (item.dock === dockId) delete item.dock;
      }
    }
  }
}

// ---------- 纯数据操作函数（供界面与自动化测试共用） ----------

/**
 * 在画布指定位置（相对于主窗口左上角）放置一个新控件：
 * - 若 type 为 "Dock"，自动加入根窗口 docks 分区，并按落点所在四侧设置 dockArea（left/right/top/bottom）与顺序；
 * - 若目标容器启用了自动排版（VBox/HBox/Grid/Form/Stack 或 layout），按落点计算插入下标（Grid 同步计算 row/column），不写无意义的 x/y；
 * - 否则按自由坐标写入相对于父容器的 x/y。
 * 若目标父容器已锁定，则拒绝修改并返回 false。
 */
export function placeNewNodeInScene(
  scene: Scene,
  type: string,
  id: string,
  px: number,
  py: number,
  defaultSize: { width: number; height: number },
  options: {
    props?: Record<string, Value>;
    canHaveChildren?: boolean;
    targetContainerId?: string;
    boxes?: Map<string, ComputedBox>;
    dockArea?: DockArea;
    insertIndex?: number;
    exactTopLeft?: { x: number; y: number };
  } = {},
): boolean {
  if (scene.nodes[id]) return false;
  if (options.targetContainerId && isSceneNodeLocked(scene, options.targetContainerId)) return false;
  const layoutBoxes = options.boxes ?? computeSceneLayout(scene);

  if (type === "Dock") {
    const winId = scene.root;
    const winNode = scene.nodes[winId];
    if (!winNode || isSceneNodeLocked(scene, winId)) return false;
    const dockTarget = computeDockDropTarget(scene, { x: px, y: py }, layoutBoxes);
    const area: DockArea = options.dockArea ?? dockTarget?.dockArea ?? "left";
    const created: SceneNode = {
      type: "Dock",
      dockArea: area,
      width: Math.max(40, Math.round(defaultSize.width)),
      height: Math.max(40, Math.round(defaultSize.height)),
      headerHeight: 26,
      title: typeof options.props?.title === "string" ? options.props.title : "面板",
      children: [],
    };
    if (options.props && Object.keys(options.props).length > 0) {
      const restProps = { ...options.props };
      delete restProps.title;
      if (Object.keys(restProps).length > 0) created.props = restProps;
    }
    scene.nodes[id] = created;
    winNode.docks ??= [];
    const areaIdx = options.insertIndex ?? dockTarget?.insertIndex ?? winNode.docks.length;
    insertDockIntoWindowList(scene, winNode, id, area, areaIdx);
    return true;
  }

  const targetParentId =
    options.targetContainerId && scene.nodes[options.targetContainerId]
      ? options.targetContainerId
      : scene.root;
  const parent = scene.nodes[targetParentId];
  if (!parent || isSceneNodeLocked(scene, targetParentId)) return false;

  const pLayout = layoutOf(parent);
  const minDim = type === "Line" ? 1 : 8;
  const created: SceneNode = {
    type,
    width: Math.max(minDim, Math.round(defaultSize.width)),
    height: Math.max(minDim, Math.round(defaultSize.height)),
  };
  if (options.props && Object.keys(options.props).length > 0) {
    created.props = JSON.parse(JSON.stringify(options.props)) as Record<string, Value>;
  }
  if (options.canHaveChildren || type === "Container" || type === "Dock" || type === "Dialog" || type in LAYOUT_TYPE_KINDS) {
    created.children = [];
  }
  if (type in LAYOUT_TYPE_KINDS) {
    created.layout = defaultLayoutSpecForKind(LAYOUT_TYPE_KINDS[type]);
  }

  parent.children ??= [];
  if (pLayout) {
    const drop = computeLayoutDropTarget(scene, targetParentId, { x: px, y: py }, layoutBoxes);
    const idx = options.insertIndex ?? drop?.insertIndex ?? parent.children.length;
    const clampedIdx = Math.max(0, Math.min(parent.children.length, idx));
    if (pLayout.kind === "grid" && drop) {
      if (drop.row !== undefined) created.row = drop.row;
      if (drop.column !== undefined) created.column = drop.column;
    }
    scene.nodes[id] = created;
    parent.children.splice(clampedIdx, 0, id);
  } else {
    const pBox = layoutBoxes.get(targetParentId);
    const originX = targetParentId === scene.root ? 0 : (pBox?.absX ?? parent.x ?? 0);
    const originY = targetParentId === scene.root ? 0 : (pBox?.absY ?? parent.y ?? 0);
    if (options.exactTopLeft) {
      created.x = Math.round(options.exactTopLeft.x - originX);
      created.y = Math.round(options.exactTopLeft.y - originY);
    } else {
      created.x = Math.round(px - originX - created.width / 2);
      created.y = Math.round(py - originY - created.height / 2);
    }
    scene.nodes[id] = created;
    if (options.insertIndex !== undefined) {
      const clampedIdx = Math.max(0, Math.min(parent.children.length, options.insertIndex));
      parent.children.splice(clampedIdx, 0, id);
    } else {
      parent.children.push(id);
    }
  }
  return true;
}

function insertDockIntoWindowList(
  scene: Scene,
  winNode: SceneNode,
  dockId: string,
  area: DockArea,
  indexInArea: number,
): void {
  winNode.docks = (winNode.docks ?? []).filter((did) => did !== dockId);
  if (winNode.children) {
    winNode.children = winNode.children.filter((cid) => cid !== dockId);
  }
  if (winNode.central === dockId) delete winNode.central;
  if (winNode.statusBar === dockId) delete winNode.statusBar;
  const areaIds = winNode.docks.filter((did) => (scene.nodes[did]?.dockArea ?? "left") === area);
  const clamped = Math.max(0, Math.min(areaIds.length, indexInArea));
  if (areaIds.length === 0 || clamped >= areaIds.length) {
    if (areaIds.length === 0) {
      winNode.docks.push(dockId);
    } else {
      const lastId = areaIds[areaIds.length - 1];
      const pos = winNode.docks.lastIndexOf(lastId);
      winNode.docks.splice(pos + 1, 0, dockId);
    }
  } else {
    const beforeId = areaIds[clamped];
    const pos = winNode.docks.indexOf(beforeId);
    winNode.docks.splice(Math.max(0, pos), 0, dockId);
  }
}

/**
 * 将已有控件 nodeId 移入目标容器 targetContainerId 的指定下标（或在同一容器内重排顺序）。
 * 受锁定状态保护：若 nodeId、原父容器或目标容器被锁定，或者目标容器是 nodeId 的后代，则返回 false。
 */
export function insertOrMoveNodeInLayout(
  scene: Scene,
  nodeId: string,
  targetContainerId: string,
  insertIndex?: number,
  gridCell?: { row?: number; column?: number },
): boolean {
  const n = scene.nodes[nodeId];
  const target = scene.nodes[targetContainerId];
  if (!n || !target || nodeId === scene.root || nodeId === targetContainerId) return false;
  if (isSceneNodeLocked(scene, nodeId) || isSceneNodeLocked(scene, targetContainerId)) return false;
  for (let p: string | null = targetContainerId; p; p = parentOfNode(scene, p)) {
    if (p === nodeId) return false;
  }
  const oldParentId = parentOfNode(scene, nodeId);
  if (oldParentId && isSceneNodeLocked(scene, oldParentId)) return false;

  if (oldParentId) {
    const oldParent = scene.nodes[oldParentId];
    if (oldParent) {
      if (oldParent.children) oldParent.children = oldParent.children.filter((cid) => cid !== nodeId);
      if (oldParent.docks) oldParent.docks = oldParent.docks.filter((cid) => cid !== nodeId);
      if (oldParent.central === nodeId) delete oldParent.central;
      if (oldParent.statusBar === nodeId) delete oldParent.statusBar;
    }
  }

  // 若原节点是 Dock，移入普通容器 children 时自动脱掉 Dock 身份并清理关联菜单引用
  if (n.type === "Dock" || n.dockArea !== undefined) {
    delete n.dockArea;
    delete n.headerHeight;
    if (n.type === "Dock") {
      n.type = n.layout ? LAYOUT_KIND_TO_TYPE[n.layout.kind] : "Container";
    }
    clearMenuDockReference(scene, nodeId);
  }

  target.children ??= [];
  const clamped = Math.max(0, Math.min(target.children.length, insertIndex ?? target.children.length));
  target.children.splice(clamped, 0, nodeId);

  const tLayout = layoutOf(target);
  if (tLayout) {
    delete n.x;
    delete n.y;
    if (tLayout.kind === "grid" && gridCell) {
      if (gridCell.row !== undefined) n.row = Math.max(0, Math.round(gridCell.row));
      if (gridCell.column !== undefined) n.column = Math.max(0, Math.round(gridCell.column));
    }
  }
  return true;
}

/**
 * 在父容器的 children（或主窗口的 docks）中调整子节点顺序。
 * isRelative 为 true 时，targetIndexOrDelta 表示相对偏移（如 -1 上移、+1 下移）；否则表示目标下标。
 */
export function reorderChildInLayout(
  scene: Scene,
  childId: string,
  targetIndexOrDelta: number,
  isRelative = false,
): boolean {
  if (!scene.nodes[childId] || childId === scene.root || isSceneNodeLocked(scene, childId)) return false;
  const parentId = parentOfNode(scene, childId);
  if (!parentId || isSceneNodeLocked(scene, parentId)) return false;
  const parent = scene.nodes[parentId];
  if (!parent) return false;

  const list = parent.docks?.includes(childId)
    ? parent.docks
    : parent.children?.includes(childId)
      ? parent.children
      : null;
  if (!list || list.length <= 1) return false;

  const oldIdx = list.indexOf(childId);
  if (oldIdx < 0) return false;
  const nextIdx = Math.max(0, Math.min(list.length - 1, isRelative ? oldIdx + targetIndexOrDelta : targetIndexOrDelta));
  if (nextIdx === oldIdx) return false;

  list.splice(oldIdx, 1);
  list.splice(nextIdx, 0, childId);
  return true;
}

/**
 * 更新容器的排版方式与参数（LayoutSpec）。
 * spec 为 null 时切换为自由定位（清除 layout 字段；若原 type 为 VBox/HBox/Grid/Form/Stack 则转为 Container）。
 */
export function updateContainerLayoutSpec(
  scene: Scene,
  containerId: string,
  spec: LayoutSpec | null,
  syncType = false,
): boolean {
  const n = scene.nodes[containerId];
  if (!n || isSceneNodeLocked(scene, containerId)) return false;
  if (containerId === scene.root && n.locked) return false;
  const childIds = childrenOfNode(n);
  if (childIds.some((cid) => isSceneNodeLocked(scene, cid))) return false;

  if (!spec) {
    const hadLayout = Boolean(n.layout || n.type in LAYOUT_TYPE_KINDS);
    delete n.layout;
    if (n.type in LAYOUT_TYPE_KINDS) {
      n.type = "Container";
    }
    return hadLayout;
  }

  const cleaned: LayoutSpec = { kind: spec.kind };
  if (spec.padding !== undefined) cleaned.padding = spec.padding;
  if (spec.gap !== undefined && Number.isFinite(spec.gap)) cleaned.gap = Math.max(0, Math.round(spec.gap));
  if (spec.rowGap !== undefined && Number.isFinite(spec.rowGap)) cleaned.rowGap = Math.max(0, Math.round(spec.rowGap));
  if (spec.columnGap !== undefined && Number.isFinite(spec.columnGap)) cleaned.columnGap = Math.max(0, Math.round(spec.columnGap));
  if (spec.columns !== undefined && Number.isFinite(spec.columns)) cleaned.columns = Math.max(1, Math.round(spec.columns));
  if (Array.isArray(spec.columnStretch) && spec.columnStretch.length > 0) {
    cleaned.columnStretch = spec.columnStretch.map((v) => Math.max(0, Math.round(Number(v) || 0)));
  }
  if (Array.isArray(spec.rowStretch) && spec.rowStretch.length > 0) {
    cleaned.rowStretch = spec.rowStretch.map((v) => Math.max(0, Math.round(Number(v) || 0)));
  }
  if (spec.labelWidth !== undefined && Number.isFinite(spec.labelWidth)) {
    cleaned.labelWidth = Math.max(20, Math.round(spec.labelWidth));
  }

  n.layout = cleaned;
  if (syncType && (n.type === "Container" || n.type in LAYOUT_TYPE_KINDS)) {
    n.type = LAYOUT_KIND_TO_TYPE[spec.kind];
  }
  n.children ??= [];
  for (const cid of childIds) {
    const child = scene.nodes[cid];
    if (child) {
      delete child.x;
      delete child.y;
    }
  }
  return true;
}

/**
 * 修改控件的尺寸规则（SizePolicy）。
 * patch 中值为 undefined 的字段会被移除；若 size 为空对象则删除 node.size。
 */
export function updateNodeSizePolicy(
  scene: Scene,
  nodeId: string,
  patch: Partial<Record<keyof SizePolicy, SizePolicy[keyof SizePolicy] | undefined>> | null,
): boolean {
  const n = scene.nodes[nodeId];
  if (!n || isSceneNodeLocked(scene, nodeId)) return false;
  if (nodeId === scene.root && n.locked) return false;

  if (patch === null) {
    if (!n.size) return false;
    delete n.size;
    return true;
  }

  const next: SizePolicy = { ...(n.size ?? {}) };
  for (const [k, v] of Object.entries(patch) as Array<[keyof SizePolicy, unknown]>) {
    if (v === undefined || v === null || v === "" || (typeof v === "number" && !Number.isFinite(v))) {
      delete next[k];
    } else if (k === "horizontal" || k === "vertical") {
      if (v === "preferred" || v === "fixed" || v === "expanding") {
        next[k] = v;
      } else {
        delete next[k];
      }
    } else if (typeof v === "number") {
      const rounded = Math.max(0, Math.round(v));
      if (k === "stretch" && rounded === 0) {
        delete next.stretch;
      } else {
        (next as Record<string, number>)[k] = rounded;
      }
    }
  }

  if (Object.keys(next).length === 0) {
    delete n.size;
  } else {
    n.size = next;
  }

  if (n.size?.fixedWidth !== undefined) n.width = Math.round(n.size.fixedWidth);
  else if (n.size?.preferredWidth !== undefined) n.width = clampWidth(n, n.size.preferredWidth);
  else n.width = clampWidth(n, n.width);

  if (n.size?.fixedHeight !== undefined) n.height = Math.round(n.size.fixedHeight);
  else if (n.size?.preferredHeight !== undefined) n.height = clampHeight(n, n.size.preferredHeight);
  else n.height = clampHeight(n, n.height);

  return true;
}

/**
 * 修改网格或表单子控件的位置与跨度（row / column / rowSpan / columnSpan / formLabel）。
 */
export function updateNodeGridCell(
  scene: Scene,
  nodeId: string,
  patch: {
    row?: number | undefined;
    column?: number | undefined;
    rowSpan?: number | undefined;
    columnSpan?: number | undefined;
    formLabel?: string | undefined;
  },
): boolean {
  const n = scene.nodes[nodeId];
  if (!n || isSceneNodeLocked(scene, nodeId)) return false;
  if ("row" in patch) {
    if (patch.row === undefined || !Number.isFinite(patch.row)) delete n.row;
    else n.row = Math.max(0, Math.round(patch.row));
  }
  if ("column" in patch) {
    if (patch.column === undefined || !Number.isFinite(patch.column)) delete n.column;
    else n.column = Math.max(0, Math.round(patch.column));
  }
  if ("rowSpan" in patch) {
    if (patch.rowSpan === undefined || !Number.isFinite(patch.rowSpan) || patch.rowSpan <= 1) delete n.rowSpan;
    else n.rowSpan = Math.max(1, Math.round(patch.rowSpan));
  }
  if ("columnSpan" in patch) {
    if (patch.columnSpan === undefined || !Number.isFinite(patch.columnSpan) || patch.columnSpan <= 1) delete n.columnSpan;
    else n.columnSpan = Math.max(1, Math.round(patch.columnSpan));
  }
  if ("formLabel" in patch) {
    if (!patch.formLabel) delete n.formLabel;
    else n.formLabel = patch.formLabel;
  }
  return true;
}

/**
 * 设置停靠面板（Dock）的停靠侧（left / right / top / bottom）、同侧顺序与标题栏配置。
 */
export function setDockPanelArea(
  scene: Scene,
  dockId: string,
  dockArea: DockArea,
  insertIndexInArea?: number,
  patch?: { headerHeight?: number; title?: string; width?: number; height?: number },
): boolean {
  const d = scene.nodes[dockId];
  const winNode = scene.nodes[scene.root];
  if (!d || !winNode || dockId === scene.root) return false;
  if (isSceneNodeLocked(scene, dockId) || isSceneNodeLocked(scene, scene.root)) return false;
  if (!["left", "right", "top", "bottom"].includes(dockArea)) return false;

  const oldParentId = parentOfNode(scene, dockId);
  if (oldParentId && oldParentId !== scene.root) {
    if (isSceneNodeLocked(scene, oldParentId)) return false;
    const oldParent = scene.nodes[oldParentId];
    if (oldParent?.children) oldParent.children = oldParent.children.filter((cid) => cid !== dockId);
  }

  d.type = "Dock";
  d.dockArea = dockArea;
  d.headerHeight ??= 26;
  delete d.x;
  delete d.y;
  if (patch) {
    if (patch.headerHeight !== undefined && Number.isFinite(patch.headerHeight)) {
      d.headerHeight = Math.max(18, Math.round(patch.headerHeight));
    }
    if (patch.title !== undefined) {
      if (patch.title) d.title = patch.title;
      else delete d.title;
    }
    if (patch.width !== undefined && Number.isFinite(patch.width)) {
      d.width = Math.max(40, Math.round(patch.width));
    }
    if (patch.height !== undefined && Number.isFinite(patch.height)) {
      d.height = Math.max(40, Math.round(patch.height));
    }
  }

  winNode.docks ??= [];
  const existingAreaIds = winNode.docks.filter((did) => did !== dockId && (scene.nodes[did]?.dockArea ?? "left") === dockArea);
  const targetIdx = insertIndexInArea !== undefined ? insertIndexInArea : existingAreaIds.length;
  insertDockIntoWindowList(scene, winNode, dockId, dockArea, targetIdx);
  return true;
}

/**
 * 设置根窗口直接子节点的分区角色：普通子节点（none）、停靠面板（dock）、中央区（central）或状态栏（statusBar）。
 */
export function setWindowPartitionRole(
  scene: Scene,
  nodeId: string,
  role: "none" | "dock" | "central" | "statusBar",
  dockArea: DockArea = "left",
): boolean {
  const n = scene.nodes[nodeId];
  const winNode = scene.nodes[scene.root];
  if (!n || !winNode || nodeId === scene.root) return false;
  if (isSceneNodeLocked(scene, nodeId) || isSceneNodeLocked(scene, scene.root)) return false;

  const prevCentralId = winNode.central && winNode.central !== nodeId ? winNode.central : undefined;
  const prevStatusId = winNode.statusBar && winNode.statusBar !== nodeId ? winNode.statusBar : undefined;
  if (role === "central" && prevCentralId && isSceneNodeLocked(scene, prevCentralId)) return false;
  if (role === "statusBar" && prevStatusId && isSceneNodeLocked(scene, prevStatusId)) return false;

  const oldParentId = parentOfNode(scene, nodeId);
  if (oldParentId && oldParentId !== scene.root) {
    if (isSceneNodeLocked(scene, oldParentId)) return false;
    const oldParent = scene.nodes[oldParentId];
    if (oldParent?.children) oldParent.children = oldParent.children.filter((cid) => cid !== nodeId);
  }

  if (winNode.docks) winNode.docks = winNode.docks.filter((did) => did !== nodeId);
  if (winNode.central === nodeId) delete winNode.central;
  if (winNode.statusBar === nodeId) delete winNode.statusBar;
  if (winNode.children) winNode.children = winNode.children.filter((cid) => cid !== nodeId);

  if (role === "dock") {
    return setDockPanelArea(scene, nodeId, dockArea);
  }

  const stripDockMeta = () => {
    delete n.dockArea;
    delete n.headerHeight;
    if (n.type === "Dock") {
      n.type = n.layout ? LAYOUT_KIND_TO_TYPE[n.layout.kind] : "Container";
    }
    clearMenuDockReference(scene, nodeId);
  };

  if (role === "central") {
    if (prevCentralId && scene.nodes[prevCentralId]) {
      winNode.children ??= [];
      if (!winNode.children.includes(prevCentralId)) winNode.children.push(prevCentralId);
    }
    delete n.x;
    delete n.y;
    stripDockMeta();
    winNode.central = nodeId;
    return true;
  }
  if (role === "statusBar") {
    if (prevStatusId && scene.nodes[prevStatusId]) {
      winNode.children ??= [];
      if (!winNode.children.includes(prevStatusId)) winNode.children.push(prevStatusId);
    }
    delete n.x;
    delete n.y;
    stripDockMeta();
    winNode.statusBar = nodeId;
    return true;
  }

  stripDockMeta();
  winNode.children ??= [];
  if (!winNode.children.includes(nodeId)) winNode.children.push(nodeId);
  return true;
}

/**
 * 修改控件的基础尺寸/标题（width / height / title）及静态 props 属性。
 */
export function updateNodePropsAndMeta(
  scene: Scene,
  nodeId: string,
  meta: { width?: number; height?: number; title?: string | null },
  propsPatch?: Record<string, Value | undefined>,
): boolean {
  const n = scene.nodes[nodeId];
  if (!n) return false;
  if (isSceneNodeLocked(scene, nodeId) || (nodeId === scene.root && n.locked)) return false;

  if (meta.width !== undefined && Number.isFinite(meta.width)) {
    const rawW = Math.max(8, Math.round(meta.width));
    if (n.size?.fixedWidth !== undefined) n.size.fixedWidth = rawW;
    if (n.size?.preferredWidth !== undefined) n.size.preferredWidth = rawW;
    n.width = clampWidth(n, rawW);
  }
  if (meta.height !== undefined && Number.isFinite(meta.height)) {
    const rawH = Math.max(8, Math.round(meta.height));
    if (n.size?.fixedHeight !== undefined) n.size.fixedHeight = rawH;
    if (n.size?.preferredHeight !== undefined) n.size.preferredHeight = rawH;
    n.height = clampHeight(n, rawH);
  }
  if (meta.title !== undefined) {
    if (meta.title) n.title = meta.title;
    else delete n.title;
  }
  if (propsPatch) {
    n.props = { ...(n.props ?? {}) };
    for (const [k, v] of Object.entries(propsPatch)) {
      if (v === undefined) delete n.props[k];
      else n.props[k] = v;
    }
    if (Object.keys(n.props).length === 0) delete n.props;
  }
  return true;
}

// ---------- 界面挂载与画布交互 ----------

export interface LayoutEditDeps {
  getProject: () => Project;
  getMode: () => "edit" | "preview";
  getSelectedId: () => string | null;
  selectNode: (id: string | null) => void;
  saveScene: (options?: { history?: boolean; nextLogicText?: string; label?: string }) => Promise<void>;
  editLogic: (mutate: (doc: Document) => void, label?: string) => Promise<boolean>;
  newNodeId: (type: string, idBase?: string) => string;
  containerAtPoint: (px: number, py: number, excludeId?: string) => string;
  currentBoxes: () => Map<string, ComputedBox>;
  stagePoint: (e: MouseEvent) => { x: number; y: number };
  overlay: HTMLElement;
  toast: (msg: string) => void;
  activateRightTab: (tabId: string) => void;
}

let deps: LayoutEditDeps | null = null;
let indicatorEl: HTMLElement | null = null;
let indicatorLabelEl: HTMLElement | null = null;

interface ActiveLayoutDrag {
  nodeId: string;
  isDock: boolean;
  startClient: { x: number; y: number };
  moved: boolean;
  dockTarget: DockDropTarget | null;
  layoutTarget: LayoutDropTarget | null;
}
let activeDrag: ActiveLayoutDrag | null = null;

function ensureIndicator(): HTMLElement {
  if (!indicatorEl && deps) {
    indicatorEl = document.createElement("div");
    indicatorEl.id = "layout-drop-indicator";
    indicatorEl.style.display = "none";
    indicatorLabelEl = document.createElement("div");
    indicatorLabelEl.className = "layout-drop-label";
    indicatorEl.append(indicatorLabelEl);
    deps.overlay.append(indicatorEl);
  }
  return indicatorEl!;
}

export function hideLayoutDropIndicator(): void {
  if (indicatorEl) {
    indicatorEl.style.display = "none";
    indicatorEl.className = "";
  }
}

function showDockIndicator(target: DockDropTarget): void {
  const el = ensureIndicator();
  const areaNames: Record<DockArea, string> = { left: "左侧停靠区", right: "右侧停靠区", top: "顶部停靠区", bottom: "底部停靠区" };
  el.className = "dock-zone";
  Object.assign(el.style, {
    display: "block",
    left: `${target.indicator.x}px`,
    top: `${target.indicator.y}px`,
    width: `${target.indicator.width}px`,
    height: `${target.indicator.height}px`,
  });
  if (indicatorLabelEl) {
    indicatorLabelEl.textContent = `${areaNames[target.dockArea]} (#${target.insertIndex + 1})`;
  }
}

function showLayoutIndicator(target: LayoutDropTarget): void {
  const el = ensureIndicator();
  el.className = target.indicator.isLine ? "layout-line" : "layout-cell";
  Object.assign(el.style, {
    display: "block",
    left: `${target.indicator.x}px`,
    top: `${target.indicator.y}px`,
    width: `${target.indicator.width}px`,
    height: `${target.indicator.height}px`,
  });
  if (indicatorLabelEl) {
    const cellInfo = target.kind === "grid" ? ` [${target.row ?? 0}, ${target.column ?? 0}]` : ` #${target.insertIndex + 1}`;
    indicatorLabelEl.textContent = `放入 ${target.containerId}${cellInfo}`;
  }
}

/** 从左侧素材栏拖拽控件悬停在设计窗口上方时，实时显示布局插入线或停靠区预览。 */
export function previewPaletteDropOnStage(type: string, px: number, py: number): void {
  if (!deps || deps.getMode() !== "edit") return;
  const project = deps.getProject();
  const boxes = deps.currentBoxes();
  const hoveredContainerId = deps.containerAtPoint(px, py);
  if (isSceneNodeLocked(project.scene, hoveredContainerId)) {
    hideLayoutDropIndicator();
    return;
  }
  if (type === "Dock") {
    if (isSceneNodeLocked(project.scene, project.scene.root)) {
      hideLayoutDropIndicator();
      return;
    }
    const dockTarget = computeDockDropTarget(project.scene, { x: px, y: py }, boxes);
    if (dockTarget) showDockIndicator(dockTarget);
    else hideLayoutDropIndicator();
    return;
  }
  const container = project.scene.nodes[hoveredContainerId];
  if (container && layoutOf(container) !== null) {
    const target = computeLayoutDropTarget(project.scene, hoveredContainerId, { x: px, y: py }, boxes);
    if (target) {
      showLayoutIndicator(target);
      return;
    }
  }
  hideLayoutDropIndicator();
}

/** 从素材栏拖放控件到设计窗口 `(px, py)` 时执行放置并写入历史。 */
export async function commitPaletteDropOnStage(type: string, px: number, py: number): Promise<string | null> {
  hideLayoutDropIndicator();
  if (!deps || deps.getMode() !== "edit") return null;
  const project = deps.getProject();
  const decl = declFor(project, type) ?? CONTAINER_DECL;
  const size = decl.defaultSize ?? CONTAINER_DECL.defaultSize!;
  const hoveredContainerId = deps.containerAtPoint(px, py);
  const targetContainerId = type === "Dock" ? project.scene.root : hoveredContainerId;
  if (isSceneNodeLocked(project.scene, hoveredContainerId) || isSceneNodeLocked(project.scene, targetContainerId)) {
    deps.toast("目标容器已锁定，无法放入控件");
    return null;
  }
  const id = deps.newNodeId(type);
  const boxes = deps.currentBoxes();
  const ok = placeNewNodeInScene(project.scene, type, id, px, py, size, {
    canHaveChildren: Boolean(decl.children),
    targetContainerId,
    boxes,
  });
  if (!ok) return null;
  deps.selectNode(id);
  await deps.saveScene({ label: `添加控件 ${id}` });
  return id;
}

/**
 * 在画布上按下已被自动排版或作为停靠面板的单个控件时，启动布局重排/停靠区拖拽。
 */
export function tryStartLayoutCanvasDrag(nodeId: string, e: PointerEvent): boolean {
  if (!deps || deps.getMode() !== "edit") return false;
  const project = deps.getProject();
  const n = project.scene.nodes[nodeId];
  if (!n || nodeId === project.scene.root || n.type === "Line") return false;
  if (isSceneNodeLocked(project.scene, nodeId)) return false;
  const parentId = parentOfNode(project.scene, nodeId);
  if (parentId && isSceneNodeLocked(project.scene, parentId)) return false;

  const isDock = n.type === "Dock";
  const isLayoutItem = isLayoutPositionedNode(project.scene, nodeId);
  if (!isDock && !isLayoutItem) return false;

  activeDrag = {
    nodeId,
    isDock,
    startClient: { x: e.clientX, y: e.clientY },
    moved: false,
    dockTarget: null,
    layoutTarget: null,
  };

  const onMove = (ev: PointerEvent) => {
    if (!activeDrag || !deps) return;
    if (Math.hypot(ev.clientX - activeDrag.startClient.x, ev.clientY - activeDrag.startClient.y) > 4) {
      activeDrag.moved = true;
    }
    if (!activeDrag.moved) return;
    const pt = deps.stagePoint(ev);
    const boxes = deps.currentBoxes();
    if (activeDrag.isDock) {
      const dockTarget = computeDockDropTarget(project.scene, pt, boxes, activeDrag.nodeId);
      activeDrag.dockTarget = dockTarget;
      activeDrag.layoutTarget = null;
      if (dockTarget) showDockIndicator(dockTarget);
      else hideLayoutDropIndicator();
    } else {
      const targetContainerId = deps.containerAtPoint(pt.x, pt.y, activeDrag.nodeId);
      const targetContainer = project.scene.nodes[targetContainerId];
      if (targetContainer && layoutOf(targetContainer) !== null && !isSceneNodeLocked(project.scene, targetContainerId)) {
        const lTarget = computeLayoutDropTarget(project.scene, targetContainerId, pt, boxes, activeDrag.nodeId);
        activeDrag.layoutTarget = lTarget;
        activeDrag.dockTarget = null;
        if (lTarget) showLayoutIndicator(lTarget);
        else hideLayoutDropIndicator();
      } else {
        activeDrag.layoutTarget = null;
        hideLayoutDropIndicator();
      }
    }
  };

  const onUp = () => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    const finished = activeDrag;
    activeDrag = null;
    hideLayoutDropIndicator();
    if (!finished || !finished.moved || !deps) return;
    const proj = deps.getProject();
    if (finished.isDock && finished.dockTarget) {
      const changed = setDockPanelArea(
        proj.scene,
        finished.nodeId,
        finished.dockTarget.dockArea,
        finished.dockTarget.insertIndex,
      );
      if (changed) void deps.saveScene({ label: "调整停靠面板位置" });
    } else if (!finished.isDock && finished.layoutTarget) {
      const changed = insertOrMoveNodeInLayout(
        proj.scene,
        finished.nodeId,
        finished.layoutTarget.containerId,
        finished.layoutTarget.insertIndex,
        finished.layoutTarget.kind === "grid"
          ? { row: finished.layoutTarget.row, column: finished.layoutTarget.column }
          : undefined,
      );
      if (changed) void deps.saveScene({ label: "调整布局顺序" });
    }
  };

  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
  return true;
}

/**
 * 当用户在画布上拖动一个自由定位控件（move 手势）并在某个未锁定的布局容器内松开鼠标时，
 * 自动将其移入该布局容器对应的插槽中。
 */
export function tryDropFreeNodeIntoLayoutContainer(nodeId: string, pt: { x: number; y: number }): boolean {
  if (!deps || deps.getMode() !== "edit") return false;
  const project = deps.getProject();
  if (isSceneNodeLocked(project.scene, nodeId)) return false;
  const targetContainerId = deps.containerAtPoint(pt.x, pt.y, nodeId);
  const currentParentId = parentOfNode(project.scene, nodeId);
  if (!targetContainerId || targetContainerId === currentParentId) return false;
  const container = project.scene.nodes[targetContainerId];
  if (!container || layoutOf(container) === null || isSceneNodeLocked(project.scene, targetContainerId)) return false;
  const boxes = deps.currentBoxes();
  const drop = computeLayoutDropTarget(project.scene, targetContainerId, pt, boxes, nodeId);
  if (!drop) return false;
  return insertOrMoveNodeInLayout(
    project.scene,
    nodeId,
    targetContainerId,
    drop.insertIndex,
    drop.kind === "grid" ? { row: drop.row, column: drop.column } : undefined,
  );
}

// ---------- 右侧“布局”页签界面 ----------

export function initLayoutEdit(options: LayoutEditDeps): void {
  deps = options;
  const right = document.getElementById("right");
  const tabs = right?.querySelector(".tabs") ?? document.getElementById("tabs");
  if (!tabs || !right) return;

  if (!document.getElementById("tab-layout")) {
    const tabBtn = document.createElement("button");
    tabBtn.id = "tab-layout";
    tabBtn.type = "button";
    tabBtn.setAttribute("role", "tab");
    tabBtn.setAttribute("aria-selected", "false");
    tabBtn.textContent = "布局";
    tabBtn.title = "编辑容器排版、子控件顺序与伸缩、尺寸规则、停靠面板与控件属性";
    const tabDoc = document.getElementById("tab-doc");
    if (tabDoc) tabs.insertBefore(tabBtn, tabDoc);
    else tabs.prepend(tabBtn);
    tabBtn.addEventListener("click", () => deps?.activateRightTab("layout"));
  }

  if (!document.getElementById("pane-layout")) {
    const pane = document.createElement("div");
    pane.id = "pane-layout";
    pane.className = "pane vf-custom-pane";
    pane.hidden = true;
    right.append(pane);
  }
}

export function renderLayoutEditPane(): void {
  if (!deps) return;
  const pane = document.getElementById("pane-layout");
  if (!pane) return;
  const activeEl = document.activeElement;
  if (activeEl && pane.contains(activeEl) && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")) {
    // 避免用户正在输入时重绘打断光标（change/blur 后会重新触发）
  }

  const project = deps.getProject();
  const scene = project.scene;
  const selectedId = deps.getSelectedId() ?? scene.root;
  const n = scene.nodes[selectedId];
  pane.replaceChildren();

  if (!n) {
    const empty = document.createElement("div");
    empty.className = "vf-pane-empty";
    empty.textContent = "未找到控件";
    pane.append(empty);
    return;
  }

  const isRoot = selectedId === scene.root;
  const locked = isRoot ? Boolean(n.locked) : isSceneNodeLocked(scene, selectedId);
  const parentId = isRoot ? null : parentOfNode(scene, selectedId);
  const parentNode = parentId ? scene.nodes[parentId] : undefined;
  const parentLocked = parentId ? isSceneNodeLocked(scene, parentId) : false;

  // 顶部提示与锁定横幅
  const headBar = document.createElement("div");
  headBar.className = "vf-sec-banner";
  headBar.innerHTML = `<span>当前对象：<strong>${selectedId}</strong>（${n.type}）</span>`;
  if (!isRoot) {
    const selectRootBtn = document.createElement("button");
    selectRootBtn.type = "button";
    selectRootBtn.className = "vf-mini-btn";
    selectRootBtn.dataset.layoutAction = "select-root";
    selectRootBtn.textContent = "选中主窗口";
    selectRootBtn.addEventListener("click", () => deps?.selectNode(null));
    headBar.append(selectRootBtn);
  }
  pane.append(headBar);

  if (locked) {
    const lockWarn = document.createElement("div");
    lockWarn.className = "vf-lock-banner";
    lockWarn.dataset.layoutLocked = "true";
    lockWarn.textContent = "🔒 当前控件（或其父容器）已锁定，解锁后才能修改布局、尺寸或属性。";
    pane.append(lockWarn);
  }

  // 1. 基本尺寸、标题与所在父容器
  const basicSec = createSection("基本尺寸与归属");
  const sizeGrid = document.createElement("div");
  sizeGrid.className = "vf-form-grid";

  sizeGrid.append(
    makeNumberField("宽度 (W)", n.width, {
      attr: ["data-layout-field", "width"],
      disabled: locked,
      min: 8,
      onChange: (val) => {
        if (updateNodePropsAndMeta(scene, selectedId, { width: val })) {
          void deps?.saveScene({ label: `修改 ${selectedId} 宽度` });
        }
      },
    }),
    makeNumberField("高度 (H)", n.height, {
      attr: ["data-layout-field", "height"],
      disabled: locked,
      min: 8,
      onChange: (val) => {
        if (updateNodePropsAndMeta(scene, selectedId, { height: val })) {
          void deps?.saveScene({ label: `修改 ${selectedId} 高度` });
        }
      },
    }),
  );

  if (n.type === "Window" || n.type === "Dialog" || n.type === "Dock") {
    sizeGrid.append(
      makeTextField("标题 (title)", n.title ?? "", {
        attr: ["data-layout-field", "title"],
        disabled: locked,
        placeholder: selectedId,
        fullWidth: true,
        onChange: (val) => {
          if (updateNodePropsAndMeta(scene, selectedId, { title: val })) {
            void deps?.saveScene({ label: `修改 ${selectedId} 标题` });
          }
        },
      }),
    );
  }
  basicSec.append(sizeGrid);

  // 父容器切换与在父容器中的顺序
  if (!isRoot) {
    const parentRow = document.createElement("div");
    parentRow.className = "vf-row-between";
    const pLabel = document.createElement("label");
    pLabel.className = "vf-field-label";
    pLabel.textContent = "所在父容器";
    const pSelect = document.createElement("select");
    pSelect.className = "vf-select";
    pSelect.dataset.layoutField = "parentId";
    pSelect.disabled = locked || parentLocked;

    for (const [cid, cNode] of Object.entries(scene.nodes)) {
      if (cid === selectedId || !canNodeHoldChildren(project, cNode)) continue;
      let isDesc = false;
      for (let p: string | null = cid; p; p = parentOfNode(scene, p)) {
        if (p === selectedId) {
          isDesc = true;
          break;
        }
      }
      if (isDesc) continue;
      const opt = document.createElement("option");
      opt.value = cid;
      opt.textContent = `${cid} (${cNode.type})`;
      opt.selected = cid === parentId;
      pSelect.append(opt);
    }
    pSelect.addEventListener("change", () => {
      const targetId = pSelect.value;
      if (n.type === "Dock" && targetId === scene.root) {
        if (setDockPanelArea(scene, selectedId, n.dockArea ?? "left")) {
          void deps?.saveScene({ label: `移入停靠面板 ${selectedId}` });
        }
      } else if (insertOrMoveNodeInLayout(scene, selectedId, targetId)) {
        void deps?.saveScene({ label: `移动 ${selectedId} 到 ${targetId}` });
      } else {
        deps?.toast("目标容器或当前控件已锁定");
        renderLayoutEditPane();
      }
    });

    const orderBtns = document.createElement("div");
    orderBtns.className = "vf-btn-group";
    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "vf-mini-btn";
    upBtn.dataset.layoutAction = "move-prev";
    upBtn.textContent = "↑ 上移";
    upBtn.disabled = locked || parentLocked;
    upBtn.addEventListener("click", () => {
      if (reorderChildInLayout(scene, selectedId, -1, true)) {
        void deps?.saveScene({ label: `上移 ${selectedId}` });
      }
    });
    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.className = "vf-mini-btn";
    downBtn.dataset.layoutAction = "move-next";
    downBtn.textContent = "↓ 下移";
    downBtn.disabled = locked || parentLocked;
    downBtn.addEventListener("click", () => {
      if (reorderChildInLayout(scene, selectedId, 1, true)) {
        void deps?.saveScene({ label: `下移 ${selectedId}` });
      }
    });
    orderBtns.append(upBtn, downBtn);
    parentRow.append(pLabel, pSelect, orderBtns);
    basicSec.append(parentRow);
  }
  pane.append(basicSec);

  // 2. 停靠面板与主窗口分区配置
  const rootWin = scene.nodes[scene.root];
  if (!isRoot && (parentId === scene.root || n.type === "Dock")) {
    const dockSec = createSection("主窗口分区与停靠面板");
    const currentRole: "none" | "dock" | "central" | "statusBar" =
      rootWin?.docks?.includes(selectedId) || n.type === "Dock"
        ? "dock"
        : rootWin?.central === selectedId
          ? "central"
          : rootWin?.statusBar === selectedId
            ? "statusBar"
            : "none";

    const roleBar = document.createElement("div");
    roleBar.className = "vf-seg-bar";
    for (const [roleVal, roleLabel] of [
      ["none", "普通子控件"],
      ["dock", "停靠面板 (Dock)"],
      ["central", "中央区 (central)"],
      ["statusBar", "状态栏 (statusBar)"],
    ] as const) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vf-seg-btn" + (currentRole === roleVal ? " active" : "");
      btn.dataset.partitionRole = roleVal;
      btn.disabled = locked || isSceneNodeLocked(scene, scene.root);
      btn.textContent = roleLabel;
      btn.addEventListener("click", () => {
        if (setWindowPartitionRole(scene, selectedId, roleVal, n.dockArea ?? "left")) {
          void deps?.saveScene({ label: `设置 ${selectedId} 窗口分区为 ${roleLabel}` });
        }
      });
      roleBar.append(btn);
    }
    dockSec.append(roleBar);

    if (n.type === "Dock" || currentRole === "dock") {
      const areaRow = document.createElement("div");
      areaRow.className = "vf-row-between";
      const areaLabel = document.createElement("span");
      areaLabel.className = "vf-field-label";
      areaLabel.textContent = "停靠侧 (dockArea)";
      const areaBtns = document.createElement("div");
      areaBtns.className = "vf-seg-bar";
      const curArea: DockArea = n.dockArea ?? "left";
      for (const [areaVal, areaText] of [
        ["left", "左侧 (left)"],
        ["right", "右侧 (right)"],
        ["top", "顶部 (top)"],
        ["bottom", "底部 (bottom)"],
      ] as const) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "vf-seg-btn" + (curArea === areaVal ? " active" : "");
        b.dataset.dockArea = areaVal;
        b.disabled = locked || isSceneNodeLocked(scene, scene.root);
        b.textContent = areaText;
        b.addEventListener("click", () => {
          if (setDockPanelArea(scene, selectedId, areaVal)) {
            void deps?.saveScene({ label: `设置停靠面板 ${selectedId} 位置为 ${areaText}` });
          }
        });
        areaBtns.append(b);
      }
      areaRow.append(areaLabel, areaBtns);
      dockSec.append(areaRow);

      const dockMetaGrid = document.createElement("div");
      dockMetaGrid.className = "vf-form-grid";
      dockMetaGrid.append(
        makeNumberField("标题栏高度", n.headerHeight ?? 26, {
          attr: ["data-layout-field", "headerHeight"],
          disabled: locked,
          min: 18,
          onChange: (val) => {
            if (setDockPanelArea(scene, selectedId, n.dockArea ?? "left", undefined, { headerHeight: val })) {
              void deps?.saveScene({ label: `修改停靠面板 ${selectedId} 标题栏高度` });
            }
          },
        }),
      );
      dockSec.append(dockMetaGrid);
    }
    pane.append(dockSec);
  } else if (isRoot && rootWin) {
    // 选中根窗口时，展示主窗口的停靠面板列表与中央区/状态栏概览
    const winPartSec = createSection("主窗口分区概览");
    const info = document.createElement("div");
    info.className = "vf-muted-note";
    const dockList = rootWin.docks ?? [];
    info.textContent = `停靠面板：${dockList.length ? dockList.join("、") : "无"}　|　中央区：${rootWin.central ?? "无"}　|　状态栏：${rootWin.statusBar ?? "无"}`;
    winPartSec.append(info);
    pane.append(winPartSec);
  }

  // 3. 容器排版设置（当节点能包含子节点时显示）
  if (canNodeHoldChildren(project, n)) {
    const layoutSec = createSection("容器自动排版 (Layout)");
    const curLayout = layoutOf(n);
    const curKind: LayoutKind | "none" = curLayout ? curLayout.kind : "none";

    const kindBar = document.createElement("div");
    kindBar.className = "vf-seg-bar";
    for (const [kVal, kLabel] of [
      ["none", "自由定位"],
      ["vbox", "竖排 VBox"],
      ["hbox", "横排 HBox"],
      ["grid", "网格 Grid"],
      ["form", "表单 Form"],
      ["stack", "层叠 Stack"],
    ] as const) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vf-seg-btn" + (curKind === kVal ? " active" : "");
      btn.dataset.layoutKind = kVal;
      btn.disabled = locked;
      btn.textContent = kLabel;
      btn.addEventListener("click", () => {
        if (kVal === "none") {
          if (updateContainerLayoutSpec(scene, selectedId, null, true)) {
            void deps?.saveScene({ label: `切换 ${selectedId} 为自由定位` });
          }
        } else {
          const nextSpec: LayoutSpec = {
            ...(curLayout ?? {}),
            kind: kVal,
            padding: curLayout?.padding ?? (n.type === "Dock" ? 10 : 0),
            gap: curLayout?.gap ?? 8,
          };
          if (updateContainerLayoutSpec(scene, selectedId, nextSpec, n.type === "Container" || n.type in LAYOUT_TYPE_KINDS)) {
            void deps?.saveScene({ label: `设置 ${selectedId} 排版为 ${kLabel}` });
          }
        }
      });
      kindBar.append(btn);
    }
    layoutSec.append(kindBar);

    if (curLayout) {
      const specGrid = document.createElement("div");
      specGrid.className = "vf-form-grid";
      const padStr = Array.isArray(curLayout.padding)
        ? curLayout.padding.join(",")
        : String(curLayout.padding ?? 0);

      specGrid.append(
        makeTextField("内边距 (padding)", padStr, {
          attr: ["data-layout-spec", "padding"],
          disabled: locked,
          placeholder: "如 10 或 8,10,8,10",
          onChange: (raw) => {
            const parts = raw.split(",").map((s) => Number(s.trim()));
            const padding: number | [number, number, number, number] =
              parts.length === 4 && parts.every((x) => Number.isFinite(x))
                ? [Math.round(parts[0]), Math.round(parts[1]), Math.round(parts[2]), Math.round(parts[3])]
                : Math.max(0, Math.round(Number(raw) || 0));
            if (updateContainerLayoutSpec(scene, selectedId, { ...curLayout, padding })) {
              void deps?.saveScene({ label: `修改 ${selectedId} 内边距` });
            }
          },
        }),
        makeNumberField("间距 (gap)", curLayout.gap ?? 0, {
          attr: ["data-layout-spec", "gap"],
          disabled: locked,
          min: 0,
          onChange: (val) => {
            if (updateContainerLayoutSpec(scene, selectedId, { ...curLayout, gap: val })) {
              void deps?.saveScene({ label: `修改 ${selectedId} 间距` });
            }
          },
        }),
      );

      if (curLayout.kind === "grid" || curLayout.kind === "form") {
        specGrid.append(
          makeNumberField("行间距 (rowGap)", curLayout.rowGap ?? curLayout.gap ?? 0, {
            attr: ["data-layout-spec", "rowGap"],
            disabled: locked,
            min: 0,
            onChange: (val) => {
              if (updateContainerLayoutSpec(scene, selectedId, { ...curLayout, rowGap: val })) {
                void deps?.saveScene({ label: `修改 ${selectedId} 行间距` });
              }
            },
          }),
          makeNumberField("列间距 (columnGap)", curLayout.columnGap ?? curLayout.gap ?? 0, {
            attr: ["data-layout-spec", "columnGap"],
            disabled: locked,
            min: 0,
            onChange: (val) => {
              if (updateContainerLayoutSpec(scene, selectedId, { ...curLayout, columnGap: val })) {
                void deps?.saveScene({ label: `修改 ${selectedId} 列间距` });
              }
            },
          }),
        );
      }

      if (curLayout.kind === "grid") {
        specGrid.append(
          makeNumberField("列数 (columns)", curLayout.columns ?? 2, {
            attr: ["data-layout-spec", "columns"],
            disabled: locked,
            min: 1,
            onChange: (val) => {
              if (updateContainerLayoutSpec(scene, selectedId, { ...curLayout, columns: val })) {
                void deps?.saveScene({ label: `修改 ${selectedId} 网格列数` });
              }
            },
          }),
          makeTextField("列伸缩 (columnStretch)", (curLayout.columnStretch ?? []).join(","), {
            attr: ["data-layout-spec", "columnStretch"],
            disabled: locked,
            placeholder: "如 1,2",
            onChange: (raw) => {
              const arr = raw
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
                .map((s) => Math.max(0, Math.round(Number(s) || 0)));
              const next = { ...curLayout };
              if (arr.length > 0) next.columnStretch = arr;
              else delete next.columnStretch;
              if (updateContainerLayoutSpec(scene, selectedId, next)) {
                void deps?.saveScene({ label: `修改 ${selectedId} 列伸缩` });
              }
            },
          }),
          makeTextField("行伸缩 (rowStretch)", (curLayout.rowStretch ?? []).join(","), {
            attr: ["data-layout-spec", "rowStretch"],
            disabled: locked,
            placeholder: "如 0,1",
            onChange: (raw) => {
              const arr = raw
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
                .map((s) => Math.max(0, Math.round(Number(s) || 0)));
              const next = { ...curLayout };
              if (arr.length > 0) next.rowStretch = arr;
              else delete next.rowStretch;
              if (updateContainerLayoutSpec(scene, selectedId, next)) {
                void deps?.saveScene({ label: `修改 ${selectedId} 行伸缩` });
              }
            },
          }),
        );
      }

      if (curLayout.kind === "form") {
        specGrid.append(
          makeNumberField("标签列宽 (labelWidth)", curLayout.labelWidth ?? 96, {
            attr: ["data-layout-spec", "labelWidth"],
            disabled: locked,
            min: 20,
            onChange: (val) => {
              if (updateContainerLayoutSpec(scene, selectedId, { ...curLayout, labelWidth: val })) {
                void deps?.saveScene({ label: `修改 ${selectedId} 标签列宽` });
              }
            },
          }),
        );
      }

      if (curLayout.kind === "stack") {
        specGrid.append(
          makeNumberField("当前页下标 (currentIndex)", Number(n.props?.currentIndex ?? 0), {
            attr: ["data-layout-spec", "currentIndex"],
            disabled: locked,
            min: 0,
            onChange: (val) => {
              if (updateNodePropsAndMeta(scene, selectedId, {}, { currentIndex: Math.max(0, Math.round(val)) })) {
                void deps?.saveScene({ label: `切换 ${selectedId} 当前页` });
              }
            },
          }),
        );
      }

      layoutSec.append(specGrid);
    }

    // 子控件顺序与伸缩列表
    const children = childrenOfNode(n).filter((cid) => Boolean(scene.nodes[cid]));
    const childListWrap = document.createElement("div");
    childListWrap.className = "vf-child-list";
    childListWrap.dataset.layoutChildren = selectedId;

    const childHeader = document.createElement("div");
    childHeader.className = "vf-sub-header";
    childHeader.textContent = `子控件顺序与伸缩（共 ${children.length} 项）`;
    childListWrap.append(childHeader);

    if (children.length === 0) {
      const emptyNote = document.createElement("div");
      emptyNote.className = "vf-muted-note";
      emptyNote.textContent = "从左侧素材栏拖拽控件到此容器内即可放入。";
      childListWrap.append(emptyNote);
    } else {
      children.forEach((cid, idx) => {
        const cNode = scene.nodes[cid]!;
        const cLocked = isSceneNodeLocked(scene, cid);
        const row = document.createElement("div");
        row.className = "vf-child-row";
        row.dataset.childRow = cid;

        const nameBtn = document.createElement("button");
        nameBtn.type = "button";
        nameBtn.className = "vf-child-name";
        nameBtn.dataset.childSelect = cid;
        nameBtn.textContent = `${idx + 1}. ${cid} (${cNode.type})`;
        nameBtn.addEventListener("click", () => deps?.selectNode(cid));

        const stretchWrap = document.createElement("label");
        stretchWrap.className = "vf-child-stretch";
        stretchWrap.title = "主轴伸缩因子 (stretch)";
        stretchWrap.textContent = "伸缩";
        const stretchInput = document.createElement("input");
        stretchInput.type = "number";
        stretchInput.min = "0";
        stretchInput.step = "1";
        stretchInput.dataset.childStretch = cid;
        stretchInput.value = String(cNode.size?.stretch ?? 0);
        stretchInput.disabled = locked || cLocked;
        stretchInput.addEventListener("change", () => {
          const val = Math.max(0, Math.round(Number(stretchInput.value) || 0));
          const autoAxis: Partial<SizePolicy> = {};
          if (val > 0 && curLayout?.kind === "vbox" && !cNode.size?.vertical) autoAxis.vertical = "expanding";
          if (val > 0 && curLayout?.kind === "hbox" && !cNode.size?.horizontal) autoAxis.horizontal = "expanding";
          if (updateNodeSizePolicy(scene, cid, { stretch: val, ...autoAxis })) {
            void deps?.saveScene({ label: `修改 ${cid} 伸缩因子` });
          }
        });
        stretchWrap.append(stretchInput);

        const upBtn = document.createElement("button");
        upBtn.type = "button";
        upBtn.className = "vf-mini-btn";
        upBtn.dataset.childUp = cid;
        upBtn.disabled = locked || cLocked || idx === 0;
        upBtn.textContent = "↑";
        upBtn.title = "上移";
        upBtn.addEventListener("click", () => {
          if (reorderChildInLayout(scene, cid, -1, true)) {
            void deps?.saveScene({ label: `上移 ${cid}` });
          }
        });

        const downBtn = document.createElement("button");
        downBtn.type = "button";
        downBtn.className = "vf-mini-btn";
        downBtn.dataset.childDown = cid;
        downBtn.disabled = locked || cLocked || idx === children.length - 1;
        downBtn.textContent = "↓";
        downBtn.title = "下移";
        downBtn.addEventListener("click", () => {
          if (reorderChildInLayout(scene, cid, 1, true)) {
            void deps?.saveScene({ label: `下移 ${cid}` });
          }
        });

        row.append(nameBtn, stretchWrap, upBtn, downBtn);
        childListWrap.append(row);
      });
    }
    layoutSec.append(childListWrap);
    pane.append(layoutSec);
  }

  // 4. 尺寸规则（SizePolicy，非根窗口节点）
  if (!isRoot) {
    const sizeSec = createSection("尺寸规则 (SizePolicy)");
    const sz = n.size ?? {};

    // 主轴伸缩快捷按钮 + 数值框
    const stretchRow = document.createElement("div");
    stretchRow.className = "vf-row-between";
    const stLabel = document.createElement("span");
    stLabel.className = "vf-field-label";
    stLabel.textContent = "主轴伸缩 (stretch)";
    const stGroup = document.createElement("div");
    stGroup.className = "vf-btn-group";
    for (const presetVal of [0, 1, 2]) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "vf-mini-btn" + ((sz.stretch ?? 0) === presetVal ? " active" : "");
      b.dataset.sizeStretch = String(presetVal);
      b.disabled = locked;
      b.textContent = presetVal === 0 ? "0 (固定)" : `${presetVal}x 伸缩`;
      b.addEventListener("click", () => {
        const pLayout = parentNode ? layoutOf(parentNode) : null;
        const extra: Partial<SizePolicy> = { stretch: presetVal };
        if (presetVal > 0 && pLayout?.kind === "vbox") extra.vertical = "expanding";
        if (presetVal > 0 && pLayout?.kind === "hbox") extra.horizontal = "expanding";
        if (updateNodeSizePolicy(scene, selectedId, extra)) {
          void deps?.saveScene({ label: `设置 ${selectedId} 伸缩为 ${presetVal}` });
        }
      });
      stGroup.append(b);
    }
    stretchRow.append(stLabel, stGroup);
    sizeSec.append(stretchRow);

    const policyGrid = document.createElement("div");
    policyGrid.className = "vf-form-grid";

    policyGrid.append(
      makeSelectField(
        "水平策略 (horizontal)",
        sz.horizontal ?? "",
        [
          ["", "默认 (preferred)"],
          ["preferred", "首选 (preferred)"],
          ["fixed", "固定 (fixed)"],
          ["expanding", "伸展 (expanding)"],
        ],
        {
          attr: ["data-size-field", "horizontal"],
          disabled: locked,
          onChange: (val) => {
            if (updateNodeSizePolicy(scene, selectedId, { horizontal: (val || undefined) as SizeMode | undefined })) {
              void deps?.saveScene({ label: `修改 ${selectedId} 水平尺寸策略` });
            }
          },
        },
      ),
      makeSelectField(
        "垂直策略 (vertical)",
        sz.vertical ?? "",
        [
          ["", "默认 (preferred)"],
          ["preferred", "首选 (preferred)"],
          ["fixed", "固定 (fixed)"],
          ["expanding", "伸展 (expanding)"],
        ],
        {
          attr: ["data-size-field", "vertical"],
          disabled: locked,
          onChange: (val) => {
            if (updateNodeSizePolicy(scene, selectedId, { vertical: (val || undefined) as SizeMode | undefined })) {
              void deps?.saveScene({ label: `修改 ${selectedId} 垂直尺寸策略` });
            }
          },
        },
      ),
      makeOptionalNumberField("主轴伸缩值 (stretch)", sz.stretch, {
        attr: ["data-size-field", "stretch"],
        disabled: locked,
        placeholder: "0",
        onChange: (val) => {
          if (updateNodeSizePolicy(scene, selectedId, { stretch: val })) {
            void deps?.saveScene({ label: `修改 ${selectedId} stretch` });
          }
        },
      }),
      makeOptionalNumberField("首选宽 (preferredWidth)", sz.preferredWidth, {
        attr: ["data-size-field", "preferredWidth"],
        disabled: locked,
        placeholder: String(n.width),
        onChange: (val) => {
          if (updateNodeSizePolicy(scene, selectedId, { preferredWidth: val })) {
            void deps?.saveScene({ label: `修改 ${selectedId} preferredWidth` });
          }
        },
      }),
      makeOptionalNumberField("首选高 (preferredHeight)", sz.preferredHeight, {
        attr: ["data-size-field", "preferredHeight"],
        disabled: locked,
        placeholder: String(n.height),
        onChange: (val) => {
          if (updateNodeSizePolicy(scene, selectedId, { preferredHeight: val })) {
            void deps?.saveScene({ label: `修改 ${selectedId} preferredHeight` });
          }
        },
      }),
      makeOptionalNumberField("最小宽 (minWidth)", sz.minWidth, {
        attr: ["data-size-field", "minWidth"],
        disabled: locked,
        placeholder: "无",
        onChange: (val) => {
          if (updateNodeSizePolicy(scene, selectedId, { minWidth: val })) {
            void deps?.saveScene({ label: `修改 ${selectedId} minWidth` });
          }
        },
      }),
      makeOptionalNumberField("最小高 (minHeight)", sz.minHeight, {
        attr: ["data-size-field", "minHeight"],
        disabled: locked,
        placeholder: "无",
        onChange: (val) => {
          if (updateNodeSizePolicy(scene, selectedId, { minHeight: val })) {
            void deps?.saveScene({ label: `修改 ${selectedId} minHeight` });
          }
        },
      }),
      makeOptionalNumberField("最大宽 (maxWidth)", sz.maxWidth, {
        attr: ["data-size-field", "maxWidth"],
        disabled: locked,
        placeholder: "无",
        onChange: (val) => {
          if (updateNodeSizePolicy(scene, selectedId, { maxWidth: val })) {
            void deps?.saveScene({ label: `修改 ${selectedId} maxWidth` });
          }
        },
      }),
      makeOptionalNumberField("最大高 (maxHeight)", sz.maxHeight, {
        attr: ["data-size-field", "maxHeight"],
        disabled: locked,
        placeholder: "无",
        onChange: (val) => {
          if (updateNodeSizePolicy(scene, selectedId, { maxHeight: val })) {
            void deps?.saveScene({ label: `修改 ${selectedId} maxHeight` });
          }
        },
      }),
      makeOptionalNumberField("固定宽 (fixedWidth)", sz.fixedWidth, {
        attr: ["data-size-field", "fixedWidth"],
        disabled: locked,
        placeholder: "无",
        onChange: (val) => {
          if (updateNodeSizePolicy(scene, selectedId, { fixedWidth: val })) {
            void deps?.saveScene({ label: `修改 ${selectedId} fixedWidth` });
          }
        },
      }),
      makeOptionalNumberField("固定高 (fixedHeight)", sz.fixedHeight, {
        attr: ["data-size-field", "fixedHeight"],
        disabled: locked,
        placeholder: "无",
        onChange: (val) => {
          if (updateNodeSizePolicy(scene, selectedId, { fixedHeight: val })) {
            void deps?.saveScene({ label: `修改 ${selectedId} fixedHeight` });
          }
        },
      }),
    );

    const pLayout = parentNode ? layoutOf(parentNode) : null;
    if (pLayout?.kind === "grid") {
      policyGrid.append(
        makeOptionalNumberField("网格行 (row)", n.row, {
          attr: ["data-grid-field", "row"],
          disabled: locked,
          placeholder: "自动",
          onChange: (val) => {
            if (updateNodeGridCell(scene, selectedId, { row: val })) {
              void deps?.saveScene({ label: `修改 ${selectedId} 网格行` });
            }
          },
        }),
        makeOptionalNumberField("网格列 (column)", n.column, {
          attr: ["data-grid-field", "column"],
          disabled: locked,
          placeholder: "自动",
          onChange: (val) => {
            if (updateNodeGridCell(scene, selectedId, { column: val })) {
              void deps?.saveScene({ label: `修改 ${selectedId} 网格列` });
            }
          },
        }),
        makeOptionalNumberField("跨行数 (rowSpan)", n.rowSpan, {
          attr: ["data-grid-field", "rowSpan"],
          disabled: locked,
          placeholder: "1",
          onChange: (val) => {
            if (updateNodeGridCell(scene, selectedId, { rowSpan: val })) {
              void deps?.saveScene({ label: `修改 ${selectedId} 跨行数` });
            }
          },
        }),
        makeOptionalNumberField("跨列数 (columnSpan)", n.columnSpan, {
          attr: ["data-grid-field", "columnSpan"],
          disabled: locked,
          placeholder: "1",
          onChange: (val) => {
            if (updateNodeGridCell(scene, selectedId, { columnSpan: val })) {
              void deps?.saveScene({ label: `修改 ${selectedId} 跨列数` });
            }
          },
        }),
      );
    }
    sizeSec.append(policyGrid);
    pane.append(sizeSec);
  }

  // 5. 控件静态属性（props）与逻辑绑定
  const decl = declFor(project, n.type);
  if (!isRoot && n.type !== "Shape" && n.type !== "Line") {
    const propSec = createSection("控件属性与逻辑绑定");
    const propGrid = document.createElement("div");
    propGrid.className = "vf-form-grid";

    const declProps = decl?.props ?? {};
    for (const [propKey, propDecl] of Object.entries(declProps)) {
      const curVal = n.props?.[propKey] ?? propDecl.default;
      if (propDecl.type === "boolean") {
        const wrap = document.createElement("label");
        wrap.className = "vf-check-field";
        const chk = document.createElement("input");
        chk.type = "checkbox";
        chk.dataset.nodeProp = propKey;
        chk.checked = Boolean(curVal);
        chk.disabled = locked;
        chk.addEventListener("change", () => {
          if (updateNodePropsAndMeta(scene, selectedId, {}, { [propKey]: chk.checked })) {
            void deps?.saveScene({ label: `修改 ${selectedId}.${propKey}` });
          }
        });
        wrap.append(chk, document.createTextNode(propKey));
        propGrid.append(wrap);
      } else if (propDecl.type === "number") {
        propGrid.append(
          makeNumberField(propKey, Number(curVal ?? 0), {
            attr: ["data-node-prop", propKey],
            disabled: locked,
            onChange: (val) => {
              if (updateNodePropsAndMeta(scene, selectedId, {}, { [propKey]: val })) {
                void deps?.saveScene({ label: `修改 ${selectedId}.${propKey}` });
              }
            },
          }),
        );
      } else if (propDecl.type === "array") {
        propGrid.append(
          makeTextField(`${propKey} (JSON)`, JSON.stringify(curVal ?? []), {
            attr: ["data-node-prop", propKey],
            disabled: locked,
            fullWidth: true,
            onChange: (raw) => {
              try {
                const parsed = JSON.parse(raw) as Value;
                if (Array.isArray(parsed) && updateNodePropsAndMeta(scene, selectedId, {}, { [propKey]: parsed })) {
                  void deps?.saveScene({ label: `修改 ${selectedId}.${propKey}` });
                }
              } catch {
                deps?.toast("请输入合法的 JSON 数组");
              }
            },
          }),
        );
      } else {
        propGrid.append(
          makeTextField(propKey, String(curVal ?? ""), {
            attr: ["data-node-prop", propKey],
            disabled: locked,
            onChange: (val) => {
              if (updateNodePropsAndMeta(scene, selectedId, {}, { [propKey]: val })) {
                void deps?.saveScene({ label: `修改 ${selectedId}.${propKey}` });
              }
            },
          }),
        );
      }
    }

    // 双向绑定 bind（若控件支持 bind）与动态逻辑属性 / click 事件
    const objLogic = project.logic.objects?.[selectedId];
    const clearFlowOnNode = (node: unknown) => {
      if (isMap(node)) {
        node.flow = false;
        for (const pair of node.items) clearFlowOnNode(pair.value);
      } else if (isSeq(node)) {
        node.flow = false;
        for (const item of node.items) clearFlowOnNode(item);
      }
    };
    const ensureObjMap = (doc: Document) => {
      if (isMap(doc.contents)) doc.contents.flow = false;
      if (!isMap(doc.get("objects"))) doc.set("objects", doc.createNode({}));
      const objs = doc.get("objects");
      if (isMap(objs)) objs.flow = false;
      if (!isMap(doc.getIn(["objects", selectedId]))) doc.setIn(["objects", selectedId], doc.createNode({}));
      const objNode = doc.getIn(["objects", selectedId]);
      if (isMap(objNode)) objNode.flow = false;
    };

    if (decl?.bind) {
      propGrid.append(
        makeTextField(`双向绑定状态 (bind -> ${decl.bind})`, objLogic?.bind ?? "", {
          attr: ["data-logic-bind", selectedId],
          disabled: locked,
          placeholder: "如 layers.selectedIndex",
          fullWidth: true,
          onChange: (val) => {
            if (locked) return;
            const targetPath = val.trim();
            if (targetPath) {
              const leaf = findStateLeaf(project.logic, targetPath);
              if (leaf && isBusinessState(leaf)) {
                deps?.toast(`状态“${targetPath}”归业务管，界面不能直接绑定写入`);
                renderLayoutEditPane();
                return;
              }
            }
            void deps?.editLogic((doc) => {
              ensureObjMap(doc);
              if (targetPath) doc.setIn(["objects", selectedId, "bind"], targetPath);
              else doc.deleteIn(["objects", selectedId, "bind"]);
            }, `设置 ${selectedId} 绑定状态`);
          },
        }),
      );
    }

    const logicPropKeys = ["enabled", "visible", ...Object.entries(declProps).filter(([, d]) => d.logic).map(([k]) => k)];
    for (const lpKey of logicPropKeys) {
      const curExpr = objLogic?.props?.[lpKey] !== undefined ? String(objLogic.props[lpKey]) : "";
      propGrid.append(
        makeTextField(`动态属性表达式 (${lpKey})`, curExpr, {
          attr: ["data-logic-prop", lpKey],
          disabled: locked,
          placeholder: `动态计算 ${lpKey}`,
          onChange: (val) => {
            if (locked) return;
            void deps?.editLogic((doc) => {
              ensureObjMap(doc);
              if (!isMap(doc.getIn(["objects", selectedId, "props"]))) {
                doc.setIn(["objects", selectedId, "props"], doc.createNode({}));
              }
              const propsNode = doc.getIn(["objects", selectedId, "props"]);
              if (isMap(propsNode)) propsNode.flow = false;
              if (val.trim()) doc.setIn(["objects", selectedId, "props", lpKey], val.trim());
              else doc.deleteIn(["objects", selectedId, "props", lpKey]);
            }, `设置 ${selectedId}.props.${lpKey} 表达式`);
          },
        }),
      );
    }

    const curClickSteps = objLogic?.events?.click ? JSON.stringify(objLogic.events.click) : "";
    propGrid.append(
      makeTextField("点击事件步骤 (events.click JSON)", curClickSteps, {
        attr: ["data-logic-click-steps", selectedId],
        disabled: locked,
        placeholder: '如 [{"emit":"layerToggleVisible"}]',
        fullWidth: true,
        onChange: (raw) => {
          if (locked) return;
          const trimmed = raw.trim();
          if (!trimmed) {
            void deps?.editLogic((doc) => {
              doc.deleteIn(["objects", selectedId, "events", "click"]);
            }, `清空 ${selectedId} 点击事件`);
            return;
          }
          try {
            const parsed = JSON.parse(trimmed);
            if (!Array.isArray(parsed)) {
              deps?.toast("点击事件步骤应为 JSON 数组");
              return;
            }
            void deps?.editLogic((doc) => {
              ensureObjMap(doc);
              if (!isMap(doc.getIn(["objects", selectedId, "events"]))) {
                doc.setIn(["objects", selectedId, "events"], doc.createNode({}));
              }
              const eventsNode = doc.getIn(["objects", selectedId, "events"]);
              if (isMap(eventsNode)) eventsNode.flow = false;
              const clickNode = doc.createNode(parsed);
              clearFlowOnNode(clickNode);
              doc.setIn(["objects", selectedId, "events", "click"], clickNode);
            }, `设置 ${selectedId} 点击事件`);
          } catch {
            deps?.toast("请输入合法的 JSON 步骤数组");
          }
        },
      }),
    );

    propSec.append(propGrid);
    pane.append(propSec);
  }
}

function createSection(title: string): HTMLElement {
  const sec = document.createElement("section");
  sec.className = "vf-edit-section";
  const h = document.createElement("div");
  h.className = "vf-sec-title";
  h.textContent = title;
  sec.append(h);
  return sec;
}

function makeNumberField(
  label: string,
  value: number,
  opts: {
    attr: [string, string];
    disabled?: boolean;
    min?: number;
    max?: number;
    onChange: (val: number) => void;
  },
): HTMLElement {
  const wrap = document.createElement("label");
  wrap.className = "vf-field";
  const span = document.createElement("span");
  span.textContent = label;
  const input = document.createElement("input");
  input.type = "number";
  input.setAttribute(opts.attr[0], opts.attr[1]);
  if (opts.min !== undefined) input.min = String(opts.min);
  if (opts.max !== undefined) input.max = String(opts.max);
  input.value = String(Math.round(value));
  input.disabled = Boolean(opts.disabled);
  input.addEventListener("change", () => {
    const num = Number(input.value);
    if (Number.isFinite(num)) opts.onChange(num);
  });
  wrap.append(span, input);
  return wrap;
}

function makeOptionalNumberField(
  label: string,
  value: number | undefined,
  opts: {
    attr: [string, string];
    disabled?: boolean;
    placeholder?: string;
    onChange: (val: number | undefined) => void;
  },
): HTMLElement {
  const wrap = document.createElement("label");
  wrap.className = "vf-field";
  const span = document.createElement("span");
  span.textContent = label;
  const input = document.createElement("input");
  input.type = "number";
  input.setAttribute(opts.attr[0], opts.attr[1]);
  if (opts.placeholder) input.placeholder = opts.placeholder;
  input.value = value !== undefined && Number.isFinite(value) ? String(Math.round(value)) : "";
  input.disabled = Boolean(opts.disabled);
  input.addEventListener("change", () => {
    const raw = input.value.trim();
    if (!raw) {
      opts.onChange(undefined);
      return;
    }
    const num = Number(raw);
    if (Number.isFinite(num)) opts.onChange(num);
  });
  wrap.append(span, input);
  return wrap;
}

function makeTextField(
  label: string,
  value: string,
  opts: {
    attr: [string, string];
    disabled?: boolean;
    placeholder?: string;
    fullWidth?: boolean;
    onChange: (val: string) => void;
  },
): HTMLElement {
  const wrap = document.createElement("label");
  wrap.className = "vf-field" + (opts.fullWidth ? " full" : "");
  const span = document.createElement("span");
  span.textContent = label;
  const input = document.createElement("input");
  input.type = "text";
  input.setAttribute(opts.attr[0], opts.attr[1]);
  if (opts.placeholder) input.placeholder = opts.placeholder;
  input.value = value;
  input.disabled = Boolean(opts.disabled);
  input.addEventListener("change", () => opts.onChange(input.value));
  wrap.append(span, input);
  return wrap;
}

function makeSelectField(
  label: string,
  value: string,
  options: Array<[string, string]>,
  opts: {
    attr: [string, string];
    disabled?: boolean;
    onChange: (val: string) => void;
  },
): HTMLElement {
  const wrap = document.createElement("label");
  wrap.className = "vf-field";
  const span = document.createElement("span");
  span.textContent = label;
  const sel = document.createElement("select");
  sel.setAttribute(opts.attr[0], opts.attr[1]);
  sel.disabled = Boolean(opts.disabled);
  for (const [val, text] of options) {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = text;
    opt.selected = val === value;
    sel.append(opt);
  }
  sel.addEventListener("change", () => opts.onChange(sel.value));
  wrap.append(span, sel);
  return wrap;
}
