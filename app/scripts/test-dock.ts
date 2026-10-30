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
  dockActivateTab,
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
import { loadProjectFiles } from "../src/loader.ts";
import {
  childrenOfNode,
  removeNodeReferences,
  renameNodeReferences,
  STANDARD_COMPONENTS,
} from "../src/model.ts";
import { nodeIO } from "./node-io.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, "..");
const ANIMEAN_DIR = path.resolve(APP_ROOT, "../examples/animean/design");
const ANIMEAN_QT_EXE = path.resolve(APP_ROOT, "../examples/animean/qt/build/app/vf_animean.exe");

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

  console.log("PASS 1. 停靠纯模型运算、引用维护与 FloatBox 标准容器声明检查");
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
      computeSceneLayout,
      LAYOUT_TYPE_KINDS,
      MOUSE_EVENTS,
      STANDARD_COMPONENTS,
    } from "/src/model.ts";
    import { Runtime } from "/src/runtime.ts";

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

    function childrenOf(n) {
      if (!n) return [];
      const list = [];
      const add = (cid) => {
        if (cid && !list.includes(cid)) list.push(cid);
      };
      for (const cid of n.docks ?? []) add(cid);
      add(n.central);
      add(n.statusBar);
      for (const cid of n.children ?? []) add(cid);
      return list;
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
        if (!childrenOf(n).length) body.textContent = id;
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

      for (const child of childrenOf(n)) buildNode(child, wrapper);
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
      for (const child of childrenOf(root)) buildNode(child, stage);
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
              const parentId = Object.keys(project.scene.nodes).find((pid) => childrenOf(node(pid)).includes(id));
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

    // 步骤 3：切回 inspectorDock 页签并点击标题栏上的“⧉”浮出按钮，再用右下角缩放手柄拖拽改大小
    {
      const tabBtn = stage.querySelector('[data-vf-id="layersDock"] .dock-tab[data-dock-tab="inspectorDock"]');
      tabBtn.click();
      await nextFrame();
      const floatBtn = stage.querySelector('[data-vf-id="inspectorDock"] .dock-action-btn[data-dock-action="float"]');
      floatBtn.click();
      await nextFrame();
      const resizer = stage.querySelector('[data-vf-id="inspectorDock"] .dock-float-resizer');
      const rRect = resizer.getBoundingClientRect();
      simulateDrag(resizer, rRect.left + 4, rRect.top + 4, rRect.left + 24, rRect.top + 24);
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
      const ssRect = splitSplitter.getBoundingClientRect();
      simulateDrag(splitSplitter, ssRect.left + 20, ssRect.top + 2, ssRect.left + 20, ssRect.top - 50);
      await nextFrame();

      const areaSplitter = stage.querySelector('.dock-splitter[data-splitter-kind="area"][data-splitter-area="left"]');
      const asRect = areaSplitter.getBoundingClientRect();
      simulateDrag(areaSplitter, asRect.left + 2, asRect.top + 100, asRect.left + 22, asRect.top + 100);
      await nextFrame();

      const dl = runtime.getDockLayout();
      log.push({
        step: "split-and-splitter-resize",
        leftSize: dl.areas.left.size,
        splitCount: dl.areas.left.groups.length,
        split0Size: dl.areas.left.groups[0]?.size,
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

    // 步骤 8：点击 FloatBox 的“嵌入”按钮嵌回原容器
    {
      const toggleBtn = stage.querySelector('[data-vf-id="onionSkinBox"] .vf-std-floatbox-toggle');
      toggleBtn.click();
      await nextFrame();
      log.push({
        step: "floatbox-restore",
        floating: runtime.view("onionSkinBox").props.floating,
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
  assert.ok(s3.floatingDock.width > 260 && s3.floatingDock.height > 440, "浮窗右下角拖拽缩放生效");

  const s4 = report.log[3] as { floatingCount: number; leftGroupCount: number };
  assert.equal(s4.floatingCount, 0);
  assert.equal(s4.leftGroupCount, 2);

  const s5 = report.log[4] as { leftSize: number; splitCount: number; split0Size: number };
  assert.equal(s5.splitCount, 2, "拖拽到下沿应拆成上下两个并排停靠组");
  assert.equal(s5.leftSize, 260, "拖拽左侧停靠区分隔条应将宽度从 240 调整到 260");

  const s6 = report.log[5] as { hiddenAfterClose: boolean; visibleAfterMenu: boolean };
  assert.equal(s6.hiddenAfterClose, true);
  assert.equal(s6.visibleAfterMenu, true);

  const s7 = report.log[6] as { floating: boolean; floatX: number; floatY: number };
  assert.equal(s7.floating, true);
  assert.equal(s7.floatX, 420);
  assert.equal(s7.floatY, 180);

  const s8 = report.log[7] as { floating: boolean };
  assert.equal(s8.floating, false);

  console.log("PASS 2. 无头 Chrome 真实 DOM 拖拽与点击交互（叠页签/切页签/浮出/缩放/恢复/分栏/分隔条/关闭重开/FloatBox 浮出拖拽与还原）");

  // 对照 Qt 可执行文件在相同停靠编排 + FloatBox 浮出移位后的 layoutDump
  if (fs.existsSync(ANIMEAN_QT_EXE)) {
    const qtSteps =
      "resize:1280x800;dock:tabify:layersDock:inspectorDock;dock:tab:inspectorDock;dock:resize:left:260;toggle:onionSkinBox;floatbox:move:onionSkinBox:420,180;check;layout";
    const qtOut = execFileSync(ANIMEAN_QT_EXE, ["--steps", qtSteps], { encoding: "utf8" });
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
    console.log(
      `PASS 3. 停靠编排 + FloatBox 浮出移位后无头 Chrome DOM 与 Qt 实测几何对比：共 ${count} 个可见控件，最大偏差 ${maxDiff}px（<= 3px）`,
    );
  }
}

async function main(): Promise<void> {
  await testDockModelAndReferences();
  await testHeadlessDomInteractionsAndQtLayout();
  console.log("全部阶段 3（Qt 停靠与浮动嵌入框）测试通过。");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
