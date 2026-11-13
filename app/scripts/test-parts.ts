import "./test-env.ts";
// 子项目（parts/<名字>/）、项目面板和工作区的测试：
// 1) 纯函数：路径换算、拆成子项目改了哪些数据；
// 2) 读项目和检查：总项目读得到子项目，子项目跟着总项目的设计类型和样式表，写错的地方报出来；
// 3) 真实的编辑器（无头浏览器）：右键拆成子项目、总项目里画出子项目、子项目里改了总项目跟着变、
//    项目面板、停靠面板关掉再打开、布局记住、素材面板搜索和进组；
// 4) 导出：网页里带着子项目，画得出来，子项目的说明文档不带。
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkGraphic } from "../src/checkgraphic.ts";
import { loadProjectFiles, presetsPath } from "../src/loader.ts";
import type { Scene } from "../src/model.ts";
import { carveOutPart, isValidPartPath, mapPartPath, partBoard, partFolderName, referencedParts, unmapChangedPath } from "../src/parts.ts";
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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const SETTLE = `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 150))))`;

function copyExample(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-parts-"));
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

const readJson = <T>(file: string) => JSON.parse(fs.readFileSync(file, "utf8")) as T;
const writeJson = (file: string, value: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
};

/** 在示例项目里把 waveFigure 拆成 parts/wave（不经编辑器，直接按 carveOutPart 写文件） */
function carveOnDisk(dir: string, nodeId = "waveFigure", folder = "wave", name = "波形图"): void {
  const scene = readJson<Scene>(path.join(dir, "ui/scene.json"));
  const result = carveOutPart(scene, nodeId, { part: `parts/${folder}`, name, boardClass: "paper", id: "test-part" });
  writeJson(path.join(dir, "ui/scene.json"), scene);
  writeJson(path.join(dir, `parts/${folder}/project.json`), result.partConfig);
  writeJson(path.join(dir, `parts/${folder}/ui/scene.json`), result.partScene);
  fs.mkdirSync(path.join(dir, `parts/${folder}/docs`), { recursive: true });
  fs.writeFileSync(path.join(dir, `parts/${folder}/docs/part.md`), result.partDoc);
}

async function pureTests(): Promise<void> {
  await test("路径换算：子项目自己的文件进子项目文件夹，控件、样式和素材照旧用总项目的，@root/ 永远指总项目", () => {
    const part = "parts/x23";
    assert.equal(mapPartPath("ui/scene.json", part), "parts/x23/ui/scene.json");
    assert.equal(mapPartPath("project.json", part), "parts/x23/project.json");
    assert.equal(mapPartPath("docs/part.md", part), "parts/x23/docs/part.md");
    assert.equal(mapPartPath(".designer/history.json", part), "parts/x23/.designer/history.json");
    assert.equal(mapPartPath("styles/kata.css", part), "styles/kata.css");
    assert.equal(mapPartPath("components/Banner/index.js", part), "components/Banner/index.js");
    assert.equal(mapPartPath("uiassets/a.svg", part), "uiassets/a.svg", "只有 ui/ 这个文件夹算项目自己的，名字以 ui 开头的不算");
    assert.equal(mapPartPath("@root/project.json", part), "project.json");
    assert.equal(mapPartPath("@root/ui/presets.json", null), "ui/presets.json");
    assert.equal(mapPartPath("ui/scene.json", null), "ui/scene.json");
    // 文件监听报来的路径
    assert.equal(unmapChangedPath("parts/x23/ui/scene.json", part), "ui/scene.json");
    assert.equal(unmapChangedPath("ui/scene.json", part), null, "总项目自己的画布变了，和子项目无关");
    assert.equal(unmapChangedPath("styles/kata.css", part), "styles/kata.css");
    assert.equal(unmapChangedPath("parts/other/ui/scene.json", part), "@root/parts/other/ui/scene.json", "别的子项目变了也要报（可能套在里面）");
    assert.equal(unmapChangedPath("parts/x23/ui/scene.json", null), "parts/x23/ui/scene.json");
    // 子项目文件夹的写法
    assert.ok(isValidPartPath("parts/x23"));
    assert.ok(!isValidPartPath("parts/../etc"));
    assert.ok(!isValidPartPath("parts/a/b"));
    assert.ok(!isValidPartPath("x23"));
    assert.equal(partFolderName("Times 23", new Set()), "times-23");
    assert.equal(partFolderName("Times 23", new Set(["times-23"])), "times-23-2");
    assert.match(partFolderName("封面", new Set()), /^part-[a-z0-9]+$/);
    // 手写的路径：反斜杠、开头的 ./ 先规整，不会因为写法不同落到总项目里
    assert.equal(mapPartPath("docs\\part.md", part), "parts/x23/docs/part.md");
    assert.equal(mapPartPath("./ui/scene.json", part), "parts/x23/ui/scene.json");
    assert.equal(mapPartPath("styles\\kata.css", part), "styles/kata.css");
    assert.equal(unmapChangedPath("parts\\x23\\ui\\scene.json", part), "ui/scene.json");
    // 子项目也读总项目的 project.json（设计类型、样式表）和 ui/presets.json（共用的预设）：它们变了子项目要重读
    assert.equal(unmapChangedPath("project.json", part), "@root/project.json");
    assert.equal(unmapChangedPath("ui/presets.json", part), "@root/ui/presets.json");
    assert.equal(unmapChangedPath("ui/scene.json", part), null);
  });

  await test("拆成子项目：节点连同里面的东西搬进子项目，总项目里原地换成同 ID、同位置大小的子项目节点", () => {
    const master: Scene = {
      version: 1,
      unit: "mm",
      root: "p",
      boards: ["p"],
      nodes: {
        p: { type: "Page", width: 420, height: 297, props: { class: "spread" }, children: ["row", "other"] },
        row: { type: "Group", x: 20, y: 150, width: 380, height: 40, rotation: 3, props: { class: "times-row" }, children: ["a", "b"] },
        a: { type: "Text", x: 0, y: 0, width: 40, height: 10, props: { text: "×23" } },
        b: { type: "Shape", x: 50, y: 0, width: 10, height: 10 },
        other: { type: "Text", x: 10, y: 10, width: 40, height: 10 },
      },
    };
    const { partScene, partConfig, partDoc } = carveOutPart(master, "row", { part: "parts/times", name: "×23 那一行", boardClass: "spread", id: "id-1" });
    // 总项目
    assert.deepEqual(master.nodes.row, { type: "Part", x: 20, y: 150, width: 380, height: 40, rotation: 3, props: { part: "parts/times", board: "part" } });
    assert.equal(master.nodes.a, undefined);
    assert.equal(master.nodes.b, undefined);
    assert.deepEqual(master.nodes.p.children, ["row", "other"], "位置和层次不变");
    // 子项目
    assert.deepEqual(partScene.boards, ["part"]);
    assert.equal(partScene.unit, "mm");
    const page = partScene.nodes.part;
    assert.equal(page.type, "Page");
    assert.equal(page.width, 380);
    assert.equal(page.height, 40);
    assert.equal(page.props?.class, "spread", "页面的样式类照抄总项目这一页的，样式表里的写法两边都对得上");
    assert.deepEqual(page.children, ["row"]);
    assert.equal(partScene.nodes.row.x, 0);
    assert.equal(partScene.nodes.row.y, 0);
    assert.equal(partScene.nodes.row.rotation, undefined, "旋转留在总项目的子项目节点上，不转两遍");
    assert.equal(partScene.nodes.row.props?.class, "times-row");
    assert.deepEqual(Object.keys(partScene.nodes).sort(), ["a", "b", "part", "row"]);
    assert.deepEqual(referencedParts(master), ["parts/times"]);
    assert.equal(partBoard(partScene, "part"), "part");
    assert.equal(partBoard(partScene, "missing"), "part", "写的页面不在时用第一页");
    assert.equal((partConfig.part as { of: string }).of, "../..");
    assert.equal(partConfig.kind, "graphic");
    assert.match(partDoc, /×23 那一行/);
    assert.throws(() => carveOutPart(master, "p", { part: "parts/x", name: "x", id: "i" }), /页面/);
    assert.throws(() => carveOutPart(master, "row", { part: "parts/x", name: "x", id: "i" }), /已经是子项目/);
  });

  await test("拆成子项目：拆出来的东西里有叫 part 的，子项目的页面换个名字；跨出去的连线挂接拿掉", () => {
    const make = (): Scene => ({
      version: 1,
      root: "p",
      boards: ["p"],
      nodes: {
        p: { type: "Page", width: 400, height: 300, children: ["part", "out", "l1"] },
        part: { type: "Group", x: 10, y: 10, width: 100, height: 50, children: ["part2", "in", "l2"] },
        part2: { type: "Text", x: 0, y: 0, width: 20, height: 10 },
        in: { type: "Shape", x: 30, y: 0, width: 20, height: 10 },
        // 里面的线：一头挂在里面，一头挂在外面
        l2: { type: "Line", x: 0, y: 0, width: 0, height: 0, props: { startNode: "in", endNode: "out" } },
        out: { type: "Shape", x: 200, y: 10, width: 20, height: 10 },
        // 外面的线：一头挂在被拆的那一样东西本身上，一头挂在它里面
        l1: { type: "Line", x: 0, y: 0, width: 0, height: 0, props: { startNode: "part", endNode: "in" } },
      },
    });
    const master = make();
    const { partScene, partConfig } = carveOutPart(master, "part", { part: "parts/a", name: "a", id: "i" });
    assert.equal(partScene.root, "part3", "part 和 part2 都被占了");
    assert.deepEqual(partScene.boards, ["part3"]);
    assert.equal(partScene.nodes.part3.type, "Page");
    assert.deepEqual(partScene.nodes.part3.children, ["part"]);
    assert.equal(partScene.nodes.part.type, "Group", "拆出来的组原样在子项目里");
    assert.equal(partScene.nodes.part2.type, "Text");
    assert.deepEqual((partConfig.boards as unknown as Array<{ id: string }>)[0].id, "part3");
    assert.deepEqual(master.nodes.part.props, { part: "parts/a", board: "part3" });
    assert.deepEqual(partScene.nodes.l2.props, { startNode: "in" }, "挂在外面的那一头拿掉");
    assert.deepEqual(master.nodes.l1.props, { startNode: "part" }, "挂在子项目节点本身上的留着，挂在它里面的拿掉");
  });
}

async function loaderTests(): Promise<void> {
  const dir = copyExample();
  try {
    carveOnDisk(dir);
    await test("读项目：总项目读得到画布里用到的子项目和 parts/ 下全部子项目，没有问题", async () => {
      const project = await loadProjectFiles(nodeIO(dir), null);
      assert.equal(project.scene.nodes.waveFigure.type, "Part");
      assert.equal(project.parts?.get("parts/wave")?.name, "波形图");
      assert.ok(project.parts?.get("parts/wave")?.scene?.nodes.waveFigure, "子项目的画布读进来了");
      assert.deepEqual(project.partList, [{ part: "parts/wave", name: "波形图" }]);
      assert.equal(project.partOf, null);
      assert.deepEqual(project.problems.filter((p) => p.level !== "hint"), []);
    });

    await test("读子项目：设计类型、样式表跟着总项目，名字、画布、说明文档是子项目自己的，预设和总项目共用一份", async () => {
      const part = await loadProjectFiles(nodeIO(dir, "parts/wave"), null);
      assert.equal(part.kind, "graphic");
      assert.equal(part.name, "波形图");
      assert.deepEqual(part.partOf, { name: "平面设计示例", part: "parts/wave" });
      assert.deepEqual(part.styles?.map((s) => s.path), ["styles/tokens.css", "styles/text.css"]);
      assert.deepEqual(part.scene.boards, ["part"]);
      assert.ok(part.docs.has("docs/part.md"));
      assert.ok(part.components.has("Wave"), "控件用总项目的");
      assert.equal(presetsPath(part.partOf), "@root/ui/presets.json");
      assert.deepEqual(part.problems.filter((p) => p.level === "error"), []);
    });

    await test("子项目一改，总项目的指纹跟着变（编辑器靠它决定要不要重画）", async () => {
      const before = (await loadProjectFiles(nodeIO(dir), null)).signature;
      const file = path.join(dir, "parts/wave/ui/scene.json");
      const scene = readJson<Scene>(file);
      scene.nodes.part.width = 150;
      writeJson(file, scene);
      const after = (await loadProjectFiles(nodeIO(dir), null)).signature;
      assert.notEqual(before, after);
    });

    await test("检查：子项目不在、路径写错、套了自己、尺寸对不上、界面设计里放子项目，都报出来", async () => {
      const project = await loadProjectFiles(nodeIO(dir), null);
      const page = project.scene.nodes.spread1;
      project.scene.nodes.gone = { type: "Part", x: 0, y: 0, width: 10, height: 10, props: { part: "parts/gone" } };
      project.scene.nodes.bad = { type: "Part", x: 0, y: 0, width: 10, height: 10, props: { part: "../outside" } };
      project.scene.nodes.empty = { type: "Part", x: 0, y: 0, width: 10, height: 10 };
      page.children = [...(page.children ?? []), "gone", "bad", "empty"];
      project.parts?.set("parts/gone", { name: "gone", scene: null, error: "找不到 parts/gone/ui/scene.json" });
      const messages = checkGraphic(project).map((p) => `${p.level} ${p.message}`);
      assert.ok(messages.some((m) => m.startsWith("error") && m.includes("gone") && m.includes("找不到")), messages.join("\n"));
      assert.ok(messages.some((m) => m.startsWith("error") && m.includes("bad") && m.includes("parts/<名字>")));
      assert.ok(messages.some((m) => m.startsWith("error") && m.includes("empty") && m.includes("props.part")));
      // 上一个测试把子项目页面改成了 150 宽，总项目里的方框还是 176
      assert.ok(messages.some((m) => m.startsWith("hint") && m.includes("waveFigure") && m.includes("看不到")));
      // 子项目里又放了它自己
      const self = await loadProjectFiles(nodeIO(dir, "parts/wave"), null);
      self.scene.nodes.loop = { type: "Part", x: 0, y: 0, width: 10, height: 10, props: { part: "parts/wave" } };
      self.scene.nodes.part.children = [...(self.scene.nodes.part.children ?? []), "loop"];
      assert.ok(checkGraphic(self).some((p) => p.level === "error" && p.message.includes("正在编辑的这个子项目")));
      // 界面设计项目里不能放
      const ui = await loadProjectFiles(nodeIO(path.resolve(appRoot, "../examples/minimal/design")), null);
      ui.scene.nodes.p = { type: "Part", x: 0, y: 0, width: 10, height: 10, props: { part: "parts/wave" } };
      const { checkUiKind } = await import("../src/checkgraphic.ts");
      assert.ok(checkUiKind(ui).some((p) => p.message.includes("Part 只在平面设计里有")));
    });

    await test("检查：子项目里间接套了自己、从总项目算起套得超过 4 层，和画的时候一样报出来", async () => {
      // 在 parts/ 下写一串子项目，refs 是每个子项目里放了哪些子项目
      const writeChain = (refs: Record<string, string[]>) => {
        for (const [name, children] of Object.entries(refs)) {
          const nodes: Scene["nodes"] = { part: { type: "Page", width: 50, height: 50, children: children.map((_, i) => `n${i}`) } };
          children.forEach((child, i) => (nodes[`n${i}`] = { type: "Part", x: 0, y: 0, width: 50, height: 50, props: { part: `parts/${child}`, board: "part" } }));
          writeJson(path.join(dir, `parts/${name}/project.json`), { version: 1, name, kind: "graphic", part: { of: "../.." } });
          writeJson(path.join(dir, `parts/${name}/ui/scene.json`), { version: 1, unit: "mm", root: "part", boards: ["part"], nodes });
        }
      };
      // 在总项目（或 partOf 这个子项目）的画布里放一个指向 child 的子项目节点，存盘、读回来、检查，再还原
      const masterRefs = async (child: string, partOf: string | null = null) => {
        const file = path.join(dir, partOf ?? "", "ui/scene.json");
        const original = fs.readFileSync(file, "utf8");
        const scene = JSON.parse(original) as Scene;
        const board = scene.boards![0];
        scene.nodes.probe = { type: "Part", x: 0, y: 0, width: 50, height: 50, props: { part: `parts/${child}`, board: "part" } };
        scene.nodes[board].children = [...(scene.nodes[board].children ?? []), "probe"];
        writeJson(file, scene);
        try {
          const project = await loadProjectFiles(nodeIO(dir, partOf), null);
          const problems = checkGraphic(project).filter((p) => p.level === "error" && p.nodeId === "probe");
          assert.ok(problems.every((p) => p.message.includes("套")), problems.map((p) => p.message).join(" | "));
          return problems;
        } finally {
          fs.writeFileSync(file, original);
        }
      };
      writeChain({ ca: ["cb"], cb: ["cb"] }); // 总项目 → ca → cb → cb
      assert.equal((await masterRefs("ca")).length, 1, "后代里套了自己");
      writeChain({ da: ["db"], db: ["da"] }); // da → db → da
      assert.equal((await masterRefs("da")).length, 1, "两个子项目互相套");
      writeChain({ e1: ["e2"], e2: ["e3"], e3: ["e4"], e4: [] }); // 4 层：画得出来
      assert.equal((await masterRefs("e1")).length, 0, "从总项目算起 4 层没问题");
      writeChain({ f1: ["f2"], f2: ["f3"], f3: ["f4"], f4: ["f5"], f5: [] }); // 5 层
      assert.equal((await masterRefs("f1")).length, 1, "5 层报出来");
      // 有一条短路先走过同一批子项目，也不能挡住长路上的报错（以前按“走过就不再看”漏掉）
      writeChain({ g1: ["g3", "g2"], g2: ["g3"], g3: ["g4"], g4: ["g5"], g5: [] });
      assert.equal((await masterRefs("g1")).length, 1, "长路有 5 层");
      // 在子项目 e1 里看：路从 e1 算起，往下只能再套 3 层
      assert.equal((await masterRefs("e2", "parts/e1")).length, 0);
      writeChain({ h1: [], h2: ["h3"], h3: ["h4"], h4: ["h5"], h5: [] });
      assert.equal((await masterRefs("h2", "parts/h1")).length, 1, "在子项目里再套 4 层就超了");
      // 在子项目 h1 里放一个里面又放了 h1 的子项目
      writeChain({ i2: ["h1"] });
      assert.equal((await masterRefs("i2", "parts/h1")).length, 1, "绕回正在编辑的子项目");
    });
  } finally {
    cleanup(dir);
  }
}

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
  const origin = `http://127.0.0.1:${port}`;
  const page = await openHeadless(`${origin}/`, { width: 1600, height: 1000 });
  const { cdp } = page;
  const stageHas = (selector: string) => cdp.evaluate<boolean>(`Boolean(document.getElementById("stage-iframe")?.contentDocument?.querySelector(${JSON.stringify(selector)}))`).catch(() => false);
  const waitFor = async (what: string, fn: () => Promise<boolean>, ms = 15000) => {
    const deadline = Date.now() + ms;
    while (!(await fn())) {
      assert.ok(Date.now() < deadline, `${ms / 1000} 秒内没有等到：${what}`);
      await wait(100);
    }
  };
  /** 等编辑器加载完：vite 第一次预构建依赖时会刷新页面，要连续一秒都就绪才算 */
  const waitReady = async (selector: string) => {
    let since = 0;
    const deadline = Date.now() + 90000;
    while (since === 0 || Date.now() - since < 1000) {
      assert.ok(Date.now() < deadline, "编辑器 90 秒内没有加载完");
      if (await stageHas(selector)) since ||= Date.now();
      else since = 0;
      await wait(100);
    }
  };
  const center = (selector: string) =>
    cdp.evaluate<{ x: number; y: number }>(`(() => {
      const iframe = document.getElementById("stage-iframe");
      const el = iframe.contentDocument.querySelector(${JSON.stringify(selector)});
      el.scrollIntoView({ block: "center", inline: "center" });
      const r = el.getBoundingClientRect(), f = iframe.getBoundingClientRect();
      return { x: f.left + r.left + r.width / 2, y: f.top + r.top + r.height / 2 };
    })()`);
  const mouse = async (type: "mousePressed" | "mouseReleased" | "mouseMoved", x: number, y: number, button: "left" | "right" = "left", clickCount = 1) =>
    cdp.send("Input.dispatchMouseEvent", { type, x, y, button, clickCount, buttons: type === "mousePressed" ? (button === "left" ? 1 : 2) : 0 });
  const key = async (keyName: string, code: string, vk: number, modifiers = 0) => {
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: keyName, code, windowsVirtualKeyCode: vk, modifiers });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: keyName, code, windowsVirtualKeyCode: vk, modifiers });
  };
  const masterScene = () => readJson<Scene>(path.join(dir, "ui/scene.json"));
  const partFile = path.join(dir, "parts/wavefigure/ui/scene.json");

  try {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
    await waitReady('[data-vf-id="waveFigure"]');

    await test("工作区：六个面板都在停靠区里，窗口菜单关掉图层再打开，布局刷新后还在", async () => {
      const docks = await cdp.evaluate<string[]>(`[...document.querySelectorAll("#workspace .ws-dock")].map((d) => d.dataset.panel)`);
      assert.equal(docks.length, 6, docks.join(","));
      const visible = (id: string) => cdp.evaluate<boolean>(`(() => { const d = document.querySelector('#workspace .ws-dock[data-panel="${id}"]'); return Boolean(d && d.offsetWidth > 0 && getComputedStyle(d).display !== "none"); })()`);
      assert.ok(await visible("panel-layers"));
      const runMenu = async (menu: string, label: string) => {
        await cdp.evaluate(`[...document.querySelectorAll("#menubar .menubar-item")].find((b) => b.textContent.trim() === ${JSON.stringify(menu)}).dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }))`);
        await cdp.evaluate(SETTLE);
        await cdp.evaluate(`[...document.querySelectorAll(".menu-dropdown .menu-row")].find((r) => r.textContent.includes(${JSON.stringify(label)})).click()`);
        await cdp.evaluate(SETTLE);
      };
      await runMenu("窗口", "图层");
      assert.equal(await visible("panel-layers"), false, "关掉了");
      const stageWidth = await cdp.evaluate<number>(`document.getElementById("center").getBoundingClientRect().width`);
      assert.ok(stageWidth > 600, `设计窗口还留着地方（${stageWidth}px）`);
      await runMenu("窗口", "图层");
      assert.ok(await visible("panel-layers"), "又打开了");
      // 关掉问题面板，刷新页面，还是关着
      await runMenu("窗口", "问题");
      assert.equal(await visible("panel-problems"), false);
      await cdp.evaluate(`location.reload()`);
      await waitReady('[data-vf-id="waveFigure"]');
      assert.equal(await visible("panel-problems"), false, "关着的面板刷新后还关着");
      await runMenu("窗口", "重置布局");
      assert.ok(await visible("panel-problems"), "重置布局后回到默认");
    });

    await test("工作区：按住图层的标题栏拖到详细信息面板中间，叠成一组页签", async () => {
      const rect = (id: string) =>
        cdp.evaluate<{ x: number; y: number; w: number; h: number }>(`(() => { const r = document.querySelector('#workspace .ws-dock[data-panel="${id}"]').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
      const from = await rect("panel-layers");
      const to = await rect("panel-details");
      const start = { x: from.x + 60, y: from.y + 12 };
      const end = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
      await mouse("mouseMoved", start.x, start.y);
      await mouse("mousePressed", start.x, start.y);
      for (let k = 1; k <= 12; k++) {
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: start.x + ((end.x - start.x) * k) / 12, y: start.y + ((end.y - start.y) * k) / 12, button: "left", buttons: 1 });
        await wait(16);
      }
      await mouse("mouseReleased", end.x, end.y);
      await cdp.evaluate(SETTLE);
      const tabs = await cdp.evaluate<string[]>(`[...document.querySelectorAll('#workspace .ws-dock[data-panel="panel-details"] .dock-tab, #workspace .ws-dock[data-panel="panel-layers"] .dock-tab')].map((t) => t.dataset.dockTab)`);
      assert.ok(tabs.includes("panel-layers") && tabs.includes("panel-details"), `叠成了页签：${tabs.join(",")}`);
      const saved = await cdp.evaluate<string>(`localStorage.getItem("vf.workspace")`);
      const right = (JSON.parse(saved) as { layout: { areas: { right: { groups: Array<{ tabs: string[] }> } } } }).layout.areas.right.groups.flatMap((g) => g.tabs);
      assert.ok(right.includes("panel-layers"), "排列存下来了：图层到了右边");
      await cdp.evaluate(`[...document.querySelectorAll("#menubar .menubar-item")].find((b) => b.textContent.trim() === "窗口").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }))`);
      await cdp.evaluate(SETTLE);
      await cdp.evaluate(`[...document.querySelectorAll(".menu-dropdown .menu-row")].find((r) => r.textContent.includes("重置布局")).click()`);
      await cdp.evaluate(SETTLE);
    });

    await test("素材面板：搜索只留下有结果的组，点组卡片进去看全部，‹ 全部回到总览", async () => {
      const state = () =>
        cdp.evaluate<{ cards: string[]; detail: string[]; chips: string[] }>(`(() => ({
          cards: [...document.querySelectorAll(".asset-overview:not([hidden]) .asset-group")].map((c) => c.dataset.group),
          detail: [...document.querySelectorAll(".asset-detail:not([hidden]) .palette-item")].filter((i) => !i.hidden).map((i) => i.dataset.type ?? i.dataset.preset ?? i.textContent),
          chips: [...document.querySelectorAll(".asset-chip")].map((c) => c.textContent),
        }))()`);
      const all = await state();
      assert.ok(all.cards.includes("basic") && all.cards.includes("project"), all.cards.join(","));
      assert.ok(all.cards.includes("library"), "收藏的素材有自己的一组（还没收藏时卡片上写着怎么收藏）");
      await cdp.evaluate(`(() => { const s = document.querySelector(".asset-search"); s.value = "文本"; s.dispatchEvent(new Event("input")); })()`);
      await cdp.evaluate(SETTLE);
      const found = await state();
      assert.deepEqual(found.cards, ["project"], "只有项目控件里有“文本”");
      await cdp.evaluate(`document.querySelector('.asset-group[data-group="project"]').click()`);
      await cdp.evaluate(SETTLE);
      const inside = await state();
      assert.ok(inside.detail.includes("Text"), inside.detail.join(","));
      assert.ok(inside.detail.every((t) => t === "Text"), "进了组也只显示匹配的");
      assert.equal(inside.chips[0], "‹ 全部");
      await cdp.evaluate(`document.querySelector(".asset-chip.back").click()`);
      await cdp.evaluate(`(() => { const s = document.querySelector(".asset-search"); s.value = ""; s.dispatchEvent(new Event("input")); })()`);
      await cdp.evaluate(SETTLE);
      assert.ok((await state()).cards.length >= 3);
    });

    await test("右键 ▸ 拆成子项目：写出子项目的文件，总项目里换成子项目节点，内容照样画出来", async () => {
      const p = await center('[data-vf-id="waveFigure"]');
      await mouse("mouseMoved", p.x, p.y);
      await mouse("mousePressed", p.x, p.y, "right");
      await mouse("mouseReleased", p.x, p.y, "right");
      await cdp.evaluate(SETTLE);
      const clicked = await cdp.evaluate<boolean>(`(() => { const item = [...document.querySelectorAll("#menu *")].find((e) => e.children.length === 0 && e.textContent.trim() === "拆成子项目……"); item?.click(); return Boolean(item); })()`);
      assert.ok(clicked, "右键菜单里有“拆成子项目……”");
      await waitFor("对话框", () => cdp.evaluate<boolean>(`Boolean(document.querySelector("#vf-ask-dialog input"))`));
      assert.equal(await cdp.evaluate<string>(`document.querySelector("#vf-ask-dialog input").value`), "waveFigure");
      await key("Enter", "Enter", 13);
      await waitFor("子项目的文件", async () => fs.existsSync(partFile) && masterScene().nodes.waveFigure?.type === "Part");
      const master = masterScene();
      assert.deepEqual(master.nodes.waveFigure.props, { part: "parts/wavefigure", board: "part" });
      assert.equal(master.nodes.waveFigure.x, 14);
      const partConfig = readJson<{ name: string; part: { of: string } }>(path.join(dir, "parts/wavefigure/project.json"));
      assert.equal(partConfig.name, "waveFigure");
      assert.ok(fs.existsSync(path.join(dir, "parts/wavefigure/docs/part.md")));
      await waitFor("总项目里画出子项目的内容", () => stageHas('[data-vf-id="waveFigure"][data-vf-type="Part"] > .vf-part [data-vf-type="Wave"]'));
      const problems = await cdp.evaluate<string>(`document.getElementById("problems").innerText`);
      assert.equal(problems.trim(), "没有问题。");
    });

    await test("项目面板：总项目下面列出子项目和它在哪一页，点它打开子项目", async () => {
      await cdp.evaluate(`document.querySelector('#workspace .dock-tab[data-dock-tab="panel-project"]')?.click()`);
      await waitFor("子项目那一行", () => cdp.evaluate<boolean>(`[...document.querySelectorAll("#project-panel .project-row[data-depth='1']")].some((r) => r.textContent.includes("waveFigure"))`));
      const rows = await cdp.evaluate<string[]>(`[...document.querySelectorAll("#project-panel .project-row")].map((r) => r.querySelector(".project-row-title").textContent + " | " + (r.querySelector(".project-row-meta")?.textContent ?? "") + " | " + (r.getAttribute("aria-current") ?? ""))`);
      assert.match(rows[0], /^平面设计示例 \| 平面设计 \| true$/);
      assert.match(rows[1], /^waveFigure \| 子项目 · 在第 1–2 页 \| $/);
    });

    await test("打开子项目：只看到这一块，顶栏是“总项目 › 子项目”，在这里改存进子项目，总项目跟着变", async () => {
      // 双击子项目节点打开（本标签页）
      const p = await center('[data-vf-id="waveFigure"]');
      await mouse("mouseMoved", p.x, p.y);
      await mouse("mousePressed", p.x, p.y, "left", 1);
      await mouse("mouseReleased", p.x, p.y, "left", 1);
      await mouse("mousePressed", p.x, p.y, "left", 2);
      await mouse("mouseReleased", p.x, p.y, "left", 2);
      await waitFor("地址栏换到子项目", async () => (await cdp.evaluate<string>(`location.search`).catch(() => "")).includes("part=parts%2Fwavefigure"));
      await waitReady('[data-vf-id="waveFigure"][data-vf-type="Wave"]');
      const crumb = await cdp.evaluate<string>(`document.getElementById("project-name").innerText.replace(/\\s+/g, " ")`);
      assert.equal(crumb, "平面设计示例 › waveFigure");
      const stage = await cdp.evaluate<string>(`document.getElementById("stage").style.width + " " + document.getElementById("stage").style.height`);
      assert.equal(stage, "176mm 90mm", "子项目的页面就是这一块的大小");
      assert.ok(await stageHas('[data-vf-board="part"].paper'), "页面带着总项目那一页的样式类");
      const masterBefore = fs.readFileSync(path.join(dir, "ui/scene.json"), "utf8");
      // 选中波形图，往右挪 1 毫米左右（方向键一次挪一格）
      const q = await center('[data-vf-id="waveFigure"]');
      await mouse("mouseMoved", q.x, q.y);
      await mouse("mousePressed", q.x, q.y);
      await mouse("mouseReleased", q.x, q.y);
      await cdp.evaluate(SETTLE);
      const xBefore = readJson<Scene>(partFile).nodes.waveFigure.x ?? 0;
      await key("ArrowRight", "ArrowRight", 39, 8);
      await waitFor("子项目的画布存上了", async () => (readJson<Scene>(partFile).nodes.waveFigure.x ?? 0) > xBefore);
      assert.equal(fs.readFileSync(path.join(dir, "ui/scene.json"), "utf8"), masterBefore, "总项目的画布没被碰");
      const moved = readJson<Scene>(partFile).nodes.waveFigure.x ?? 0;

      // 回到总项目（点顶栏的总项目名字），子项目节点里的波形图跟着挪了
      await cdp.evaluate(`document.querySelector("#project-name .project-crumb").click()`);
      await waitFor("地址栏回到总项目", async () => !(await cdp.evaluate<string>(`location.search`).catch(() => "part")).includes("part="));
      await waitReady('[data-vf-id="waveFigure"][data-vf-type="Part"] .vf-part [data-vf-type="Wave"]');
      const innerLeft = await cdp.evaluate<string>(`document.getElementById("stage-iframe").contentDocument.querySelector('[data-vf-type="Part"] .vf-part [data-vf-id="waveFigure"]').style.left`);
      assert.equal(innerLeft, `${moved}mm`);
    });

    await test("总项目开着时，子项目的文件被别处改了，总项目自己重画", async () => {
      const scene = readJson<Scene>(partFile);
      scene.nodes.waveFigure.x = 7;
      writeJson(partFile, scene);
      await waitFor("总项目跟着变", async () => (await cdp.evaluate<string>(`document.getElementById("stage-iframe").contentDocument.querySelector('[data-vf-type="Part"] .vf-part [data-vf-id="waveFigure"]')?.style.left ?? ""`)) === "7mm");
    });
  } finally {
    await page.close();
    await server.close();
    cleanup(dir);
  }
}

async function exportTests(): Promise<void> {
  const dir = copyExample();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "vf-parts-out-"));
  try {
    carveOnDisk(dir);
    await test("导出网页：带着子项目，播放页画得出来；子项目的说明文档不带；?part= 只看一个子项目", async () => {
      const report = await exportWeb(dir, path.join(out, "web"));
      assert.ok(report.files.includes("parts/wave/ui/scene.json"), report.files.join(","));
      assert.ok(report.files.includes("parts/wave/project.json"));
      assert.ok(!report.files.some((f) => f.startsWith("parts/wave/docs/")), "子项目的说明文档不带过去");
      const served = await serveFolder(path.join(out, "web"));
      try {
        type PlayerState = { ready: boolean; errors: string[]; boards: number; waves: number; inPart: number };
        const look = async (query: string) => {
          const view = await openHeadless(`${served.url}index.html${query}`);
          try {
            let state: PlayerState | null = null;
            for (let k = 0; k < 200 && !state?.ready; k++) {
              state = await view.cdp
                .evaluate<PlayerState | null>(`window.__vfPlayer ? { ready: window.__vfPlayer.isReady, errors: window.__vfPlayer.errors, boards: window.__vfPlayer.boards.length, waves: document.querySelectorAll('[data-vf-type="Wave"]').length, inPart: document.querySelectorAll('.vf-part [data-vf-type="Wave"]').length } : null`)
                .catch(() => null);
              if (!state?.ready) await wait(100);
            }
            assert.ok(state?.ready, "播放页没有报告准备好");
            return state!;
          } finally {
            await view.close();
          }
        };
        const whole = await look("");
        assert.deepEqual(whole.errors, []);
        assert.equal(whole.boards, 2);
        assert.equal(whole.inPart, 1, "波形图画在子项目节点里");
        const single = await look("?part=parts/wave");
        assert.deepEqual(single.errors, []);
        assert.equal(single.boards, 1);
        assert.equal(single.waves, 1);
        assert.equal(single.inPart, 0, "直接看子项目时它就是页面本身的内容");
      } finally {
        await served.close();
      }
    });
  } finally {
    cleanup(dir);
    fs.rmSync(out, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  await pureTests();
  await loaderTests();
  await exportTests();
  await editorTests();
  console.log(`\n全部 ${passed} 项子项目和工作区测试通过。`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
