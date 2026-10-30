// 在三个窗口尺寸（及打开模态对话框）下，启动无头浏览器（Chrome / Edge）渲染设计项目的真实 DOM，
// 用 getBoundingClientRect() 实测每个可见控件在各自窗口内的屏幕坐标与宽高，
// 并与导出的 Qt 程序实际运行时的控件几何（layoutDump）逐一比较，检查偏差不超过 3 像素。
//
//   node scripts/compare-layout.ts <设计项目文件夹> <Qt可执行文件路径>
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { loadProjectFiles } from "../src/loader.ts";
import { nodeIO } from "./node-io.ts";

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SIZES: Array<{ width: number; height: number }> = [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1024, height: 720 },
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, "..");

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

function buildHtmlPage(): string {
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
      --color-text: #e2e8f0;
      --color-heading: #f8fafc;
      --color-muted: #94a3b8;
      --color-surface: #1e293b;
      --color-border: #334155;
    }
  </style>
</head>
<body class="preview">
  <div id="stage"></div>
  <script type="module">
    import {
      allWindowIds,
      computeSceneLayout,
      LAYOUT_TYPE_KINDS,
      MOUSE_EVENTS,
      STANDARD_COMPONENTS,
    } from "/src/model.ts";
    import { STANDARD_COMPONENT_LIST } from "/standard/index.ts";
    import { Runtime } from "/src/runtime.ts";

    const projectRes = await fetch("/project-data.json");
    const projectData = await projectRes.json();
    const project = {
      ...projectData,
      components: new Map(),
      effects: new Map(),
      docs: new Map(),
    };

    for (const std of STANDARD_COMPONENT_LIST) {
      if (std.styleText) {
        const styleEl = document.createElement("style");
        styleEl.textContent = \`@scope ([data-vf-type="\${std.decl.type}"]) { \${std.styleText} }\`;
        document.head.append(styleEl);
      }
    }

    const runtime = new Runtime(project);
    runtime.start();

    const stage = document.getElementById("stage");
    const mounted = new Map();

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
        header.style.cssText = \`height:\${n.headerHeight ?? 26}px;display:flex;align-items:center;padding:0 10px;font-size:12px;font-weight:600;background:#182030;color:#cbd5e1;border-bottom:1px solid #2b3548;box-sizing:border-box;user-select:none;\`;
        header.textContent = String(runtime.view(id).props.title ?? n.title ?? id);
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

    function renderStage(rootSize) {
      for (const entry of mounted.values()) {
        try { entry.instance?.destroy?.(); } catch {}
      }
      mounted.clear();
      stage.innerHTML = "";
      const root = node(project.scene.root);
      if (!root) return;
      stage.style.width = \`\${rootSize.width}px\`;
      stage.style.height = \`\${rootSize.height}px\`;

      if (root.menuBar) {
        const bar = document.createElement("div");
        const mh = root.menuBar.height ?? 28;
        bar.style.cssText = \`position:absolute;left:0;top:0;width:100%;height:\${mh}px;display:flex;align-items:center;gap:12px;padding:0 10px;background:#111827;border-bottom:1px solid #263042;box-sizing:border-box;z-index:20;font-size:12px;color:#e2e8f0;\`;
        for (const m of root.menuBar.menus ?? []) {
          const item = document.createElement("span");
          item.style.cssText = "font-weight:600;color:#cbd5e1;padding:2px 6px;border-radius:4px;background:#1e293b;";
          item.textContent = m.title;
          bar.append(item);
        }
        stage.append(bar);
      }

      for (const child of childrenOf(root)) buildNode(child, stage);
      for (const winId of allWindowIds(project.scene)) {
        if (winId !== project.scene.root) buildNode(winId, stage);
      }
    }

    function applyViews(rootSize) {
      stage.style.width = \`\${rootSize.width}px\`;
      stage.style.height = \`\${rootSize.height}px\`;
      const boxes = computeSceneLayout(project.scene, {
        rootSize,
        isVisible: (nid) => runtime.view(nid).visible,
        getProp: (nid, prop) => runtime.view(nid).props[prop] ?? null,
      });
      for (const [id, entry] of mounted) {
        const view = runtime.view(id);
        const n = node(id);
        const box = boxes.get(id);
        if (box && n?.type !== "Line") {
          if (n?.type === "Dialog" && id !== project.scene.root) {
            const dx = Math.round((rootSize.width - box.width) / 2);
            const dy = Math.round((rootSize.height - box.height) / 2);
            Object.assign(entry.wrapper.style, {
              left: \`\${dx}px\`,
              top: \`\${dy}px\`,
              width: \`\${box.width}px\`,
              height: \`\${box.height}px\`,
            });
          } else {
            Object.assign(entry.wrapper.style, {
              left: \`\${box.x}px\`,
              top: \`\${box.y}px\`,
              width: \`\${box.width}px\`,
              height: \`\${box.height}px\`,
            });
          }
        }
        const effectiveVis = box ? box.visible : view.visible;
        entry.wrapper.style.display = effectiveVis ? "" : "none";
        entry.wrapper.toggleAttribute("data-vf-disabled", !view.enabled);
        if (n?.type === "Dock") {
          const header = entry.wrapper.querySelector(".vf-dock-header");
          if (header) header.textContent = String(view.props.title ?? n?.title ?? id);
        }
        entry.instance?.update?.(view.props);
      }
    }

    function nextFrame() {
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }

    function measureDomBoxes() {
      const stageRect = stage.getBoundingClientRect();
      const result = {};
      const nodes = stage.querySelectorAll(".vf-node[data-vf-id]");
      for (const el of nodes) {
        const id = el.dataset.vfId;
        if (!id || id === project.scene.root) continue;
        // 必须真在 DOM 中可见且有布局尺寸
        if (el.getClientRects().length === 0) continue;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;

        const rect = el.getBoundingClientRect();
        const dialogAncestor = el.parentElement?.closest('.vf-node[data-vf-type="Dialog"]');
        if (el.dataset.vfType === "Dialog") {
          result[id] = {
            x: 0,
            y: 0,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        } else if (dialogAncestor) {
          const dRect = dialogAncestor.getBoundingClientRect();
          result[id] = {
            x: Math.round(rect.left - dRect.left),
            y: Math.round(rect.top - dRect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        } else {
          result[id] = {
            x: Math.round(rect.left - stageRect.left),
            y: Math.round(rect.top - stageRect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        }
      }
      return result;
    }

    const sizes = ${JSON.stringify(SIZES)};
    renderStage(sizes[0]);
    if (new URLSearchParams(window.location.search).get("shot") === "1") {
      applyViews(sizes[0]);
      await nextFrame();
    } else {
      const measuredScenarios = [];
      for (const size of sizes) {
        applyViews(size);
        await nextFrame();
        measuredScenarios.push(measureDomBoxes());
      }

      // 第 4 个场景：在 1024x720 下真实点击 DOM 中的 newProjectBtn 打开新建项目对话框后量取 DOM
      const lastSize = sizes[sizes.length - 1];
      const btnEl = stage.querySelector('[data-vf-id="newProjectBtn"] button') || stage.querySelector('[data-vf-id="newProjectBtn"]');
      if (btnEl) {
        btnEl.click();
      } else {
        runtime.dispatch("newProjectBtn", "click");
      }
      applyViews(lastSize);
      await nextFrame();
      measuredScenarios.push(measureDomBoxes());

      await fetch("/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAgent: navigator.userAgent,
          scenarios: measuredScenarios,
        }),
      });
    }
  </script>
</body>
</html>`;
}

async function measureInHeadlessBrowser(
  project: Awaited<ReturnType<typeof loadProjectFiles>>,
  webShotOutPath?: string,
): Promise<{
  userAgent: string;
  scenarios: Array<Record<string, Box>>;
}> {
  const browserExe = findBrowserExecutable();
  const tmpProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-layout-chrome-"));

  let resolveReport!: (val: { userAgent: string; scenarios: Array<Record<string, Box>> }) => void;
  let rejectReport!: (err: Error) => void;
  const reportPromise = new Promise<{ userAgent: string; scenarios: Array<Record<string, Box>> }>((res, rej) => {
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
        res.end(buildHtmlPage());
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
        const rawJson = fs.readFileSync(filePath, "utf8");
        if (req.headers["sec-fetch-dest"] === "script" || (req.headers.accept ?? "").includes("javascript")) {
          res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
          res.end(`export default ${rawJson};`);
        } else {
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(rawJson);
        }
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
    rejectReport(new Error("无头浏览器测量 DOM 超时（15s）"));
  }, 15000);

  try {
    const res = await reportPromise;
    if (webShotOutPath) {
      const shotProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-shot-chrome-"));
      try {
        await new Promise<void>((resolve, reject) => {
          const shotProc = spawn(
            browserExe,
            [
              "--headless=new",
              "--disable-gpu",
              "--hide-scrollbars",
              "--no-first-run",
              "--no-default-browser-check",
              "--window-size=1280,800",
              `--user-data-dir=${shotProfileDir}`,
              `--screenshot=${webShotOutPath}`,
              `${url}?shot=1`,
            ],
            { stdio: "ignore" },
          );
          shotProc.on("exit", () => resolve());
          shotProc.on("error", reject);
        });
      } finally {
        try {
          fs.rmSync(shotProfileDir, { recursive: true, force: true });
        } catch {}
      }
    }
    return res;
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
}

async function main(): Promise<number> {
  const [projectArg, qtExeArg, webShotArg] = process.argv.slice(2);
  if (!projectArg || !qtExeArg) {
    console.log("用法：node scripts/compare-layout.ts <设计项目文件夹> <Qt可执行文件路径> [Web截图输出路径]");
    return 2;
  }
  const projectDir = path.resolve(projectArg);
  const qtExe = path.resolve(qtExeArg);
  const webShotOutPath = webShotArg ? path.resolve(webShotArg) : undefined;
  const project = await loadProjectFiles(nodeIO(projectDir), null);

  // 1. 启动无头浏览器渲染真实 DOM 并通过 getBoundingClientRect() 量取各场景下每个可见控件的屏幕坐标
  const domMeasured = await measureInHeadlessBrowser(project, webShotOutPath);
  console.log(`DOM 实测浏览器：${domMeasured.userAgent}`);

  // 2. 启动 Qt 可执行文件量取相同场景下的真实 QWidget 几何
  const steps = [
    ...SIZES.map((s) => `resize:${s.width}x${s.height};layout`),
    "click:newProjectBtn;layout",
  ].join(";");
  const rawOut = execFileSync(qtExe, ["--steps", steps], { encoding: "utf8" });
  const layoutLines = rawOut
    .split(/\r?\n/)
    .filter((line) => line.startsWith("layout "))
    .map((line) => JSON.parse(line.slice("layout ".length)) as Record<string, Box>);

  if (layoutLines.length !== SIZES.length + 1 || domMeasured.scenarios.length !== SIZES.length + 1) {
    console.log(
      `错误：期望收到 ${SIZES.length + 1} 个场景的布局数据，实际 DOM=${domMeasured.scenarios.length}，Qt=${layoutLines.length}`,
    );
    return 1;
  }

  let globalMaxDiff = 0;
  let failed = false;

  const labels = [
    ...SIZES.map((size) => `窗口尺寸 ${size.width}x${size.height}`),
    `窗口尺寸 ${SIZES[SIZES.length - 1].width}x${SIZES[SIZES.length - 1].height}（打开新建项目对话框）`,
  ];

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    const domBoxes = domMeasured.scenarios[i];
    const qtBoxes = layoutLines[i];

    let sizeMaxDiff = 0;
    let comparedCount = 0;
    const mismatches: string[] = [];

    const allIds = new Set<string>([...Object.keys(domBoxes), ...Object.keys(qtBoxes)]);
    for (const id of allIds) {
      if (id === project.scene.root) continue;
      const dom = domBoxes[id];
      const qt = qtBoxes[id];
      if (!dom) {
        mismatches.push(`  ${id}：Qt 侧可见，但浏览器 DOM 中未测到可见元素`);
        failed = true;
        continue;
      }
      if (!qt) {
        mismatches.push(`  ${id}：浏览器 DOM 中可见，但 Qt 侧未出现在 layoutDump 中`);
        failed = true;
        continue;
      }
      const dx = Math.abs(dom.x - qt.x);
      const dy = Math.abs(dom.y - qt.y);
      const dw = Math.abs(dom.width - qt.width);
      const dh = Math.abs(dom.height - qt.height);
      const maxD = Math.max(dx, dy, dw, dh);
      if (maxD > sizeMaxDiff) sizeMaxDiff = maxD;
      if (maxD > globalMaxDiff) globalMaxDiff = maxD;
      comparedCount++;

      if (maxD > 3) {
        mismatches.push(
          `  ${id}：相差 ${maxD}px（DOM=[${dom.x},${dom.y},${dom.width}x${dom.height}] Qt=[${qt.x},${qt.y},${qt.width}x${qt.height}]）`,
        );
        failed = true;
      }
    }

    console.log(
      `${label}：实测对比同名可见控件 ${comparedCount} 个，最大偏差 ${sizeMaxDiff}px ${
        mismatches.length === 0 ? "（通过 <= 3px）" : "（超出 3px）"
      }`,
    );
    for (const msg of mismatches) console.log(msg);
  }

  console.log(`总结：四个实测场景下 DOM 与 Qt 最大偏差 = ${globalMaxDiff}px（阈值 3px），结果：${failed ? "未通过" : "全部通过"}`);
  return failed ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (e) => {
    console.error(e);
    process.exitCode = 1;
  },
);
