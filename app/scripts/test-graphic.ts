// 平面设计模式的测试：
// 1) 纯函数：单位取整、页面版心和中缝、加页删页调页序、样式类清单；
// 2) 检查：示例项目没有问题，写错的地方报出来；
// 3) 真实的编辑器（无头浏览器）：页签按设计类型显示、毫米下拖动、翻页、双击改字、预览时图会动；
// 4) 导出：网页能独立打开，PDF 每个页面一页、尺寸对，跨页拆成单页，最后没有多出来的空白页。
import "./test-env.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classNamesIn, classStylesOf, toggleClass } from "../src/classstyles.ts";
import { formatLength, fromPx, roundUnit, UNITS } from "../src/kinds.ts";
import { applyResizeToScene } from "../src/history.ts";
import { loadProjectFiles } from "../src/loader.ts";
import { syncResizedNodeDimensions, type Scene } from "../src/model.ts";
import { addPage, coverWrapId, movePage, pageGeometry, pageGuideRects, pageIds, pageLabel, removePage, sheetPageNumbers } from "../src/pages.ts";
import { exportPrint } from "./export-print.ts";
import { exportWeb } from "./export-web.ts";
import { freePort, openHeadless, serveFolder } from "./headless.ts";
import { nodeIO } from "./node-io.ts";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exampleDir = path.resolve(appRoot, "../examples/graphic/design");

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  await fn();
  passed++;
  console.log(`PASS ${name}`);
}

function copyExample(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-graphic-"));
  fs.cpSync(exampleDir, path.join(dir, "design"), { recursive: true });
  return path.join(dir, "design");
}

function cleanup(dir: string): void {
  try {
    fs.rmSync(path.dirname(dir), { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch {
    // 浏览器的文件偶尔释放得慢，临时目录留着不影响结果
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** PNG 文件头里的宽和高。 */
function pngSize(file: string): [number, number] {
  const head = fs.readFileSync(file).subarray(16, 24);
  return [head.readUInt32BE(0), head.readUInt32BE(4)];
}

/** PDF 里每一页的 MediaBox（点，1/72 英寸）。Chromium 出的 PDF 页面对象是明文的。 */
function pdfPages(file: string): Array<[number, number]> {
  const text = fs.readFileSync(file).toString("latin1");
  const pages: Array<[number, number]> = [];
  for (const match of text.matchAll(/\/Type\s*\/Page\b(?!s)[\s\S]*?\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g)) {
    pages.push([Number(match[3]) - Number(match[1]), Number(match[4]) - Number(match[2])]);
  }
  return pages;
}
const PT_PER_MM = 72 / 25.4;

async function pureTests(): Promise<void> {
  await test("毫米取整到 0.01，不留浮点尾巴；像素取整数", () => {
    const mm = UNITS.mm;
    assert.equal(roundUnit(mm, 0.1 + 0.2), 0.3);
    assert.equal(roundUnit(mm, 12.344999), 12.34);
    assert.equal(roundUnit(mm, 291.9897), 291.99);
    assert.equal(formatLength(mm, 34.089999999999996), "34.09");
    assert.equal(roundUnit(UNITS.px, 12.5), 13);
    // 手感（像素）换成毫米：8 像素约合 2.12 毫米
    assert.ok(Math.abs(fromPx(mm, 8) - 8 / (96 / 25.4)) < 1e-9);
    assert.equal(fromPx(UNITS.px, 8), 8);
  });

  await test("跨页的版心：靠中缝一边用内边距，外侧用外边距；中缝在一半处", () => {
    const geo = pageGeometry({ type: "Page", width: 420, height: 297, props: { sheets: 2, marginTop: 14, marginBottom: 16, marginOuter: 14, marginInner: 20 } });
    assert.equal(geo.sheets, 2);
    assert.deepEqual(geo.folds, [210]);
    assert.deepEqual(geo.liveAreas[0], { x: 14, y: 14, width: 176, height: 267 });
    assert.deepEqual(geo.liveAreas[1], { x: 230, y: 14, width: 176, height: 267 });
    const single = pageGeometry({ type: "Page", width: 210, height: 297, props: { marginOuter: 10, marginInner: 30 } });
    assert.deepEqual(single.folds, []);
    assert.equal(single.liveAreas[0].x, 10, "单页左右都用外边距");
    assert.equal(single.liveAreas[0].width, 190);
    // 拼页数写坏了当 1
    assert.equal(pageGeometry({ type: "Page", width: 210, height: 297, props: { sheets: 0 } }).sheets, 1);
  });

  await test("加页、调页序、删页：页序写在 boards 里，root 始终是第一页，删页连同里面的东西", () => {
    const scene: Scene = {
      version: 1,
      unit: "mm",
      root: "a",
      boards: ["a"],
      nodes: {
        a: { type: "Page", width: 420, height: 297, props: { sheets: 2, marginOuter: 14 }, children: ["t"] },
        t: { type: "Text", x: 10, y: 10, width: 50, height: 10 },
      },
    };
    addPage(scene, "b", "a");
    assert.deepEqual(scene.boards, ["a", "b"]);
    assert.equal(scene.nodes.b.width, 420, "新页照抄前一页的尺寸");
    assert.equal(scene.nodes.b.props?.sheets, 2, "新页照抄前一页的拼页数");
    assert.equal(pageLabel(scene, "b"), "第 3–4 页");
    assert.ok(movePage(scene, "b", -1));
    assert.deepEqual(scene.boards, ["b", "a"]);
    assert.equal(scene.root, "b");
    assert.equal(movePage(scene, "b", -1), false, "第一页不能再往前");
    assert.ok(removePage(scene, "a"));
    assert.deepEqual(pageIds(scene), ["b"]);
    assert.equal(scene.nodes.t, undefined, "删页时页里的东西一起删");
    assert.equal(removePage(scene, "b"), false, "只剩一页不能删");
  });

  await test("成册：包封的左半是最后一页、右半是第 1 页，翻开从第 2 页数起", () => {
    const scene: Scene = {
      version: 1,
      unit: "mm",
      root: "c",
      boards: ["c", "s", "p"],
      cover: "wrap",
      nodes: {
        c: { type: "Page", width: 420, height: 297, props: { sheets: 2 }, children: [] },
        s: { type: "Page", width: 420, height: 297, props: { sheets: 2 }, children: [] },
        p: { type: "Page", width: 210, height: 297, children: [] },
      },
    };
    assert.equal(coverWrapId(scene), "c");
    assert.deepEqual([...sheetPageNumbers(scene)], [["c", [5, 1]], ["s", [2, 3]], ["p", [4]]]);
    assert.equal(pageLabel(scene, "c"), "封底 + 封面");
    assert.equal(pageLabel(scene, "s"), "第 2–3 页");
    delete scene.cover;
    assert.deepEqual(sheetPageNumbers(scene).get("c"), [1, 2], "不成册时照顺序数");
    assert.equal(pageLabel(scene, "c"), "第 1–2 页");
    // 第一个页面不是两张纸拼成的：不算包封，照顺序数
    scene.cover = "wrap";
    scene.boards = ["p", "c", "s"];
    assert.equal(coverWrapId(scene), null);
    assert.deepEqual(sheetPageNumbers(scene).get("p"), [1]);
  });

  await test("吸附参考：每张纸的边和版心", () => {
    const scene: Scene = { version: 1, unit: "mm", root: "a", nodes: { a: { type: "Page", width: 420, height: 297, props: { sheets: 2, marginOuter: 14, marginInner: 20, marginTop: 14, marginBottom: 16 } } } };
    const rects = pageGuideRects(scene, "a");
    assert.equal(rects.length, 4);
    assert.deepEqual(rects[1], { x: 210, y: 0, width: 210, height: 297 });
  });

  await test("毫米画布上改尺寸保留 0.01 mm，最小尺寸也取整（不是整毫米，也不是 2.1166…）", () => {
    const scene: Scene = { version: 1, unit: "mm", root: "p", nodes: { p: { type: "Page", width: 210, height: 297, children: ["b"] }, b: { type: "Text", x: 10, y: 10, width: 50, height: 20 } } };
    const node = scene.nodes.b;
    syncResizedNodeDimensions(node, 50.374, 20.251, fromPx(UNITS.mm, 8), scene, "b");
    assert.deepEqual([node.width, node.height], [50.37, 20.25]);
    syncResizedNodeDimensions(node, 0.4, 0.4, fromPx(UNITS.mm, 8), scene, "b");
    assert.deepEqual([node.width, node.height], [2.12, 2.12]);
    const resized = applyResizeToScene(scene, "b", "se", 0.37, 0.25);
    assert.deepEqual([resized.nodes.b.width, resized.nodes.b.height], [2.49, 2.37]);
    // 像素画布照旧取整数
    const px: Scene = { version: 1, root: "w", nodes: { w: { type: "Window", width: 400, height: 300, children: ["c"] }, c: { type: "Container", x: 0, y: 0, width: 40, height: 20 } } };
    syncResizedNodeDimensions(px.nodes.c, 50.6, 3, 8, px, "c");
    assert.deepEqual([px.nodes.c.width, px.nodes.c.height], [51, 8]);
  });

  await test("样式类清单：标了 @style 的只列这些，没标就列单独成规则的类", () => {
    const declared = [{ path: "a.css", text: "/* @style 正文 */\n.body { font-size: 9pt; }\n.helper { color: red; }\n/* @style 图注 */ .cap { }" }];
    assert.deepEqual(classStylesOf(declared).map((s) => [s.name, s.label]), [["body", "正文"], ["cap", "图注"]]);
    const plain = [{ path: "b.css", text: ".title { }\n.s1 .wordmark { }\n.lead { }\n@media print { .x { } }" }];
    assert.deepEqual(classStylesOf(plain).map((s) => s.name), ["title", "lead"]);
    assert.ok(classNamesIn(plain).has("wordmark"), "复合选择器里的类也算存在");
    assert.equal(toggleClass("a b", "b"), "a");
    assert.equal(toggleClass("a", "c"), "a c");
  });
}

async function checkTests(): Promise<void> {
  await test("示例项目：读成平面设计，单位是毫米，没有问题", async () => {
    const project = await loadProjectFiles(nodeIO(exampleDir), null);
    assert.equal(project.kind, "graphic");
    assert.equal(project.scene.unit, "mm");
    assert.deepEqual(project.styles?.map((s) => s.path), ["styles/tokens.css", "styles/text.css"]);
    assert.deepEqual(project.boardDocs, { spread1: "docs/spread1.md", page3: "docs/spread1.md" });
    assert.deepEqual(project.problems.filter((p) => p.level === "error"), []);
    assert.deepEqual(project.problems, []);
  });

  await test("检查：压中缝的文字、找不到的样式类、界面设计专用的类型、kind 写错", async () => {
    const dir = copyExample();
    try {
      const scenePath = path.join(dir, "ui/scene.json");
      const scene = JSON.parse(fs.readFileSync(scenePath, "utf8")) as Scene;
      scene.nodes.coverTitle.x = 180;                       // 180 + 150 跨过 210 的中缝
      scene.nodes.coverLead.props = { ...scene.nodes.coverLead.props, class: "lead nosuch" };
      scene.nodes.badDock = { type: "Dock", x: 0, y: 0, width: 10, height: 10 };
      scene.nodes.spread1.children!.push("badDock");
      fs.writeFileSync(scenePath, JSON.stringify(scene, null, 2));
      const problems = (await loadProjectFiles(nodeIO(dir), null)).problems.map((p) => p.message);
      assert.ok(problems.some((m) => m.includes("coverTitle") && m.includes("中缝")), "压中缝要提示");
      assert.ok(problems.some((m) => m.includes("nosuch")), "找不到的样式类要提示");
      assert.ok(problems.some((m) => m.includes("badDock") && m.includes("只在界面设计里有")), "界面设计专用的类型要报错");

      // 成册的写法：第一个页面不是跨页时提示，写了别的值报错
      const wrap = JSON.parse(fs.readFileSync(scenePath, "utf8")) as Scene;
      fs.writeFileSync(scenePath, JSON.stringify({ ...wrap, cover: "wrap", boards: ["page3", "spread1"] }));
      assert.ok((await loadProjectFiles(nodeIO(dir), null)).problems.some((p) => p.level === "hint" && p.message.includes("cover") && p.message.includes("page3")));
      fs.writeFileSync(scenePath, JSON.stringify({ ...wrap, cover: "jacket" }));
      assert.ok((await loadProjectFiles(nodeIO(dir), null)).problems.some((p) => p.level === "error" && p.message.includes("jacket")));
      fs.writeFileSync(scenePath, JSON.stringify(wrap));

      const config = JSON.parse(fs.readFileSync(path.join(dir, "project.json"), "utf8"));
      fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify({ ...config, kind: "poster" }));
      const wrongKind = await loadProjectFiles(nodeIO(dir), null);
      assert.equal(wrongKind.kind, "ui", "kind 写错时先按界面设计打开");
      assert.ok(wrongKind.problems.some((p) => p.message.includes("kind")));

      // 项目控件和工具自带的类型重名：平面设计里报错；界面设计里 Group 不是自带类型，不报
      fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify(config));
      fs.cpSync(path.join(dir, "components/Wave"), path.join(dir, "components/Group"), { recursive: true });
      const decl = JSON.parse(fs.readFileSync(path.join(dir, "components/Group/component.json"), "utf8"));
      fs.writeFileSync(path.join(dir, "components/Group/component.json"), JSON.stringify({ ...decl, type: "Group" }));
      const shadowed = await loadProjectFiles(nodeIO(dir), null);
      assert.ok(shadowed.problems.some((p) => p.message.includes("控件 Group") && p.message.includes("重名")));
      fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify({ ...config, kind: "ui" }));
      const uiProject = await loadProjectFiles(nodeIO(dir), null);
      assert.ok(!uiProject.problems.some((p) => p.message.includes("控件 Group") && p.message.includes("重名")), "界面设计里叫 Group 的项目控件照旧可用");
    } finally {
      cleanup(dir);
    }
  });
}

const SETTLE = `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 150))))`;

async function editorTests(): Promise<void> {
  const dir = copyExample();
  process.env.VF_PROJECT = dir;
  const { createServer } = await import("vite");
  const port = await freePort();
  const server = await createServer({
    root: appRoot,
    configFile: path.join(appRoot, "vite.config.ts"),
    server: { port, strictPort: true, host: "127.0.0.1" },
    logLevel: "silent",
  });
  await server.listen();
  const page = await openHeadless(`http://127.0.0.1:${port}/`, { width: 1600, height: 1000 });
  const { cdp } = page;
  const readScene = () => JSON.parse(fs.readFileSync(path.join(dir, "ui/scene.json"), "utf8")) as Scene;
  try {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
    // vite 第一次预构建依赖时会刷新页面，要连续一段时间都就绪才算数
    let readySince = 0;
    const deadline = Date.now() + 90000;
    while (Date.now() - readySince < 1000 || readySince === 0) {
      assert.ok(Date.now() < deadline, "编辑器 90 秒内没有加载完");
      let ready = false;
      try {
        ready = await cdp.evaluate<boolean>(`Boolean(document.getElementById("stage-iframe")?.contentDocument?.querySelector('[data-vf-id="coverTitle"] .vf-text'))`);
      } catch {
        // 页面正在刷新
      }
      if (!ready) readySince = 0;
      else if (readySince === 0) readySince = Date.now();
      await wait(100);
    }

    await test("编辑器：页签、素材栏和画布都按平面设计来", async () => {
      const state = await cdp.evaluate<{ tabs: string[]; basics: string[]; stage: string; std: string[]; problems: string }>(`(() => ({
        tabs: [...document.querySelectorAll("#right .tabs [role=tab]")].filter((t) => !t.hidden).map((t) => t.id),
        basics: [...document.querySelectorAll("#palette-basic .palette-item")].map((e) => e.dataset.type),
        std: [...document.querySelectorAll("#palette-project .palette-item")].map((e) => e.dataset.type),
        stage: document.getElementById("stage").style.width + " " + document.getElementById("stage").style.height,
        problems: document.getElementById("problems").innerText,
      }))()`);
      assert.deepEqual(state.tabs, ["tab-props", "tab-doc"]);
      assert.deepEqual(state.basics, ["Container", "Group"]);
      assert.ok(state.std.includes("Text") && state.std.includes("Image") && state.std.includes("Wave"));
      assert.ok(!state.std.includes("Button"), "界面设计的标准控件不出现在平面设计里");
      assert.equal(state.stage, "420mm 297mm");
      assert.equal(state.problems.trim(), "没有问题。");
    });

    await test("拖动：按毫米写回，最多两位小数，挪的距离和鼠标一致", async () => {
      await cdp.evaluate(`[...document.querySelectorAll("#zoom-bar button")].find((b) => b.textContent === "100%").click()`);
      await cdp.evaluate(SETTLE);
      const before = readScene().nodes.coverTitle;
      const at = await cdp.evaluate<{ x: number; y: number; pxPerMm: number }>(`(() => {
        const iframe = document.getElementById("stage-iframe");
        const el = iframe.contentDocument.querySelector('[data-vf-id="coverTitle"]');
        el.scrollIntoView({ block: "center", inline: "center" });
        const r = el.getBoundingClientRect(), f = iframe.getBoundingClientRect();
        return { x: f.left + r.left + 20, y: f.top + r.top + 10, pxPerMm: f.width / 420 };
      })()`);
      await cdp.evaluate(SETTLE);
      const p = await cdp.evaluate<{ x: number; y: number }>(`(() => {
        const iframe = document.getElementById("stage-iframe");
        const r = iframe.contentDocument.querySelector('[data-vf-id="coverTitle"]').getBoundingClientRect(), f = iframe.getBoundingClientRect();
        return { x: f.left + r.left + 20, y: f.top + r.top + 10 };
      })()`);
      const dx = 75, dy = 38;
      await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", clickCount: 1 });
      for (let k = 1; k <= 6; k++) {
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x + (dx * k) / 6, y: p.y + (dy * k) / 6, button: "left", buttons: 1 });
      }
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x + dx, y: p.y + dy, button: "left", clickCount: 1 });
      await wait(800);
      const after = readScene().nodes.coverTitle;
      const decimals = (v: number) => (String(v).split(".")[1] ?? "").length;
      assert.ok(decimals(after.x!) <= 2 && decimals(after.y!) <= 2, `写回的是 ${after.x}, ${after.y}`);
      // 吸附可能把落点挪一点（6 像素以内）
      const tolerance = 6 / at.pxPerMm + 0.02;
      assert.ok(Math.abs(after.x! - before.x! - dx / at.pxPerMm) <= tolerance, `x 从 ${before.x} 到 ${after.x}`);
      assert.ok(Math.abs(after.y! - before.y! - dy / at.pxPerMm) <= tolerance, `y 从 ${before.y} 到 ${after.y}`);
      assert.equal(after.width, before.width, "拖动不改尺寸");
      // 撤销回到原处
      await cdp.evaluate(`document.querySelector('[data-action="undo"]').click()`);
      await wait(800);
      assert.equal(readScene().nodes.coverTitle.x, before.x);
    });

    await test("翻页：第二页只画它自己的东西，属性页签显示这一页的纸张", async () => {
      await cdp.evaluate(`(() => { const s = document.querySelector('[data-board="select"]'); s.value = "page3"; s.dispatchEvent(new Event("change")); })()`);
      await wait(600);
      const state = await cdp.evaluate<{ ids: string[]; title: string; size: string }>(`(() => ({
        ids: [...document.getElementById("stage-iframe").contentDocument.querySelectorAll(".vf-node")].map((n) => n.dataset.vfId),
        title: document.getElementById("stage-title").textContent,
        size: document.getElementById("pane-props").innerText,
      }))()`);
      assert.deepEqual(state.ids.sort(), ["page3Body", "page3Title"]);
      assert.equal(state.title, "第 3 页");
      assert.ok(state.size.includes("A4"), "属性页签认出 A4");
      await cdp.evaluate(`document.querySelector('[data-board="prev"]').click()`);
      await wait(600);
    });

    /** 用真的鼠标按下、停一下、松开（工具的点击只有几毫秒，按住期间界面重画丢掉点击的毛病测不出来） */
    const press = async (selector: string, holdMs = 120) => {
      const p = await cdp.evaluate<{ x: number; y: number } | null>(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()`);
      assert.ok(p, `找不到 ${selector}`);
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y });
      await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", clickCount: 1 });
      await wait(holdMs);
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", clickCount: 1 });
    };

    await test("画布上方浮着的按钮条：每个按钮都点得到，按住鼠标再松开也能翻页", async () => {
      // 浮在画布上的那一栏本身不拦鼠标，只有按钮拦；新加的按钮忘了打开就会点到下面的画布上
      const missed = await cdp.evaluate<string[]>(`[...document.querySelectorAll("#center-bar button, #center-bar select, #center-bar input")]
        .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.closest("[hidden], .overflow-panel"); })
        .filter((el) => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !(hit === el || el.contains(hit)); })
        .map((el) => el.id || el.dataset.board || el.title || el.textContent.trim())`);
      assert.deepEqual(missed, [], "这些按钮被画布挡住了");
      const title = () => cdp.evaluate<string>(`document.getElementById("stage-title").textContent`);
      assert.equal(await title(), "第 1–2 页");
      await press('[data-board="next"]');
      await wait(600);
      assert.equal(await title(), "第 3 页");
      await press('[data-board="prev"]');
      await wait(600);
      assert.equal(await title(), "第 1–2 页");
    });

    await test("文本框的字号、行距、字距、对齐：没填时灰字是样式给的值，填了只改这一个，↺ 回到样式", async () => {
      await cdp.evaluate(`[...document.querySelectorAll(".layer")].find((r) => r.dataset.id === "coverTitle").click()`);
      await wait(200);
      await cdp.evaluate(`document.getElementById("tab-props").click()`);
      await wait(300);
      const fontPx = () => cdp.evaluate<string>(`getComputedStyle(document.getElementById("stage-iframe").contentDocument.querySelector('[data-vf-id="coverTitle"] .vf-text')).fontSize`);
      const pane = await cdp.evaluate<{ sections: string[]; placeholder: string; value: string; unit: string; align: string }>(`(() => {
        const row = (key) => document.querySelector('#pane-props [data-prop="' + key + '"]');
        return {
          sections: [...document.querySelectorAll("#pane-props .props-section h4")].map((h) => h.textContent),
          placeholder: row("fontSize").querySelector("input").placeholder,
          value: row("fontSize").querySelector("input").value,
          unit: row("fontSize").querySelector(".props-unit").textContent,
          align: row("textAlign").querySelector("option").textContent,
        };
      })()`);
      assert.ok(pane.sections.includes("属性") && pane.sections.includes("文字"), pane.sections.join("、"));
      assert.equal(pane.placeholder, "54", "灰字是样式类 .title 给的 54pt");
      assert.equal(pane.value, "");
      assert.equal(pane.unit, "pt");
      assert.equal(pane.align, "跟随样式（左对齐）");
      assert.equal(await fontPx(), "72px");

      await cdp.evaluate(`(() => { const i = document.querySelector('#pane-props [data-prop="fontSize"] input'); i.value = "30"; i.dispatchEvent(new Event("change")); })()`);
      await wait(700);
      assert.equal(readScene().nodes.coverTitle.props?.fontSize, 30);
      assert.equal(await fontPx(), "40px", "30pt = 40px");
      await cdp.evaluate(`(() => { const s = document.querySelector('#pane-props [data-prop="textAlign"] select'); s.value = "center"; s.dispatchEvent(new Event("change")); })()`);
      await wait(700);
      assert.equal(readScene().nodes.coverTitle.props?.textAlign, "center");

      await press('#pane-props [data-prop="fontSize"] .props-reset');
      await wait(700);
      assert.equal(readScene().nodes.coverTitle.props?.fontSize, undefined, "↺ 之后文件里不留字号");
      assert.equal(await fontPx(), "72px");
      await cdp.evaluate(`(() => { const s = document.querySelector('#pane-props [data-prop="textAlign"] select'); s.value = ""; s.dispatchEvent(new Event("change")); })()`);
      await wait(700);
      assert.equal(readScene().nodes.coverTitle.props?.textAlign, undefined);
    });

    await test("双击文本框直接改字，存成单引号的 HTML", async () => {
      await cdp.evaluate(`[...document.querySelectorAll("#zoom-bar button")].find((b) => b.textContent === "100%").click()`);
      await cdp.evaluate(SETTLE);
      const p = await cdp.evaluate<{ x: number; y: number }>(`(() => {
        const iframe = document.getElementById("stage-iframe");
        const el = iframe.contentDocument.querySelector('[data-vf-id="coverLead"]');
        el.scrollIntoView({ block: "center", inline: "center" });
        const r = el.getBoundingClientRect(), f = iframe.getBoundingClientRect();
        return { x: f.left + r.left + 30, y: f.top + r.top + 8 };
      })()`);
      await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", clickCount: 1 });
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", clickCount: 1 });
      await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", clickCount: 2 });
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", clickCount: 2 });
      await wait(300);
      const editing = await cdp.evaluate<boolean>(`Boolean(document.getElementById("stage-iframe").contentDocument.querySelector('[data-vf-id="coverLead"] [contenteditable="true"]'))`);
      assert.ok(editing, "双击后文本框可以直接编辑");
      await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "End", code: "End", windowsVirtualKeyCode: 35 });
      await cdp.send("Input.insertText", { text: "（改）" });
      await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 2 });
      await wait(800);
      const html = String(readScene().nodes.coverLead.props?.html);
      assert.ok(html.endsWith("（改）"), html);
      assert.ok(html.includes("<b>窗口</b>"), "行内标签保留");
      assert.ok(!html.includes("contenteditable"), "编辑用的属性不进文件");
      const raw = fs.readFileSync(path.join(dir, "ui/scene.json"), "utf8");
      assert.ok(!/\\"/.test(raw.split("\n").find((l) => l.includes("（改）")) ?? ""), "HTML 属性用单引号，JSON 里没有转义的双引号");
    });

    await test("平面设计里 Ctrl+Enter 不建连接线（线条只在像素画布上有）", async () => {
      await cdp.evaluate(`[...document.querySelectorAll(".layer")].find((r) => r.dataset.id === "coverRule").click()`);
      await wait(200);
      await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 2 });
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 2 });
      await wait(700);
      const types = Object.values(readScene().nodes).map((n) => n.type);
      assert.ok(!types.includes("Line"), "不该出现线条");
      assert.equal(types.filter((t) => t === "Shape").length, 1, "也不该多出一个形状");
    });

    await test("开发接口只接受编辑器自己发来的写请求", async () => {
      const base = `http://127.0.0.1:${port}`;
      const cross = await fetch(`${base}/__export/graphic`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://evil.example" }, body: JSON.stringify({ target: "web", outDir: path.join(os.tmpdir(), "vf-should-not-exist") }) });
      assert.equal(cross.status, 403);
      const plain = await fetch(`${base}/__export/graphic`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ target: "web" }) });
      assert.equal(plain.status, 403, "不是 JSON 的请求（跨站表单能直接发的那种）不接受");
      const write = await fetch(`${base}/__fs/write?path=pwned.txt`, { method: "POST", headers: { Origin: "http://evil.example", "Sec-Fetch-Site": "cross-site" }, body: "x" });
      assert.equal(write.status, 403);
      assert.ok(!fs.existsSync(path.join(dir, "pwned.txt")));
      // 编辑器自己的写入照常
      const ok = await cdp.evaluate<number>(`fetch("/__fs/write?path=docs/probe.md", { method: "POST", body: "probe" }).then((r) => r.status)`);
      assert.equal(ok, 200);
      fs.rmSync(path.join(dir, "docs/probe.md"), { force: true });
    });

    await test("项目脚本改了：设计窗口换一个干净的环境，画出新的样子", async () => {
      const d = `document.getElementById("stage-iframe").contentDocument.querySelector(".wave-line-0")?.getAttribute("d") ?? ""`;
      const before = await cdp.evaluate<string>(d);
      const lib = path.join(dir, "lib/wave.js");
      fs.writeFileSync(lib, fs.readFileSync(lib, "utf8").replace("const steps = 96;", "const steps = 12;"));
      // 重画的中途波形会短暂不在，等到画出新的为止
      let after = before;
      for (let k = 0; k < 50 && (after === before || after === ""); k++) {
        await wait(200);
        after = await cdp.evaluate<string>(d).catch(() => before);
      }
      assert.notEqual(after, before, "改了 lib/wave.js 之后波形没有重画");
      assert.equal((after.match(/L/g) ?? []).length, 12, "用的是改过的脚本");
      const overlay = await cdp.evaluate<boolean>(`Boolean(document.getElementById("overlay")?.isConnected)`);
      assert.ok(overlay, "编辑层还在");
    });

    await test("预览：项目控件按时间动，回到编辑停在静帧；项目脚本的相对引用能用", async () => {
      const d = `document.getElementById("stage-iframe").contentDocument.querySelector(".wave-line-0").getAttribute("d")`;
      const still = await cdp.evaluate<string>(d);
      await cdp.evaluate(`document.getElementById("mode-preview").click()`);
      await wait(500);
      const a = await cdp.evaluate<string>(d);
      await wait(400);
      const b = await cdp.evaluate<string>(d);
      assert.notEqual(a, b, "预览时在动");
      await cdp.evaluate(`document.getElementById("mode-edit").click()`);
      await wait(400);
      assert.equal(await cdp.evaluate<string>(d), still, "编辑时是静帧");
    });
  } finally {
    await page.close();
    await server.close();
    cleanup(dir);
  }
}

async function exportTests(): Promise<void> {
  const dir = copyExample();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "vf-graphic-out-"));
  try {
    await test("导出网页：不带说明文档和逻辑，导出的页面自己就能打开", async () => {
      fs.mkdirSync(path.join(dir, "assets/docs"), { recursive: true });
      fs.copyFileSync(path.join(dir, "assets/grid.svg"), path.join(dir, "assets/docs/figure.svg"));
      const report = await exportWeb(dir, path.join(out, "web"));
      assert.ok(report.files.includes("index.html") && report.files.includes("vf-player.js") && report.files.includes("ui/scene.json"));
      assert.ok(!report.files.some((f) => f.startsWith("docs/")), "说明文档不带过去");
      assert.ok(report.files.includes("assets/docs/figure.svg"), "素材里叫 docs 的文件夹照样带上");
      const server = await serveFolder(path.join(out, "web"));
      const page = await openHeadless(`${server.url}index.html`);
      try {
        type PlayerState = { ready: boolean; errors: string[]; boards: number; nodes: number };
        let state: PlayerState | null = null;
        for (let k = 0; k < 200 && !state?.ready; k++) {
          state = await page.cdp.evaluate<PlayerState | null>(`window.__vfPlayer ? { ready: window.__vfPlayer.isReady, errors: window.__vfPlayer.errors, boards: window.__vfPlayer.boards.length, nodes: document.querySelectorAll(".vf-node").length } : null`).catch(() => null);
          if (!state?.ready) await wait(100);
        }
        assert.ok(state?.ready, "播放页没有报告准备好");
        assert.deepEqual(state!.errors, []);
        assert.equal(state!.boards, 2);
        assert.equal(state!.nodes, 11);
      } finally {
        await page.close();
        await server.close();
      }
    });

    await test("导出 PDF 和图片：每个页面一页，尺寸对；跨页拆成单页；没有多出来的空白页", async () => {
      const report = await exportPrint(dir, path.join(out, "print"), { scale: 1 });
      assert.deepEqual(report.errors, []);
      const boards = pdfPages(path.join(out, "print/boards.pdf")).map(([w, h]) => [Math.round(w / PT_PER_MM), Math.round(h / PT_PER_MM)]);
      assert.deepEqual(boards, [[420, 297], [210, 297]]);
      const sheets = pdfPages(path.join(out, "print/sheets.pdf")).map(([w, h]) => [Math.round(w / PT_PER_MM), Math.round(h / PT_PER_MM)]);
      assert.deepEqual(sheets, [[210, 297], [210, 297], [210, 297]]);
      const [w1, h1] = pngSize(path.join(out, "print/board-01.png"));
      assert.ok(Math.abs(w1 - 1587) <= 1 && Math.abs(h1 - 1123) <= 1, `board-01.png 是 ${w1}×${h1}`);
      const [w2] = pngSize(path.join(out, "print/sheet-02.png"));
      assert.ok(Math.abs(w2 - 794) <= 1, `sheet-02.png 宽 ${w2}`);
    });

    await test("成册：一页一页地出时按页码排，包封的右半（封面）是第 1 页", async () => {
      const scenePath = path.join(dir, "ui/scene.json");
      fs.writeFileSync(scenePath, JSON.stringify({ ...JSON.parse(fs.readFileSync(scenePath, "utf8")), cover: "wrap" }));
      const report = await exportPrint(dir, path.join(out, "print-wrap"), { scale: 1 });
      assert.deepEqual(report.errors, []);
      assert.deepEqual(report.boards.map((b) => b.label), ["封底 + 封面", "第 2 页"]);
      assert.deepEqual(report.files.filter((f) => f.startsWith("sheet-")), ["sheet-01.png", "sheet-02.png", "sheet-03.png"]);
      assert.equal(pdfPages(path.join(out, "print-wrap/sheets.pdf")).length, 3);
      await exportWeb(dir, path.join(out, "web-wrap"));
      const server = await serveFolder(path.join(out, "web-wrap"));
      const page = await openHeadless(`${server.url}index.html?print=1&split=1`);
      try {
        for (let k = 0; k < 200; k++) {
          if (await page.cdp.evaluate<boolean>("Boolean(window.__vfPlayer && window.__vfPlayer.isReady)").catch(() => false)) break;
          await wait(100);
        }
        const frames = await page.cdp.evaluate<Array<[string, string]>>(`[...document.querySelectorAll(".vf-board-frame")].map((f) => [f.dataset.vfPages, f.firstElementChild.style.marginLeft])`);
        assert.deepEqual(frames.map((f) => f[0]), ["1", "2", "3"], "按页码排");
        assert.equal(frames[0][1], "-210mm", "第 1 页是包封的右半");
      } finally {
        await page.close();
        await server.close();
      }
    });
  } finally {
    cleanup(dir);
    fs.rmSync(out, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

async function main(): Promise<void> {
  await pureTests();
  await checkTests();
  await editorTests();
  await exportTests();
  console.log(`\n全部 ${passed} 项平面设计测试通过。`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

