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

      // 3. Step 6 复审浏览器实测：
      //    (a) 通过 loadProject 加载 examples/animean/design，验证 StateButton/ColorPicker 的 export default create 与 destroy
      //    (b) 验证 StateButton 在编辑模式（#window.edit）下不响应 hover/press，在预览模式（#window.preview）下正常切换状态，且 .vf-state-image-root 的 5 层 SVG 不被 textContent 清空
      //    (c) 验证 loadProject 在存在加载期语法错误（如损坏的 JSON 或语法错误的 index.js）时，project.problems 同时保留加载期错误与 check(project) 结果且不重复
      const { loadProject } = await import("/src/project.ts");
      const animeanProj = await loadProject(null);
      const stateBtnComp = animeanProj.components.get("StateButton");
      const colorPickerComp = animeanProj.components.get("ColorPicker");

      const hostWin = document.createElement("div");
      hostWin.id = "window";
      hostWin.className = "edit";
      const sbEl = document.createElement("div");
      hostWin.appendChild(sbEl);
      document.body.appendChild(hostWin);

      let emittedCount = 0;
      const sbInst = stateBtnComp.create(sbEl, {
        props: { text: "播放", checkable: true, checked: false, enabled: true },
        emit: () => { emittedCount++; },
        mode: "design",
      });
      const sbRoot = sbEl.querySelector(".vf-state-image-root");
      const sbLayerCount = sbEl.querySelectorAll(".vf-state-image-layer").length;
      const sbTextContent = sbEl.querySelector(".vf-state-image-text")?.textContent ?? "";

      // 编辑模式下派发 mouseenter / mousedown / click，状态必须保持 normal，不触发 hover/pressed
      sbRoot.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      const stateAfterEditHover = sbRoot.dataset.state;
      sbRoot.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      const stateAfterEditPress = sbRoot.dataset.state;
      sbRoot.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
      const emittedInEdit = emittedCount;

      // 切换到预览模式后派发 mouseenter / mousedown / click
      hostWin.className = "preview";
      sbInst.destroy();
      const sbInstPreview = stateBtnComp.create(sbEl, {
        props: { text: "播放", checkable: true, checked: false, enabled: true },
        emit: () => { emittedCount++; },
        mode: "preview",
      });
      const sbRootPreview = sbEl.querySelector(".vf-state-image-root");
      sbRootPreview.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      const stateAfterPreviewHover = sbRootPreview.dataset.state;
      sbRootPreview.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      const stateAfterPreviewPress = sbRootPreview.dataset.state;
      sbRootPreview.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
      const emittedInPreview = emittedCount;
      sbInstPreview.destroy();
      const sbRootAfterDestroy = sbEl.querySelector(".vf-state-image-root");

      // ColorPicker 挂载与销毁 + ColorPickerDraw 效果挂载
      const cpEl = document.createElement("div");
      hostWin.appendChild(cpEl);
      const cpInst = colorPickerComp.create(cpEl, {
        props: { hue: 210, sat: 78, val: 92 },
        emit: () => {},
        mode: "preview",
      });
      const cpDrawEff = animeanProj.effects.get("ColorPickerDraw");
      cpDrawEff.paint(cpEl, {
        props: { hue: 210, saturation: 78, brightness: 92, hexColor: "#3394eb" },
        width: 228,
        height: 152,
      });
      const cpHasRoot = cpEl.classList.contains("vf-color-picker-host") && Boolean(cpEl.querySelector("canvas[data-vf-color-picker]"));
      cpInst.destroy();
      const cpHasRootAfterDestroy = cpEl.classList.contains("vf-color-picker-host");

      // 注入损坏文件覆盖（模拟 ui/scene.json 后面多写字符 + ColorPicker/index.js 语法错误），验证 loadProject 保留加载期报错且不重复
      await fetch("/__fs/set-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          "ui/scene.json": "{ broken json",
          "components/ColorPicker/index.js": "export default function ((( broken syntax",
        }),
      });
      const brokenProj = await loadProject(animeanProj);
      const brokenProblems = brokenProj.problems.map((p) => ({ file: p.file, message: p.message }));

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
          animeanProblems: animeanProj.problems,
          stateBtnHasError: stateBtnComp?.error ?? null,
          colorPickerHasError: colorPickerComp?.error ?? null,
          sbLayerCount,
          sbTextContent,
          stateAfterEditHover,
          stateAfterEditPress,
          emittedInEdit,
          stateAfterPreviewHover,
          stateAfterPreviewPress,
          emittedInPreview,
          sbRootAfterDestroy: Boolean(sbRootAfterDestroy),
          cpHasRoot,
          cpHasRootAfterDestroy,
          brokenProblems,
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
    error?: string;
    paletteTypes: string[];
    docMode: string;
    synced: boolean;
    selStart: number;
    selEnd: number;
    docValue: string;
    animeanProblems: Array<{ level: string; file?: string; message: string }>;
    stateBtnHasError: string | null;
    colorPickerHasError: string | null;
    sbLayerCount: number;
    sbTextContent: string;
    stateAfterEditHover: string;
    stateAfterEditPress: string;
    emittedInEdit: number;
    stateAfterPreviewHover: string;
    stateAfterPreviewPress: string;
    emittedInPreview: number;
    sbRootAfterDestroy: boolean;
    cpHasRoot: boolean;
    cpHasRootAfterDestroy: boolean;
    brokenProblems: Array<{ file: string; message: string }>;
  }
  let reportData: BrowserReport | null = null;
  let resolveReport!: () => void;
  const reportPromise = new Promise<void>((res) => {
    resolveReport = res;
  });

  const animeanDesignRoot = path.resolve(REPO_ROOT, "examples/animean/design");
  let fsOverrides: Record<string, string | null> = {};

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
    if (url.pathname === "/__fs/set-overrides" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        fsOverrides = JSON.parse(body);
        res.writeHead(200);
        res.end("ok");
      });
      return;
    }
    if (url.pathname === "/__fs/root") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(animeanDesignRoot);
      return;
    }
    if (url.pathname === "/__fs/read") {
      const rel = (url.searchParams.get("path") ?? "").replace(/^\/+/, "");
      if (rel in fsOverrides) {
        const v = fsOverrides[rel];
        if (v === null) {
          res.writeHead(404);
          res.end("Not Found");
        } else {
          res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(v);
        }
        return;
      }
      const abs = path.resolve(animeanDesignRoot, rel);
      if (!abs.startsWith(animeanDesignRoot) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
        res.writeHead(404);
        res.end("Not Found");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(fs.readFileSync(abs, "utf8"));
      return;
    }
    if (url.pathname === "/__fs/list") {
      const rel = (url.searchParams.get("path") ?? "").replace(/^\/+/, "");
      const abs = path.resolve(animeanDesignRoot, rel);
      if (!abs.startsWith(animeanDesignRoot) || !fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end("[]");
        return;
      }
      const entries = fs.readdirSync(abs, { withFileTypes: true }).map((e) => ({
        name: e.name,
        isDir: e.isDirectory(),
      }));
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(entries));
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
    if (url.pathname.startsWith("/@id/@tauri-apps/api/event")) {
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
      res.end("export async function listen() { return () => {}; }\n");
      return;
    }
    const relPath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    let absPath = path.resolve(APP_ROOT, relPath);
    if (!fs.existsSync(absPath) && fs.existsSync(`${absPath}.ts`)) {
      absPath = `${absPath}.ts`;
    }
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
      source = source.replace(/@tauri-apps\/api\/event/g, "/@id/@tauri-apps/api/event");
      source = source.replace(/from\s+["']yaml["']/g, 'from "/node_modules/yaml/browser/index.js"');
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
  assert.equal(report.error, undefined, `无头浏览器执行报错：${report.error}`);
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

  // 验证 Step 6 复审项（无头浏览器内真实 loadProject + StateButton/ColorPicker 挂载 + 编辑/预览模式 + problems 保留）：
  const animeanErrors = report.animeanProblems.filter((p) => p.level === "error");
  assert.equal(animeanErrors.length, 0, `examples/animean/design 在浏览器中 loadProject 应无 error，实测=${JSON.stringify(animeanErrors)}`);
  assert.ok(
    report.animeanProblems.some((p) => p.level === "hint" && p.message.includes("ColorPickerDraw") && p.message.includes("ba2779df")),
    "loadProject 应包含 ColorPickerDraw 翻译提示（哈希 ba2779df）",
  );
  assert.ok(
    report.animeanProblems.some((p) => p.level === "hint" && p.message.includes("PanelExpand") && p.message.includes("4c42b870")),
    "loadProject 应包含 PanelExpand 翻译提示（哈希 4c42b870）",
  );
  assert.equal(report.stateBtnHasError, null, "StateButton/index.js 应通过 export default create 正常加载");
  assert.equal(report.colorPickerHasError, null, "ColorPicker/index.js 应通过 export default create 正常加载");
  assert.equal(report.sbLayerCount, 5, "StateButton 挂载后 .vf-state-image-root 应保留全部 5 个状态图层（不被 textContent 清空）");
  assert.equal(report.sbTextContent, "播放", "StateButton 挂载后 .vf-state-image-text 应显示文本“播放”");
  assert.equal(report.stateAfterEditHover, "normal", "编辑模式下 mouseenter 不应把 StateButton 切为 hover");
  assert.equal(report.stateAfterEditPress, "normal", "编辑模式下 mousedown 不应把 StateButton 切为 pressed");
  assert.equal(report.emittedInEdit, 0, "编辑模式下 click 不应触发 StateButton 的 clicked 事件");
  assert.equal(report.stateAfterPreviewHover, "hover", "预览模式下 mouseenter 应把 StateButton 切为 hover");
  assert.equal(report.stateAfterPreviewPress, "pressed", "预览模式下 mousedown 应把 StateButton 切为 pressed");
  assert.equal(report.emittedInPreview, 1, "预览模式下 click 应触发 StateButton 的 clicked 事件");
  assert.equal(report.sbRootAfterDestroy, false, "StateButton.destroy() 后应清理 .vf-state-image-root");
  assert.equal(report.cpHasRoot, true, "ColorPicker 挂载后应渲染 .cp-root");
  assert.equal(report.cpHasRootAfterDestroy, false, "ColorPicker.destroy() 后应清理 .cp-root");

  const sceneBrokenErrors = report.brokenProblems.filter((p) => p.message.includes("ui/scene.json 不是有效的 JSON"));
  assert.equal(sceneBrokenErrors.length, 1, `loadProject 应保留 loader 阶段的 ui/scene.json 语法错误且仅出现 1 次，实测=${JSON.stringify(report.brokenProblems)}`);
  const cpBrokenErrors = report.brokenProblems.filter((p) => p.message.includes("控件 ColorPicker：index.js 加载失败"));
  assert.equal(cpBrokenErrors.length, 1, `loadProject 应报告 ColorPicker/index.js 语法错误且仅出现 1 次，实测=${JSON.stringify(report.brokenProblems)}`);

  console.log("PASS 第 1 项与第 5 项 + Step 6 浏览器实测（StateButton/ColorPicker 模块契约、5 层状态图片、编辑/预览模式隔离、loadProject 错误保留）");
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
