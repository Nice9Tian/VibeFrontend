// 测试计划第 5 项“编辑模式支持布局和停靠”：
// 1) 纯函数与单元断言：布局容器拖入、顺序与伸缩调整、尺寸规则（SizePolicy）、停靠面板（Dock）四侧配置、
//    菜单栏与菜单项增删改排、状态归属（owner: ui | business）标注、锁定保护与撤销/重做（history）；
// 2) 真实无头浏览器（Headless Chrome + CDP 真实鼠标事件）端到端验收：
//    从全新空项目出发，仅通过编辑模式鼠标拖拽与面板交互搭出“图层面板”（Dock + HBox 工具栏 + 列表 + 显隐栏 + 视图菜单项 + 业务状态 layer.visible），
//    并在真实浏览器内验证锁定拦截与 Ctrl+Z / Ctrl+Y 撤销重做，最后与 examples/animean/design 对跑同一套图层面板用例，结果完全一致。
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";
import { check } from "../src/check.ts";
import { exportQt } from "../src/export/qt.ts";
import {
  canRedo,
  canUndo,
  cloneScene,
  createHistory,
  parseScene,
  pushHistory,
  redoHistory,
  snapshotOf,
  undoHistory,
} from "../src/history.ts";
import {
  insertOrMoveNodeInLayout,
  placeNewNodeInScene,
  reorderChildInLayout,
  setDockPanelArea,
  setWindowPartitionRole,
  updateContainerLayoutSpec,
  updateNodeGridCell,
  updateNodePropsAndMeta,
  updateNodeSizePolicy,
} from "../src/layoutedit.ts";
import { loadProjectFiles } from "../src/loader.ts";
import {
  addMenuItemToMenu,
  addMenuToWindow,
  bindDockToggleMenuItem,
  removeMenuFromWindow,
  removeMenuItemFromMenu,
  renameObjectIdInYaml,
  reorderMenuInWindow,
  reorderMenuItemInMenu,
  updateMenuInWindow,
  updateMenuItemInMenu,
} from "../src/menuedit.ts";
import {
  allStateLeaves,
  computeDockDropTarget,
  computeLayoutDropTarget,
  computeSceneLayout,
  findMenuItem,
  findStateLeaf,
  isBusinessState,
  isSceneNodeLocked,
  isValidIdentifier,
  parentOfNode,
  type Project,
  type Scene,
} from "../src/model.ts";
import { Runtime } from "../src/runtime.ts";
import {
  isValidStatePath,
  removeStateLeafInDoc,
  setStateOwnerInDoc,
  setStateOwnerInYaml,
  updateStateInitialInDoc,
  upsertBusinessEventInDoc,
  upsertGlobalConditionInDoc,
  upsertStateLeafInDoc,
  validateSimulateSteps,
  validateStateOwnerChange,
} from "../src/stateedit.ts";
import { setNodesLocked } from "../src/transform.ts";
import { nodeIO, readTree } from "./node-io.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const animeanDesignDir = path.join(repoRoot, "examples", "animean", "design");

let passed = 0;
const queue: Array<{ name: string; fn: () => void | Promise<void> }> = [];
function test(name: string, fn: () => void | Promise<void>): void {
  queue.push({ name, fn });
}

function makeEmptyScene(): Scene {
  return {
    version: 1,
    root: "window",
    nodes: {
      window: {
        type: "Window",
        width: 1080,
        height: 680,
        title: "测试窗口",
        children: [],
      },
    },
  };
}

// ---------- 1. 纯函数与历史/锁定测试 ----------

test("布局容器拖入、顺序重排、伸缩与尺寸规则（SizePolicy）及撤销重做", () => {
  let scene = makeEmptyScene();
  let history = createHistory();

  const applySceneOp = (label: string, mut: (s: Scene) => boolean) => {
    const before = snapshotOf(scene, "");
    const next = cloneScene(scene);
    const changed = mut(next);
    assert.equal(changed, true, `操作“${label}”应当生效`);
    const after = snapshotOf(next, "");
    history = pushHistory(history, before, after, label);
    scene = next;
  };

  // 1) 拖入左停靠面板 layersDock 并设为 VBox 排版
  applySceneOp("添加停靠面板", (s) =>
    placeNewNodeInScene(s, "Dock", "layersDock", 60, 200, { width: 240, height: 580 }),
  );
  assert.deepEqual(scene.nodes.window.docks, ["layersDock"]);
  assert.equal(scene.nodes.layersDock.dockArea, "left");

  applySceneOp("开启 VBox 排版", (s) =>
    updateContainerLayoutSpec(s, "layersDock", { kind: "vbox", padding: 10, gap: 8 }),
  );
  assert.equal(scene.nodes.layersDock.layout?.kind, "vbox");

  // 2) 往 VBox 容器内依次拖入 3 个子控件，验证按落点坐标计算插入位置
  applySceneOp("放入 toolbar", (s) =>
    placeNewNodeInScene(s, "HBox", "layerToolbar", 80, 50, { width: 220, height: 30 }, { targetContainerId: "layersDock" }),
  );
  applySceneOp("放入 visBar", (s) =>
    placeNewNodeInScene(s, "HBox", "layerVisibilityBar", 80, 500, { width: 220, height: 32 }, { targetContainerId: "layersDock" }),
  );
  // 落在 toolbar 与 visBar 中间时，computeLayoutDropTarget 应算出 insertIndex = 1
  const boxesMid = computeSceneLayout(scene);
  const dropMid = computeLayoutDropTarget(scene, "layersDock", { x: 80, y: 75 }, boxesMid);
  assert.ok(dropMid);
  assert.equal(dropMid.insertIndex, 1);

  applySceneOp("中间插入 layerList", (s) =>
    placeNewNodeInScene(s, "List", "layerList", 80, 75, { width: 220, height: 220 }, { targetContainerId: "layersDock", boxes: boxesMid }),
  );
  assert.deepEqual(scene.nodes.layersDock.children, ["layerToolbar", "layerList", "layerVisibilityBar"]);

  // 3) 设置 layerList 的 stretch = 1 与 vertical = expanding，验证排版高度自动撑满剩余空间
  applySceneOp("设置 layerList 伸缩", (s) =>
    updateNodeSizePolicy(s, "layerList", { stretch: 1, vertical: "expanding", minHeight: 100 }),
  );
  const boxesAfterStretch = computeSceneLayout(scene);
  const listBox = boxesAfterStretch.get("layerList")!;
  assert.ok(listBox.height > 400, `layerList 应撑满停靠面板剩余高度，实际高度 ${listBox.height}`);

  // 4) 调整子控件顺序（上移/下移）
  applySceneOp("上移 layerList", (s) => reorderChildInLayout(s, "layerList", -1, true));
  assert.deepEqual(scene.nodes.layersDock.children, ["layerList", "layerToolbar", "layerVisibilityBar"]);

  // 5) 撤销与重做验证
  assert.equal(canUndo(history), true);
  const u1 = undoHistory(history, snapshotOf(scene, ""));
  history = u1.stack;
  scene = parseScene(u1.snapshot!.sceneText);
  assert.deepEqual(scene.nodes.layersDock.children, ["layerToolbar", "layerList", "layerVisibilityBar"]);

  assert.equal(canRedo(history), true);
  const r1 = redoHistory(history, snapshotOf(scene, ""));
  history = r1.stack;
  scene = parseScene(r1.snapshot!.sceneText);
  assert.deepEqual(scene.nodes.layersDock.children, ["layerList", "layerToolbar", "layerVisibilityBar"]);
});

test("停靠面板四侧切换、窗口分区角色与网格单元格设置", () => {
  const scene = makeEmptyScene();
  placeNewNodeInScene(scene, "Dock", "dockA", 50, 200, { width: 200, height: 300 });
  assert.equal(scene.nodes.dockA.dockArea, "left");

  // 切换到右侧、顶部、底部
  for (const area of ["right", "top", "bottom", "left"] as const) {
    assert.equal(setDockPanelArea(scene, "dockA", area, undefined, { title: `面板-${area}`, headerHeight: 28 }), true);
    assert.equal(scene.nodes.dockA.dockArea, area);
    assert.equal(scene.nodes.dockA.headerHeight, 28);
  }

  // computeDockDropTarget 四侧落点判定
  assert.equal(computeDockDropTarget(scene, { x: 40, y: 300 })?.dockArea, "left");
  assert.equal(computeDockDropTarget(scene, { x: 1020, y: 300 })?.dockArea, "right");
  assert.equal(computeDockDropTarget(scene, { x: 540, y: 30 })?.dockArea, "top");
  assert.equal(computeDockDropTarget(scene, { x: 540, y: 640 })?.dockArea, "bottom");

  // 主窗口 central 与 statusBar 分区角色
  placeNewNodeInScene(scene, "Grid", "mainGrid", 500, 300, { width: 400, height: 300 });
  assert.equal(setWindowPartitionRole(scene, "mainGrid", "central"), true);
  assert.equal(scene.nodes.window.central, "mainGrid");

  updateContainerLayoutSpec(scene, "mainGrid", { kind: "grid", columns: 3, columnStretch: [1, 2, 1], rowStretch: [0, 1] });
  placeNewNodeInScene(scene, "Button", "cellBtn", 520, 320, { width: 80, height: 32 }, { targetContainerId: "mainGrid" });
  assert.equal(updateNodeGridCell(scene, "cellBtn", { row: 1, column: 2, rowSpan: 2, columnSpan: 1 }), true);
  assert.equal(scene.nodes.cellBtn.row, 1);
  assert.equal(scene.nodes.cellBtn.column, 2);
  assert.equal(scene.nodes.cellBtn.rowSpan, 2);
});

test("窗口顶部菜单与菜单项增删改排及停靠面板绑定", () => {
  const scene = makeEmptyScene();
  placeNewNodeInScene(scene, "Dock", "layersDock", 60, 200, { width: 240, height: 580 });
  updateNodePropsAndMeta(scene, "layersDock", { title: "图层" });

  // 一键绑定停靠面板到视图菜单
  const toggleId = bindDockToggleMenuItem(scene, "layersDock");
  assert.equal(toggleId, "menuToggleLayers");
  const item = findMenuItem(scene, "menuToggleLayers");
  assert.ok(item);
  assert.equal(item.dock, "layersDock");
  assert.equal(item.text, "图层面板");
  assert.equal(item.checkable, true);
  assert.equal(item.checked, true);

  // 新增顶层菜单与菜单项、排序与修改
  const fileMenuId = addMenuToWindow(scene, { id: "fileMenu", title: "文件" });
  assert.equal(fileMenuId, "fileMenu");
  assert.equal(reorderMenuInWindow(scene, "fileMenu", -1), true);
  assert.equal(scene.nodes.window.menuBar?.menus[0].id, "fileMenu");

  const saveItemId = addMenuItemToMenu(scene, "fileMenu", {
    id: "menuSave",
    text: "保存",
    shortcut: "Ctrl+S",
    emit: "fileSave",
  });
  assert.equal(saveItemId, "menuSave");
  assert.equal(updateMenuItemInMenu(scene, "menuSave", { text: "保存项目" }), true);
  assert.equal(findMenuItem(scene, "menuSave")?.text, "保存项目");

  const quitItemId = addMenuItemToMenu(scene, "fileMenu", { id: "menuQuit", text: "退出" });
  assert.equal(quitItemId, "menuQuit");
  assert.equal(reorderMenuItemInMenu(scene, "menuQuit", -1), true);
  assert.equal(scene.nodes.window.menuBar?.menus[0].items[0].id, "menuQuit");

  assert.equal(removeMenuItemFromMenu(scene, "menuQuit"), true);
  assert.equal(findMenuItem(scene, "menuQuit"), null);
  assert.equal(updateMenuInWindow(scene, "fileMenu", { title: "文件管理" }), true);
  assert.equal(removeMenuFromWindow(scene, "fileMenu"), true);
});

test("状态归属（owner: ui | business）标注、状态增删改与撤销重做", () => {
  const initialYaml = [
    "# 顶部注释保留",
    "state:",
    "  layer:",
    "    visible:",
    "      type: boolean",
    "      initial: true",
    "  project:",
    "    statusMessage:",
    "      type: string",
    "      initial: 就绪",
    "",
  ].join("\n");

  // 标注 layer.visible 为 business
  const afterBiz = setStateOwnerInYaml(initialYaml, "layer.visible", "business");
  assert.ok(afterBiz.includes("# 顶部注释保留"), "YAML 注释应当保留");
  assert.ok(afterBiz.includes("owner: business"), "应写入 owner: business");

  const docBiz = parseDocument(afterBiz);
  const logicBiz = docBiz.toJSON();
  assert.equal(isBusinessState(findStateLeaf(logicBiz, "layer.visible")), true);
  assert.equal(isBusinessState(findStateLeaf(logicBiz, "project.statusMessage")), false);

  // 切换回 ui
  const afterUi = setStateOwnerInYaml(afterBiz, "layer.visible", "ui");
  const logicUi = parseDocument(afterUi).toJSON();
  assert.equal(isBusinessState(findStateLeaf(logicUi, "layer.visible")), false);

  // 新增状态、修改初始值、新增业务事件、新增条件、删除状态
  const doc = parseDocument(afterBiz);
  assert.equal(
    upsertStateLeafInDoc(doc, "layers.selectedIndex", { type: "number", initial: 0, owner: "ui" }),
    true,
  );
  assert.equal(updateStateInitialInDoc(doc, "layers.selectedIndex", 2), true);
  assert.equal(
    upsertBusinessEventInDoc(doc, "layerToggleVisible", { simulateSet: "layer.visible = not layer.visible" }),
    true,
  );
  assert.equal(
    upsertGlobalConditionInDoc(doc, "canMoveLayerUp", { type: "symbol", expr: "layers.selectedIndex > 0" }),
    true,
  );
  const parsedLogic = doc.toJSON();
  assert.equal(findStateLeaf(parsedLogic, "layers.selectedIndex")?.initial, 2);
  assert.equal(parsedLogic.events.layerToggleVisible.owner, "business");
  assert.equal(parsedLogic.conditions.canMoveLayerUp.expr, "layers.selectedIndex > 0");

  assert.equal(removeStateLeafInDoc(doc, "layers.selectedIndex"), true);
  assert.equal(findStateLeaf(doc.toJSON(), "layers.selectedIndex"), null);
});

test("锁定节点及父容器继承锁定保护：禁止一切布局、尺寸、停靠与菜单改动", () => {
  const scene = makeEmptyScene();
  placeNewNodeInScene(scene, "Dock", "layersDock", 60, 200, { width: 240, height: 580 });
  updateContainerLayoutSpec(scene, "layersDock", { kind: "vbox", padding: 10, gap: 8 });
  placeNewNodeInScene(scene, "Button", "btn1", 80, 60, { width: 80, height: 30 }, { targetContainerId: "layersDock" });
  placeNewNodeInScene(scene, "Button", "btn2", 80, 120, { width: 80, height: 30 }, { targetContainerId: "layersDock" });

  // 锁定父容器 layersDock 后，子控件 btn1 继承锁定
  setNodesLocked(scene, ["layersDock"], true);
  assert.equal(isSceneNodeLocked(scene, "layersDock"), true);
  assert.equal(isSceneNodeLocked(scene, "btn1"), true);

  const snapBefore = JSON.stringify(scene);
  assert.equal(placeNewNodeInScene(scene, "Button", "btn3", 80, 160, { width: 80, height: 30 }, { targetContainerId: "layersDock" }), false);
  // 即使是 Dock 类型，目标容器锁定时也必须拒绝放入
  assert.equal(placeNewNodeInScene(scene, "Dock", "dockLocked", 80, 160, { width: 120, height: 120 }, { targetContainerId: "layersDock" }), false);
  assert.equal(reorderChildInLayout(scene, "btn1", 1, true), false);
  assert.equal(updateContainerLayoutSpec(scene, "layersDock", { kind: "hbox" }), false);
  assert.equal(updateNodeSizePolicy(scene, "btn1", { stretch: 2 }), false);
  assert.equal(setDockPanelArea(scene, "layersDock", "right"), false);
  assert.equal(updateNodePropsAndMeta(scene, "btn1", { width: 120 }, { text: "被改了" }), false);
  assert.equal(JSON.stringify(scene), snapBefore, "锁定状态下 scene 不得发生任何改动");

  // 解锁后恢复可编辑
  setNodesLocked(scene, ["layersDock"], false);
  assert.equal(reorderChildInLayout(scene, "btn1", 1, true), true);
  assert.deepEqual(scene.nodes.layersDock.children, ["btn2", "btn1"]);

  // 当容器未锁定但子控件 btn1 锁定时，修改容器排版（如切换为自由定位或改变排版参数）会被拒绝，不改动锁定子控件
  setNodesLocked(scene, ["btn1"], true);
  const snapChildLocked = JSON.stringify(scene);
  assert.equal(updateContainerLayoutSpec(scene, "layersDock", null, true), false);
  assert.equal(updateContainerLayoutSpec(scene, "layersDock", { kind: "hbox" }), false);
  assert.equal(JSON.stringify(scene), snapChildLocked, "子控件锁定时不得改写父容器排版参数");
  setNodesLocked(scene, ["btn1"], false);
});

test("审核回归：主窗口分区切换防孤儿/防双挂载、Dock 移入普通容器降级及导出 Qt 合法性", async () => {
  const animeanProj = await loadProjectFiles(nodeIO(animeanDesignDir), null);
  const scene = cloneScene(animeanProj.scene);
  assert.equal(scene.nodes.window.central, "centralArea");

  // 新增一个容器 otherBox，验证替换 centralArea 时：
  // 1) 若原 centralArea 锁定，则拒绝替换；
  // 2) 若原 centralArea 未锁定，替换后原 centralArea 降级保留在 window.children 中，绝不变成无父孤儿节点。
  placeNewNodeInScene(scene, "VBox", "otherBox", 500, 300, { width: 400, height: 300 });
  assert.equal(scene.nodes.otherBox.layout?.kind, "vbox", "新建 VBox 应自动初始化 layout: { kind: 'vbox' }");

  setNodesLocked(scene, ["centralArea"], true);
  assert.equal(setWindowPartitionRole(scene, "otherBox", "central"), false, "原 central 锁定时应拒绝替换");
  assert.equal(scene.nodes.window.central, "centralArea");

  setNodesLocked(scene, ["centralArea"], false);
  assert.equal(setWindowPartitionRole(scene, "otherBox", "central"), true);
  assert.equal(scene.nodes.window.central, "otherBox");
  assert.equal(parentOfNode(scene, "centralArea"), "window", "被顶替的旧 centralArea 必须保留在 window.children 中而不变成孤儿");

  // 把当前作为 central 的 otherBox 直接通过 setDockPanelArea 改为停靠面板：window.central 必须同步清空，不得双重挂载
  assert.equal(setDockPanelArea(scene, "otherBox", "right"), true);
  assert.equal(scene.nodes.window.central, undefined, "central 节点转为 Dock 后应清理 window.central");
  assert.ok(scene.nodes.window.docks?.includes("otherBox"));

  // 恢复 centralArea 为 central，并把原本是 Dock 的 layersDock 移入 centralArea.children：
  // 必须自动清理 Dock 专属字段（dockArea、headerHeight、type: Dock -> VBox）以及菜单项关联
  assert.equal(setWindowPartitionRole(scene, "centralArea", "central"), true);
  assert.equal(insertOrMoveNodeInLayout(scene, "layersDock", "centralArea", 0), true);
  assert.equal(scene.nodes.window.docks?.includes("layersDock"), false);
  assert.equal(scene.nodes.layersDock.type, "VBox");
  assert.equal(scene.nodes.layersDock.dockArea, undefined);
  assert.equal(scene.nodes.layersDock.headerHeight, undefined);
  assert.equal(findMenuItem(scene, "menuToggleLayers")?.dock, undefined);

  // 验证此时项目检查 0 错误，且导出 Qt 生成的 Ui.cpp 不会重复把 layersDock 声明为 QDockWidget
  const testProj: Project = { ...animeanProj, scene };
  const errs = check(testProj).filter((p) => p.level === "error");
  assert.deepEqual(errs, []);
  const qtRes = exportQt(
    testProj,
    {
      runtimeJs: "",
      generated: readTree(path.join(repoRoot, "app", "qt-templates", "generated")),
      scaffold: readTree(path.join(repoRoot, "app", "qt-templates", "scaffold")),
    },
    null,
  );
  assert.deepEqual(qtRes.problems.filter((p) => p.level === "error"), []);
  const uiCpp = qtRes.files.get("ui_binding/Ui.cpp") ?? "";
  const dockDeclMatches = uiCpp.match(/QDockWidget\s*\*\s*layersDock\b/g) ?? [];
  assert.equal(dockDeclMatches.length, 0, "降级为普通子容器后不应再生成 QDockWidget* layersDock");
});

test("审核回归：状态归属冲突拦截、simulate 目标归属校验、跨表唯一性、保留字拦截与菜单项重命名同步 YAML", () => {
  // 1) 保留字与状态路径段数校验
  assert.equal(isValidIdentifier("true"), false);
  assert.equal(isValidIdentifier("and"), false);
  assert.equal(isValidIdentifier("value"), false);
  assert.equal(isValidIdentifier("validName1"), true);
  assert.equal(isValidStatePath("singleSeg"), false, "单段路径不得作为状态路径");
  assert.equal(isValidStatePath("true.flag"), false, "含保留字的路径应被拒绝");
  assert.equal(isValidStatePath("layer.visible"), true);

  // 2) 状态叶子与分组前缀覆盖保护、归属双向冲突拦截与 simulate 目标校验
  const yamlText = [
    "state:",
    "  layer:",
    "    visible:",
    "      type: boolean",
    "      initial: true",
    "      owner: business",
    "  layers:",
    "    selectedIndex:",
    "      type: number",
    "      initial: 0",
    "events:",
    "  layerToggleVisible:",
    "    owner: business",
    "    simulate:",
    "      - set: layer.visible = not layer.visible",
    "objects:",
    "  layerList:",
    "    bind: layers.selectedIndex",
    "",
  ].join("\n");
  const doc = parseDocument(yamlText);
  const scene = makeEmptyScene();
  placeNewNodeInScene(scene, "Dock", "layersDock", 60, 200, { width: 240, height: 580 });
  addMenuToWindow(scene, { id: "viewMenu", title: "视图" });
  addMenuItemToMenu(scene, "viewMenu", { id: "menuSave", text: "保存" });

  // 穿过已有叶子 layer.visible 写入子路径 layer.visible.sub 应拒绝；覆盖已有分组 layer 应拒绝
  assert.equal(upsertStateLeafInDoc(doc, "layer.visible.sub", { type: "boolean", initial: false }, scene), false);
  assert.equal(upsertStateLeafInDoc(doc, "layer", { type: "string", initial: "" }, scene), false);

  // layer.visible 在业务事件 simulate 中被修改，禁止切回 ui
  assert.ok(validateStateOwnerChange(doc.toJSON(), "layer.visible", "ui") !== null);
  assert.equal(setStateOwnerInDoc(doc, "layer.visible", "ui"), false);

  // layers.selectedIndex 被 layerList.bind 绑定，禁止切为 business
  assert.ok(validateStateOwnerChange(doc.toJSON(), "layers.selectedIndex", "business") !== null);
  assert.equal(setStateOwnerInDoc(doc, "layers.selectedIndex", "business"), false);

  // 业务事件 simulate 试图修改 ui 状态 layers.selectedIndex 或不存在的状态时应被拒绝
  assert.ok(validateSimulateSteps(doc.toJSON(), [{ set: "layers.selectedIndex = 1" }]) !== null);
  assert.equal(upsertBusinessEventInDoc(doc, "badBizEvent", { simulateSet: "layers.selectedIndex = 1" }), false);
  assert.equal(upsertBusinessEventInDoc(doc, "badBizEvent2", { simulateSet: "unknown.state = 1" }), false);

  // 3) 跨表重名拦截（控件、菜单/菜单项、状态根名、全局条件）
  assert.equal(upsertStateLeafInDoc(doc, "layersDock.flag", { type: "boolean", initial: false }, scene), false, "状态根名与控件重名应拒绝");
  assert.equal(upsertStateLeafInDoc(doc, "viewMenu.flag", { type: "boolean", initial: false }, scene), false, "状态根名与菜单重名应拒绝");
  assert.equal(upsertGlobalConditionInDoc(doc, "layers", { type: "symbol", expr: "layers.selectedIndex >= 0" }, scene), false, "条件名与状态根名重名应拒绝");
  assert.equal(upsertGlobalConditionInDoc(doc, "layersDock", { type: "symbol", expr: "layers.selectedIndex >= 0" }, scene), false, "条件名与控件重名应拒绝");
  assert.equal(upsertGlobalConditionInDoc(doc, "menuSave", { type: "symbol", expr: "layers.selectedIndex >= 0" }, scene), false, "条件名与菜单项重名应拒绝");
  assert.equal(addMenuToWindow(scene, { id: "layers", title: "冲突菜单" }, "window", doc.toJSON()), null, "菜单 ID 与状态根名重名应拒绝");
  assert.equal(addMenuItemToMenu(scene, "viewMenu", { id: "layersDock", text: "冲突项" }, "window", doc.toJSON()), null, "菜单项 ID 与控件重名应拒绝");

  // 4) 菜单项重命名时同步更新 YAML 中的 objects.<itemId>
  const yamlWithMenuObj = [
    "state:",
    "  layers:",
    "    selectedIndex:",
    "      type: number",
    "      initial: 0",
    "objects:",
    "  menuSave:",
    "    props:",
    "      enabled: layers.selectedIndex >= 0",
    "",
  ].join("\n");
  const logicObj = parseDocument(yamlWithMenuObj).toJSON();
  assert.equal(updateMenuItemInMenu(scene, "menuSave", { id: "menuSaveProject" }, "window", logicObj), true);
  const renamedYaml = renameObjectIdInYaml(yamlWithMenuObj, "menuSave", "menuSaveProject");
  assert.ok(renamedYaml.includes("menuSaveProject:"), "YAML 中 objects.menuSave 应同步重命名为 menuSaveProject");
  assert.ok(!renamedYaml.includes("menuSave:"), "YAML 中不应残留旧键 menuSave");
});

// ---------- 2. 真实无头浏览器（Headless Chrome + CDP 真实鼠标事件）端到端测试 ----------

function findChromeExecutable(): string {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error("未找到 Chrome 或 Edge 浏览器可执行文件");
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on("error", reject);
  });
}

class CdpSession {
  private ws: WebSocket;
  private seq = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data)) as { id?: number; result?: unknown; error?: { message: string } };
      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
      }
    });
  }

  static async connect(wsUrl: string): Promise<CdpSession> {
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener("error", (e) => reject(new Error(`CDP WebSocket error: ${String(e)}`)), { once: true });
    });
    return new CdpSession(ws);
  }

  send<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = this.seq++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    });
  }

  async eval<T = unknown>(expression: string): Promise<T> {
    const res = await this.send<{ result: { value?: T }; exceptionDetails?: { text: string } }>(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true },
    );
    if (res.exceptionDetails) {
      throw new Error(`Browser eval error: ${res.exceptionDetails.text}\nExpr: ${expression}`);
    }
    return res.result.value as T;
  }

  async waitForSelector(selector: string, timeoutMs = 8000): Promise<{ x: number; y: number; width: number; height: number }> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const box = await this.eval<{ x: number; y: number; width: number; height: number } | null>(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return null;
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height };
      })()`);
      if (box) return box;
      await new Promise((r) => setTimeout(r, 40));
    }
    const debugInfo = await this.eval<string>(`JSON.stringify({ url: location.href, body: document.body?.innerText?.slice(0, 500) })`).catch(() => "unknown");
    throw new Error(`等待选择器超时: ${selector} (${debugInfo})`);
  }

  async mouseClick(x: number, y: number): Promise<void> {
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left" });
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
    await new Promise((r) => setTimeout(r, 25));
  }

  async clickSelector(selector: string): Promise<void> {
    const box = await this.waitForSelector(selector);
    await this.mouseClick(Math.round(box.x), Math.round(box.y));
  }

  async mouseDrag(x1: number, y1: number, x2: number, y2: number, steps = 5): Promise<void> {
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: Math.round(x1), y: Math.round(y1), button: "none" });
    await this.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: Math.round(x1),
      y: Math.round(y1),
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    for (let i = 1; i <= steps; i++) {
      const cx = Math.round(x1 + ((x2 - x1) * i) / steps);
      const cy = Math.round(y1 + ((y2 - y1) * i) / steps);
      await this.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: cx,
        y: cy,
        button: "left",
        buttons: 1,
      });
      await new Promise((r) => setTimeout(r, 8));
    }
    await this.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: Math.round(x2),
      y: Math.round(y2),
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
    await new Promise((r) => setTimeout(r, 45));
  }

  async setInputValue(selector: string, value: string): Promise<void> {
    await this.waitForSelector(selector);
    await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error("Missing input: " + ${JSON.stringify(selector)});
      el.focus();
      el.value = ${JSON.stringify(value)};
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.blur();
    })()`);
    await new Promise((r) => setTimeout(r, 25));
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      // ignore
    }
  }
}

/**
 * 对任意项目的图层面板运行同一套交互用例，返回每一步后的状态与视图快照。
 */
function runLayerPanelSuite(project: Project) {
  const runtime = new Runtime(project);
  runtime.start();

  const snap = (tag: string) => {
    const boxes = computeSceneLayout(project.scene, {
      isVisible: (id) => runtime.view(id).visible,
      getProp: (id, prop) => runtime.view(id).props[prop] ?? null,
    });
    const dockBox = boxes.get("layersDock");
    const listBox = boxes.get("layerList");
    return {
      tag,
      layerVisible: runtime.getState("layer.visible"),
      selectedIndex: runtime.getState("layers.selectedIndex"),
      nextId: runtime.getState("layers.nextId"),
      items: runtime.getState("layers.items"),
      statusMessage: runtime.getState("project.statusMessage"),
      views: {
        layersDockVis: runtime.view("layersDock").visible,
        layerListProps: runtime.view("layerList").props,
        addBtnEnabled: runtime.view("addLayerBtn").enabled,
        removeBtnEnabled: runtime.view("removeLayerBtn").enabled,
        upBtnEnabled: runtime.view("moveLayerUpBtn").enabled,
        downBtnEnabled: runtime.view("moveLayerDownBtn").enabled,
        visLabelProps: runtime.view("layerVisibleLabel").props,
        toggleBtnProps: runtime.view("toggleVisibleBtn").props,
      },
      geometry: {
        dockWidth: dockBox?.width,
        listWidth: listBox?.width,
        listExpanding: (listBox?.height ?? 0) > 350,
      },
    };
  };

  const click = (id: string) => {
    runtime.dispatch(id, "mousedown");
    runtime.dispatch(id, "mouseup");
    runtime.dispatch(id, "click");
    runtime.dispatch(null, "window.click");
  };

  const results = [];
  results.push(snap("initial"));

  // 1) 点击新建图层按钮
  click("addLayerBtn");
  results.push(snap("after-add"));

  // 2) 点击上移图层按钮
  click("moveLayerUpBtn");
  results.push(snap("after-move-up"));

  // 3) 点击下移图层按钮
  click("moveLayerDownBtn");
  results.push(snap("after-move-down"));

  // 4) 点击切换显隐按钮（触发业务事件 layerToggleVisible 的 simulate）
  click("toggleVisibleBtn");
  results.push(snap("after-toggle-visible-1"));
  click("toggleVisibleBtn");
  results.push(snap("after-toggle-visible-2"));

  // 5) 点击删除图层按钮
  click("removeLayerBtn");
  results.push(snap("after-remove"));

  // 6) 点击顶部菜单项 menuToggleLayers 隐藏再显示停靠面板
  click("menuToggleLayers");
  results.push(snap("after-menu-hide-dock"));
  click("menuToggleLayers");
  results.push(snap("after-menu-show-dock"));

  return results;
}

test("Headless Chrome 真实鼠标拖拽与面板操作：从空项目搭出图层面板并与 examples/animean/design 对跑用例", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-layout-edit-"));
  fs.mkdirSync(path.join(tmpDir, "ui"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "logic"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "docs"), { recursive: true });

  fs.writeFileSync(
    path.join(tmpDir, "project.json"),
    JSON.stringify({ name: "图层面板验收", pageDoc: "docs/窗口.md" }, null, 2) + "\n",
  );
  fs.writeFileSync(path.join(tmpDir, "docs", "窗口.md"), "# 图层面板验收\n");
  fs.writeFileSync(
    path.join(tmpDir, "ui", "scene.json"),
    JSON.stringify(
      {
        version: 1,
        root: "window",
        nodes: {
          window: {
            type: "Window",
            width: 1080,
            height: 680,
            title: "AnimeAn 动画工作台",
            children: [],
          },
        },
      },
      null,
      2,
    ) + "\n",
  );
  fs.writeFileSync(
    path.join(tmpDir, "logic", "app.logic.yaml"),
    "state: {}\nconditions: {}\nevents: {}\nobjects: {}\n",
  );

  const prevEnv = process.env.VF_PROJECT;
  process.env.VF_PROJECT = tmpDir;

  const vitePort = await getFreePort();
  const cdpPort = await getFreePort();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-chrome-profile-"));

  const { createServer } = await import("vite");
  const server = await createServer({
    root: path.join(repoRoot, "app"),
    configFile: path.join(repoRoot, "app", "vite.config.ts"),
    server: { port: vitePort, strictPort: true, host: "127.0.0.1" },
    logLevel: "silent",
  });
  await server.listen();

  let chromeProc: ChildProcess | null = null;
  let cdp: CdpSession | null = null;

  try {
    const chromeBin = findChromeExecutable();
    chromeProc = spawn(
      chromeBin,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--window-size=1600,1000",
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${userDataDir}`,
        `http://127.0.0.1:${vitePort}/`,
      ],
      { stdio: "ignore" },
    );

    // 等待 CDP 端口就绪并连接页面
    let wsUrl = "";
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
        if (res.ok) {
          const targets = (await res.json()) as Array<{ type: string; webSocketDebuggerUrl?: string; url?: string }>;
          const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
          if (page?.webSocketDebuggerUrl) {
            wsUrl = page.webSocketDebuggerUrl;
            break;
          }
        }
      } catch {
        // wait
      }
      await new Promise((r) => setTimeout(r, 80));
    }
    assert.ok(wsUrl, "应当成功连接 Headless Chrome CDP");

    cdp = await CdpSession.connect(wsUrl);
    await cdp.waitForSelector("#stage");
    await cdp.waitForSelector("#tab-layout");
    await cdp.waitForSelector("#tab-menu");
    await cdp.waitForSelector("#tab-state");

    const stagePointToClient = async (sx: number, sy: number) => {
      return cdp!.eval<{ x: number; y: number }>(`(() => {
        const el = document.getElementById("stage");
        const r = el.getBoundingClientRect();
        const scaleX = r.width / (el.offsetWidth || 1);
        const scaleY = r.height / (el.offsetHeight || 1);
        return { x: r.left + ${sx} * scaleX, y: r.top + ${sy} * scaleY };
      })()`);
    };

    const dragFromPaletteToStage = async (type: string, sx: number, sy: number) => {
      const itemBox = await cdp!.waitForSelector(`.palette-item[data-type="${type}"]`);
      const targetPt = await stagePointToClient(sx, sy);
      await cdp!.mouseDrag(itemBox.x, itemBox.y, targetPt.x, targetPt.y);
    };

    // 1) 从左侧素材栏把 Dock 拖到主窗口左侧，重命名为 layersDock，开启 VBox 排版
    await dragFromPaletteToStage("Dock", 60, 260);
    await cdp.clickSelector("#tab-layout");
    await cdp.setInputValue("#selection-id", "layersDock");
    await cdp.setInputValue('[data-layout-field="title"]', "图层");
    await cdp.setInputValue('[data-layout-field="width"]', "240");
    await cdp.setInputValue('[data-layout-field="height"]', "580");
    await cdp.clickSelector('[data-dock-area="left"]');
    await cdp.clickSelector('[data-layout-kind="vbox"]');
    await cdp.setInputValue('[data-layout-spec="padding"]', "10");
    await cdp.setInputValue('[data-layout-spec="gap"]', "8");

    // 2) 往 layersDock 容器内拖入 HBox (layerToolbar)、HBox (layerVisibilityBar) 与 List (layerList)
    await dragFromPaletteToStage("HBox", 100, 60);
    await cdp.setInputValue("#selection-id", "layerToolbar");
    await cdp.setInputValue('[data-layout-field="width"]', "220");
    await cdp.setInputValue('[data-layout-field="height"]', "30");
    await cdp.setInputValue('[data-layout-spec="gap"]', "6");

    await dragFromPaletteToStage("HBox", 100, 140);
    await cdp.setInputValue("#selection-id", "layerVisibilityBar");
    await cdp.setInputValue('[data-layout-field="width"]', "220");
    await cdp.setInputValue('[data-layout-field="height"]', "32");
    await cdp.setInputValue('[data-layout-spec="gap"]', "8");

    // 先拖到末尾，再在画布上用真实鼠标把 layerList 拖到 layerVisibilityBar 上方完成重排，并设置主轴伸缩 stretch = 1
    await dragFromPaletteToStage("List", 100, 240);
    await cdp.setInputValue("#selection-id", "layerList");
    await cdp.setInputValue('[data-layout-field="width"]', "220");
    await cdp.setInputValue('[data-layout-field="height"]', "220");
    await cdp.clickSelector('[data-size-stretch="1"]');
    const listStartPt = await stagePointToClient(100, 240);
    const listDropPt = await stagePointToClient(100, 72);
    await cdp.mouseDrag(listStartPt.x, listStartPt.y, listDropPt.x, listDropPt.y);

    // 验证此时 layersDock.children 顺序为 ["layerToolbar", "layerList", "layerVisibilityBar"]
    const sceneAfterList = JSON.parse(fs.readFileSync(path.join(tmpDir, "ui", "scene.json"), "utf8")) as Scene;
    assert.deepEqual(sceneAfterList.nodes.layersDock.children, ["layerToolbar", "layerList", "layerVisibilityBar"]);
    assert.equal(sceneAfterList.nodes.layerList.size?.stretch, 1);
    assert.equal(sceneAfterList.nodes.layerList.size?.vertical, "expanding");

    // 3) 往 layerToolbar 内拖入 4 个按钮：addLayerBtn、removeLayerBtn、moveLayerUpBtn、moveLayerDownBtn
    const toolbarButtons = [
      { id: "addLayerBtn", text: "新建", variant: "primary", x: 30 },
      { id: "removeLayerBtn", text: "删除", variant: "danger", x: 85 },
      { id: "moveLayerUpBtn", text: "上移", variant: "secondary", x: 140 },
      { id: "moveLayerDownBtn", text: "下移", variant: "secondary", x: 195 },
    ];
    for (const b of toolbarButtons) {
      await dragFromPaletteToStage("Button", b.x, 48);
      await cdp.setInputValue("#selection-id", b.id);
      await cdp.setInputValue('[data-layout-field="width"]', "50");
      await cdp.setInputValue('[data-layout-field="height"]', "30");
      await cdp.setInputValue('[data-node-prop="text"]', b.text);
      await cdp.setInputValue('[data-node-prop="variant"]', b.variant);
    }

    // 4) 往 layerVisibilityBar (位于底部 y≈654) 内拖入 Label (layerVisibleLabel) 与 Button (toggleVisibleBtn)
    await dragFromPaletteToStage("Label", 60, 654);
    await cdp.setInputValue("#selection-id", "layerVisibleLabel");
    await cdp.setInputValue('[data-layout-field="width"]', "112");
    await cdp.setInputValue('[data-layout-field="height"]', "32");
    await cdp.clickSelector('[data-size-stretch="1"]');
    await cdp.setInputValue('[data-node-prop="text"]', "当前图层：显示");
    await cdp.setInputValue('[data-node-prop="tone"]', "normal");

    await dragFromPaletteToStage("Button", 190, 654);
    await cdp.setInputValue("#selection-id", "toggleVisibleBtn");
    await cdp.setInputValue('[data-layout-field="width"]', "100");
    await cdp.setInputValue('[data-layout-field="height"]', "32");
    await cdp.setInputValue('[data-node-prop="text"]', "隐藏图层");
    await cdp.setInputValue('[data-node-prop="variant"]', "secondary");

    // 5) 切换到“菜单”页签，一键绑定 layersDock 到“视图”菜单（生成 menuToggleLayers）
    await cdp.clickSelector("#tab-menu");
    await cdp.clickSelector('[data-menu-bind-dock="layersDock"]');
    const sceneAfterMenu = JSON.parse(fs.readFileSync(path.join(tmpDir, "ui", "scene.json"), "utf8")) as Scene;
    assert.equal(findMenuItem(sceneAfterMenu, "menuToggleLayers")?.dock, "layersDock");

    // 6) 切换到“状态”页签，创建状态、将 layer.visible 标注为 owner: business、添加业务事件与条件
    await cdp.clickSelector("#tab-state");

    const addStateViaUi = async (sPath: string, sType: string, sInit: string) => {
      await cdp!.setInputValue("[data-new-state-path]", sPath);
      await cdp!.setInputValue("[data-new-state-type]", sType);
      await cdp!.setInputValue("[data-new-state-initial]", sInit);
      await cdp!.clickSelector('[data-state-action="add-state"]');
    };

    await addStateViaUi("project.statusMessage", "string", "就绪");
    await addStateViaUi("layer.visible", "boolean", "true");
    // 点击按钮将 layer.visible 标注为业务管 (owner: business)
    await cdp.clickSelector('[data-state-owner-business="layer.visible"]');

    await addStateViaUi(
      "layers.items",
      "array",
      JSON.stringify([
        { id: 1, name: "背景层", visible: true, locked: false },
        { id: 2, name: "人物线稿", visible: true, locked: false },
        { id: 3, name: "高光层", visible: true, locked: false },
      ]),
    );
    await addStateViaUi("layers.selectedIndex", "number", "0");
    await addStateViaUi("layers.nextId", "number", "4");

    // 添加业务事件 layerToggleVisible
    await cdp.setInputValue("[data-new-bizevent-name]", "layerToggleVisible");
    await cdp.setInputValue("[data-new-bizevent-sim]", "layer.visible = not layer.visible");
    await cdp.clickSelector('[data-state-action="add-bizevent"]');

    // 添加 3 个全局条件
    const addCondViaUi = async (cid: string, expr: string) => {
      await cdp!.setInputValue("[data-new-cond-id]", cid);
      await cdp!.setInputValue("[data-new-cond-expr]", expr);
      await cdp!.clickSelector('[data-state-action="add-condition"]');
    };
    await addCondViaUi(
      "canRemoveLayer",
      "layers.items.length > 1 and layers.selectedIndex >= 0",
    );
    await addCondViaUi(
      "canMoveLayerUp",
      "layers.selectedIndex > 0",
    );
    await addCondViaUi(
      "canMoveLayerDown",
      "layers.selectedIndex >= 0 and layers.selectedIndex < layers.items.length - 1",
    );

    // 7) 在“布局”页签为各控件配置逻辑绑定（bind、动态 props、点击事件步骤）
    await cdp.clickSelector("#tab-layout");
    const selectLayerInTree = async (id: string) => {
      await cdp!.clickSelector(`#layers .layer[data-id="${id}"]`);
    };

    await selectLayerInTree("layerList");
    await cdp.setInputValue('[data-logic-bind="layerList"]', "layers.selectedIndex");
    await cdp.setInputValue('[data-logic-prop="items"]', "layers.items");
    await cdp.setInputValue('[data-logic-prop="value"]', "layers.selectedIndex");

    await selectLayerInTree("addLayerBtn");
    await cdp.setInputValue(
      '[data-logic-click-steps="addLayerBtn"]',
      JSON.stringify([
        {
          push: {
            to: "layers.items",
            item: { id: "layers.nextId", name: '"图层 " + layers.nextId', visible: true, locked: false },
          },
        },
        { set: "layers.selectedIndex = layers.items.length - 1" },
        { set: "layers.nextId = layers.nextId + 1" },
        { set: 'project.statusMessage = "已新建图层"' },
      ]),
    );

    await selectLayerInTree("removeLayerBtn");
    await cdp.setInputValue('[data-logic-prop="enabled"]', "canRemoveLayer");
    await cdp.setInputValue(
      '[data-logic-click-steps="removeLayerBtn"]',
      JSON.stringify([
        {
          if: "canRemoveLayer",
          then: [
            { remove: { from: "layers.items", index: "layers.selectedIndex" } },
            {
              if: "layers.selectedIndex >= layers.items.length",
              then: [{ set: "layers.selectedIndex = layers.items.length - 1" }],
            },
            { set: 'project.statusMessage = "已删除图层"' },
          ],
        },
      ]),
    );

    await selectLayerInTree("moveLayerUpBtn");
    await cdp.setInputValue('[data-logic-prop="enabled"]', "canMoveLayerUp");
    await cdp.setInputValue(
      '[data-logic-click-steps="moveLayerUpBtn"]',
      JSON.stringify([
        {
          if: "canMoveLayerUp",
          then: [
            { move: { in: "layers.items", from: "layers.selectedIndex", to: "layers.selectedIndex - 1" } },
            { set: "layers.selectedIndex = layers.selectedIndex - 1" },
            { set: 'project.statusMessage = "图层已上移"' },
          ],
        },
      ]),
    );

    await selectLayerInTree("moveLayerDownBtn");
    await cdp.setInputValue('[data-logic-prop="enabled"]', "canMoveLayerDown");
    await cdp.setInputValue(
      '[data-logic-click-steps="moveLayerDownBtn"]',
      JSON.stringify([
        {
          if: "canMoveLayerDown",
          then: [
            { move: { in: "layers.items", from: "layers.selectedIndex", to: "layers.selectedIndex + 1" } },
            { set: "layers.selectedIndex = layers.selectedIndex + 1" },
            { set: 'project.statusMessage = "图层已下移"' },
          ],
        },
      ]),
    );

    await selectLayerInTree("layerVisibleLabel");
    await cdp.setInputValue('[data-logic-prop="text"]', 'layer.visible ? "当前图层：显示" : "当前图层：隐藏"');

    await selectLayerInTree("toggleVisibleBtn");
    await cdp.setInputValue('[data-logic-prop="text"]', 'layer.visible ? "隐藏图层" : "显示图层"');
    await cdp.setInputValue('[data-logic-click-steps="toggleVisibleBtn"]', JSON.stringify([{ emit: "layerToggleVisible" }]));

    // 8) 在真实浏览器中验证锁定保护（含向已锁定容器拖拽控件拒绝穿透）与撤销/重做
    await selectLayerInTree("layersDock");
    await cdp.clickSelector('[data-action="lock"]');
    const lockBannerExists = await cdp.eval<boolean>(`Boolean(document.querySelector('[data-layout-locked="true"]'))`);
    assert.equal(lockBannerExists, true, "锁定 layersDock 后布局页签应显示锁定横幅并禁用控件");

    // 实操验证审核项 1：当 layersDock 已锁定时，从素材栏拖 Button 到 layersDock (100, 200) 必须被拦截，不得穿透落入 window
    const sceneWhileDockLocked = fs.readFileSync(path.join(tmpDir, "ui", "scene.json"), "utf8");
    await dragFromPaletteToStage("Button", 100, 200);
    assert.equal(
      fs.readFileSync(path.join(tmpDir, "ui", "scene.json"), "utf8"),
      sceneWhileDockLocked,
      "向已锁定的 layersDock 拖入控件应被拦截，scene.json 不得改变",
    );

    // 点击撤销按钮恢复解锁状态，再点击重做与撤销验证历史栈工作正常
    await cdp.clickSelector('[data-action="undo"]');
    const unlockedAfterUndo = await cdp.eval<boolean>(`!document.querySelector('[data-layout-locked="true"]')`);
    assert.equal(unlockedAfterUndo, true, "点击撤销应解除刚才的锁定");

    await cdp.clickSelector('[data-action="redo"]');
    const relockedAfterRedo = await cdp.eval<boolean>(`Boolean(document.querySelector('[data-layout-locked="true"]'))`);
    assert.equal(relockedAfterRedo, true, "点击重做应恢复锁定");

    await cdp.clickSelector('[data-action="undo"]');

    // 实操验证审核项 1（嵌套子容器锁定）：单独锁定子容器 layerToolbar 后，向其内部 (100, 78) 拖入 Button 不得穿透落入父容器 layersDock
    await selectLayerInTree("layerToolbar");
    await cdp.clickSelector('[data-action="lock"]');
    const sceneWhileToolbarLocked = fs.readFileSync(path.join(tmpDir, "ui", "scene.json"), "utf8");
    await dragFromPaletteToStage("Button", 100, 78);
    assert.equal(
      fs.readFileSync(path.join(tmpDir, "ui", "scene.json"), "utf8"),
      sceneWhileToolbarLocked,
      "向已锁定的子容器 layerToolbar 拖入控件应被拦截，不得穿透落入未锁定的父容器 layersDock",
    );
    await cdp.clickSelector('[data-action="undo"]');

    // 实操验证审核项 3：选中分区主窗口 window 时，布局页签应通过 childrenOfNode 列出分区子节点 layersDock
    await selectLayerInTree("window");
    const winHasDockRow = await cdp.eval<boolean>(
      `Boolean(document.querySelector('[data-layout-children="window"] [data-child-row="layersDock"]'))`,
    );
    assert.equal(winHasDockRow, true, "选中分区主窗口 window 时布局页签应显示其分区子节点列表");

    // 实操验证审核项 5：在菜单页签中尝试把菜单项 menuToggleLayers 重命名为已存在的控件名 layersDock 或保留字 true 均被拦截
    await cdp.clickSelector("#tab-menu");
    await cdp.setInputValue('[data-item-id="menuToggleLayers"]', "layersDock");
    await cdp.setInputValue('[data-item-id="menuToggleLayers"]', "true");
    const sceneAfterInvalidMenuRename = JSON.parse(fs.readFileSync(path.join(tmpDir, "ui", "scene.json"), "utf8")) as Scene;
    assert.ok(findMenuItem(sceneAfterInvalidMenuRename, "menuToggleLayers"), "与控件重名或使用保留字重命名菜单项应被拒绝");
    await cdp.clickSelector("#tab-layout");

    // 实操验证审核项 4 与审核项 6：
    // - 在状态页签中点击已被业务事件 simulate 修改的 layer.visible 的 ui 按钮、以及已被 layerList.bind 绑定的 layers.selectedIndex 的 business 按钮，均应被拦截；
    // - 含有 `<` 号的条件表达式（canMoveLayerDown）必须按纯文本渲染，不得被当作 HTML 标签吞掉或注入节点；
    // - 磁盘上的 logic/app.logic.yaml 必须为多行块格式（不含 state: { / objects: { 单行流式映射）。
    await cdp.clickSelector("#tab-state");
    await cdp.clickSelector('[data-state-owner-ui="layer.visible"]');
    await cdp.clickSelector('[data-state-owner-business="layers.selectedIndex"]');
    await cdp.setInputValue("[data-new-bizevent-name]", "badSimEvent");
    await cdp.setInputValue("[data-new-bizevent-sim]", "layers.selectedIndex = 0");
    await cdp.clickSelector('[data-state-action="add-bizevent"]');

    const condDomCheck = await cdp.eval<{ text: string; childCount: number }>(`(() => {
      const note = document.querySelector('[data-condition-row="canMoveLayerDown"] .vf-muted-note');
      return { text: note?.textContent ?? "", childCount: note?.childElementCount ?? -1 };
    })()`);
    assert.equal(
      condDomCheck.text,
      "layers.selectedIndex >= 0 and layers.selectedIndex < layers.items.length - 1",
      "含 < 的表达式应完整以纯文本显示，不被当作 HTML 标签截断",
    );
    assert.equal(condDomCheck.childCount, 0, "状态面板渲染表达式时不得注入任何 HTML 子元素");

    const savedLogicText = fs.readFileSync(path.join(tmpDir, "logic", "app.logic.yaml"), "utf8");
    assert.ok(!savedLogicText.includes("state: {"), "logic/app.logic.yaml 的 state 应使用多行块格式而非单行流式 {}");
    assert.ok(!savedLogicText.includes("objects: {"), "logic/app.logic.yaml 的 objects 应使用多行块格式而非单行流式 {}");
    assert.ok(!savedLogicText.includes("events: {"), "logic/app.logic.yaml 的 events 应使用多行块格式而非单行流式 {}");
    assert.ok(!savedLogicText.includes("conditions: {"), "logic/app.logic.yaml 的 conditions 应使用多行块格式而非单行流式 {}");

    // 9) 加载搭出来的项目与 examples/animean/design，检查无错误并对比运行结果
    const builtProject = await loadProjectFiles(nodeIO(tmpDir), null);
    const problems = check(builtProject);
    const errors = problems.filter((p) => p.level === "error");
    assert.deepEqual(errors, [], `搭出的项目不应有任何检查错误: ${JSON.stringify(errors)}`);

    // 验证 layer.visible 仍为 business，layers.selectedIndex 仍为 ui，且非法业务事件未写入
    const visLeaf = findStateLeaf(builtProject.logic, "layer.visible");
    assert.ok(visLeaf);
    assert.equal(visLeaf.owner, "business");
    assert.equal(findStateLeaf(builtProject.logic, "layers.selectedIndex")?.owner, undefined);
    assert.equal(builtProject.logic.events?.badSimEvent, undefined);
    assert.equal(allStateLeaves(builtProject.logic).length, 5);

    const animeanProject = await loadProjectFiles(nodeIO(animeanDesignDir), null);
    const builtResults = runLayerPanelSuite(builtProject);
    const animeanResults = runLayerPanelSuite(animeanProject);
    assert.deepEqual(builtResults, animeanResults, "新建项目搭出的图层面板与 examples/animean/design 对跑结果应完全一致");
  } finally {
    cdp?.close();
    if (chromeProc) {
      chromeProc.kill();
    }
    await server.close();
    if (prevEnv === undefined) delete process.env.VF_PROJECT;
    else process.env.VF_PROJECT = prevEnv;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup error on Windows
    }
  }
});

for (const item of queue) {
  await item.fn();
  passed++;
  console.log(`PASS ${item.name}`);
}
console.log(`全部 ${passed} 项测试通过`);
