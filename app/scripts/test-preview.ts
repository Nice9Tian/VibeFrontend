import "./test-env.ts";
// 预览的设备外框（书、电脑、手机、原样）在真实编辑器里的测试（无头浏览器）：
// 1) 平面设计：书一屏两页、翻页时纸从书脊翻过去、键盘翻页；手机一屏一页；电脑窗口里看跨页；原样一个画板一个画板地看；
//    设备选择存进 .designer/preview.json，刷新后还在；切回编辑时编辑的视角原样回来。
// 2) 界面设计：默认是电脑，软件的窗口在桌面中间，标题栏、任务栏、缩略图、最小化和还原、最大化；窗口里的控件照样能点。
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { freePort, openHeadless, type HeadlessPage } from "./headless.ts";

type Cdp = HeadlessPage["cdp"];

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  await fn();
  passed++;
  console.log(`PASS ${name}`);
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 起一个开发服务器打开这个项目（复制一份），跑 fn，最后收拾 */
async function withEditor(example: string, fn: (ctx: { cdp: Cdp; dir: string; reload(): Promise<void> }) => Promise<void>): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vf-preview-"));
  const dir = path.join(tmp, "design");
  fs.cpSync(path.resolve(appRoot, `../examples/${example}/design`), dir, { recursive: true });
  process.env.VF_PROJECT = dir;
  const { createServer } = await import("vite");
  const port = await freePort();
  const server = await createServer({ root: appRoot, configFile: path.join(appRoot, "vite.config.ts"), server: { port, strictPort: true, host: "127.0.0.1" }, logLevel: "silent" });
  await server.listen();
  const page = await openHeadless(`http://127.0.0.1:${port}/`, { width: 1600, height: 1000 });
  const { cdp } = page;
  const ready = async () => {
    let since = 0;
    const deadline = Date.now() + 90000;
    while (since === 0 || Date.now() - since < 1000) {
      assert.ok(Date.now() < deadline, "编辑器 90 秒内没有加载完");
      const ok = await cdp.evaluate<boolean>(`Boolean(document.getElementById("stage-iframe")?.contentDocument?.querySelector(".vf-node"))`).catch(() => false);
      if (ok) since ||= Date.now();
      else since = 0;
      await wait(100);
    }
  };
  try {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
    await ready();
    await fn({
      cdp,
      dir,
      reload: async () => {
        await cdp.evaluate(`location.reload()`);
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
  });
}

async function main(): Promise<void> {
  await graphicTests();
  await uiTests();
  console.log(`\n全部 ${passed} 项预览设备测试通过。`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
