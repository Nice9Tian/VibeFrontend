// 针对复审 5 项要求与第一轮 7 项要求的回归验证脚本（含无头浏览器 DOM 实测）。
//
//   node scripts/test-step2.ts
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { check, findForbiddenDomUsage } from "../src/check.ts";
import {
  emptyOrigins,
  isReservedComponentName,
  prepareLibraryComponentForProject,
  reconcileProjectLibrary,
  relinkOrphanedOrigin,
  type LibraryItem,
} from "../src/library.ts";
import { loadProjectFiles } from "../src/loader.ts";
import {
  childrenOfNode,
  parentOfNode,
  remapNodeChildren,
  removeNodeReferences,
  renameNodeReferences,
  STANDARD_COMPONENTS,
  type Scene,
} from "../src/model.ts";
import { controlReference, selectionRange } from "../src/refs.ts";
import { nodeIO } from "./node-io.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(APP_ROOT, "..");

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

async function testItem1AndItem5InHeadlessBrowser(): Promise<void> {
  // 1. 纯函数级验证：标准控件名与内置类型名保留，拖入同名收藏走规则 4（改名 Button_2）
  for (const stdName of STANDARD_COMPONENTS.keys()) {
    assert.equal(isReservedComponentName(stdName), true, `标准控件 ${stdName} 必须是保留名称`);
  }
  assert.equal(isReservedComponentName("Window"), true);
  assert.equal(isReservedComponentName("Dock"), true);
  assert.equal(isReservedComponentName("CustomCard"), false);

  const favButton: LibraryItem = {
    id: "fav-btn-1",
    type: "Button",
    label: "按钮",
    description: "收藏里的按钮",
    hash: "12345678",
    sourceProjectId: "other-proj",
    files: {
      "component.json": JSON.stringify({ type: "Button", label: "按钮" }, null, 2) + "\n",
      "index.js": "export default () => ({ update() {}, destroy() {} });\n",
    },
  };
  const dragRes = prepareLibraryComponentForProject(favButton, {}, emptyOrigins());
  assert.equal(dragRes.action, "copy-renamed", "拖入与标准控件同名的收藏必须走规则 4 改名");
  assert.equal(dragRes.localType, "Button_2", "拖入同名 Button 应改名为 Button_2");

  // relinkOrphanedOrigin 不允许关联到保留名称
  const originsWithOrphan = {
    version: 1 as const,
    origins: { OldBtn: { libraryId: "fav-btn-1", baseHash: "12345678" } },
  };
  const relinked = relinkOrphanedOrigin(originsWithOrphan, "OldBtn", "Button");
  assert.ok(relinked.origins.OldBtn, "relinkOrphanedOrigin 应拒绝关联到保留的标准控件名 Button");

  // reconcileProjectLibrary 忽略保留的标准控件名
  const recRes = reconcileProjectLibrary({ Button: favButton.files }, [favButton], emptyOrigins());
  assert.equal(recRes.matchedByLibraryId.size, 0, "reconcileProjectLibrary 不应将标准控件名关联为收藏副本");

  // 2. 无头浏览器实测：
  //    (a) renderLibraryPalette() 执行后 #palette-project 仍常驻全部 8 个标准控件
  //    (b) #doc-preview 在默认预览模式下选中某段文字后，syncPreviewSelectionToTextarea 能同步到 #doc-text 选区并算出精确行号
  const html = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="UTF-8" /></head>
<body>
  <div id="palette-Section">
    <h3>项目素材</h3>
    <div id="palette-project" class="palette"></div>
  </div>
  <div id="pane-doc">
    <div class="note-row">
      <span id="doc-note"></span>
      <button id="doc-quote" type="button">引用所选</button>
    </div>
    <textarea id="doc-text"></textarea>
  </div>
  <script type="module">
    window.addEventListener("error", (e) => {
      fetch("/report", { method: "POST", body: JSON.stringify({ error: String(e.message || e.error) }) });
    });
    window.addEventListener("unhandledrejection", (e) => {
      fetch("/report", { method: "POST", body: JSON.stringify({ error: String(e.reason) }) });
    });
    try {
      const { initLibrary, renderLibraryPalette } = await import("/src/library.ts");
      const { initDocView, syncDocView, syncPreviewSelectionToTextarea, getDocEditMode } = await import("/src/docview.ts");

      const fakeProject = {
        root: "/fake/minimal",
        name: "Minimal",
        pageDoc: "docs/main.md",
        sceneText: "{}",
        logicText: "",
        scene: { version: 1, root: "window", nodes: { window: { type: "Window", width: 800, height: 600 } } },
        logic: {},
        docs: new Map(),
        components: new Map(),
        effects: new Map(),
        presets: [],
        qtExportDir: null,
        problems: [],
        signature: "sig",
      };

      initLibrary({
        getProject: () => fakeProject,
        getMode: () => "edit",
        getZoom: () => 1,
        readText: async () => null,
        writeText: async () => {},
        listDir: async () => [],
        reload: async () => {},
        toast: () => {},
        openMenu: () => {},
        copyComponentRef: () => {},
        setSelection: () => {},
        setNodeTool: () => {},
        addNodeAt: async () => {},
        renderProblems: () => {},
      });

      await renderLibraryPalette();

      const paletteTypes = Array.from(document.querySelectorAll("#palette-project .palette-item")).map(
        (el) => el.dataset.type
      );

      const docTextarea = document.getElementById("doc-text");
      docTextarea.value = [
        "## 标题行",
        "",
        "第一段说明内容。",
        "",
        "第二段要被引用的目标文字。",
        "",
        "第三段结尾。",
      ].join("\\n");
      docTextarea.disabled = false;

      initDocView({
        getProject: () => fakeProject,
        getSelectedId: () => "btn1",
      });
      syncDocView();

      const previewEl = document.getElementById("doc-preview");
      const paragraphs = Array.from(previewEl.querySelectorAll("p"));
      const targetP = paragraphs.find((p) => (p.textContent || "").includes("第二段要被引用的目标文字"));
      const range = document.createRange();
      range.selectNodeContents(targetP);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);

      const synced = syncPreviewSelectionToTextarea();

      await fetch("/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paletteTypes,
          docMode: getDocEditMode(),
          synced,
          selStart: docTextarea.selectionStart,
          selEnd: docTextarea.selectionEnd,
          docValue: docTextarea.value,
        }),
      });
    } catch (err) {
      await fetch("/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: String(err && err.stack ? err.stack : err) }),
      });
    }
  </script>
</body>
</html>`;

  interface BrowserReport {
    paletteTypes: string[];
    docMode: string;
    synced: boolean;
    selStart: number;
    selEnd: number;
    docValue: string;
  }
  let reportData: BrowserReport | null = null;
  let resolveReport!: () => void;
  const reportPromise = new Promise<void>((res) => {
    resolveReport = res;
  });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "POST" && url.pathname === "/report") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        reportData = JSON.parse(body);
        res.writeHead(200);
        res.end("ok");
        resolveReport();
      });
      return;
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    if (url.pathname.startsWith("/@id/@tauri-apps/api/core")) {
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
      res.end("export async function invoke() { return null; }\n");
      return;
    }
    const relPath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const absPath = path.resolve(APP_ROOT, relPath);
    if (!absPath.startsWith(APP_ROOT) || !fs.existsSync(absPath) || fs.statSync(absPath).isDirectory()) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    if (absPath.endsWith(".json")) {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(fs.readFileSync(absPath, "utf8"));
      return;
    }
    if (absPath.endsWith(".css")) {
      res.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });
      res.end(fs.readFileSync(absPath, "utf8"));
      return;
    }
    if (absPath.endsWith(".ts") || absPath.endsWith(".js")) {
      let source = fs.readFileSync(absPath, "utf8");
      source = source.replace(/@tauri-apps\/api\/core/g, "/@id/@tauri-apps/api/core");
      const js = absPath.endsWith(".ts")
        ? ts.transpileModule(source, {
            compilerOptions: {
              module: ts.ModuleKind.ESNext,
              target: ts.ScriptTarget.ES2022,
            },
            fileName: absPath,
          }).outputText
        : source;
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
      res.end(js);
      return;
    }
    res.writeHead(200);
    res.end(fs.readFileSync(absPath));
  });

  await new Promise<void>((res) => server.listen(0, "127.0.0.1", () => res()));
  const port = (server.address() as { port: number }).port;
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-step2-test-"));
  const browserBin = findBrowserExecutable();
  const proc = spawn(
    browserBin,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${userDataDir}`,
      `http://127.0.0.1:${port}/index.html`,
    ],
    { stdio: "ignore" },
  );

  try {
    await Promise.race([
      reportPromise,
      new Promise<void>((_, rej) => setTimeout(() => rej(new Error("无头浏览器测试超时")), 15000)),
    ]);
  } finally {
    try {
      proc.kill();
    } catch {
      // ignore
    }
    server.close();
    server.closeAllConnections?.();
  }

  const report = reportData as BrowserReport | null;
  assert.ok(report, "应收到无头浏览器的实测报告");
  const expectedStd = [...STANDARD_COMPONENTS.keys()];
  assert.deepEqual(
    report.paletteTypes,
    expectedStd,
    `renderLibraryPalette() 后 #palette-project 应常驻全部 8 个标准控件，实测=${JSON.stringify(report.paletteTypes)}`,
  );
  assert.equal(report.docMode, "preview", "文档页签默认应处于 preview 模式");
  assert.equal(report.synced, true, "在 #doc-preview 中选中文字后 syncPreviewSelectionToTextarea 应返回 true");
  assert.ok(report.selEnd > report.selStart, "同步后的 #doc-text 选区不应为空");

  // 验证行号计算：在题设 7 行文本中，“第二段要被引用的目标文字。”位于第 5 行（若该小节在文件第 10 行开始，则对应文件第 14 行）
  const lineRange = selectionRange(report.docValue, report.selStart, report.selEnd, 10);
  assert.deepEqual(lineRange, { start: 14, end: 14 }, `选中第二段时计算出的文件行号应为 14-14，实测=${JSON.stringify(lineRange)}`);
  console.log("PASS 第 1 项与第 5 项（标准控件常驻与名称保护 + 预览模式 #doc-quote 选中行号映射）");
}

async function testItem3JsChecker(): Promise<void> {
  // 1. 正则表达式字面量中包含单双引号，不能掩盖后面的 DOM 访问
  assert.equal(
    findForbiddenDomUsage(`const r1 = /'/; document.body.innerHTML = "x"; const r2 = /'/;`),
    "document",
    "正则字面量 /'/ 不应把后面的 document.body 吞入伪字符串",
  );
  assert.equal(
    findForbiddenDomUsage(`const r1 = /["']/g; window.location.href = "a"; const r2 = /["']/;`),
    "window",
    "字符类含引号的正则字面量 /[\"']/g 不应绕过静态检查",
  );
  assert.equal(
    findForbiddenDomUsage(`if (true) /'/; fetch("https://example.com"); /'/;`),
    "fetch",
    "if (...) 后的正则字面量不应绕过静态检查",
  );
  assert.equal(
    findForbiddenDomUsage(`return /'/ + eval("1") + /'/;`),
    "eval",
    "return 后的正则字面量不应绕过静态检查",
  );

  // 2. 合法纯计算中的除法与正则不应误报
  assert.equal(
    findForbiddenDomUsage(`export default (state) => ({ ratio: state.a / state.b, ok: /^\\d+$/.test("123") });`),
    null,
    "普通除法和合法正则不应误报",
  );

  // 3. actions/*.js 中的禁用 DOM 访问也必须被 check(project) 检出
  const animean = await loadProjectFiles(nodeIO(path.resolve(REPO_ROOT, "examples/animean/design")), null);
  animean.actionSources = {
    ...animean.actionSources,
    exportClip: `export default (input) => { const r1 = /'/; document.title = "hack"; const r2 = /'/; return {}; };`,
  };
  const problems = check(animean);
  const actionDomError = problems.find((p) => p.level === "error" && p.message.includes("exportClip") && p.message.includes("document"));
  assert.ok(actionDomError, `check(project) 必须检出 actions/exportClip.js 中的禁用 DOM 访问，实际 problems=${JSON.stringify(problems)}`);
  console.log("PASS 第 3 项（正则字面量词法扫描 + actions/*.js 静态检查）");
}

async function testItem4UnifiedTraversal(): Promise<void> {
  const animean = await loadProjectFiles(nodeIO(path.resolve(REPO_ROOT, "examples/animean/design")), null);
  // 模拟仅通过 docks / central / statusBar 挂载分区节点（不写冗余 children）的主窗口
  delete animean.scene.nodes["window"].children;

  // 1. refs.ts parentChain：主窗口分区（docks / central / statusBar）及其内部控件引用路径必须包含 window/
  const layersDockRef = controlReference(animean, "layersDock");
  assert.ok(layersDockRef.includes("path=window/layersDock;"), `layersDock 的引用路径应为 window/layersDock，实际=${layersDockRef}`);

  const centralRef = controlReference(animean, "centralArea");
  assert.ok(centralRef.includes("path=window/centralArea;"), `centralArea 的引用路径应为 window/centralArea，实际=${centralRef}`);

  const statusRef = controlReference(animean, "statusBar");
  assert.ok(statusRef.includes("path=window/statusBar;"), `statusBar 的引用路径应为 window/statusBar，实际=${statusRef}`);

  const layerListRef = controlReference(animean, "layerList");
  assert.ok(
    layerListRef.includes("path=window/layersDock/layerList;"),
    `layerList 的引用路径应为 window/layersDock/layerList，实际=${layerListRef}`,
  );

  // 2. childrenOfNode 与 parentOfNode
  const rootChildren = childrenOfNode(animean.scene.nodes["window"]);
  assert.deepEqual(rootChildren, ["toolsDock", "layersDock", "inspectorDock", "timelineDock", "centralArea", "statusBar"]);
  assert.equal(parentOfNode(animean.scene, "layersDock"), "window");
  assert.equal(parentOfNode(animean.scene, "centralArea"), "window");
  assert.equal(parentOfNode(animean.scene, "statusBar"), "window");

  // 3. renameNodeReferences：重命名停靠面板或状态栏时同步更新 root.docks / root.statusBar / menuBar.dock
  const sceneCopy1: Scene = JSON.parse(JSON.stringify(animean.scene));
  sceneCopy1.nodes["layersPanel"] = sceneCopy1.nodes["layersDock"];
  delete sceneCopy1.nodes["layersDock"];
  renameNodeReferences(sceneCopy1, "layersDock", "layersPanel");
  assert.ok(sceneCopy1.nodes["window"].docks?.includes("layersPanel"), "重命名后 window.docks 应更新为 layersPanel");
  assert.ok(!sceneCopy1.nodes["window"].docks?.includes("layersDock"), "重命名后 window.docks 不应残留 layersDock");
  const toggleLayersItem = sceneCopy1.nodes["window"].menuBar?.menus[1]?.items.find((it) => it.id === "menuToggleLayers");
  assert.equal(toggleLayersItem?.dock, "layersPanel", "重命名后菜单项的 item.dock 应同步更新为 layersPanel");

  // 4. removeNodeReferences：删除停靠面板或状态栏时同步清理 root.docks / root.statusBar / menuBar.dock
  const sceneCopy2: Scene = JSON.parse(JSON.stringify(animean.scene));
  removeNodeReferences(sceneCopy2, new Set(["layersDock", "statusBar"]));
  assert.ok(!sceneCopy2.nodes["window"].docks?.includes("layersDock"), "删除后 window.docks 不应残留 layersDock");
  assert.equal(sceneCopy2.nodes["window"].statusBar, undefined, "删除后 window.statusBar 应被清除");
  const toggleLayersAfterDel = sceneCopy2.nodes["window"].menuBar?.menus[1]?.items.find((it) => it.id === "menuToggleLayers");
  assert.equal(toggleLayersAfterDel?.dock, undefined, "删除后菜单项的 item.dock 应被清除");

  // 5. remapNodeChildren 与 check(project) 子节点存在性检查
  const rootCopy = JSON.parse(JSON.stringify(animean.scene.nodes["window"]));
  remapNodeChildren(rootCopy, (id) => `${id}_copy`);
  assert.deepEqual(rootCopy.docks, ["toolsDock_copy", "layersDock_copy", "inspectorDock_copy", "timelineDock_copy"]);
  assert.equal(rootCopy.central, "centralArea_copy");
  assert.equal(rootCopy.statusBar, "statusBar_copy");

  const brokenProject = { ...animean, scene: JSON.parse(JSON.stringify(animean.scene)) };
  brokenProject.scene.nodes["window"].statusBar = "missingStatus";
  const brokenProblems = check(brokenProject);
  assert.ok(
    brokenProblems.some((p) => p.message.includes("missingStatus")),
    "check(project) 应通过 childrenOfNode 检出 statusBar 指向的不存在节点",
  );

  console.log("PASS 第 4 项（统一子节点遍历与结构引用删除/重命名/映射）");
}

async function main(): Promise<void> {
  await testItem1AndItem5InHeadlessBrowser();
  await testItem3JsChecker();
  await testItem4UnifiedTraversal();
  console.log("全部 5 项复审回归测试通过。");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
