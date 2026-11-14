import "./test-env.ts";
// 预览的设备外框（书、电脑、手机、原样）的测试（无头浏览器）：
// 1) 编辑器的预览，平面设计：书一屏两页、翻页时纸从书脊翻过去、键盘翻页；手机一屏一页；电脑窗口里看跨页；原样一个画板一个画板地看；
//    设备选择存进 .designer/preview.json，刷新后还在；切回编辑时编辑的视角原样回来。
// 2) 编辑器的预览，界面设计：默认是电脑，软件的窗口在桌面中间，标题栏、任务栏、缩略图、最小化和还原、最大化；窗口里的控件照样能点。
// 3) 播放页（平面设计的独立预览 player.html）：同样的书、电脑、手机、原样和翻页，页面不重画；选择和编辑器共用 .designer/preview.json。
// 4) 导出的网页：默认是书，换设备记在网址和浏览器里；只从导出的文件夹里取东西；?print=1 照旧按纸排。
// 5) 界面设计的独立预览窗口（?preview=1）：默认是电脑，设备按窗口缩放；能换手机、原样。
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exportWeb } from "./export-web.ts";
import { freePort, openHeadless, serveFolder, type HeadlessPage } from "./headless.ts";

type Cdp = HeadlessPage["cdp"];

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  await fn();
  passed++;
  console.log(`PASS ${name}`);
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 编辑器（含独立预览窗口 ?preview=1）加载完：设计窗口里画出了控件，并且稳定 1 秒 */
async function editorReady(cdp: Cdp): Promise<void> {
  let since = 0;
  const deadline = Date.now() + 90000;
  while (since === 0 || Date.now() - since < 1000) {
    assert.ok(Date.now() < deadline, "编辑器 90 秒内没有加载完");
    const ok = await cdp.evaluate<boolean>(`Boolean(document.getElementById("stage-iframe")?.contentDocument?.querySelector(".vf-node"))`).catch(() => false);
    if (ok) since ||= Date.now();
    else since = 0;
    await wait(100);
  }
}

/** 播放页报告准备好了（字体、图片、控件都到位），而且没有报错 */
async function playerReady(cdp: Cdp): Promise<void> {
  const deadline = Date.now() + 60000;
  for (;;) {
    assert.ok(Date.now() < deadline, "播放页 60 秒内没有准备好");
    const state = await cdp
      .evaluate<{ ready: boolean; errors: string[] } | null>(`window.__vfPlayer ? { ready: window.__vfPlayer.isReady, errors: window.__vfPlayer.errors } : null`)
      .catch(() => null);
    if (state?.ready) {
      assert.deepEqual(state.errors, [], "播放页报了错");
      return;
    }
    await wait(100);
  }
}

interface EditorOptions {
  /** 打开哪个网址（相对于开发服务器），默认是编辑器 */
  page?: string;
  width?: number;
  height?: number;
  ready?: (cdp: Cdp) => Promise<void>;
}

interface EditorContext {
  cdp: Cdp;
  dir: string;
  reload(): Promise<void>;
  /** 换到开发服务器上的另一个网址，等它准备好 */
  open(page: string): Promise<void>;
}

/** 起一个开发服务器打开这个项目（复制一份），用无头浏览器打开 page（默认是编辑器），跑 fn，最后收拾 */
async function withEditor(example: string, fn: (ctx: EditorContext) => Promise<void>, options: EditorOptions = {}): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vf-preview-"));
  const dir = path.join(tmp, "design");
  fs.cpSync(path.resolve(appRoot, `../examples/${example}/design`), dir, { recursive: true });
  process.env.VF_PROJECT = dir;
  const { createServer } = await import("vite");
  const port = await freePort();
  const server = await createServer({ root: appRoot, configFile: path.join(appRoot, "vite.config.ts"), server: { port, strictPort: true, host: "127.0.0.1" }, logLevel: "silent" });
  await server.listen();
  const origin = `http://127.0.0.1:${port}`;
  const width = options.width ?? 1600;
  const height = options.height ?? 1000;
  const page = await openHeadless(`${origin}${options.page ?? "/"}`, { width, height });
  const { cdp } = page;
  const ready = () => (options.ready ?? editorReady)(cdp);
  try {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    await ready();
    await fn({
      cdp,
      dir,
      reload: async () => {
        await cdp.evaluate(`location.reload()`);
        await wait(300);
        await ready();
      },
      open: async (url: string) => {
        await cdp.send("Page.navigate", { url: `${origin}${url}` });
        await wait(300);
        await ready();
      },
    });
  } finally {
    await page.close();
    await server.close();
    try {
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {
      // 浏览器的文件偶尔释放得慢
    }
  }
}

const stageQuery = (selector: string) => `document.getElementById("stage-iframe").contentDocument.querySelector(${JSON.stringify(selector)})`;

async function graphicTests(): Promise<void> {
  await withEditor("graphic", async ({ cdp, dir, reload }) => {
    const bar = () => cdp.evaluate<{ devices: Record<string, string>; label: string; prev: boolean; next: boolean }>(`(() => ({
      devices: Object.fromEntries([...document.querySelectorAll("#board-bar [data-device]")].map((b) => [b.dataset.device, b.getAttribute("aria-pressed")])),
      label: document.querySelector('#board-bar [data-board="label"]')?.textContent ?? "",
      prev: !(document.querySelector('#board-bar [data-board="prev"]')?.disabled ?? true),
      next: !(document.querySelector('#board-bar [data-board="next"]')?.disabled ?? true),
    }))()`);

    const editZoom = await cdp.evaluate<string>(`document.getElementById("zoom-level").textContent`);

    await test("平面设计进预览默认是书：一屏两页，设计好的跨页（第 1–2 页）按设计一屏看完，书脊有阴影", async () => {
      await cdp.evaluate(`document.getElementById("mode-preview").click()`);
      await wait(800);
      const state = await bar();
      assert.deepEqual(state.devices, { book: "true", desktop: "false", phone: "false", plain: "false" });
      assert.equal(state.label, "第 1–2 页");
      assert.equal(state.prev, false);
      assert.equal(state.next, true);
      const book = await cdp.evaluate<{ faces: string[]; gutter: boolean; boards: string[]; coverTitle: boolean }>(`(() => {
        const doc = document.getElementById("stage-iframe").contentDocument;
        return {
          faces: [...doc.querySelectorAll(".vf-dev-page")].map((f) => f.className.replace("vf-dev-page ", "")),
          gutter: Boolean(doc.querySelector(".vf-dev-gutter")),
          boards: [...doc.querySelectorAll(".vf-dev-slot > [data-vf-board]")].map((b) => b.dataset.vfBoard),
          coverTitle: Boolean(doc.querySelector('.vf-dev-slot [data-vf-id="coverTitle"]')),
        };
      })()`);
      assert.deepEqual(book.faces, ["left", "right"]);
      assert.ok(book.gutter, "两页中间有书脊的阴影");
      assert.deepEqual(book.boards, ["spread1"], "跨页的两面是同一块，跨过中缝的东西连着");
      assert.ok(book.coverTitle, "页面里的东西画在书里");
      const fonts = await cdp.evaluate<[string, string]>(`(() => {
        const doc = document.getElementById("stage-iframe").contentDocument;
        return [getComputedStyle(doc.querySelector(".vf-dev-slot")).fontFamily, getComputedStyle(doc.getElementById("stage-canvas")).fontFamily];
      })()`);
      assert.equal(fonts[0], fonts[1], "外框不给页面换字体：页面没写字体的地方用设计窗口的字体（排版和编辑、导出一样）");
    });

    await test("翻页：纸从书脊翻过去（翻的时候有一张纸在转，翻完收掉）；键盘 ← → 也能翻；最后一屏是第 3 页", async () => {
      await cdp.evaluate(`document.querySelector('#board-bar [data-board="next"]').click()`);
      const turning = await cdp.evaluate<boolean>(`Boolean(${stageQuery(".vf-dev-leaf")})`);
      assert.ok(turning, "翻页时有一张在转的纸");
      await wait(900);
      assert.equal(await cdp.evaluate<boolean>(`Boolean(${stageQuery(".vf-dev-leaf")})`), false, "翻完收掉");
      const state = await bar();
      assert.equal(state.label, "第 3 页");
      assert.equal(state.next, false);
      assert.ok(await cdp.evaluate<boolean>(`Boolean(${stageQuery('[data-vf-id="page3Title"]')})`), "第 3 页的东西画出来了");
      // 第 3 页是单页、奇数页在右边：书是翻开的，左边一张空白的纸（不是合上的书）
      assert.deepEqual(await cdp.evaluate(`[...document.getElementById("stage-iframe").contentDocument.querySelectorAll(".vf-dev-page")].map((f) => f.className.replace("vf-dev-page ", ""))`), ["left blank", "right"]);
      await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 });
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 });
      await wait(900);
      assert.equal((await bar()).label, "第 1–2 页", "← 翻回上一屏");
    });

    await test("换设备停在同一页：书翻到第 3 页，换成手机还是第 3 页，换回书也还是", async () => {
      await cdp.evaluate(`document.querySelector('#board-bar [data-board="next"]').click()`);
      await wait(900);
      assert.equal((await bar()).label, "第 3 页");
      await cdp.evaluate(`document.querySelector('#board-bar [data-device="phone"]').click()`);
      await wait(600);
      assert.equal((await bar()).label, "第 3 页", "手机上还是第 3 页");
      await cdp.evaluate(`document.querySelector('#board-bar [data-device="book"]').click()`);
      await wait(600);
      assert.equal((await bar()).label, "第 3 页", "换回书还是第 3 页");
      await cdp.evaluate(`document.querySelector('#board-bar [data-board="prev"]').click()`);
      await wait(900);
      assert.equal((await bar()).label, "第 1–2 页");
    });

    await test("预览成书时在图层里选第 3 页上的东西：书翻到第 3 页", async () => {
      await cdp.evaluate(`[...document.querySelectorAll(".layer")].find((r) => r.dataset.id === "page3Title").click()`);
      await wait(900);
      assert.equal((await bar()).label, "第 3 页");
      assert.ok(await cdp.evaluate<boolean>(`Boolean(${stageQuery('.vf-dev-slot [data-vf-id="page3Title"]')})`), "书里画的是第 3 页");
      await cdp.evaluate(`document.querySelector('#board-bar [data-board="prev"]').click()`);
      await wait(900);
      assert.equal((await bar()).label, "第 1–2 页");
    });

    await test("手机：一屏一页，页面按屏幕宽度缩放，有灵动岛和状态栏；换型号、横放", async () => {
      await cdp.evaluate(`document.querySelector('#board-bar [data-device="phone"]').click()`);
      await wait(700);
      const state = await bar();
      assert.equal(state.devices.phone, "true");
      assert.equal(state.label, "第 1 页");
      const phone = await cdp.evaluate<{ island: boolean; time: string; slotW: number; screenW: number }>(`(() => {
        const doc = document.getElementById("stage-iframe").contentDocument;
        const slot = doc.querySelector(".vf-dev-screen-slot");
        return { island: Boolean(doc.querySelector(".vf-dev-island")), time: doc.querySelector(".vf-dev-status-time")?.textContent ?? "", slotW: slot.getBoundingClientRect().width, screenW: doc.querySelector(".vf-dev-phone-screen").getBoundingClientRect().width };
      })()`);
      assert.ok(phone.island);
      assert.equal(phone.time, "9:41");
      assert.ok(Math.abs(phone.slotW - phone.screenW) < 1, `页面按屏幕宽度缩放：${phone.slotW} vs ${phone.screenW}`);
      await cdp.evaluate(`document.querySelector('#board-bar [data-board="next"]').click()`);
      await wait(400);
      assert.equal((await bar()).label, "第 2 页");
      // 换成老式 iPhone SE：有 Home 键，没有灵动岛
      await cdp.evaluate(`(() => { const s = document.querySelector('#board-bar [data-board="phone-model"]'); s.value = "iphone-se"; s.dispatchEvent(new Event("change")); })()`);
      await wait(500);
      assert.deepEqual(await cdp.evaluate(`[Boolean(${stageQuery(".vf-dev-classic-home")}), Boolean(${stageQuery(".vf-dev-island")})]`), [true, false]);
      await cdp.evaluate(`document.querySelector('#board-bar [data-board="rotate"]').click()`);
      await wait(500);
      assert.ok(await cdp.evaluate<boolean>(`Boolean(${stageQuery(".vf-dev-phone.landscape")})`), "横过来了");
    });

    await test("电脑：桌面里一个窗口看跨页，标题是项目名和第几页；任务栏上有这个软件", async () => {
      await cdp.evaluate(`document.querySelector('#board-bar [data-device="desktop"]').click()`);
      await wait(700);
      const desk = await cdp.evaluate<{ title: string; taskbar: boolean; app: boolean; boards: number }>(`(() => {
        const doc = document.getElementById("stage-iframe").contentDocument;
        return { title: doc.querySelector(".vf-dev-title")?.textContent ?? "", taskbar: Boolean(doc.querySelector(".vf-dev-taskbar")), app: Boolean(doc.querySelector(".vf-dev-tb-btn.app.active")), boards: doc.querySelectorAll(".vf-dev-screen-slot [data-vf-board]").length };
      })()`);
      assert.match(desk.title, /^平面设计示例 — 第/);
      assert.ok(desk.taskbar && desk.app);
      assert.ok(desk.boards >= 1);
    });

    await test("原样：不套外框，一个画板一个画板地看", async () => {
      await cdp.evaluate(`document.querySelector('#board-bar [data-device="plain"]').click()`);
      await wait(600);
      assert.equal(await cdp.evaluate<boolean>(`Boolean(${stageQuery(".vf-dev")})`), false);
      assert.equal(await cdp.evaluate<string>(`document.getElementById("stage-iframe").contentDocument.getElementById("stage-canvas").dataset.vfBoard ?? ""`), "spread1");
    });

    await test("设备的选择存在 .designer/preview.json，刷新后还在；切回编辑时编辑的视角原样回来", async () => {
      const saved = JSON.parse(fs.readFileSync(path.join(dir, ".designer/preview.json"), "utf8")) as { device: string; phone: string; landscape: boolean };
      assert.deepEqual(saved, { device: "plain", phone: "iphone-se", landscape: true });
      await cdp.evaluate(`document.querySelector('#board-bar [data-device="book"]').click()`);
      await wait(500);
      await cdp.evaluate(`document.getElementById("mode-edit").click()`);
      await wait(600);
      assert.equal(await cdp.evaluate<string>(`document.getElementById("zoom-level").textContent`), editZoom, "编辑的缩放回来了");
      assert.ok(await cdp.evaluate<boolean>(`Boolean(document.getElementById("stage-iframe").contentDocument.querySelector(".vf-spread"))`), "回到摊开的画布");
      await reload();
      await cdp.evaluate(`document.getElementById("mode-preview").click()`);
      await wait(800);
      assert.equal((await bar()).devices.book, "true", "刷新后还是书");
    });

    await test("没有包封时最后一页落在左边（第 4 页）：书还是翻开的，右边一张空白的纸", async () => {
      await cdp.evaluate(`document.getElementById("mode-edit").click()`);
      await wait(400);
      const scenePath = path.join(dir, "ui/scene.json");
      const scene = JSON.parse(fs.readFileSync(scenePath, "utf8")) as { boards: string[]; nodes: Record<string, unknown> };
      scene.nodes.page4 = { type: "Page", width: 210, height: 297, children: [] };
      scene.boards.push("page4");
      fs.writeFileSync(scenePath, JSON.stringify(scene, null, 2));
      await reload();
      await cdp.evaluate(`document.getElementById("mode-preview").click()`);
      await wait(800);
      for (const label of ["第 3 页", "第 4 页"]) {
        await cdp.evaluate(`document.querySelector('#board-bar [data-board="next"]').click()`);
        await wait(900);
        assert.equal((await bar()).label, label);
      }
      assert.equal((await bar()).next, false, "第 4 页是最后一屏");
      assert.deepEqual(await cdp.evaluate(`[...document.getElementById("stage-iframe").contentDocument.querySelectorAll(".vf-dev-page")].map((f) => f.className.replace("vf-dev-page ", ""))`), ["left", "right blank"]);
    });

    await test("包封：停在封底换成手机还是封底（封面和封底是同一块画板，按页码找，不按画板找），换回书也还是", async () => {
      await cdp.evaluate(`document.getElementById("mode-edit").click()`);
      await wait(400);
      const scenePath = path.join(dir, "ui/scene.json");
      const scene = JSON.parse(fs.readFileSync(scenePath, "utf8")) as Record<string, unknown>;
      fs.writeFileSync(scenePath, JSON.stringify({ ...scene, cover: "wrap" }, null, 2));
      await reload();
      await cdp.evaluate(`document.getElementById("mode-preview").click()`);
      await wait(800);
      assert.equal((await bar()).label, "封面");
      for (let i = 0; i < 6 && (await bar()).next; i++) {
        await cdp.evaluate(`document.querySelector('#board-bar [data-board="next"]').click()`);
        await wait(900);
      }
      assert.equal((await bar()).label, "封底");
      await cdp.evaluate(`document.querySelector('#board-bar [data-device="phone"]').click()`);
      await wait(600);
      assert.deepEqual([(await bar()).label, (await bar()).next], ["封底", false], "手机上还是封底");
      await cdp.evaluate(`document.querySelector('#board-bar [data-device="book"]').click()`);
      await wait(600);
      assert.equal((await bar()).label, "封底", "换回书还是封底");
    });

    await test("包封：原样看着包封（封底 + 封面）换成书，停在封面，不是封底", async () => {
      await cdp.evaluate(`document.querySelector('#board-bar [data-device="plain"]').click()`);
      await wait(600);
      assert.equal((await bar()).label, "封底 + 封面");
      await cdp.evaluate(`document.querySelector('#board-bar [data-device="book"]').click()`);
      await wait(600);
      assert.equal((await bar()).label, "封面");
    });

    await test("别的窗口（独立预览、播放页）改了 .designer/preview.json：编辑器的预览跟着换、停在同一页；编辑器再存时只改自己动的那一项，别的不丢", async () => {
      const settingsPath = path.join(dir, ".designer/preview.json");
      fs.writeFileSync(settingsPath, JSON.stringify({ device: "phone", phone: "pixel-8", landscape: false, other: 1 }));
      let state = await bar();
      for (let k = 0; k < 40 && state.devices.phone !== "true"; k++) {
        await wait(100);
        state = await bar();
      }
      assert.deepEqual([state.devices.phone, state.label], ["true", "封面"], "跟着换成手机，还是封面");
      assert.ok(await cdp.evaluate<boolean>(`Boolean(${stageQuery(".vf-dev-punch")})`), "Pixel 8 的挖孔屏");
      await cdp.evaluate(`document.querySelector('#board-bar [data-device="desktop"]').click()`);
      await wait(600);
      assert.deepEqual(JSON.parse(fs.readFileSync(settingsPath, "utf8")), { device: "desktop", phone: "pixel-8", landscape: false, other: 1 });
      await wait(600);
      assert.equal((await bar()).devices.desktop, "true", "自己写的文件读回来不来回跳");
    });
  });
}

async function uiTests(): Promise<void> {
  await withEditor("animean", async ({ cdp }) => {
    await test("界面设计进预览默认是电脑：窗口在桌面中间，标题栏有图标和名字，任务栏上的软件亮着", async () => {
      await cdp.evaluate(`document.getElementById("mode-preview").click()`);
      await wait(900);
      const desk = await cdp.evaluate<{ pressed: string; title: string; icon: boolean; inWindow: boolean; flip: boolean }>(`(() => {
        const doc = document.getElementById("stage-iframe").contentDocument;
        return {
          pressed: document.querySelector('#board-bar [data-device][aria-pressed="true"]')?.dataset.device ?? "",
          title: doc.querySelector(".vf-dev-title")?.textContent ?? "",
          icon: Boolean(doc.querySelector(".vf-dev-titlebar .vf-dev-title-icon")),
          inWindow: Boolean(doc.querySelector('.vf-dev-window .vf-dev-screen-slot [data-vf-id="moveLayerDownBtn"]')),
          flip: Boolean(document.querySelector('#board-bar [data-board="next"]')),
        };
      })()`);
      assert.equal(desk.pressed, "desktop");
      assert.ok(desk.title.length > 0 && desk.icon);
      assert.ok(desk.inWindow, "软件的控件在窗口里");
      assert.equal(desk.flip, false, "界面设计只有一个主窗口，不用翻页");
    });

    await test("窗口里的控件照样能点（逻辑照常跑，事件记录里有）", async () => {
      const before = await cdp.evaluate<number>(`document.querySelectorAll("#log .log-entry").length`);
      const p = await cdp.evaluate<{ x: number; y: number }>(`(() => {
        const iframe = document.getElementById("stage-iframe");
        const el = iframe.contentDocument.querySelector('[data-vf-id="moveLayerDownBtn"]');
        const r = el.getBoundingClientRect(), f = iframe.getBoundingClientRect(), k = f.width / iframe.offsetWidth;
        return { x: f.left + (r.left + r.width / 2) * k, y: f.top + (r.top + r.height / 2) * k };
      })()`);
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y });
      await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", clickCount: 1 });
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", clickCount: 1 });
      await wait(400);
      const after = await cdp.evaluate<number>(`document.querySelectorAll("#log .log-entry").length`);
      assert.ok(after > before, `点了以后事件记录多了（${before} → ${after}）`);
    });

    await test("窗口的菜单栏：点菜单标题，弹出的菜单就在屏幕上这个标题的正下方（窗口在桌面里缩小摆放）", async () => {
      const title = await cdp.evaluate<{ left: number; bottom: number; k: number }>(`(() => {
        const iframe = document.getElementById("stage-iframe"), f = iframe.getBoundingClientRect(), k = f.width / iframe.offsetWidth;
        const el = iframe.contentDocument.querySelector(".vf-dev-window [data-vf-menu-title]");
        const r = el.getBoundingClientRect();
        el.click();
        return { left: f.left + r.left * k, bottom: f.top + r.bottom * k, k };
      })()`);
      await wait(200);
      const menu = await cdp.evaluate<{ hidden: boolean; left: number; top: number }>(`(() => { const m = document.getElementById("menu"), r = m.getBoundingClientRect(); return { hidden: m.hidden, left: r.left, top: r.top }; })()`);
      assert.equal(menu.hidden, false, "菜单弹出来了");
      assert.ok(Math.abs(menu.left - title.left) < 2, `菜单左边 ${menu.left}，标题左边 ${title.left}`);
      assert.ok(Math.abs(menu.top - (title.bottom + 2 * title.k)) < 2, `菜单顶边 ${menu.top}，标题底边 ${title.bottom}`);
      await cdp.evaluate(`document.getElementById("menu").hidden = true`);
    });

    await test("任务栏：鼠标停在软件图标上弹出窗口的缩略图；最小化后窗口收进任务栏，点图标还原；最大化铺满桌面", async () => {
      await cdp.evaluate(`${stageQuery(".vf-dev-tb-btn.app")}.dispatchEvent(new MouseEvent("mouseenter"))`);
      await wait(500);
      const peek = await cdp.evaluate<{ shown: boolean; hasContent: boolean }>(`(() => {
        const thumb = ${stageQuery(".vf-dev-peek-thumb")};
        return { shown: Boolean(thumb), hasContent: Boolean(thumb?.querySelector('[data-vf-id="moveLayerDownBtn"]')) };
      })()`);
      assert.ok(peek.shown && peek.hasContent, "缩略图里是窗口当前的样子");
      await cdp.evaluate(`${stageQuery(".vf-dev-tb-btn.app")}.dispatchEvent(new MouseEvent("mouseleave"))`);
      await cdp.evaluate(`${stageQuery(".vf-dev-control.min")}.click()`);
      await wait(400);
      assert.ok(await cdp.evaluate<boolean>(`Boolean(${stageQuery(".vf-dev-window.minimized")})`), "最小化了");
      assert.equal(await cdp.evaluate<boolean>(`Boolean(${stageQuery(".vf-dev-tb-btn.app.active")})`), false, "任务栏上不再是当前窗口");
      await cdp.evaluate(`${stageQuery(".vf-dev-tb-btn.app")}.click()`);
      await wait(400);
      assert.equal(await cdp.evaluate<boolean>(`Boolean(${stageQuery(".vf-dev-window.minimized")})`), false, "点图标还原了");
      await cdp.evaluate(`${stageQuery(".vf-dev-control.max")}.click()`);
      await wait(400);
      const max = await cdp.evaluate<{ maximized: boolean; width: number }>(`(() => { const w = ${stageQuery(".vf-dev-window")}; return { maximized: w.classList.contains("maximized"), width: w.offsetWidth }; })()`);
      assert.ok(max.maximized);
      assert.equal(max.width, 1920, "铺满桌面的宽度");
    });

    await test("界面设计的手机预览：窗口按屏幕宽度缩放放进屏幕，长的部分在屏幕里滚动", async () => {
      await cdp.evaluate(`document.querySelector('#board-bar [data-device="phone"]').click()`);
      await wait(700);
      const phone = await cdp.evaluate<{ inScreen: boolean; slotW: number; screenW: number }>(`(() => {
        const doc = document.getElementById("stage-iframe").contentDocument;
        return { inScreen: Boolean(doc.querySelector('.vf-dev-phone-screen [data-vf-id="moveLayerDownBtn"]')), slotW: doc.querySelector(".vf-dev-screen-slot").getBoundingClientRect().width, screenW: doc.querySelector(".vf-dev-phone-screen").getBoundingClientRect().width };
      })()`);
      assert.ok(phone.inScreen);
      assert.ok(Math.abs(phone.slotW - phone.screenW) < 1);
    });

    await test("界面设计从手机换回原样：画布不留着手机的宽度，主窗口按设计的尺寸 1:1", async () => {
      await cdp.evaluate(`document.querySelector('#board-bar [data-device="plain"]').click()`);
      await wait(600);
      const plain = await cdp.evaluate<{ device: boolean; canvasWidth: string; iframeWidth: number }>(`(() => {
        const iframe = document.getElementById("stage-iframe");
        return { device: Boolean(iframe.contentDocument.querySelector(".vf-dev")), canvasWidth: iframe.contentDocument.getElementById("stage-canvas").style.width, iframeWidth: iframe.offsetWidth };
      })()`);
      assert.equal(plain.device, false);
      assert.equal(plain.canvasWidth, "", "画布没有留下外框量的宽度");
      assert.equal(plain.iframeWidth, 1280, "设计窗口是主窗口的宽度");
    });
  });
}

// ---------- 播放页：平面设计的独立预览和导出的网页 ----------

const playerBar = (cdp: Cdp) =>
  cdp.evaluate<{ devices: Record<string, string>; label: string; prev: boolean; next: boolean; phoneOpts: boolean }>(`(() => ({
    devices: Object.fromEntries([...document.querySelectorAll("#vf-player-ui [data-device]")].map((b) => [b.dataset.device, b.getAttribute("aria-pressed")])),
    label: document.querySelector('#vf-player-ui [data-board="label"]')?.textContent ?? "",
    prev: !(document.querySelector('#vf-player-ui [data-board="prev"]')?.disabled ?? true),
    next: !(document.querySelector('#vf-player-ui [data-board="next"]')?.disabled ?? true),
    phoneOpts: !(document.querySelector("#vf-player-ui .vf-phone-opts")?.hidden ?? true),
  }))()`);

const clickIn = (cdp: Cdp, selector: string) => cdp.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);

async function pressKey(cdp: Cdp, key: string, keyCode: number): Promise<void> {
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: keyCode });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: keyCode });
}

const faces = (cdp: Cdp) => cdp.evaluate<string[]>(`[...document.querySelectorAll(".vf-dev-page")].map((f) => f.className.replace("vf-dev-page ", ""))`);

/**
 * 播放页上的设备和翻页，独立预览和导出的网页都一样（开始时是书、第 1–2 页）：
 * 书翻页、页面元素不重画、手机、电脑、原样、浏览器自己打印时临时换回原样。最后停在电脑上。
 */
async function playerDeviceTests(cdp: Cdp, where: string): Promise<void> {
  await test(`${where}默认是书：第 1–2 页一屏，跨页是同一块、书脊有阴影；一页页排开的那一列藏起来；整本书放在窗口里、不压着播放条`, async () => {
    const state = await playerBar(cdp);
    assert.deepEqual(state.devices, { book: "true", desktop: "false", phone: "false", plain: "false" });
    assert.deepEqual([state.label, state.prev, state.next, state.phoneOpts], ["第 1–2 页", false, true, false]);
    assert.deepEqual(await faces(cdp), ["left", "right"]);
    const book = await cdp.evaluate<{
      gutter: boolean;
      boards: string[];
      clips: number[];
      bookWidth: number;
      fonts: [string, string];
      title: boolean;
      listShown: boolean;
      mode: boolean;
      root: { left: number; top: number; right: number; bottom: number };
      ui: number;
      vw: number;
    }>(`(() => {
      const r = document.querySelector(".vf-dev").getBoundingClientRect();
      return {
        gutter: Boolean(document.querySelector(".vf-dev-gutter")),
        boards: [...document.querySelectorAll(".vf-dev-slot > [data-vf-board]")].map((b) => b.dataset.vfBoard),
        clips: [...document.querySelectorAll(".vf-dev-book > .vf-dev-clip")].map((c) => c.offsetWidth),
        bookWidth: document.querySelector(".vf-dev-book").offsetWidth,
        fonts: [getComputedStyle(document.querySelector(".vf-dev-slot")).fontFamily, getComputedStyle(document.body).fontFamily],
        title: Boolean(document.querySelector('.vf-dev-slot [data-vf-id="coverTitle"]')),
        listShown: getComputedStyle(document.getElementById("vf-book")).display !== "none",
        mode: document.documentElement.classList.contains("vf-device-mode"),
        root: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
        ui: document.getElementById("vf-player-ui").getBoundingClientRect().top,
        vw: innerWidth,
      };
    })()`);
    assert.ok(book.gutter, "两页中间有书脊的阴影");
    assert.deepEqual(book.boards, ["spread1"], "跨页的两面是同一块，跨过中缝的东西连着");
    assert.deepEqual(book.clips, [book.bookWidth], "跨页只有一块、横跨整本书（两面各一块时左边会是空的）");
    assert.equal(book.fonts[0], book.fonts[1], "书里的页面用网页自己的字体，不用外框的字体（排版和打印、导出 PDF 一样）");
    assert.ok(book.title, "页面里的东西画在书里");
    assert.equal(book.listShown, false, "原样的那一列藏起来了");
    assert.ok(book.mode);
    assert.ok(book.root.left >= -0.5 && book.root.top >= -0.5 && book.root.right <= book.vw + 0.5, `书在窗口里：${JSON.stringify(book.root)}`);
    assert.ok(book.root.bottom <= book.ui + 0.5, `书不压着播放条：书底 ${book.root.bottom}，播放条顶 ${book.ui}`);
  });

  await test(`${where}▶ 翻页时纸从书脊翻过去、翻完收掉；第 3 页单页在右、左边一张空白的纸；← 翻回，PageDown / PageUp 也能翻`, async () => {
    await clickIn(cdp, '#vf-player-ui [data-board="next"]');
    assert.ok(await cdp.evaluate<boolean>(`Boolean(document.querySelector(".vf-dev-leaf"))`), "翻页时有一张在转的纸");
    await wait(900);
    assert.equal(await cdp.evaluate<boolean>(`Boolean(document.querySelector(".vf-dev-leaf"))`), false, "翻完收掉");
    const state = await playerBar(cdp);
    assert.deepEqual([state.label, state.prev, state.next], ["第 3 页", true, false]);
    assert.ok(await cdp.evaluate<boolean>(`Boolean(document.querySelector('.vf-dev-slot [data-vf-id="page3Title"]'))`), "第 3 页的东西画在书里");
    assert.deepEqual(await faces(cdp), ["left blank", "right"]);
    await pressKey(cdp, "ArrowLeft", 37);
    await wait(900);
    assert.equal((await playerBar(cdp)).label, "第 1–2 页", "← 翻回上一屏");
    await pressKey(cdp, "PageDown", 34);
    await wait(900);
    assert.equal((await playerBar(cdp)).label, "第 3 页", "PageDown 翻到下一屏");
    await pressKey(cdp, "PageUp", 33);
    await wait(900);
    assert.equal((await playerBar(cdp)).label, "第 1–2 页", "PageUp 翻回来");
  });

  await test(`${where}翻页、换设备不重画页面：页面元素挪进外框，翻过去再翻回来、换到手机再换回来，还是同一个元素（控件接着动）`, async () => {
    await cdp.evaluate(`document.querySelector('.vf-dev-slot > [data-vf-board="spread1"]').__vfMark = "same"`);
    await pressKey(cdp, "ArrowRight", 39);
    await wait(900);
    await pressKey(cdp, "ArrowLeft", 37);
    await wait(900);
    assert.equal(await cdp.evaluate<string>(`document.querySelector('.vf-dev-slot > [data-vf-board="spread1"]').__vfMark ?? ""`), "same");
    await clickIn(cdp, '#vf-player-ui [data-device="phone"]');
    await wait(500);
    assert.equal(await cdp.evaluate<string>(`document.querySelector('.vf-dev-screen-slot [data-vf-board="spread1"]').__vfMark ?? ""`), "same", "手机屏幕里也是同一个");
    await clickIn(cdp, '#vf-player-ui [data-device="book"]');
    await wait(500);
    assert.equal((await playerBar(cdp)).label, "第 1–2 页", "换回书还在第 1–2 页");
  });

  await test(`${where}手机：一屏一页，按屏幕宽度缩放，有灵动岛和状态栏；换设备停在同一页；型号和横放只在手机时出现`, async () => {
    await clickIn(cdp, '#vf-player-ui [data-board="next"]');
    await wait(900);
    await clickIn(cdp, '#vf-player-ui [data-device="phone"]');
    await wait(600);
    const state = await playerBar(cdp);
    assert.deepEqual([state.devices.phone, state.label, state.phoneOpts], ["true", "第 3 页", true], "书停在第 3 页，换成手机还是第 3 页");
    const phone = await cdp.evaluate<{ island: boolean; time: string; slotW: number; screenW: number }>(`(() => {
      const slot = document.querySelector(".vf-dev-screen-slot");
      return { island: Boolean(document.querySelector(".vf-dev-island")), time: document.querySelector(".vf-dev-status-time")?.textContent ?? "", slotW: slot.getBoundingClientRect().width, screenW: document.querySelector(".vf-dev-phone-screen").getBoundingClientRect().width };
    })()`);
    assert.ok(phone.island);
    assert.equal(phone.time, "9:41");
    assert.ok(Math.abs(phone.slotW - phone.screenW) < 1, `页面按屏幕宽度缩放：${phone.slotW} vs ${phone.screenW}`);
    await clickIn(cdp, '#vf-player-ui [data-board="prev"]');
    await wait(500);
    assert.equal((await playerBar(cdp)).label, "第 2 页", "手机一屏一页，跨页拆成两屏");
    await cdp.evaluate(`(() => { const s = document.querySelector('#vf-player-ui [data-board="phone-model"]'); s.value = "iphone-se"; s.dispatchEvent(new Event("change")); })()`);
    await wait(500);
    assert.deepEqual(await cdp.evaluate(`[Boolean(document.querySelector(".vf-dev-classic-home")), Boolean(document.querySelector(".vf-dev-island"))]`), [true, false], "老式 iPhone SE：有 Home 键，没有灵动岛");
    await clickIn(cdp, '#vf-player-ui [data-board="rotate"]');
    await wait(500);
    assert.ok(await cdp.evaluate<boolean>(`Boolean(document.querySelector(".vf-dev-phone.landscape"))`), "横过来了");
    assert.equal(await cdp.evaluate<string>(`document.querySelector('#vf-player-ui [data-board="rotate"]').textContent`), "竖放");
    assert.equal((await playerBar(cdp)).label, "第 2 页", "换型号、横放不换页");
  });

  await test(`${where}电脑：窗口标题是项目名和第几页，任务栏上有这个软件；最小化收进任务栏、点图标还原；最大化铺满桌面，翻页后还是最大化`, async () => {
    await clickIn(cdp, '#vf-player-ui [data-device="desktop"]');
    await wait(700);
    const state = await playerBar(cdp);
    assert.deepEqual([state.devices.desktop, state.label, state.phoneOpts], ["true", "第 1–2 页", false]);
    const desk = await cdp.evaluate<{ title: string; taskbar: boolean; app: boolean; boards: number; clips: number[]; slotWidth: number }>(`(() => ({
      title: document.querySelector(".vf-dev-title")?.textContent ?? "",
      taskbar: Boolean(document.querySelector(".vf-dev-taskbar")),
      app: Boolean(document.querySelector(".vf-dev-tb-btn.app.active")),
      boards: document.querySelectorAll(".vf-dev-window .vf-dev-screen-slot [data-vf-board]").length,
      clips: [...document.querySelectorAll(".vf-dev-window .vf-dev-screen-slot > div")].map((c) => c.offsetWidth),
      slotWidth: document.querySelector(".vf-dev-window .vf-dev-screen-slot").offsetWidth,
    }))()`);
    assert.equal(desk.title, "平面设计示例 — 第 1–2 页");
    assert.ok(desk.taskbar && desk.app);
    assert.equal(desk.boards, 1, "窗口里是第 1–2 页这个跨页");
    assert.deepEqual(desk.clips, [desk.slotWidth], "跨页在窗口里是一整块");
    await clickIn(cdp, ".vf-dev-control.min");
    await wait(400);
    assert.ok(await cdp.evaluate<boolean>(`Boolean(document.querySelector(".vf-dev-window.minimized"))`), "最小化了");
    await clickIn(cdp, ".vf-dev-tb-btn.app");
    await wait(400);
    assert.equal(await cdp.evaluate<boolean>(`Boolean(document.querySelector(".vf-dev-window.minimized"))`), false, "点图标还原了");
    await clickIn(cdp, ".vf-dev-control.max");
    await wait(400);
    assert.equal(await cdp.evaluate<number>(`document.querySelector(".vf-dev-window.maximized")?.offsetWidth ?? 0`), 1920, "铺满桌面的宽度");
    await pressKey(cdp, "ArrowRight", 39);
    await wait(500);
    assert.equal(await cdp.evaluate<string>(`document.querySelector(".vf-dev-title")?.textContent ?? ""`), "平面设计示例 — 第 3 页", "翻页后标题跟着变");
    assert.ok(await cdp.evaluate<boolean>(`Boolean(document.querySelector(".vf-dev-window.maximized"))`), "还是最大化");
    await clickIn(cdp, ".vf-dev-control.max");
    await pressKey(cdp, "ArrowLeft", 37);
    await wait(500);
  });

  await test(`${where}原样：不套外框，页面回到各自的框里一页页排开；← → 滚到上一页、下一页`, async () => {
    await clickIn(cdp, '#vf-player-ui [data-device="plain"]');
    await wait(600);
    const plain = await cdp.evaluate<{ device: boolean; mode: boolean; frames: string[] }>(`(() => ({
      device: Boolean(document.querySelector(".vf-dev")),
      mode: document.documentElement.classList.contains("vf-device-mode"),
      frames: [...document.querySelectorAll("#vf-book > .vf-board-frame")].map((f) => [...f.children].map((c) => c.dataset.vfBoard).join(",")),
    }))()`);
    assert.deepEqual(plain, { device: false, mode: false, frames: ["spread1", "page3"] });
    assert.equal(await cdp.evaluate<string>(`document.querySelector('#vf-book > .vf-board-frame > [data-vf-board="spread1"]').__vfMark ?? ""`), "same", "回到框里的还是同一个元素，没有重画");
    assert.match((await playerBar(cdp)).label, /^第 1–2 页/);
    await pressKey(cdp, "ArrowRight", 39);
    await wait(900);
    assert.match((await playerBar(cdp)).label, /^第 3 页/, "→ 滚到下一页");
    await pressKey(cdp, "ArrowLeft", 37);
    await wait(900);
    assert.match((await playerBar(cdp)).label, /^第 1–2 页/, "← 滚回上一页");
  });

  await test(`${where}用浏览器的菜单打印时临时换回一页页排开（按纸张原大出），打印完再套回外框、停在原来那一屏`, async () => {
    await clickIn(cdp, '#vf-player-ui [data-device="book"]');
    await wait(500);
    await pressKey(cdp, "ArrowRight", 39);
    await wait(900);
    await cdp.evaluate(`window.dispatchEvent(new Event("beforeprint"))`);
    const printing = await cdp.evaluate<{ device: boolean; frames: number }>(
      `({ device: Boolean(document.querySelector(".vf-dev")), frames: document.querySelectorAll("#vf-book > .vf-board-frame > .vf-board").length })`,
    );
    assert.deepEqual(printing, { device: false, frames: 2 });
    await cdp.evaluate(`window.dispatchEvent(new Event("afterprint"))`);
    await wait(300);
    const state = await playerBar(cdp);
    assert.deepEqual([state.devices.book, state.label], ["true", "第 3 页"]);
    await clickIn(cdp, '#vf-player-ui [data-device="desktop"]');
    await wait(500);
  });
}

async function playerTests(): Promise<void> {
  await withEditor(
    "graphic",
    async ({ cdp, dir, reload, open }) => {
      await playerDeviceTests(cdp, "独立预览（播放页）：");
      const settingsPath = path.join(dir, ".designer/preview.json");

      await test("独立预览：设备的选择存进 .designer/preview.json（和编辑器的预览共用），刷新后还在", async () => {
        assert.deepEqual(JSON.parse(fs.readFileSync(settingsPath, "utf8")), { device: "desktop", phone: "iphone-se", landscape: true });
        await reload();
        assert.equal((await playerBar(cdp)).devices.desktop, "true", "刷新后还是电脑");
      });

      await test("独立预览：编辑器里换了设备，独立预览打开时照它的来；文件里编辑器记的别的东西不丢", async () => {
        fs.writeFileSync(settingsPath, JSON.stringify({ device: "phone", phone: "pixel-8", landscape: false, other: 7 }));
        await open("/player.html");
        const state = await playerBar(cdp);
        assert.deepEqual([state.devices.phone, state.phoneOpts], ["true", true]);
        assert.equal(await cdp.evaluate<string>(`document.querySelector('#vf-player-ui [data-board="phone-model"]').value`), "pixel-8");
        assert.ok(await cdp.evaluate<boolean>(`Boolean(document.querySelector(".vf-dev-punch"))`), "Pixel 8 是挖孔屏");
        await clickIn(cdp, '#vf-player-ui [data-device="book"]');
        await wait(500);
        assert.deepEqual(JSON.parse(fs.readFileSync(settingsPath, "utf8")), { device: "book", phone: "pixel-8", landscape: false, other: 7 });
      });

      await test("独立预览：网址参数 ?device= 比存下来的优先", async () => {
        await open("/player.html?device=plain");
        assert.equal((await playerBar(cdp)).devices.plain, "true");
        assert.equal(await cdp.evaluate<boolean>(`Boolean(document.querySelector(".vf-dev"))`), false);
      });

      await test("独立预览：包封的书打开时停在封面（不是封底）；原样看着包封再换成书，也是封面", async () => {
        const scenePath = path.join(dir, "ui/scene.json");
        fs.writeFileSync(scenePath, JSON.stringify({ ...JSON.parse(fs.readFileSync(scenePath, "utf8")), cover: "wrap" }, null, 2));
        await open("/player.html?device=book");
        let state = await playerBar(cdp);
        assert.deepEqual([state.label, state.prev, state.next], ["封面", false, true]);
        assert.ok(await cdp.evaluate<boolean>(`Boolean(document.querySelector(".vf-dev-book.closed.front"))`), "合着的书，看见封面");
        await clickIn(cdp, '#vf-player-ui [data-device="plain"]');
        await wait(500);
        assert.match((await playerBar(cdp)).label, /^封底 \+ 封面/);
        await clickIn(cdp, '#vf-player-ui [data-device="book"]');
        await wait(600);
        state = await playerBar(cdp);
        assert.equal(state.label, "封面");
        await open("/player.html?device=phone");
        assert.equal((await playerBar(cdp)).label, "封面", "手机也从封面开始");
      });
    },
    { page: "/player.html", width: 1280, height: 900, ready: playerReady },
  );
}

async function exportedWebTests(): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vf-preview-web-"));
  let served: Awaited<ReturnType<typeof serveFolder>> | null = null;
  let page: HeadlessPage | null = null;
  try {
    const dir = path.join(tmp, "design");
    fs.cpSync(path.resolve(appRoot, "../examples/graphic/design"), dir, { recursive: true });
    // 编辑器这台机器上的预览设置不进设计，也不跟着导出
    fs.mkdirSync(path.join(dir, ".designer"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".designer/preview.json"), JSON.stringify({ device: "phone" }));
    // 软件图标（电脑的标题栏和任务栏用）：项目里的一张图片，导出后也从导出的文件夹里取
    const configPath = path.join(dir, "project.json");
    fs.writeFileSync(configPath, JSON.stringify({ ...JSON.parse(fs.readFileSync(configPath, "utf8")), icon: " assets/grid.svg " }, null, 2));
    const report = await exportWeb(dir, path.join(tmp, "web"));
    served = await serveFolder(path.join(tmp, "web"));
    const origin = served.url;
    page = await openHeadless("about:blank", { width: 1280, height: 900 });
    const { cdp } = page;
    const requested: string[] = [];
    const open = async (query = "") => {
      await cdp.send("Page.navigate", { url: `${origin}index.html${query}` });
      await wait(300);
      await playerReady(cdp);
    };
    /** 到现在为止要过的东西都在导出的文件夹里：不连编辑器的开发服务器，不上网 */
    const assertOffline = () => {
      const outside = requested.filter((url) => !url.startsWith(origin) && !url.startsWith("data:") && !url.startsWith("blob:") && !url.startsWith("about:"));
      assert.deepEqual(outside, [], "向导出的文件夹以外要了东西");
      const editorOnly = requested.filter((url) => url.startsWith(origin) && /^\/(src|@vite|__project|__p|__fs)\//.test(new URL(url).pathname));
      assert.deepEqual(editorOnly, [], "没有向开发服务器要东西");
    };
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp.send("Network.enable");
    cdp.on("Network.requestWillBeSent", (params) => requested.push((params as { request: { url: string } }).request.url));
    await open();

    await test("导出的网页只从导出的文件夹里取东西（外框和翻页都打包在 vf-player.js 里），不连编辑器、不上网；预览设置不跟着导出", async () => {
      assert.ok(!report.files.some((f) => f.startsWith(".designer")), "预览设置不跟着导出");
      assertOffline();
      assert.ok(requested.some((url) => url.endsWith("/vf-player.js")));
    });

    await playerDeviceTests(cdp, "导出的网页：");

    await test("导出的网页：电脑的标题栏和任务栏上是项目的图标（project.json 的 icon，前后的空格不算），换过所有设备、翻过页也没有向别处要东西", async () => {
      await clickIn(cdp, '#vf-player-ui [data-device="desktop"]');
      await wait(500);
      const icons = await cdp.evaluate<Array<{ src: string; loaded: boolean }>>(
        `[...document.querySelectorAll("img.vf-dev-title-icon, img.vf-dev-tb-app-icon")].map((img) => ({ src: img.src, loaded: img.complete && img.naturalWidth > 0 }))`,
      );
      assert.equal(icons.length, 2, "标题栏和任务栏各一个");
      for (const icon of icons) {
        assert.equal(icon.src, `${origin}assets/grid.svg`);
        assert.ok(icon.loaded, `图标加载出来了：${icon.src}`);
      }
      assertOffline();
    });

    await test("导出的网页：换的设备记在网址和这个浏览器里，刷新后还在；手机的型号、横放也在网址里", async () => {
      assert.equal(await cdp.evaluate<string>(`new URL(location.href).searchParams.get("device")`), "desktop");
      await clickIn(cdp, '#vf-player-ui [data-device="phone"]');
      await wait(400);
      const query = await cdp.evaluate<Record<string, string>>(`Object.fromEntries(new URL(location.href).searchParams)`);
      assert.deepEqual(query, { device: "phone", phone: "iphone-se", landscape: "1" });
      const stored = await cdp.evaluate<string>(`Object.entries(localStorage).find(([k]) => k.startsWith("vf-player-preview:"))?.[1] ?? ""`);
      assert.deepEqual(JSON.parse(stored), { device: "phone", phone: "iphone-se", landscape: true });
      await cdp.evaluate(`location.reload()`);
      await wait(300);
      await playerReady(cdp);
      assert.ok(await cdp.evaluate<boolean>(`Boolean(document.querySelector(".vf-dev-phone.landscape .vf-dev-classic-home"))`), "刷新后还是横放的 iPhone SE");
      // 不带参数打开：用这个浏览器里存的
      await open();
      assert.equal((await playerBar(cdp)).devices.phone, "true");
    });

    await test("导出的网页：网址参数 ?device= 优先；?print=1（导出 PDF 和图片用）照旧按纸排，不套外框、没有播放条", async () => {
      await open("?device=desktop");
      assert.equal((await playerBar(cdp)).devices.desktop, "true");
      await open("?device=book&print=1");
      const print = await cdp.evaluate<{ device: boolean; ui: boolean; frames: number }>(
        `({ device: Boolean(document.querySelector(".vf-dev")), ui: Boolean(document.getElementById("vf-player-ui")), frames: document.querySelectorAll(".vf-board-frame > .vf-board").length })`,
      );
      assert.deepEqual(print, { device: false, ui: false, frames: 2 });
      assertOffline();
    });
  } finally {
    await page?.close();
    await served?.close();
    try {
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {
      // 浏览器的文件偶尔释放得慢
    }
  }
}

// ---------- 界面设计的独立预览窗口（?preview=1） ----------

async function standaloneUiTests(): Promise<void> {
  await withEditor(
    "animean",
    async ({ cdp, dir }) => {
      const stageFits = () =>
        cdp.evaluate<{ frame: number[]; scroll: number[] }>(`(() => {
          const f = document.getElementById("stage-frame").getBoundingClientRect(), s = document.getElementById("stage-scroll").getBoundingClientRect();
          return { frame: [f.left, f.top, f.right, f.bottom], scroll: [s.left, s.top, s.right, s.bottom] };
        })()`);
      const inside = (r: { frame: number[]; scroll: number[] }) =>
        r.frame[0] >= r.scroll[0] - 0.5 && r.frame[1] >= r.scroll[1] - 0.5 && r.frame[2] <= r.scroll[2] + 0.5 && r.frame[3] <= r.scroll[3] + 0.5;

      await test("界面设计的独立预览窗口默认是电脑：工具条上能选设备，软件的窗口在桌面中间，整个桌面缩放到装进窗口", async () => {
        const state = await cdp.evaluate<{ pressed: string; device: boolean; inWindow: boolean; overflow: string }>(`(() => ({
          pressed: document.querySelector('#board-bar [data-device][aria-pressed="true"]')?.dataset.device ?? "",
          device: document.body.classList.contains("standalone-device"),
          inWindow: Boolean(document.getElementById("stage-iframe").contentDocument.querySelector('.vf-dev-window .vf-dev-screen-slot [data-vf-id="moveLayerDownBtn"]')),
          overflow: getComputedStyle(document.getElementById("stage-scroll")).overflow,
        }))()`);
        assert.deepEqual(state, { pressed: "desktop", device: true, inWindow: true, overflow: "hidden" });
        const fits = await stageFits();
        assert.ok(inside(fits), `桌面整个在窗口里：${JSON.stringify(fits)}`);
      });

      await test("独立预览窗口里套着外框，控件照样能点（逻辑照常跑，事件记录里有）", async () => {
        const before = await cdp.evaluate<number>(`document.querySelectorAll("#log .log-entry").length`);
        const p = await cdp.evaluate<{ x: number; y: number }>(`(() => {
          const iframe = document.getElementById("stage-iframe");
          const el = iframe.contentDocument.querySelector('[data-vf-id="moveLayerDownBtn"]');
          const r = el.getBoundingClientRect(), f = iframe.getBoundingClientRect(), k = f.width / iframe.offsetWidth;
          return { x: f.left + (r.left + r.width / 2) * k, y: f.top + (r.top + r.height / 2) * k };
        })()`);
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y });
        await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", clickCount: 1 });
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", clickCount: 1 });
        await wait(400);
        const after = await cdp.evaluate<number>(`document.querySelectorAll("#log .log-entry").length`);
        assert.ok(after > before, `点了以后事件记录多了（${before} → ${after}）`);
      });

      await test("独立预览窗口变小了，设备重新缩放到装进窗口", async () => {
        await cdp.send("Emulation.setDeviceMetricsOverride", { width: 900, height: 700, deviceScaleFactor: 1, mobile: false });
        await wait(600);
        const fits = await stageFits();
        assert.ok(inside(fits), `变小后还在窗口里：${JSON.stringify(fits)}`);
        await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
        await wait(600);
      });

      await test("独立预览窗口换成手机：软件按屏幕宽度放进手机；换成原样：1:1 不套外框，比窗口大时能滚到左边，不被居中裁掉", async () => {
        await clickIn(cdp, '#board-bar [data-device="phone"]');
        await wait(700);
        assert.ok(await cdp.evaluate<boolean>(`Boolean(document.getElementById("stage-iframe").contentDocument.querySelector('.vf-dev-phone-screen [data-vf-id="moveLayerDownBtn"]'))`));
        assert.ok(inside(await stageFits()), "手机整个在窗口里");
        await clickIn(cdp, '#board-bar [data-device="plain"]');
        await wait(700);
        const plain = await cdp.evaluate<{ device: boolean; framed: boolean; transform: string; frameLeft: number; scrollLeft: number; iframeWidth: number }>(`(() => {
          const iframe = document.getElementById("stage-iframe"), scroll = document.getElementById("stage-scroll");
          return {
            device: Boolean(iframe.contentDocument.querySelector(".vf-dev")),
            framed: document.body.classList.contains("standalone-device"),
            transform: getComputedStyle(document.getElementById("stage-frame")).transform,
            frameLeft: document.getElementById("stage-frame").getBoundingClientRect().left,
            scrollLeft: scroll.getBoundingClientRect().left,
            iframeWidth: iframe.offsetWidth,
          };
        })()`);
        assert.deepEqual([plain.device, plain.framed, plain.transform, plain.iframeWidth], [false, false, "none", 1280], "原样 1:1，主窗口是设计的宽度");
        assert.ok(plain.frameLeft >= plain.scrollLeft, `换回原样时从左上角看起，设计窗口的左边没有滚出去：${plain.frameLeft} vs ${plain.scrollLeft}`);
      });

      await test("独立预览窗口从原样再换回电脑：重新缩放到装下整个桌面（不沿用原样时的滚动位置）", async () => {
        await clickIn(cdp, '#board-bar [data-device="desktop"]');
        await wait(700);
        const fits = await stageFits();
        assert.ok(inside(fits), `换回电脑后整个桌面在窗口里：${JSON.stringify(fits)}`);
      });

      await test("独立预览窗口打开事件记录（放设计窗口的地方变矮了）：设备跟着缩小，还是整个放得下", async () => {
        await clickIn(cdp, "#preview-toggle-log");
        await wait(600);
        const fits = await stageFits();
        assert.ok(inside(fits), `打开事件记录后还在窗口里：${JSON.stringify(fits)}`);
        await clickIn(cdp, "#preview-toggle-log");
        await wait(600);
        assert.ok(inside(await stageFits()), "收起事件记录后也在窗口里");
      });

      await test("独立预览窗口套着外框时，在软件里滚滚轮不推着整个设备跑", async () => {
        const before = await stageFits();
        const center = { x: (before.frame[0] + before.frame[2]) / 2, y: (before.frame[1] + before.frame[3]) / 2 };
        for (let i = 0; i < 4; i++) {
          await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: center.x, y: center.y, deltaX: 0, deltaY: 240 });
          await wait(60);
        }
        await wait(300);
        const after = await stageFits();
        assert.deepEqual(after.frame.map(Math.round), before.frame.map(Math.round), "设备没有挪");
      });

      await test("独立预览窗口的设备选择和编辑器共用 .designer/preview.json", async () => {
        const saved = JSON.parse(fs.readFileSync(path.join(dir, ".designer/preview.json"), "utf8")) as { device: string };
        assert.equal(saved.device, "desktop");
      });
    },
    { page: "/?preview=1", width: 1280, height: 900 },
  );
}

async function main(): Promise<void> {
  await graphicTests();
  await uiTests();
  await playerTests();
  await exportedWebTests();
  await standaloneUiTests();
  console.log(`\n全部 ${passed} 项预览设备测试通过。`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
