// 阶段 3（Qt 停靠与浮动嵌入框 FloatBox）自动化回归与无头浏览器真实 DOM 交互测试：
// 1. 停靠纯模型运算与引用维护（叠页签、切页签、浮出、恢复、分栏并排、改停靠区大小、改分栏大小、删除/重命名/映射）
// 2. FloatBox 标准容器运行态属性、事件与布局脱离/还原计算
// 3. 启动无头 Chrome 渲染真实预览 DOM（含 syncDockHeaderDom / syncDockSplittersDom / FloatBox 组件实例），
//    通过真实鼠标按下、拖拽、松开与按钮点击完成：
//      拖拽叠页签 → 点击页签切换 → 点击按钮浮出 → 拖拽右下角缩放浮窗 → 点击按钮恢复 →
//      拖拽下沿并排分栏 → 拖拽分栏分隔条改大小 → 拖拽停靠区分隔条改大小 → 点击 × 关闭与菜单重开 →
//      点击 FloatBox 浮出按钮 → 拖拽 FloatBox 标题栏移动 → 点击还原按钮嵌回原容器
// 4. 在完成复杂停靠编排 + FloatBox 浮出后，实测无头 Chrome getBoundingClientRect() 与 Qt 可执行文件 layoutDump 逐控件对比（<= 3px）

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { check } from "../src/check.ts";
import {
  computeDockWindowLayout,
  dockActivateTab,
  effectiveDockLayout,
  dockFloat,
  dockIdsOfLayout,
  dockMoveToArea,
  dockResizeArea,
  dockResizeSplit,
  dockRestore,
  dockSplit,
  dockTabify,
  normalizeDockLayout,
  remapDockLayoutReferences,
  removeDockLayoutReferences,
  renameDockLayoutReferences,
} from "../src/dock.ts";
import type { DockLayoutSpec } from "../src/dock.ts";
import {
  applyAddNodeToScene,
  applyDockLayoutToScene,
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
  updateNodePropsAndMeta,
} from "../src/layoutedit.ts";
import { loadProjectFiles } from "../src/loader.ts";
import {
  childrenOfNode,
  computeSceneLayout,
  dockMinHeightForWidth,
  removeNodeReferences,
  renameNodeReferences,
  STANDARD_COMPONENTS,
  syncResizedNodeDimensions,
} from "../src/model.ts";
import { Runtime } from "../src/runtime.ts";
import { nodeIO } from "./node-io.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, "..");
const ANIMEAN_DIR = path.resolve(APP_ROOT, "../examples/animean/design");
const ANIMEAN_QT_EXE = [
  process.env.VF_ANIMEAN_EXE,
  path.join(os.tmpdir(), "vf-build-animean/app/vf_animean.exe"),
  path.resolve(APP_ROOT, "../examples/animean/qt/build/app/vf_animean.exe"),
].find((p): p is string => Boolean(p) && fs.existsSync(p!)) ?? path.join(os.tmpdir(), "vf-build-animean/app/vf_animean.exe");

function buildQtEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (process.platform === "win32") {
    const extraDirs = ["C:\\Qt\\6.9.1\\mingw_64\\bin", "C:\\Qt\\Tools\\mingw1310_64\\bin"].filter((d) =>
      fs.existsSync(d),
    );
    if (extraDirs.length > 0) {
      const pathKey = Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
      env[pathKey] = [...extraDirs, env[pathKey] ?? ""].join(";");
    }
  }
  return env;
}

function findBrowserExecutable(): string {
  const candidates = [
    process.env.CHROME_BIN,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter((p): p is string => Boolean(p));
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error("未找到无头浏览器可执行文件（Chrome 或 Edge）");
}

// ---------------------------------------------------------------------------
// 1. 停靠模型纯函数与引用维护测试
// ---------------------------------------------------------------------------
async function testDockModelAndReferences(): Promise<void> {
  const project = await loadProjectFiles(nodeIO(ANIMEAN_DIR), null);
  const win = project.scene.nodes[project.scene.root];
  assert.ok(win, "主窗口节点存在");

  let layout = normalizeDockLayout(project.scene, win);
  assert.deepEqual(dockIdsOfLayout(layout), ["toolsDock", "timelineDock", "layersDock", "inspectorDock"]);

  // 1) 叠页签：把 inspectorDock 叠入 layersDock
  layout = dockTabify(layout, project.scene, win, "layersDock", "inspectorDock");
  assert.deepEqual(layout.areas.left.groups[0].tabs, ["layersDock", "inspectorDock"]);
  assert.equal(layout.areas.left.groups[0].active, "inspectorDock");
  assert.equal(layout.areas.right.groups.length, 0);

  // 2) 切换激活页签
  layout = dockActivateTab(layout, project.scene, win, "layersDock");
  assert.equal(layout.areas.left.groups[0].active, "layersDock");

  // 3) 浮出面板
  layout = dockFloat(layout, project.scene, win, "inspectorDock", { x: 300, y: 120, width: 280, height: 420 });
  assert.deepEqual(layout.areas.left.groups[0].tabs, ["layersDock"]);
  assert.equal((layout.floating ?? []).length, 1);
  assert.equal(layout.floating![0].dockId, "inspectorDock");
  assert.equal(layout.floating![0].x, 300);
  assert.equal(layout.floating![0].width, 280);

  // 4) 从浮窗恢复
  layout = dockRestore(layout, project.scene, win, "inspectorDock", "right");
  assert.equal((layout.floating ?? []).length, 0);
  assert.deepEqual(layout.areas.right.groups[0].tabs, ["inspectorDock"]);

  // 5) 分栏并排与改大小
  layout = dockSplit(layout, project.scene, win, "layersDock", "inspectorDock", "after");
  assert.equal(layout.areas.left.groups.length, 2);
  layout = dockResizeArea(layout, project.scene, win, "left", 275);
  assert.equal(layout.areas.left.size, 275);
  layout = dockResizeSplit(layout, project.scene, win, "left", 0, 230);
  assert.equal(layout.areas.left.groups[0].size, 230);

  // 6) 移动回右侧并验证引用维护函数
  layout = dockMoveToArea(layout, project.scene, win, "inspectorDock", "right");
  const renamed = structuredClone(layout);
  renameDockLayoutReferences(renamed, "inspectorDock", "propDock");
  assert.ok(dockIdsOfLayout(renamed).includes("propDock"));
  const remapped = structuredClone(renamed);
  remapDockLayoutReferences(remapped, (oldId) => (oldId === "propDock" ? "inspectorDock" : oldId));
  assert.ok(dockIdsOfLayout(remapped).includes("inspectorDock"));
  const removed = structuredClone(remapped);
  removeDockLayoutReferences(removed, new Set(["inspectorDock"]));
  assert.ok(!dockIdsOfLayout(removed).includes("inspectorDock"));

  // 7) 验证 model.ts 的 childrenOfNode / removeNodeReferences / renameNodeReferences
  const sceneClone = structuredClone(project.scene);
  const winClone = sceneClone.nodes[sceneClone.root];
  assert.ok(childrenOfNode(winClone).includes("inspectorDock"));
  renameNodeReferences(sceneClone, "inspectorDock", "renamedInspectorDock");
  assert.ok(dockIdsOfLayout(winClone.dockLayout).includes("renamedInspectorDock"));
  removeNodeReferences(sceneClone, new Set(["renamedInspectorDock"]));
  assert.ok(!dockIdsOfLayout(winClone.dockLayout).includes("renamedInspectorDock"));

  // 8) 验证 checkProject 零错误且 FloatBox 已注册为标准容器
  const problems = check(project).filter((p) => p.level === "error");
  assert.equal(problems.length, 0, `checkProject 不应有错误：${JSON.stringify(problems)}`);
  const fbComp = STANDARD_COMPONENTS.get("FloatBox");
  assert.ok(fbComp, "STANDARD_COMPONENTS 中应注册 FloatBox");
  assert.equal(fbComp.decl.children, true, "FloatBox 应声明 children: true");

  // 9) [审核问题 5] 3 组分栏拖拽分隔条只调整相邻两组且保持其余组大小不变，且在窗口缩放时按比例伸缩
  const scene3 = structuredClone(project.scene);
  scene3.nodes.extraDock = {
    type: "Dock",
    title: "附加",
    dockArea: "left",
    x: 0,
    y: 0,
    width: 240,
    height: 200,
    headerHeight: 26,
    children: [],
  };
  const win3 = scene3.nodes[scene3.root];
  win3.docks = [...(win3.docks ?? []), "extraDock"];
  let layout3 = normalizeDockLayout(scene3, win3);
  layout3 = dockSplit(layout3, scene3, win3, "layersDock", "inspectorDock", "after");
  layout3 = dockSplit(layout3, scene3, win3, "inspectorDock", "extraDock", "after");
  assert.equal(layout3.areas.left.groups.length, 3);
  const g2Before = layout3.areas.left.groups[2].size!;
  layout3 = dockResizeSplit(layout3, scene3, win3, "left", 0, 150);
  assert.equal(layout3.areas.left.groups[0].size, 150, "第 0 组应调整为 150px");
  assert.equal(layout3.areas.left.groups[2].size, g2Before, "第 2 组大小在拖动第 0/1 组间分隔条时不应改变");
  assert.equal(
    layout3.areas.left.groups[0].size! + layout3.areas.left.groups[1].size! + layout3.areas.left.groups[2].size!,
    550,
    "3 组分栏参考跨度之和应等于 550px",
  );
  // 窗口高度从 800 放大到 1000（左侧停靠区高度从 550 变 750），分栏各组高度应按比例伸缩
  const winResized = computeDockWindowLayout(
    scene3,
    scene3.root,
    win3,
    1280,
    28,
    1000 - 28 - 28,
    true,
    () => true,
    layout3,
  );
  const b0 = winResized.dockBoxes.get("layersDock")!;
  const b1 = winResized.dockBoxes.get("inspectorDock")!;
  const b2 = winResized.dockBoxes.get("extraDock")!;
  assert.equal(b0.height + b1.height + b2.height, 750, "窗口缩放后分栏组总高度应填满 750px");
  assert.ok(b0.height > 150, "窗口高度增大后第 0 组高度也应按比例放大");

  // 10) [审核问题 6] 关闭叠页签组中的当前激活页签，自动切换到同组剩余可见页签
  const rtTab = new Runtime(structuredClone(project));
  rtTab.start();
  rtTab.dockTabify("layersDock", "inspectorDock");
  assert.equal(rtTab.getDockLayout().areas.left.groups[0].active, "inspectorDock");
  rtTab.dockSetVisible("inspectorDock", false);
  assert.equal(
    rtTab.getDockLayout().areas.left.groups[0].active,
    "layersDock",
    "关闭当前激活页签 inspectorDock 后应自动激活同组可见的 layersDock",
  );

  // 11) [审核问题 4.1] 浮出的 FloatBox 在原父停靠面板隐藏/关闭后依然保持可见
  const rtFb = new Runtime(structuredClone(project));
  rtFb.start();
  rtFb.dispatch("onionSkinBox", "toggle");
  assert.equal(rtFb.view("onionSkinBox").props.floating, true);
  rtFb.dockSetVisible("inspectorDock", false);
  const fbBoxes = computeSceneLayout(project.scene, {
    rootSize: { width: 1280, height: 800 },
    isVisible: (nid) => rtFb.view(nid).visible,
    getProp: (nid, prop) => rtFb.view(nid).props[prop] ?? null,
    getDockLayout: (wid) => rtFb.getDockLayout(wid),
  });
  assert.equal(fbBoxes.get("inspectorDock")?.visible, false);
  assert.equal(
    fbBoxes.get("onionSkinBox")?.visible,
    true,
    "浮出的 FloatBox 挂在窗口层级，原父 Dock 关闭后仍应可见",
  );

  // 12) [审核问题 3 & 7] applyDockLayoutToScene、syncResizedNodeDimensions、duplicateNodes 与 History 撤销/重做
  const projHist = structuredClone(project);
  const rtHist = new Runtime(projHist);
  rtHist.start();
  let histStack = createHistory();
  const snapBefore = snapshotOf(projHist.scene);
  rtHist.dockTabify("layersDock", "inspectorDock");
  projHist.scene = applyDockLayoutToScene(projHist.scene, rtHist.getDockLayout(), projHist.scene.root);
  rtHist.setDockLayout(rtHist.getDockLayout(), projHist.scene.root);
  const snapAfter = snapshotOf(projHist.scene);
  histStack = pushHistory(histStack, snapBefore, snapAfter, "叠入页签");
  assert.deepEqual(projHist.scene.nodes[projHist.scene.root].dockLayout?.areas.left.groups[0].tabs, [
    "layersDock",
    "inspectorDock",
  ]);
  const undoRes = undoHistory(histStack, snapshotOf(projHist.scene));
  assert.ok(undoRes.snapshot, "应可撤销停靠编排");
  histStack = undoRes.stack;
  projHist.scene = parseScene(undoRes.snapshot.sceneText);
  rtHist.adopt(projHist);
  assert.deepEqual(rtHist.getDockLayout().areas.right.groups[0].tabs, ["inspectorDock"], "撤销后 inspectorDock 应回到右侧停靠区");
  const redoRes = redoHistory(histStack, snapshotOf(projHist.scene));
  assert.ok(redoRes.snapshot, "应可重做停靠编排");
  histStack = redoRes.stack;
  projHist.scene = parseScene(redoRes.snapshot.sceneText);
  rtHist.adopt(projHist);
  assert.deepEqual(rtHist.getDockLayout().areas.left.groups[0].tabs, ["layersDock", "inspectorDock"], "重做后应恢复叠页签");

  // syncResizedNodeDimensions 同步更新 dockLayout.areas.left.size
  syncResizedNodeDimensions(
    projHist.scene.nodes.layersDock,
    310,
    580,
    8,
    projHist.scene,
    "layersDock",
  );
  assert.equal(projHist.scene.nodes[projHist.scene.root].dockLayout?.areas.left.size, 310);

  // applyAddNodeToScene 添加 Dock 节点时同步维护 parent.docks 与 parent.dockLayout
  const newDockId = "clonedLayersDock";
  projHist.scene = applyAddNodeToScene(projHist.scene, projHist.scene.root, newDockId, {
    ...projHist.scene.nodes.layersDock,
    children: [],
  });
  assert.ok(projHist.scene.nodes[projHist.scene.root].docks?.includes(newDockId), "新增的 Dock 应加入主窗口 docks 列表");
  assert.ok(
    dockIdsOfLayout(normalizeDockLayout(projHist.scene, projHist.scene.nodes[projHist.scene.root])).includes(newDockId),
    "新增的 Dock 应出现在主窗口 dockLayout 中",
  );

  // 13) 验证 layoutedit.ts 停靠摆放操作与 winNode.dockLayout 保持同一份描述同步
  const sceneLe = structuredClone(project.scene);
  const placed = placeNewNodeInScene(
    sceneLe,
    "Dock",
    "extraBottomDock",
    400,
    750,
    { width: 1280, height: 160 },
    { dockArea: "bottom", insertIndex: 0, props: { title: "扩展底部" } },
  );
  assert.equal(placed, true);
  const winLe = sceneLe.nodes[sceneLe.root];
  assert.ok(winLe.dockLayout, "placeNewNodeInScene 后主窗口应维护 dockLayout");
  assert.equal(
    winLe.dockLayout!.areas.bottom.groups[0].tabs[0],
    "extraBottomDock",
    "placeNewNodeInScene 按 insertIndex=0 插入底部停靠面板应同步到 dockLayout.areas.bottom.groups[0]",
  );
  assert.equal(setDockPanelArea(sceneLe, "extraBottomDock", "right"), true);
  assert.ok(
    sceneLe.nodes[sceneLe.root].dockLayout!.areas.right.groups.some((g) => g.tabs.includes("extraBottomDock")),
    "setDockPanelArea 切换停靠侧后应同步更新 dockLayout.areas.right",
  );
  assert.ok(
    !sceneLe.nodes[sceneLe.root].dockLayout!.areas.bottom.groups.some((g) => g.tabs.includes("extraBottomDock")),
    "setDockPanelArea 切换停靠侧后原 bottom 停靠区不应残留该面板",
  );
  assert.equal(updateNodePropsAndMeta(sceneLe, "extraBottomDock", { width: 292 }), true);
  assert.equal(
    sceneLe.nodes[sceneLe.root].dockLayout!.areas.right.size,
    292,
    "updateNodePropsAndMeta 修改停靠面板宽度应同步更新 dockLayout.areas.right.size",
  );
  assert.equal(reorderChildInLayout(sceneLe, "extraBottomDock", -1, true), true);
  assert.equal(
    sceneLe.nodes[sceneLe.root].dockLayout!.areas.right.groups[0].tabs[0],
    "extraBottomDock",
    "reorderChildInLayout 调整停靠面板顺序应同步更新 dockLayout.areas.right.groups 顺序",
  );
  assert.equal(setWindowPartitionRole(sceneLe, "extraBottomDock", "none"), true);
  assert.ok(
    !dockIdsOfLayout(sceneLe.nodes[sceneLe.root].dockLayout!).includes("extraBottomDock"),
    "setWindowPartitionRole 降级为普通容器后应从 dockLayout 移除",
  );
  assert.equal(setWindowPartitionRole(sceneLe, "extraBottomDock", "dock", "left"), true);
  assert.ok(
    sceneLe.nodes[sceneLe.root].dockLayout!.areas.left.groups.some((g) => g.tabs.includes("extraBottomDock")),
    "setWindowPartitionRole 重新设回主窗口停靠区应同步更新 dockLayout",
  );
  assert.equal(insertOrMoveNodeInLayout(sceneLe, "extraBottomDock", "layersDock", 0), true);
  assert.ok(
    !dockIdsOfLayout(sceneLe.nodes[sceneLe.root].dockLayout!).includes("extraBottomDock"),
    "insertOrMoveNodeInLayout 移入普通容器后应从主窗口 dockLayout 移除",
  );

  // 10) [审核三 阻塞 1] 顶部、底部停靠区的高度只跟随排列描述，只有换行布局按内容下限撑高
  const edgeScene = project.scene;
  const edgeWin = edgeScene.nodes[edgeScene.root];
  const always = () => true;
  const edgeLayoutOf = (spec: DockLayoutSpec, w = 1280, h = 800) =>
    computeDockWindowLayout(edgeScene, edgeScene.root, edgeWin, w, 28, h - 56, true, always, spec);
  const base = normalizeDockLayout(edgeScene, edgeWin);
  assert.equal(
    dockMinHeightForWidth(edgeScene, edgeScene.nodes.timelineDock, 1280, always),
    0,
    "非换行面板没有内容下限，设计高度不是下限",
  );
  assert.equal(dockMinHeightForWidth(edgeScene, edgeScene.nodes.inspectorDock, 1280, always), 0);
  const toolsFloorWide = dockMinHeightForWidth(edgeScene, edgeScene.nodes.toolsDock, 1280, always);
  const toolsFloorNarrow = dockMinHeightForWidth(edgeScene, edgeScene.nodes.toolsDock, 800, always);
  assert.ok(toolsFloorWide > 0 && toolsFloorNarrow > toolsFloorWide, "换行面板变窄后内容下限变高");

  const bottomSmall = edgeLayoutOf(dockResizeArea(base, edgeScene, edgeWin, "bottom", 100));
  assert.equal(bottomSmall.dockBoxes.get("timelineDock")!.height, 100, "底部停靠区能缩到比设计高度小");
  const tabInBottom = edgeLayoutOf(dockTabify(base, edgeScene, edgeWin, "timelineDock", "inspectorDock"));
  assert.equal(tabInBottom.dockBoxes.get("inspectorDock")!.height, 132, "叠进底部的面板跟随底部厚度");
  const moveToTop = edgeLayoutOf(dockMoveToArea(base, edgeScene, edgeWin, "inspectorDock", "top"));
  const topToolsBox = moveToTop.dockBoxes.get("toolsDock")!;
  assert.equal(
    moveToTop.dockBoxes.get("inspectorDock")!.height,
    Math.max(62, dockMinHeightForWidth(edgeScene, edgeScene.nodes.toolsDock, topToolsBox.width, always)),
    "移到顶部的面板跟随顶部厚度，只有工具条变窄换行时才撑高，不取自己的设计高度 554",
  );
  const vSplitSpec = dockSplit(base, edgeScene, edgeWin, "timelineDock", "inspectorDock", "after", "vertical");
  const vSplit = edgeLayoutOf(vSplitSpec);
  assert.equal(
    vSplit.dockBoxes.get("timelineDock")!.height + vSplit.dockBoxes.get("inspectorDock")!.height,
    132,
    "底部竖向分栏后各组高度之和等于停靠区厚度",
  );
  assert.equal(vSplit.centralBox.height, 800 - 56 - 62 - 132, "底部竖向分栏不挤占中央区");

  const narrowTools = edgeLayoutOf(base, 800, 600);
  assert.equal(narrowTools.dockBoxes.get("toolsDock")!.height, toolsFloorNarrow, "窄窗口下换行面板仍按内容撑高");
  const toolsTiny = edgeLayoutOf(dockResizeArea(base, edgeScene, edgeWin, "top", 48));
  assert.equal(toolsTiny.dockBoxes.get("toolsDock")!.height, Math.max(48, toolsFloorWide), "换行面板的下限是内容高度，不是设计高度");

  // 11) 沿厚度方向并排时拖停靠区分隔条按比例缩放各组，否则归一化后又回到原来的和
  const vSplitResized = dockResizeArea(vSplitSpec, edgeScene, edgeWin, "bottom", 200);
  assert.equal(vSplitResized.areas.bottom.size, 200);
  assert.equal(vSplitResized.areas.bottom.groups.reduce((acc, g) => acc + (g.size ?? 0), 0), 200);
  const hSplitLeft = dockSplit(base, edgeScene, edgeWin, "layersDock", "inspectorDock", "after", "horizontal");
  const hSplitResized = dockResizeArea(hSplitLeft, edgeScene, edgeWin, "left", 300);
  assert.equal(hSplitResized.areas.left.size, 300);
  assert.equal(hSplitResized.areas.left.groups.reduce((acc, g) => acc + (g.size ?? 0), 0), 300);

  // 12) 窗口放不下全部停靠区时只收窄实际尺寸，中央区留有余地，描述不变、窗口放大后恢复
  const hugeBottom = dockResizeArea(base, edgeScene, edgeWin, "bottom", 700);
  const hugeBox = edgeLayoutOf(hugeBottom);
  assert.equal(hugeBottom.areas.bottom.size, 700, "排列描述里的尺寸保持用户拖到的值");
  assert.ok(hugeBox.centralBox.height >= 80, "中央区保留最小高度");
  assert.ok(hugeBox.dockBoxes.get("timelineDock")!.absY + hugeBox.dockBoxes.get("timelineDock")!.height <= 772, "底部停靠区不超出窗口");
  assert.equal(edgeLayoutOf(hugeBottom, 1600, 1000).dockBoxes.get("timelineDock")!.height, 700, "窗口放大后恢复");
  const hugeSides = dockResizeArea(dockResizeArea(base, edgeScene, edgeWin, "left", 900), edgeScene, edgeWin, "right", 900);
  assert.ok(edgeLayoutOf(hugeSides).centralBox.width >= 120, "中央区保留最小宽度");

  // 13) 比较用的实际排列：换行撑高、关闭页签后显示的页签、只剩一组时不带分栏尺寸
  const boxesOf = (spec: DockLayoutSpec, w: number, h: number) => {
    const boxes = edgeLayoutOf(spec, w, h).dockBoxes;
    return (id: string) => boxes.get(id);
  };
  const effNarrow = effectiveDockLayout(base, boxesOf(base, 800, 600));
  assert.equal(effNarrow.areas.top.size, toolsFloorNarrow, "实际厚度含换行撑高");
  assert.equal(base.areas.top.size, 62, "描述不被实际尺寸改写");
  const closedActive = dockTabify(base, edgeScene, edgeWin, "layersDock", "inspectorDock");
  const closedBoxes = computeDockWindowLayout(
    edgeScene, edgeScene.root, edgeWin, 1280, 28, 744, true, (id) => id !== "inspectorDock", closedActive,
  ).dockBoxes;
  const effClosed = effectiveDockLayout(closedActive, (id) => closedBoxes.get(id));
  assert.equal(closedActive.areas.left.groups[0].active, "inspectorDock");
  assert.equal(effClosed.areas.left.groups[0].active, "layersDock", "激活页签已关闭时实际显示的是组里另一个");

  // 14) [审核四] 控件不再显示或被重排后，悬停和按下状态不残留，切回来时不是 hover
  const btn = "colorPanelToggleBtn";
  const freshRuntime = async () => {
    const rt = new Runtime(project);
    rt.start();
    await rt.waitForIdle();
    return rt;
  };
  const stateOf = (rt: Runtime) => rt.view(btn).visualState;
  {
    const rt = await freshRuntime();
    assert.equal(stateOf(rt), "selected", "初始是 selected");
    rt.dockOp("tabify", { target: "layersDock", dock: "inspectorDock" });
    rt.dispatch(btn, "mouseenter");
    assert.equal(stateOf(rt), "hover", "显示着的控件能悬停");
    rt.dockOp("activateTab", { dock: "layersDock" });
    rt.dockOp("activateTab", { dock: "inspectorDock" });
    assert.equal(stateOf(rt), "selected", "切走页签再切回不残留 hover");

    rt.dockOp("activateTab", { dock: "layersDock" });
    rt.dispatch(btn, "mouseenter");
    rt.dockOp("activateTab", { dock: "inspectorDock" });
    assert.equal(stateOf(rt), "selected", "后台页签里的控件不能进入悬停");
  }
  {
    const rt = await freshRuntime();
    rt.dispatch(btn, "mouseenter");
    rt.dockOp("close", { dock: "inspectorDock" });
    await rt.waitForIdle();
    rt.dockOp("open", { dock: "inspectorDock" });
    await rt.waitForIdle();
    assert.equal(stateOf(rt), "selected", "关闭再打开不残留 hover");
    rt.dispatch(btn, "mousedown");
    assert.equal(stateOf(rt), "pressed");
    rt.dockOp("close", { dock: "inspectorDock" });
    await rt.waitForIdle();
    rt.dockOp("open", { dock: "inspectorDock" });
    await rt.waitForIdle();
    assert.equal(stateOf(rt), "selected", "关闭再打开不残留 pressed");
  }
  {
    const rt = await freshRuntime();
    rt.dispatch(btn, "mouseenter");
    rt.dockOp("move", { dock: "inspectorDock", area: "left" });
    assert.equal(stateOf(rt), "selected", "面板重排后不残留 hover");
    rt.dispatch(btn, "mouseenter");
    rt.dockOp("float", { dock: "inspectorDock" });
    assert.equal(stateOf(rt), "selected", "面板浮出后不残留 hover");
    rt.dispatch(btn, "mouseenter");
    rt.dispatch(btn, "mousedown");
    rt.dispatch(btn, "mouseleave");
    assert.equal(stateOf(rt), "selected", "移出时悬停和按下一起清掉");
  }

  // 15) [审核五] 模态框打开时背景控件不残留悬停和按下；移出和松开被模态拦截时也要清掉
  {
    const rt = await freshRuntime();
    rt.dispatch(btn, "mouseenter");
    assert.equal(stateOf(rt), "hover");
    rt.dispatch("newProjectBtn", "click");
    await rt.waitForIdle();
    assert.equal(stateOf(rt), "selected", "模态框打开后背景控件不再悬停");
    rt.dispatch(btn, "mouseenter");
    assert.equal(stateOf(rt), "selected", "模态框打开时背景控件不能进入悬停");
    rt.closeWindow("newProjectDialog");
    assert.equal(stateOf(rt), "selected", "模态框关闭后不残留");
    rt.dispatch(btn, "mouseenter");
    rt.dispatch(btn, "mousedown");
    assert.equal(stateOf(rt), "pressed");
    rt.setDockLayout(rt.getDockLayout());
    assert.equal(stateOf(rt), "selected", "setDockLayout 也清掉停靠面板里的悬停和按下");
  }
  // 16) 已浮出的 FloatBox 脱离了原面板，停靠操作不清它里面的状态
  {
    const rt = await freshRuntime();
    const pointerSets = rt as unknown as { hoveredControls: Set<string> };
    const insideBox = project.scene.nodes.onionSkinBox.children![0];
    rt.dispatch("onionSkinBox", "toggle", true);
    await rt.waitForIdle();
    assert.equal(rt.view("onionSkinBox").props.floating, true);
    rt.dispatch(insideBox, "mouseenter");
    assert.ok(pointerSets.hoveredControls.has(insideBox));
    rt.dockOp("resizeArea", { area: "left", size: 250 });
    assert.ok(pointerSets.hoveredControls.has(insideBox), "停靠操作不影响已浮出 FloatBox 里的控件");
  }

  console.log("PASS 1. 停靠纯模型运算、layoutedit 同步、3组分栏缩放、关闭激活页签自动切换、持久化撤销重做与 FloatBox 独立显隐检查");
}

// ---------------------------------------------------------------------------
// 2. 无头 Chrome 真实 DOM 拖拽与点击交互 + 与 Qt 实测几何对比
// ---------------------------------------------------------------------------
function buildInteractiveHtmlPage(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <link rel="stylesheet" href="/src/styles.css" />
  <style>
    html, body {
      margin: 0;
      padding: 0;
      background: #0f172a;
      overflow: hidden;
    }
    #stage {
      position: relative;
      overflow: hidden;
      user-select: none;
    }
  </style>
</head>
<body class="preview">
  <div id="stage"></div>
  <script>
    window.addEventListener("error", (e) => {
      fetch("/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAgent: navigator.userAgent, error: String(e.error?.stack ?? e.message), log: [], domBoxesAfterOps: {} }),
      });
    });
    window.addEventListener("unhandledrejection", (e) => {
      fetch("/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAgent: navigator.userAgent, error: String(e.reason?.stack ?? e.reason), log: [], domBoxesAfterOps: {} }),
      });
    });
  </script>
  <script type="module">
    import {
      computeDockWindowLayout,
      syncDockHeaderDom,
      syncDockSplittersDom,
    } from "/src/dock.ts";
    import {
      allWindowIds,
      childrenOfNode,
      computeSceneLayout,
      LAYOUT_TYPE_KINDS,
      MOUSE_EVENTS,
      STANDARD_COMPONENTS,
    } from "/src/model.ts";
    import { STANDARD_COMPONENT_LIST } from "/standard/index.ts";
    import { Runtime } from "/src/runtime.ts";

    for (const std of STANDARD_COMPONENT_LIST) {
      if (std.styleText) {
        const styleEl = document.createElement("style");
        styleEl.textContent = \`@scope ([data-vf-type="\${std.decl.type}"]) { \${std.styleText} }\`;
        document.head.append(styleEl);
      }
    }

    const projectRes = await fetch("/project-data.json");
    const projectData = await projectRes.json();
    const project = {
      ...projectData,
      components: new Map(),
      effects: new Map(),
      docs: new Map(),
    };

    const rootSize = { width: 1280, height: 800 };
    const stage = document.getElementById("stage");
    const mounted = new Map();
    let stageReady = false;

    const runtime = new Runtime(project, {
      onChange: () => {
        if (stageReady) applyViews();
      },
      onLog: () => {},
    });
    runtime.start();

    function node(id) {
      return project.scene.nodes[id];
    }

    function buildNode(id, parentEl) {
      const n = node(id);
      if (!n) return;
      const wrapper = document.createElement("div");
      wrapper.className = "vf-node";
      wrapper.dataset.vfId = id;
      wrapper.dataset.vfType = n.type;
      Object.assign(wrapper.style, {
        left: \`\${n.x ?? 0}px\`,
        top: \`\${n.y ?? 0}px\`,
        width: \`\${n.width}px\`,
        height: \`\${n.height}px\`,
      });
      const body = document.createElement("div");
      body.className = "vf-body";
      wrapper.append(body);
      parentEl.append(wrapper);
      const entry = { wrapper, body };
      mounted.set(id, entry);

      if (n.type === "Dock") {
        const header = document.createElement("div");
        header.className = "vf-dock-header";
        header.style.cssText = \`height:\${n.headerHeight ?? 26}px;\`;
        wrapper.prepend(header);
        wrapper.style.background = "#111726";
        wrapper.style.boxShadow = "inset 0 0 0 1px #263042";
        wrapper.style.boxSizing = "border-box";
      } else if (n.type === "Dialog") {
        wrapper.style.background = "#151c2c";
        wrapper.style.borderRadius = "8px";
        wrapper.style.zIndex = "50";
      } else if (n.type === "Container" || n.type in LAYOUT_TYPE_KINDS) {
        if (!childrenOfNode(n).length) body.textContent = id;
      } else if (n.type === "External") {
        body.textContent = \`外部容器 \${id}\`;
      } else {
        const component = STANDARD_COMPONENTS.get(n.type);
        if (component?.create) {
          entry.instance = component.create(body, {
            props: runtime.view(id).props,
            emit: (event, value) => runtime.dispatch(id, event, value),
            mode: "preview",
            nodeEl: wrapper,
            stageEl: stage,
            getZoom: () => 1,
          });
        }
      }

      for (const name of MOUSE_EVENTS) {
        wrapper.addEventListener(name, (e) => {
          const bubbles = name !== "mouseenter" && name !== "mouseleave";
          if (bubbles && e.target.closest(".vf-node") !== wrapper) return;
          runtime.dispatch(id, name);
        });
      }

      for (const child of childrenOfNode(n)) buildNode(child, wrapper);
    }

    function renderStage() {
      stage.innerHTML = "";
      mounted.clear();
      stage.style.width = \`\${rootSize.width}px\`;
      stage.style.height = \`\${rootSize.height}px\`;
      const root = node(project.scene.root);
      if (root.menuBar) {
        const bar = document.createElement("div");
        bar.className = "vf-menubar";
        const mh = root.menuBar.height ?? 28;
        bar.style.cssText = \`position:absolute;left:0;top:0;width:100%;height:\${mh}px;display:flex;align-items:center;gap:4px;padding:0 8px;background:#111827;border-bottom:1px solid #263042;box-sizing:border-box;z-index:20;font-size:12px;color:#e2e8f0;\`;
        for (const menu of root.menuBar.menus ?? []) {
          for (const item of menu.items ?? []) {
            const btn = document.createElement("button");
            btn.dataset.menuItemId = item.id;
            btn.textContent = item.text;
            btn.addEventListener("click", () => runtime.dispatch(item.id, "click"));
            bar.append(btn);
          }
        }
        stage.append(bar);
      }
      for (const child of childrenOfNode(root)) buildNode(child, stage);
      for (const winId of allWindowIds(project.scene)) {
        if (winId !== project.scene.root) buildNode(winId, stage);
      }
    }

    function applyViews() {
      const boxes = computeSceneLayout(project.scene, {
        rootSize,
        isVisible: (nid) => runtime.view(nid).visible,
        getProp: (nid, prop) => runtime.view(nid).props[prop] ?? null,
        getDockLayout: (wid) => runtime.getDockLayout(wid),
      });
      const rootNode = node(project.scene.root);
      const menuH = rootNode.menuBar?.height ?? 28;
      const statusH = rootNode.statusBar && runtime.view(rootNode.statusBar).visible ? 28 : 0;
      const dockWinResult = computeDockWindowLayout(
        project.scene,
        project.scene.root,
        rootNode,
        rootSize.width,
        menuH,
        Math.max(0, rootSize.height - menuH - statusH),
        true,
        (nid) => runtime.view(nid).visible,
        runtime.getDockLayout(project.scene.root),
      );
      const dockCallbacks = {
        getMode: () => "preview",
        getScene: () => project.scene,
        getWindowSize: () => rootSize,
        getDockLayout: () => runtime.getDockLayout(project.scene.root),
        getDockTitle: (did) => String(runtime.view(did).props.title ?? node(did)?.title ?? did),
        onActivateTab: (did) => runtime.dockActivateTab(did, project.scene.root),
        onTabify: (targetId, did) => runtime.dockTabify(targetId, did, project.scene.root),
        onSplit: (targetId, did, pos, orient) => runtime.dockSplit(targetId, did, pos, orient, project.scene.root),
        onMoveToArea: (did, area) => runtime.dockMoveToArea(did, area, undefined, project.scene.root),
        onFloat: (did, rect) => runtime.dockFloat(did, rect, project.scene.root),
        onRestore: (did) => runtime.dockRestore(did, undefined, project.scene.root),
        onClose: (did) => runtime.dockSetVisible(did, false),
        onResizeArea: (area, size) => runtime.dockResizeArea(area, size, project.scene.root),
        onResizeSplit: (area, groupIndex, size) => runtime.dockResizeSplit(area, groupIndex, size, project.scene.root),
      };
      syncDockSplittersDom(stage, dockWinResult.splitters, dockCallbacks);

      for (const [id, entry] of mounted) {
        const view = runtime.view(id);
        const n = node(id);
        const box = boxes.get(id);
        const dockInfo = n?.type === "Dock" ? dockWinResult.activeTabByDock.get(id) : undefined;
        if (box) {
          if (n?.type === "FloatBox" && Boolean(view.props.floating)) {
            if (entry.wrapper.parentElement !== stage) stage.append(entry.wrapper);
            Object.assign(entry.wrapper.style, {
              left: \`\${box.absX}px\`,
              top: \`\${box.absY}px\`,
              width: \`\${box.width}px\`,
              height: \`\${box.height}px\`,
              zIndex: "36",
            });
          } else {
            if (n?.type === "FloatBox") {
              const parentId = Object.keys(project.scene.nodes).find((pid) => childrenOfNode(node(pid)).includes(id));
              const parentWrapper = parentId ? mounted.get(parentId)?.wrapper : null;
              if (parentWrapper && entry.wrapper.parentElement !== parentWrapper) {
                parentWrapper.append(entry.wrapper);
              }
            }
            Object.assign(entry.wrapper.style, {
              left: \`\${box.x}px\`,
              top: \`\${box.y}px\`,
              width: \`\${box.width}px\`,
              height: \`\${box.height}px\`,
              zIndex: dockInfo?.isFloating ? "35" : "",
            });
          }
        }
        const effectiveVis = box ? box.visible : view.visible;
        entry.wrapper.style.display = effectiveVis ? "" : "none";
        if (n?.type === "Dock") {
          const header = entry.wrapper.querySelector(".vf-dock-header");
          if (header) {
            syncDockHeaderDom(
              entry.wrapper,
              header,
              id,
              n.headerHeight ?? 26,
              dockInfo,
              stage,
              dockCallbacks,
            );
          }
        }
        entry.instance?.update?.(view.props);
      }
    }

    function nextFrame() {
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }

    function simulateDrag(el, startX, startY, endX, endY) {
      el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, clientX: startX, clientY: startY }));
      window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, cancelable: true, button: 0, clientX: (startX + endX) / 2, clientY: (startY + endY) / 2 }));
      window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, cancelable: true, button: 0, clientX: endX, clientY: endY }));
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, button: 0, clientX: endX, clientY: endY }));
    }

    function measureDomBoxes() {
      const stageRect = stage.getBoundingClientRect();
      const result = {};
      const nodes = stage.querySelectorAll(".vf-node[data-vf-id]");
      for (const el of nodes) {
        const id = el.dataset.vfId;
        if (!id || id === project.scene.root) continue;
        if (el.getClientRects().length === 0) continue;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        const rect = el.getBoundingClientRect();
        result[id] = {
          x: Math.round(rect.left - stageRect.left),
          y: Math.round(rect.top - stageRect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      }
      return result;
    }

    renderStage();
    stageReady = true;
    applyViews();
    await nextFrame();

    const log = [];
    try {

    // 步骤 1：在 DOM 中按住 inspectorDock 标题栏拖到 layersDock 中央，触发真实叠页签（tabify）
    {
      const inspHdr = stage.querySelector('[data-vf-id="inspectorDock"] > .vf-dock-header');
      const layersEl = stage.querySelector('[data-vf-id="layersDock"]');
      const hRect = inspHdr.getBoundingClientRect();
      const lRect = layersEl.getBoundingClientRect();
      simulateDrag(
        inspHdr,
        hRect.left + 40,
        hRect.top + 12,
        lRect.left + lRect.width / 2,
        lRect.top + lRect.height / 2,
      );
      await nextFrame();
      const dl = runtime.getDockLayout();
      const tabs = dl.areas.left.groups[0]?.tabs ?? [];
      const layersHidden = getComputedStyle(layersEl).display === "none";
      log.push({ step: "drag-tabify", tabs, activeTab: dl.areas.left.groups[0]?.active, layersHidden });
    }

    // 步骤 2：点击 inspectorDock 标题栏上的“图层”页签按钮切回 layersDock
    {
      const tabBtn = stage.querySelector('[data-vf-id="inspectorDock"] .dock-tab[data-dock-tab="layersDock"]');
      tabBtn.click();
      await nextFrame();
      const dl = runtime.getDockLayout();
      const inspEl = stage.querySelector('[data-vf-id="inspectorDock"]');
      log.push({
        step: "click-tab",
        activeTab: dl.areas.left.groups[0]?.active,
        inspectorHidden: getComputedStyle(inspEl).display === "none",
      });
    }

    // 步骤 3：切回 inspectorDock 页签并点击标题栏上的“⧉”浮出按钮，再用右下角缩放手柄拖拽放大到超过 320x440，并拖动标题栏移位验证尺寸保持
    {
      const tabBtn = stage.querySelector('[data-vf-id="layersDock"] .dock-tab[data-dock-tab="inspectorDock"]');
      tabBtn.click();
      await nextFrame();
      const floatBtn = stage.querySelector('[data-vf-id="inspectorDock"] .dock-action-btn[data-dock-action="float"]');
      floatBtn.click();
      await nextFrame();
      const resizer = stage.querySelector('[data-vf-id="inspectorDock"] .dock-float-resizer');
      const rRect = resizer.getBoundingClientRect();
      simulateDrag(resizer, rRect.left + 4, rRect.top + 4, rRect.left + 124, rRect.top + 64);
      await nextFrame();
      const floatHdr = stage.querySelector('[data-vf-id="inspectorDock"] > .vf-dock-header');
      const fhRect = floatHdr.getBoundingClientRect();
      simulateDrag(floatHdr, fhRect.left + 40, fhRect.top + 12, 360, 160);
      await nextFrame();
      const dl = runtime.getDockLayout();
      log.push({
        step: "float-and-resize",
        floatingCount: dl.floating.length,
        floatingDock: dl.floating[0],
      });
    }

    // 步骤 4：点击浮窗标题栏上的“↙”按钮恢复停靠
    {
      const restoreBtn = stage.querySelector('[data-vf-id="inspectorDock"] .dock-action-btn[data-dock-action="restore"]');
      restoreBtn.click();
      await nextFrame();
      const dl = runtime.getDockLayout();
      log.push({
        step: "restore-dock",
        floatingCount: dl.floating.length,
        leftGroupCount: dl.areas.left.groups.length,
      });
    }

    // 步骤 5：先把 inspectorDock 拖到窗口右边沿吸附回右侧，再拖到 layersDock 下半区触发并排分栏（split），再拖动分栏分隔条与左侧停靠区分隔条
    {
      const stageRect = stage.getBoundingClientRect();
      let inspHdr = stage.querySelector('[data-vf-id="inspectorDock"] > .vf-dock-header');
      let hRect = inspHdr.getBoundingClientRect();
      simulateDrag(
        inspHdr,
        hRect.left + 40,
        hRect.top + 12,
        stageRect.right - 10,
        stageRect.top + 300,
      );
      await nextFrame();

      inspHdr = stage.querySelector('[data-vf-id="inspectorDock"] > .vf-dock-header');
      const layersEl = stage.querySelector('[data-vf-id="layersDock"]');
      hRect = inspHdr.getBoundingClientRect();
      const lRect = layersEl.getBoundingClientRect();
      simulateDrag(
        inspHdr,
        hRect.left + 40,
        hRect.top + 12,
        lRect.left + lRect.width / 2,
        lRect.bottom - 20,
      );
      await nextFrame();

      const splitSplitter = stage.querySelector('.dock-splitter[data-splitter-kind="split"][data-splitter-area="left"]');
      const hasSplitClass = splitSplitter.classList.contains("dock-splitter-horizontal");
      const ssRect = splitSplitter.getBoundingClientRect();
      simulateDrag(splitSplitter, ssRect.left + 20, ssRect.top + 2, ssRect.left + 20, ssRect.top - 50);
      await nextFrame();

      const areaSplitter = stage.querySelector('.dock-splitter[data-splitter-kind="area"][data-splitter-area="left"]');
      const hasAreaClass = areaSplitter.classList.contains("dock-splitter-vertical");
      const asRect = areaSplitter.getBoundingClientRect();
      simulateDrag(areaSplitter, asRect.left + 2, asRect.top + 100, asRect.left + 26, asRect.top + 100);
      await nextFrame();

      const dl = runtime.getDockLayout();
      log.push({
        step: "split-and-splitter-resize",
        leftSize: dl.areas.left.size,
        splitCount: dl.areas.left.groups.length,
        split0Size: dl.areas.left.groups[0]?.size,
        hasSplitClass,
        hasAreaClass,
      });
    }

    // 步骤 6：点击 timelineDock 标题栏上的“×”关闭按钮隐藏时间轴，再点击菜单栏“时间轴面板”重新打开
    {
      const closeBtn = stage.querySelector('[data-vf-id="timelineDock"] .dock-action-btn[data-dock-action="close"]');
      closeBtn.click();
      await nextFrame();
      const hiddenAfterClose = !runtime.view("timelineDock").visible;
      const menuBtn = stage.querySelector('button[data-menu-item-id="menuToggleTimeline"]');
      menuBtn.click();
      await nextFrame();
      const visibleAfterMenu = runtime.view("timelineDock").visible;
      log.push({ step: "close-and-reopen-menu", hiddenAfterClose, visibleAfterMenu });
    }

    // 步骤 7：点击 onionSkinBox（FloatBox）的“浮动”按钮，脱离排版后拖拽标题栏移动，再测量 DOM 几何与 Qt 对比
    {
      // 先重置停靠布局到固定测试排布，以便与 Qt 侧同一串指令后的几何 1:1 对照
      runtime.reset();
      runtime.start();
      runtime.dockOp("tabify", { target: "layersDock", dock: "inspectorDock" });
      runtime.dockOp("tab", { dock: "inspectorDock" });
      runtime.dockOp("resize", { area: "left", size: 260 });
      applyViews();
      await nextFrame();

      const toggleBtn = stage.querySelector('[data-vf-id="onionSkinBox"] .vf-std-floatbox-toggle');
      toggleBtn.click();
      await nextFrame();

      const fbHdr = stage.querySelector('[data-vf-id="onionSkinBox"] .vf-std-floatbox-header');
      const fbEl = stage.querySelector('[data-vf-id="onionSkinBox"]');
      const fbRect = fbEl.getBoundingClientRect();
      const hdrRect = fbHdr.getBoundingClientRect();
      const dx = 420 - Math.round(fbRect.left - stage.getBoundingClientRect().left);
      const dy = 180 - Math.round(fbRect.top - stage.getBoundingClientRect().top);
      simulateDrag(fbHdr, hdrRect.left + 30, hdrRect.top + 10, hdrRect.left + 30 + dx, hdrRect.top + 10 + dy);
      await nextFrame();

      const floatProps = runtime.view("onionSkinBox").props;
      log.push({
        step: "floatbox-toggle-and-drag",
        floating: floatProps.floating,
        floatX: floatProps.floatX,
        floatY: floatProps.floatY,
      });
    }

    const domBoxesAfterOps = measureDomBoxes();

    // 步骤 8：验证关闭原父停靠面板 inspectorDock 后，浮出的 onionSkinBox 在 DOM 中仍然可见并切换到 layersDock，再点击“还原”按钮嵌回原容器
    {
      const inspCloseBtn = stage.querySelector('[data-vf-id="inspectorDock"] .dock-action-btn[data-dock-action="close"]');
      inspCloseBtn.click();
      await nextFrame();
      const boxesAfterParentClosed = measureDomBoxes();
      const onionVisibleWhenParentClosed = Boolean(boxesAfterParentClosed.onionSkinBox);
      const activeSwitchedToLayers = runtime.getDockLayout().areas.left.groups[0]?.active === "layersDock";
      runtime.dockSetVisible("inspectorDock", true);
      runtime.dockActivateTab("inspectorDock");
      applyViews();
      await nextFrame();
      const toggleBtn = stage.querySelector('[data-vf-id="onionSkinBox"] .vf-std-floatbox-toggle');
      toggleBtn.click();
      await nextFrame();
      log.push({
        step: "floatbox-restore",
        floating: runtime.view("onionSkinBox").props.floating,
        onionVisibleWhenParentClosed,
        activeSwitchedToLayers,
      });
    }

    // 步骤 9：验证同组多页签拖出分栏（Problem 2B DOM 侧）以及 iframe 缩放容器内的 DOM 拖拽坐标转换
    {
      // 此时 layersDock 与 inspectorDock 叠在同一页签组且激活 inspectorDock，按住 inspectorDock 标题栏拖向自身底部边缘拆分为上下两栏
      const inspHdr = stage.querySelector('[data-vf-id="inspectorDock"] > .vf-dock-header');
      const inspEl = stage.querySelector('[data-vf-id="inspectorDock"]');
      const hRect = inspHdr.getBoundingClientRect();
      const iRect = inspEl.getBoundingClientRect();
      simulateDrag(
        inspHdr,
        hRect.left + 40,
        hRect.top + 12,
        iRect.left + iRect.width / 2,
        iRect.bottom - 15,
      );
      await nextFrame();
      const dlAfterUnTabSplit = runtime.getDockLayout();
      const unTabSplitGroupCount = dlAfterUnTabSplit.areas.left.groups.length;

      // 在带 CSS transform: scale(0.75) 与偏移 (40, 30) 的外层容器中挂载 iframe 画布，测试 iframe 内部与跨窗口指针拖拽坐标
      const hostWrap = document.createElement("div");
      hostWrap.style.cssText = "position:fixed;left:40px;top:30px;transform:scale(0.75);transform-origin:0 0;z-index:100;";
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "width:1280px;height:800px;border:0;";
      hostWrap.append(iframe);
      document.body.append(hostWrap);
      const idoc = iframe.contentDocument;
      const iwin = iframe.contentWindow;
      idoc.open();
      idoc.write('<!doctype html><html><head><style>html,body{margin:0;padding:0;}#istage{position:relative;width:1280px;height:800px;}</style></head><body><div id="istage"></div></body></html>');
      idoc.close();
      const istage = idoc.getElementById("istage");
      let iframeAreaSize = 240;
      const iframeCb = {
        ...{
          getMode: () => "preview",
          getScene: () => project.scene,
          getWindowSize: () => rootSize,
          getDockLayout: () => runtime.getDockLayout(project.scene.root),
          getDockTitle: (did) => did,
          onActivateTab: () => {},
          onTabify: () => {},
          onSplit: () => {},
          onMoveToArea: () => {},
          onFloat: () => {},
          onRestore: () => {},
          onClose: () => {},
          onResizeArea: (_area, sz) => { iframeAreaSize = sz; },
          onResizeSplit: () => {},
        },
      };
      syncDockSplittersDom(
        istage,
        [{ kind: "area", area: "left", orientation: "vertical", x: 237, y: 28, width: 6, height: 580, currentSize: 240 }],
        iframeCb,
      );
      const isplitter = istage.querySelector('.dock-splitter[data-splitter-kind="area"]');
      // 1) iframe 内部坐标系（clientX=240 -> 290，应增加 50px 到 290）
      isplitter.dispatchEvent(new iwin.PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 240, clientY: 100 }));
      iwin.dispatchEvent(new iwin.PointerEvent("pointermove", { bubbles: true, button: 0, clientX: 290, clientY: 100 }));
      iwin.dispatchEvent(new iwin.PointerEvent("pointerup", { bubbles: true, button: 0, clientX: 290, clientY: 100 }));
      const sizeAfterLocalDrag = iframeAreaSize;

      // 2) 外层窗口缩放坐标系（iframe left=40, scale=0.75：startX=240 -> outerClientX = 40 + 240*0.75 = 220，endX=300 -> outerClientX = 40 + 300*0.75 = 265）
      iframeAreaSize = 240;
      isplitter.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 240, clientY: 100 }));
      window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, button: 0, clientX: 40 + 300 * 0.75, clientY: 30 + 100 * 0.75 }));
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: 40 + 300 * 0.75, clientY: 30 + 100 * 0.75 }));
      const sizeAfterOuterScaledDrag = iframeAreaSize;
      hostWrap.remove();

      log.push({
        step: "untab-split-and-iframe-drag",
        unTabSplitGroupCount,
        sizeAfterLocalDrag,
        sizeAfterOuterScaledDrag,
      });
    }

    await fetch("/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userAgent: navigator.userAgent,
        log,
        domBoxesAfterOps,
      }),
    });
    } catch (err) {
      await fetch("/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAgent: navigator.userAgent,
          error: String(err?.stack ?? err),
          log,
          domBoxesAfterOps: {},
        }),
      });
    }
  </script>
</body>
</html>`;
}

async function testHeadlessDomInteractionsAndQtLayout(): Promise<void> {
  const project = await loadProjectFiles(nodeIO(ANIMEAN_DIR), null);
  const browserExe = findBrowserExecutable();
  const tmpProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-dock-chrome-"));

  interface ReportPayload {
    userAgent: string;
    error?: string;
    log: Array<Record<string, unknown>>;
    domBoxesAfterOps: Record<string, { x: number; y: number; width: number; height: number }>;
  }

  let resolveReport!: (val: ReportPayload) => void;
  let rejectReport!: (err: Error) => void;
  const reportPromise = new Promise<ReportPayload>((res, rej) => {
    resolveReport = res;
    rejectReport = rej;
  });

  const server = http.createServer((req, res) => {
    try {
      const urlPath = (req.url ?? "/").split("?")[0];
      if (req.method === "POST" && urlPath === "/report") {
        let body = "";
        req.setEncoding("utf8");
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("ok");
          try {
            resolveReport(JSON.parse(body));
          } catch (e) {
            rejectReport(e as Error);
          }
        });
        return;
      }
      if (urlPath === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(buildInteractiveHtmlPage());
        return;
      }
      if (urlPath === "/project-data.json") {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            name: project.name,
            pageDoc: project.pageDoc,
            scene: project.scene,
            logic: project.logic,
            functions: project.functions,
            actionSources: project.actionSources,
          }),
        );
        return;
      }
      const filePath = path.resolve(APP_ROOT, "." + urlPath);
      if (!filePath.startsWith(APP_ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end("Not found: " + urlPath);
        return;
      }
      if (filePath.endsWith(".json")) {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(fs.readFileSync(filePath, "utf8"));
        return;
      }
      if (filePath.endsWith(".css")) {
        res.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });
        res.end(fs.readFileSync(filePath, "utf8"));
        return;
      }
      if (filePath.endsWith(".ts") || filePath.endsWith(".js")) {
        const raw = fs.readFileSync(filePath, "utf8");
        const js = filePath.endsWith(".ts")
          ? ts.transpileModule(raw, {
              compilerOptions: {
                module: ts.ModuleKind.ESNext,
                target: ts.ScriptTarget.ES2022,
              },
            }).outputText
          : raw;
        res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
        res.end(js);
        return;
      }
      res.writeHead(200);
      res.end(fs.readFileSync(filePath));
    } catch (err) {
      res.writeHead(500);
      res.end(String(err));
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}/`;

  const proc = spawn(
    browserExe,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--window-size=1600,1200",
      `--user-data-dir=${tmpProfileDir}`,
      url,
    ],
    { stdio: "ignore" },
  );

  const timeout = setTimeout(() => {
    rejectReport(new Error("无头浏览器交互测试超时（15s）"));
  }, 15000);

  let report: ReportPayload;
  try {
    report = await reportPromise;
  } finally {
    clearTimeout(timeout);
    try {
      proc.kill();
    } catch {}
    server.closeAllConnections?.();
    server.close();
    try {
      fs.rmSync(tmpProfileDir, { recursive: true, force: true });
    } catch {}
  }

  console.log(`无头浏览器真实 DOM 交互（${report.userAgent}）：`);
  for (const item of report.log) {
    console.log(`  - ${JSON.stringify(item)}`);
  }
  if (report.error) {
    throw new Error(`浏览器脚本异常：${report.error}`);
  }

  const s1 = report.log[0] as { tabs: string[]; activeTab: string; layersHidden: boolean };
  assert.deepEqual(s1.tabs, ["layersDock", "inspectorDock"]);
  assert.equal(s1.activeTab, "inspectorDock");
  assert.equal(s1.layersHidden, true);

  const s2 = report.log[1] as { activeTab: string; inspectorHidden: boolean };
  assert.equal(s2.activeTab, "layersDock");
  assert.equal(s2.inspectorHidden, true);

  const s3 = report.log[2] as { floatingCount: number; floatingDock: { dockId: string; width: number; height: number } };
  assert.equal(s3.floatingCount, 1);
  assert.equal(s3.floatingDock.dockId, "inspectorDock");
  assert.ok(s3.floatingDock.width > 320 && s3.floatingDock.height > 440, "浮窗右下角拖拽放大后再次拖动标题栏应保留放大后的宽高");

  const s4 = report.log[3] as { floatingCount: number; leftGroupCount: number };
  assert.equal(s4.floatingCount, 0);
  assert.equal(s4.leftGroupCount, 2);

  const s5 = report.log[4] as {
    leftSize: number;
    splitCount: number;
    split0Size: number;
    hasSplitClass: boolean;
    hasAreaClass: boolean;
  };
  assert.equal(s5.splitCount, 2, "拖拽到下沿应拆成上下两个并排停靠组");
  assert.equal(s5.leftSize, 260, "拖拽左侧停靠区分隔条应将宽度从 240 调整到 260");
  assert.equal(s5.hasSplitClass, true, "分栏分隔条应包含 .dock-splitter-horizontal 类名");
  assert.equal(s5.hasAreaClass, true, "区域分隔条应包含 .dock-splitter-vertical 类名");

  const s6 = report.log[5] as { hiddenAfterClose: boolean; visibleAfterMenu: boolean };
  assert.equal(s6.hiddenAfterClose, true);
  assert.equal(s6.visibleAfterMenu, true);

  const s7 = report.log[6] as { floating: boolean; floatX: number; floatY: number };
  assert.equal(s7.floating, true);
  assert.equal(s7.floatX, 420);
  assert.equal(s7.floatY, 180);

  const s8 = report.log[7] as {
    floating: boolean;
    onionVisibleWhenParentClosed: boolean;
    activeSwitchedToLayers: boolean;
  };
  assert.equal(s8.floating, false);
  assert.equal(s8.onionVisibleWhenParentClosed, true, "原父 Dock 关闭后浮出的 FloatBox 在 DOM 中仍应可见");
  assert.equal(s8.activeSwitchedToLayers, true, "关闭激活页签后应自动切换到同组剩余可见页签 layersDock");

  const s9 = report.log[8] as {
    unTabSplitGroupCount: number;
    sizeAfterLocalDrag: number;
    sizeAfterOuterScaledDrag: number;
  };
  assert.equal(s9.unTabSplitGroupCount, 2, "同组多页签拖向底边应拆出独立分栏组");
  assert.equal(s9.sizeAfterLocalDrag, 290, "iframe 内部坐标拖拽分隔条应准确计算位移");
  assert.equal(s9.sizeAfterOuterScaledDrag, 300, "iframe 外层缩放窗口坐标拖拽分隔条应按缩放比例换算");

  console.log("PASS 2. 无头 Chrome 真实 DOM 拖拽与点击交互（叠页签/切页签/浮出/缩放/恢复/分栏/分隔条/关闭重开/FloatBox/iframe 坐标）");

  // 对照 Qt 可执行文件在相同停靠编排 + FloatBox 浮出移位后的 layoutDump
  if (fs.existsSync(ANIMEAN_QT_EXE)) {
    const qtEnv = buildQtEnv();
    const qtSteps =
      "resize:1280x800;dock:tabify:layersDock:inspectorDock;dock:tab:inspectorDock;dock:resize:left:260;toggle:onionSkinBox;floatbox:move:onionSkinBox:420,180;check;layout";
    const qtOut = execFileSync(ANIMEAN_QT_EXE, ["--steps", qtSteps], { encoding: "utf8", env: qtEnv });
    const qtLines = qtOut.split(/\r?\n/).filter(Boolean);
    assert.ok(qtLines.includes("check ok"), `Qt check 应通过，实际输出：${qtOut}`);
    const layoutLine = qtLines.find((l) => l.startsWith("layout "));
    assert.ok(layoutLine, "Qt 应输出 layout 行");
    const qtBoxes = JSON.parse(layoutLine.slice("layout ".length)) as Record<
      string,
      { x: number; y: number; width: number; height: number }
    >;

    let maxDiff = 0;
    let count = 0;
    for (const [id, dom] of Object.entries(report.domBoxesAfterOps)) {
      const qt = qtBoxes[id];
      assert.ok(qt, `控件 ${id} 在 DOM 中可见，在 Qt layoutDump 中也应可见`);
      const d = Math.max(
        Math.abs(dom.x - qt.x),
        Math.abs(dom.y - qt.y),
        Math.abs(dom.width - qt.width),
        Math.abs(dom.height - qt.height),
      );
      if (d > maxDiff) maxDiff = d;
      assert.ok(
        d <= 3,
        `停靠编排 + FloatBox 浮出后控件 ${id} 偏差 ${d}px > 3px（DOM=${JSON.stringify(dom)} Qt=${JSON.stringify(qt)}）`,
      );
      count++;
    }

    // 验证 Qt 侧在关闭原父停靠面板 inspectorDock 后，浮出的 onionSkinBox 仍在 layoutDump 中可见，且 check 通过（激活页签切回 layersDock）
    const qtCloseParentSteps =
      "resize:1280x800;dock:tabify:layersDock:inspectorDock;dock:tab:inspectorDock;toggle:onionSkinBox;floatbox:move:onionSkinBox:420,180;dock:close:inspectorDock;check;layout";
    const qtCloseOut = execFileSync(ANIMEAN_QT_EXE, ["--steps", qtCloseParentSteps], { encoding: "utf8", env: qtEnv });
    const qtCloseLines = qtCloseOut.split(/\r?\n/).filter(Boolean);
    assert.ok(qtCloseLines.includes("check ok"), `关闭激活页签后 Qt check 应通过，实际输出：${qtCloseOut}`);
    const qtCloseLayout = JSON.parse(qtCloseLines.find((l) => l.startsWith("layout "))!.slice("layout ".length));
    assert.ok(qtCloseLayout.onionSkinBox, "原父 Dock 关闭后 Qt 中浮出的 onionSkinBox 仍应可见");
    assert.ok(!qtCloseLayout.inspectorDock, "已关闭的 inspectorDock 不应出现在可见 layoutDump 中");
    assert.ok(qtCloseLayout.layersDock, "同组剩余可见页签 layersDock 应自动激活并出现在可见 layoutDump 中");

    // 验证 Qt 侧通过真实 QTest 鼠标按下/移动/松开事件操作停靠面板（拖拽叠页签、点击页签切换、点击浮出/还原、拖拽分隔条、拖拽下沿分栏）
    const qtRealMouseSteps = [
      "resize:1280x800",
      "dock:tabify:layersDock:inspectorDock",
      "check",
      "dock:tab:layersDock",
      "check",
      "dock:float:layersDock",
      "check",
      "dock:restore:layersDock",
      "check",
      "dock:resize:left:276",
      "check",
      "dock:split:layersDock:inspectorDock:after",
      "check",
      "docks",
    ].join(";");
    const qtMouseOut = execFileSync(ANIMEAN_QT_EXE, ["--steps", qtRealMouseSteps], { encoding: "utf8", env: qtEnv });
    const qtMouseLines = qtMouseOut.split(/\r?\n/).filter(Boolean);
    const checkLines = qtMouseLines.filter((l) => l.startsWith("check "));
    assert.equal(checkLines.length, 6, `应有 6 处 check 输出，实际：${qtMouseOut}`);
    for (const cl of checkLines) {
      assert.equal(cl, "check ok", `真实 QTest 鼠标操作后 Qt check 应全部通过：${qtMouseOut}`);
    }
    const finalDocksJson = JSON.parse(qtMouseLines.find((l) => l.startsWith("docks "))!.slice("docks ".length));
    assert.equal(finalDocksJson.areas.left.groups.length, 2, "真实鼠标拖拽下沿分栏后 Qt 实测 dockDump 应有 2 个并排组");
    assert.equal(finalDocksJson.areas.left.size, 276, "真实鼠标拖拽分隔条后 Qt 实测左侧宽度应为 276px");

    // [复审 Blocking 2 问题 A] 先分栏再向第一组叠页签：不应被后续 splitDockWidget 抹平 tabify
    const qtSplitThenTabify = execFileSync(
      ANIMEAN_QT_EXE,
      ["--steps", "resize:1280x800;dock:split:layersDock:inspectorDock:after;dock:tabify:layersDock:timelineDock;check;docks"],
      { encoding: "utf8", env: qtEnv },
    );
    const qtStLines = qtSplitThenTabify.split(/\r?\n/).filter(Boolean);
    assert.ok(qtStLines.includes("check ok"), `先 split 再 tabify 后 Qt check 应通过，实际：${qtSplitThenTabify}`);
    const qtStDocks = JSON.parse(qtStLines.find((l) => l.startsWith("docks "))!.slice("docks ".length));
    assert.equal(qtStDocks.areas.left.groups.length, 2, "先 split 再 tabify 后左侧应保持 2 个并排组");
    assert.deepEqual(
      qtStDocks.areas.left.groups[0].tabs,
      ["layersDock", "timelineDock"],
      "第 0 组应保留 layersDock 与 timelineDock 两个叠放页签",
    );
    assert.deepEqual(qtStDocks.areas.left.groups[1].tabs, ["inspectorDock"], "第 1 组应保留 inspectorDock");

    // [复审 Blocking 2 问题 B] 先叠页签再从同一页签组拖出分栏：应能正确定位可见激活页签并拆分为两栏
    const qtTabifyThenSplit = execFileSync(
      ANIMEAN_QT_EXE,
      ["--steps", "resize:1280x800;dock:tabify:layersDock:inspectorDock;dock:split:layersDock:inspectorDock:after;check;docks"],
      { encoding: "utf8", env: qtEnv },
    );
    const qtTsLines = qtTabifyThenSplit.split(/\r?\n/).filter(Boolean);
    assert.ok(qtTsLines.includes("check ok"), `先 tabify 再同组拖出 split 后 Qt check 应通过，实际：${qtTabifyThenSplit}`);
    const qtTsDocks = JSON.parse(qtTsLines.find((l) => l.startsWith("docks "))!.slice("docks ".length));
    assert.equal(qtTsDocks.areas.left.groups.length, 2, "从同一叠页签组拖出分栏后左侧应拆成 2 个并排组");

    // [复审 Should-Fix 3] 左侧停靠区按水平方向（厚度方向）分栏：areaRect 联合宽度应与总宽度一致
    const qtHorizSplit = execFileSync(
      ANIMEAN_QT_EXE,
      ["--steps", "resize:1280x800;dock:split:layersDock:inspectorDock:after:horizontal;check;docks"],
      { encoding: "utf8", env: qtEnv },
    );
    const qtHsLines = qtHorizSplit.split(/\r?\n/).filter(Boolean);
    assert.ok(qtHsLines.includes("check ok"), `左侧水平分栏后 Qt check 应通过，实际：${qtHorizSplit}`);
    const qtHsDocks = JSON.parse(qtHsLines.find((l) => l.startsWith("docks "))!.slice("docks ".length));
    assert.equal(qtHsDocks.areas.left.splitOrientation, "horizontal", "左侧停靠区应记录为 horizontal 分栏");
    assert.equal(qtHsDocks.areas.left.size, 236, "左侧水平分栏联合总宽度应为 236px");

    // 以下都从 Qt 实测的 docks / layout 判断，鼠标事件走和用户操作相同的路径
    const qtRun = (steps: string) => {
      const out = execFileSync(ANIMEAN_QT_EXE, ["--steps", steps], { encoding: "utf8", env: qtEnv });
      const lines = out.split(/\r?\n/).filter(Boolean);
      for (const l of lines.filter((x) => x.startsWith("check "))) assert.equal(l, "check ok", `${steps}\n${l}`);
      const docksRow = lines.find((l) => l.startsWith("docks "));
      const docks = docksRow ? JSON.parse(docksRow.slice("docks ".length)) : undefined;
      const states = lines.filter((l) => l.startsWith("state ")).map((l) => JSON.parse(l.slice("state ".length)));
      const layoutRow = lines.find((l) => l.startsWith("layout "));
      const boxes = layoutRow ? JSON.parse(layoutRow.slice("layout ".length)) : {};
      return { docks, boxes, states } as {
        docks: DockLayoutSpec;
        boxes: Record<string, { width: number; height: number }>;
        states: Array<{ views: Record<string, { visualState?: string }> }>;
      };
    };

    // [审核三 阻塞 1] 顶部、底部停靠区能缩小，面板移入后不撑大
    assert.equal(qtRun("dock:resize:bottom:100;check;docks").docks.areas.bottom.size, 100);
    const qtBottomTab = qtRun("dock:tabify:timelineDock:inspectorDock;check;docks;layout");
    assert.equal(qtBottomTab.docks.areas.bottom.size, 132, "侧边面板叠进底部后厚度不变");
    assert.equal(qtBottomTab.boxes.inspectorDock.height, 132);
    assert.equal(qtRun("dock:move:inspectorDock:top;check;docks").docks.areas.top.size, 94, "移到顶部后按工具条换行的内容下限");
    const qtBottomSplit = qtRun("dock:split:timelineDock:inspectorDock:after:vertical;check;dock:resize:bottom:200;check;docks");
    assert.equal(qtBottomSplit.docks.areas.bottom.size, 200, "竖向分栏的底部停靠区也能拖分隔条改厚度");
    assert.equal(qtBottomSplit.docks.areas.bottom.groups.length, 2);

    // [审核三 阻塞 2] 三个页签占满标题栏时，拖页签走停靠拖拽，不穿透到 QDockWidget 原生拖拽
    const threeTabs = "dock:tabify:layersDock:inspectorDock;dock:tabify:layersDock:timelineDock;";
    const qtThree = qtRun(`${threeTabs}dock:split:layersDock:timelineDock:after;check;docks`);
    assert.deepEqual(qtThree.docks.floating, [], "拖页签拆分栏不应产生浮窗");
    assert.deepEqual(qtThree.docks.areas.left.groups.map((g) => g.tabs), [["layersDock", "inspectorDock"], ["timelineDock"]]);
    // 没激活的页签也能直接拖，组里剩下的页签和激活页签不变
    const qtInactive = qtRun(`${threeTabs}dock:split:timelineDock:inspectorDock:after;check;docks`);
    assert.deepEqual(qtInactive.docks.areas.left.groups.map((g) => g.tabs), [["layersDock", "timelineDock"], ["inspectorDock"]]);
    assert.equal(qtInactive.docks.areas.left.groups[0].active, "timelineDock");
    assert.deepEqual(
      qtRun(`${threeTabs}dock:move:layersDock:right;check;docks`).docks.areas.right.groups.map((g) => g.tabs),
      [["layersDock"]],
      "拖没激活的页签到右边缘，只有它移走",
    );
    // 点页签仍然是切换
    assert.equal(qtRun(`${threeTabs}dock:tab:inspectorDock;check;docks`).docks.areas.left.groups[0].active, "inspectorDock");
    // 窗口来回缩放后叠页签组和分栏都保持，比较用当前窗口下的实际尺寸
    const qtRoundTrip = qtRun(`${threeTabs}dock:split:layersDock:timelineDock:after;check;resize:800x600;wait:120;check;resize:1280x800;wait:120;check;docks`);
    assert.equal(qtRoundTrip.docks.areas.left.groups.length, 2);

    // [审核四] Qt 里悬停的按钮所在面板切走、关闭后状态不残留
    const hoverSeen = (steps: string) => qtRun(steps).states.map((s) => s.views.colorPanelToggleBtn.visualState);
    assert.deepEqual(
      hoverSeen("dock:tabify:layersDock:inspectorDock;enter:colorPanelToggleBtn;state;dock:tab:layersDock;dock:tab:inspectorDock;state"),
      ["hover", "selected"],
      "Qt 切走页签再切回不残留 hover",
    );
    assert.deepEqual(
      hoverSeen("enter:colorPanelToggleBtn;state;dock:close:inspectorDock;dock:open:inspectorDock;state"),
      ["hover", "selected"],
      "Qt 关闭再打开不残留 hover",
    );

    // 最小化不是关闭：恢复后面板都还在
    const qtMinimized = qtRun("window:minimize;wait:200;state;window:restore;wait:200;check;state;docks");
    for (const s of qtMinimized.states) {
      for (const id of ["toolsDock", "layersDock", "inspectorDock", "timelineDock"]) {
        assert.equal((s.views[id] as { visible?: boolean }).visible, true, `最小化后 ${id} 不应被当成关闭`);
      }
    }

    // [审核五] 模态框：Qt 与逻辑层走同一份清理
    assert.deepEqual(
      hoverSeen("enter:colorPanelToggleBtn;state;click:newProjectBtn;leave:colorPanelToggleBtn;state;click:confirmNewProjectBtn;state"),
      ["hover", "selected", "selected"],
      "Qt 悬停时弹出模态框不残留",
    );

    // 鼠标步骤没做成时状态没变，紧接着的 check 不能报 ok
    const afterFailedPointer = execFileSync(ANIMEAN_QT_EXE, ["--steps", "floatbox:move:noSuchBox:1,1;check"], { encoding: "utf8", env: qtEnv })
      .split(/\r?\n/)
      .filter((l) => l.startsWith("check "));
    assert.ok(afterFailedPointer.length === 2 && afterFailedPointer.every((l) => l.startsWith("check MISMATCH")), afterFailedPointer.join("\n"));

    // [审核五] check 读真实控件：面板被背着逻辑层隐藏时必须报错；最小化时面板逻辑上还开着，check ok 是对的
    const rawChecks = (steps: string) =>
      execFileSync(ANIMEAN_QT_EXE, ["--steps", steps], { encoding: "utf8", env: qtEnv })
        .split(/\r?\n/)
        .filter((l) => l.startsWith("check "));
    const brokenChecks = rawChecks("break:hide:inspectorDock;check");
    assert.ok(
      brokenChecks.some((l) => l.includes("check MISMATCH inspectorDock.visible")),
      `面板被意外隐藏时 check 应报 inspectorDock.visible，实际：${brokenChecks.join("\n").slice(0, 300)}`,
    );
    assert.deepEqual(rawChecks("window:minimize;wait:200;check"), ["check ok"], "最小化时面板逻辑上仍开着");

    // 窗口放不下时 Qt 不被停靠面板撑大
    const qtHuge = qtRun("dock:resize:bottom:700;check;docks;layout");
    assert.ok(qtHuge.docks.areas.bottom.size! <= 800 - 56 - 62 - 80 + 3, `底部实测厚度 ${qtHuge.docks.areas.bottom.size}`);
    // 全部页签关闭的组夹在中间时，分隔条序号和逻辑层一致
    const qtClosedMiddle = qtRun(
      "dock:split:layersDock:timelineDock:after;dock:split:timelineDock:inspectorDock:after;dock:close:timelineDock;check;dock:resizeSplit:left:0:300;check;docks",
    );
    assert.equal(qtClosedMiddle.docks.areas.left.groups.length, 3);

    // DataForm (toolOptionsForm) 在固定 58px 高度下应保持自然行高（按钮高度 >= 20px）并提供纵向滚动
    const qtFormCheck = execFileSync(
      ANIMEAN_QT_EXE,
      ["--steps", "resize:1280x800;size:toolOptionsForm;size:toolOptionsForm:buttons;size:toolOptionsForm:scroll;size:toolOptionsForm:scroll=20;form:toolOptionsForm:color:blue;size:toolOptionsForm:scroll;click:toolAutoMapBtn;size:toolOptionsForm:scroll"],
      { encoding: "utf8", env: qtEnv },
    )
      .split(/\r?\n/)
      .filter(Boolean);
    const formBtnsLine = qtFormCheck.find((l) => l.startsWith("size toolOptionsForm buttons ")) ?? "";
    const formBtnEntries = formBtnsLine
      .replace(/^size toolOptionsForm buttons\s*/, "")
      .split(",")
      .filter(Boolean);
    assert.ok(formBtnEntries.length >= 3, `toolOptionsForm 应包含至少 3 个可见按钮，实际：${formBtnsLine}`);
    for (const entry of formBtnEntries) {
      const m = /^(.+)=(\d+)x(\d+)$/.exec(entry);
      assert.ok(m, `按钮尺寸格式错误：${entry}`);
      const btnH = Number(m![3]);
      assert.ok(btnH >= 20, `toolOptionsForm 按钮 ${m![1]} 高度应保持自然行高 (>= 20px)，不应被挤扁，实际：${entry}`);
    }
    const formScrollLine = qtFormCheck.find((l) => l.startsWith("size toolOptionsForm scroll ")) ?? "";
    const maxScrollMatch = /maxScroll=(\d+)/.exec(formScrollLine);
    assert.ok(
      maxScrollMatch && Number(maxScrollMatch[1]) > 0,
      `toolOptionsForm 内容超出 58px 时应可纵向滚动 (maxScroll > 0)，实际：${formScrollLine}`,
    );
    const formScrollLines = qtFormCheck.filter((l) => l.startsWith("size toolOptionsForm scroll "));
    const afterSyncScrollLine = formScrollLines[2] ?? "";
    assert.ok(
      /value=20\b/.test(afterSyncScrollLine),
      `同表单内改值（syncDataFormValues）应保留滚动位置 value=20，实际：${afterSyncScrollLine}`,
    );
    const afterRebuildScrollLine = formScrollLines[3] ?? "";
    assert.ok(
      /value=0\b/.test(afterRebuildScrollLine),
      `切换工具表单结构（rebuildDataForm）时应将滚动条归零 value=0，实际：${afterRebuildScrollLine}`,
    );

    console.log(
      `PASS 3. 停靠编排 + FloatBox 浮出移位后无头 Chrome DOM 与 Qt 实测几何对比：共 ${count} 个可见控件，最大偏差 ${maxDiff}px（<= 3px），父 Dock 关闭后 FloatBox 独立显隐、真实 QTest 鼠标拖拽及复审组合场景验证通过`,
    );
  } else {
    console.log(`未运行第 3 项：找不到 Qt 程序 ${ANIMEAN_QT_EXE}。用环境变量 VF_ANIMEAN_EXE 指定`);
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  await testDockModelAndReferences();
  await testHeadlessDomInteractionsAndQtLayout();
  if (!process.exitCode) console.log("全部阶段 3（Qt 停靠与浮动嵌入框）测试通过。");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
