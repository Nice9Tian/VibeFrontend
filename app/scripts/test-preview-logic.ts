// 页面画布排布（boardlayout）、翻书分屏（bookview）与预览设备几何（devices）的纯函数测试。
import assert from "node:assert/strict";
import { boardGap, boardWorldBounds, boardWorldLayout, boardWorldOrigin } from "../src/boardlayout.ts";
import { bookViewIndexOfBoard, bookViewIndexOfPage, bookViews, deviceViews, screenIndexForAnchor, sheetPiece } from "../src/bookview.ts";
import {
  defaultDevice,
  DESKTOP_SCREEN,
  desktopWindowPlacement,
  DEVICE_IDS,
  DEVICE_LABELS,
  fitScale,
  isDeviceId,
  PHONE_MODELS,
  phoneModel,
  phoneScreenPlacement,
  viewFit,
} from "../src/devices.ts";
import type { Scene } from "../src/model.ts";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  await fn();
  passed++;
  console.log(`PASS ${name}`);
}

async function boardLayoutTests(): Promise<void> {
  await test("boardlayout：4 个跨页（首屏包封）排成一列，x 全为 0，间距与外包框正确", () => {
    const scene: Scene = {
      version: 1,
      unit: "mm",
      cover: "wrap",
      root: "s1",
      boards: ["s1", "s2", "s3", "s4"],
      nodes: {
        s1: { type: "Page", width: 420, height: 297, props: { sheets: 2 } },
        s2: { type: "Page", width: 420, height: 297, props: { sheets: 2 } },
        s3: { type: "Page", width: 420, height: 297, props: { sheets: 2 } },
        s4: { type: "Page", width: 420, height: 297, props: { sheets: 2 } },
      },
    };
    const gap = boardGap(scene);
    assert.equal(gap, 35.64); // 297 * 0.12 = 35.64
    const layout = boardWorldLayout(scene);
    assert.equal(layout.length, 4);
    const stepY = 297 + 35.64; // 332.64
    assert.deepEqual(
      layout.map((p) => ({ id: p.id, x: p.x, y: p.y, width: p.width, height: p.height, spine: p.spine })),
      [
        { id: "s1", x: 0, y: 0, width: 420, height: 297, spine: 210 },
        { id: "s2", x: 0, y: Number(stepY.toFixed(2)), width: 420, height: 297, spine: 210 },
        { id: "s3", x: 0, y: Number((stepY * 2).toFixed(2)), width: 420, height: 297, spine: 210 },
        { id: "s4", x: 0, y: Number((stepY * 3).toFixed(2)), width: 420, height: 297, spine: 210 },
      ],
    );
    assert.deepEqual(boardWorldBounds(scene), {
      x: 0,
      y: 0,
      width: 420,
      height: Number((stepY * 3 + 297).toFixed(2)),
    });
  });

  await test("boardlayout：根页面是单页右手页时，后面的偶数左手单页 x 为 -宽度，外包框左边界为负", () => {
    const scene: Scene = {
      version: 1,
      unit: "mm",
      root: "p1",
      boards: ["p1", "p2", "p3"],
      nodes: {
        p1: { type: "Page", width: 210, height: 297, props: { sheets: 1 } },
        p2: { type: "Page", width: 210, height: 297, props: { sheets: 1 } },
        p3: { type: "Page", width: 210, height: 297, props: { sheets: 1 } },
      },
    };
    const layout = boardWorldLayout(scene);
    // p1 是第 1 页（右手页，书脊在 0）；p2 是第 2 页（左手页，书脊在右边 210，所以 x = -210）；p3 是第 3 页（x = 0）
    assert.equal(layout[0].x, 0);
    assert.equal(layout[0].spine, 0);
    assert.equal(layout[1].x, -210);
    assert.equal(layout[1].spine, 0);
    assert.equal(layout[2].x, 0);
    assert.equal(layout[2].spine, 0);
    assert.deepEqual(boardWorldOrigin(scene, "p2"), { x: -210, y: 332.64 });
    const bounds = boardWorldBounds(scene)!;
    assert.equal(bounds.x, -210);
    assert.equal(bounds.width, 420);
  });

  await test("boardlayout：跨页、单页与 3 折页混排时书脊对齐，3 张纸取中间偏左的中缝", () => {
    const scene: Scene = {
      version: 1,
      unit: "mm",
      root: "spread1",
      boards: ["spread1", "single3", "single4", "tri5"],
      nodes: {
        // 第 1–2 页（跨页，宽 420，书脊在 210）
        spread1: { type: "Page", width: 420, height: 297, props: { sheets: 2 } },
        // 第 3 页（奇数单页，右手页，书脊在左边 0 → x = 210）
        single3: { type: "Page", width: 210, height: 297, props: { sheets: 1 } },
        // 第 4 页（偶数单页，左手页，书脊在右边 210 → x = 0）
        single4: { type: "Page", width: 210, height: 297, props: { sheets: 1 } },
        // 3 张纸拼成的折页（宽 630，folds 为 [210, 420]，离 315 最近且并列取左边那条 210 → x = 0）
        tri5: { type: "Page", width: 630, height: 297, props: { sheets: 3 } },
      },
    };
    const layout = boardWorldLayout(scene);
    for (const p of layout) {
      assert.equal(p.spine, 210, `${p.id} 的书脊都对齐在 x=210`);
    }
    assert.equal(layout[0].x, 0);
    assert.equal(layout[1].x, 210);
    assert.equal(layout[2].x, 0);
    assert.equal(layout[3].x, 0);
  });

  await test("boardlayout：写了 x/y 的页面照写的放、不参加纵向排队，根页面写了 x/y 也固定在 (0,0)", () => {
    const scene: Scene = {
      version: 1,
      unit: "mm",
      root: "p1",
      boards: ["p1", "p2", "p3"],
      nodes: {
        p1: { type: "Page", x: 99, y: 88, width: 420, height: 200, props: { sheets: 2 } },
        p2: { type: "Page", x: 500, y: 120, width: 420, height: 200, props: { sheets: 2 } },
        p3: { type: "Page", width: 420, height: 200, props: { sheets: 2 } },
      },
    };
    const gap = boardGap(scene); // 200 * 0.12 = 24
    assert.equal(gap, 24);
    const layout = boardWorldLayout(scene);
    assert.deepEqual(layout[0], { id: "p1", x: 0, y: 0, width: 420, height: 200, spine: 210 });
    assert.deepEqual(layout[1], { id: "p2", x: 500, y: 120, width: 420, height: 200, spine: 710 });
    // p3 紧接在自动排列的 p1 下面（y = 0 + 200 + 24 = 224）
    assert.deepEqual(layout[2], { id: "p3", x: 0, y: 224, width: 420, height: 200, spine: 210 });
  });

  await test("boardlayout：非页面画板返回 null；原地修改页面高度后缓存自动失效并重算", () => {
    const uiScene: Scene = {
      version: 1,
      root: "win",
      windows: ["win", "dlg"],
      nodes: {
        win: { type: "Window", width: 800, height: 600 },
        dlg: { type: "Dialog", width: 400, height: 300 },
      },
    };
    assert.equal(boardGap(uiScene), 0);
    assert.deepEqual(boardWorldLayout(uiScene), []);
    assert.equal(boardWorldOrigin(uiScene, "win"), null);
    assert.equal(boardWorldOrigin(uiScene, "dlg"), null);
    assert.equal(boardWorldBounds(uiScene), null);

    const graphicScene: Scene = {
      version: 1,
      unit: "mm",
      root: "p1",
      boards: ["p1", "p2"],
      nodes: {
        p1: { type: "Page", width: 210, height: 100, props: { sheets: 2 } },
        p2: { type: "Page", width: 210, height: 100, props: { sheets: 2 } },
        child: { type: "Text", x: 10, y: 10, width: 50, height: 20 },
      },
    };
    assert.equal(boardWorldOrigin(graphicScene, "child"), null);
    assert.deepEqual(boardWorldOrigin(graphicScene, "p2"), { x: 0, y: 112 }); // 100 + 12

    // 原地修改 p1 的高度，同一个 scene 引用再查
    graphicScene.nodes.p1.height = 200;
    assert.equal(boardGap(graphicScene), 24); // max(200, 100) * 0.12 = 24
    assert.deepEqual(boardWorldOrigin(graphicScene, "p2"), { x: 0, y: 224 }); // 200 + 24
  });

  await test("boardlayout：root 不是第一页时整体平移，root 始终在原点（坐标换算假设根画板在原点）", () => {
    const scene: Scene = {
      version: 1,
      unit: "mm",
      root: "p2",
      boards: ["p1", "p2"],
      nodes: {
        p1: { type: "Page", width: 210, height: 100, props: { sheets: 2 } },
        p2: { type: "Page", width: 210, height: 100, props: { sheets: 2 } },
      },
    };
    assert.deepEqual(boardWorldOrigin(scene, "p2"), { x: 0, y: 0 });
    assert.deepEqual(boardWorldOrigin(scene, "p1"), { x: 0, y: -112 });
    assert.deepEqual(boardWorldBounds(scene), { x: 0, y: -112, width: 210, height: 212 });
  });
}

async function bookViewTests(): Promise<void> {
  await test("bookview：包封 + 3 个跨页（8 页）拆成 5 屏：封面、2–3、4–5、6–7、封底", () => {
    const scene: Scene = {
      version: 1,
      unit: "mm",
      cover: "wrap",
      root: "s1",
      boards: ["s1", "s2", "s3", "s4"],
      nodes: {
        s1: { type: "Page", width: 420, height: 297, props: { sheets: 2 } },
        s2: { type: "Page", width: 420, height: 297, props: { sheets: 2 } },
        s3: { type: "Page", width: 420, height: 297, props: { sheets: 2 } },
        s4: { type: "Page", width: 420, height: 297, props: { sheets: 2 } },
      },
    };
    const views = bookViews(scene);
    assert.deepEqual(views, [
      { left: null, right: { board: "s1", sheet: 1, page: 1 }, label: "封面" },
      {
        left: { board: "s2", sheet: 0, page: 2 },
        right: { board: "s2", sheet: 1, page: 3 },
        label: "第 2–3 页",
      },
      {
        left: { board: "s3", sheet: 0, page: 4 },
        right: { board: "s3", sheet: 1, page: 5 },
        label: "第 4–5 页",
      },
      {
        left: { board: "s4", sheet: 0, page: 6 },
        right: { board: "s4", sheet: 1, page: 7 },
        label: "第 6–7 页",
      },
      { left: { board: "s1", sheet: 0, page: 8 }, right: null, label: "封底" },
    ]);

    assert.equal(bookViewIndexOfBoard(views, "s1"), 0);
    assert.equal(bookViewIndexOfBoard(views, "s3"), 2);
    assert.equal(bookViewIndexOfBoard(views, "missing"), 0);
    assert.equal(bookViewIndexOfPage(views, 1), 0);
    assert.equal(bookViewIndexOfPage(views, 5), 2);
    assert.equal(bookViewIndexOfPage(views, 8), 4);
    assert.equal(bookViewIndexOfPage(views, 99), 0);
  });

  await test("bookview：全是单页共 7 页时，首屏第 1 页在右，最后一屏是第 6–7 页", () => {
    const ids = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"];
    const nodes: Scene["nodes"] = {};
    for (const id of ids) {
      nodes[id] = { type: "Page", width: 210, height: 297, props: { sheets: 1 } };
    }
    const scene: Scene = { version: 1, unit: "mm", root: "p1", boards: ids, nodes };
    const views = bookViews(scene);
    assert.equal(views.length, 4);
    assert.deepEqual(views[0], {
      left: null,
      right: { board: "p1", sheet: 0, page: 1 },
      label: "第 1 页",
    });
    assert.deepEqual(views[3], {
      left: { board: "p6", sheet: 0, page: 6 },
      right: { board: "p7", sheet: 0, page: 7 },
      label: "第 6–7 页",
    });
  });

  await test("bookview：设计好的跨页按设计一屏看完；单页按奇偶配对；三张纸的折页两张一屏、落单的在左；界面设计返回 []", () => {
    const P = (width: number, sheets: number) => ({ type: "Page", width, height: 297, props: { sheets } });
    // 第一个页面是跨页（第 1–2 页）、后面一个单页（第 3 页）：跨页一屏，第 3 页单独在右
    const example: Scene = { version: 1, unit: "mm", root: "spread1", boards: ["spread1", "page3"], nodes: { spread1: P(420, 2), page3: P(210, 1) } };
    assert.deepEqual(bookViews(example), [
      { left: { board: "spread1", sheet: 0, page: 1 }, right: { board: "spread1", sheet: 1, page: 2 }, label: "第 1–2 页" },
      { left: null, right: { board: "page3", sheet: 0, page: 3 }, label: "第 3 页" },
    ]);
    // 两个单页（共 2 页）：第 1 页单独在右，第 2 页单独在左
    const twoSingles: Scene = { version: 1, unit: "mm", root: "a", boards: ["a", "b"], nodes: { a: P(210, 1), b: P(210, 1) } };
    assert.deepEqual(bookViews(twoSingles), [
      { left: null, right: { board: "a", sheet: 0, page: 1 }, label: "第 1 页" },
      { left: { board: "b", sheet: 0, page: 2 }, right: null, label: "第 2 页" },
    ]);
    // 单页第 2 页后面跟着跨页 3–4：第 2 页等不到单页，单独在左；跨页照设计一屏
    const mixed: Scene = { version: 1, unit: "mm", root: "a", boards: ["a", "b", "c"], nodes: { a: P(210, 1), b: P(210, 1), c: P(420, 2) } };
    assert.deepEqual(bookViews(mixed).map((v) => v.label), ["第 1 页", "第 2 页", "第 3–4 页"]);
    // 三张纸的折页：第 0、1 张一屏，第 2 张单独在左
    const fold: Scene = { version: 1, unit: "mm", root: "a", boards: ["a"], nodes: { a: P(630, 3) } };
    assert.deepEqual(bookViews(fold), [
      { left: { board: "a", sheet: 0, page: 1 }, right: { board: "a", sheet: 1, page: 2 }, label: "第 1–2 页" },
      { left: { board: "a", sheet: 2, page: 3 }, right: null, label: "第 3 页" },
    ]);
    // 写了 cover: "wrap" 但第一个页面是单页（不算包封）：不叫封面封底，照单页排
    const notWrap: Scene = { version: 1, unit: "mm", cover: "wrap", root: "a", boards: ["a", "b"], nodes: { a: P(210, 1), b: P(420, 2) } };
    assert.deepEqual(bookViews(notWrap).map((v) => v.label), ["第 1 页", "第 2–3 页"]);
    const uiScene: Scene = { version: 1, root: "main", nodes: { main: { type: "Window", width: 1024, height: 768 } } };
    assert.deepEqual(bookViews(uiScene), []);
  });

  await test("bookview：deviceViews 是编辑器预览和播放页共用的一屏一屏：书和电脑一屏两页，手机一屏一页，纸的尺寸是 CSS 像素；换设备按页码停在同一页", () => {
    const P = (width: number, sheets: number) => ({ type: "Page", width, height: 297, props: { sheets } });
    const example: Scene = { version: 1, unit: "mm", root: "spread1", boards: ["spread1", "page3"], nodes: { spread1: P(420, 2), page3: P(210, 1) } };
    const a4 = { width: (210 * 96) / 25.4, height: (297 * 96) / 25.4 };
    const piece = sheetPiece(example, "spread1", 1)!;
    assert.equal(piece.board, "spread1");
    assert.equal(piece.sheet, 1);
    assert.ok(Math.abs(piece.width - a4.width) < 1e-6 && Math.abs(piece.height - a4.height) < 1e-6, `一张 A4 是 ${piece.width}×${piece.height}`);
    assert.equal(sheetPiece(example, "nope", 0), null);

    const book = deviceViews(example, "book");
    assert.deepEqual(book.map((v) => [v.label, v.board, v.pages, v.left?.sheet ?? null, v.right?.sheet ?? null]), [
      ["第 1–2 页", "spread1", [1, 2], 0, 1],
      ["第 3 页", "page3", [3], null, 0],
    ]);
    assert.deepEqual(deviceViews(example, "desktop"), book, "电脑和书一样一屏两页");
    const phone = deviceViews(example, "phone");
    assert.deepEqual(phone.map((v) => [v.label, v.board, v.pages, v.left, v.right?.sheet]), [
      ["第 1 页", "spread1", [1], null, 0],
      ["第 2 页", "spread1", [2], null, 1],
      ["第 3 页", "page3", [3], null, 0],
    ]);
    // 书停在第 1–2 页换成手机：第 1 页；手机停在第 2 页换回书：第 1–2 页那一屏
    assert.equal(screenIndexForAnchor(phone, book[0]), 0);
    assert.equal(screenIndexForAnchor(book, phone[1]), 0);
    assert.equal(screenIndexForAnchor(book, phone[2]), 1);
    // 没有页码（原样里一个画板）时按页面找；都找不到回到第一屏
    assert.equal(screenIndexForAnchor(phone, { pages: [], board: "page3" }), 2);
    assert.equal(screenIndexForAnchor(phone, { pages: [], board: "gone" }), 0);
    // 包封：封面单独在第一屏右边，封底单独在最后一屏左边；手机上同样是封面、封底
    const wrap: Scene = { version: 1, unit: "mm", cover: "wrap", root: "c", boards: ["c", "s"], nodes: { c: P(420, 2), s: P(420, 2) } };
    assert.deepEqual(deviceViews(wrap, "book").map((v) => v.label), ["封面", "第 2–3 页", "封底"]);
    assert.deepEqual(deviceViews(wrap, "phone").map((v) => v.label), ["封面", "第 2 页", "第 3 页", "封底"]);
    const uiScene: Scene = { version: 1, root: "main", nodes: { main: { type: "Window", width: 1024, height: 768 } } };
    assert.deepEqual(deviceViews(uiScene, "phone"), []);
  });
}

async function deviceTests(): Promise<void> {
  await test("devices：设备代号判断、默认设备与手机型号查找（找不到时回退到第一个）", () => {
    assert.deepEqual(DEVICE_IDS, ["book", "desktop", "phone"]);
    assert.equal(DEVICE_LABELS.book, "书籍");
    assert.equal(DEVICE_LABELS.desktop, "电脑");
    assert.equal(DEVICE_LABELS.phone, "手机");
    assert.equal(isDeviceId("book"), true);
    assert.equal(isDeviceId("desktop"), true);
    assert.equal(isDeviceId("phone"), true);
    assert.equal(isDeviceId("tablet"), false);
    assert.equal(isDeviceId(null), false);
    assert.equal(defaultDevice("graphic"), "book");
    assert.equal(defaultDevice("ui"), "desktop");

    assert.equal(PHONE_MODELS.length, 4);
    assert.equal(phoneModel("pixel-8").label, "Pixel 8");
    assert.equal(phoneModel("iphone-se").cutout, "notch");
    assert.equal(phoneModel("unknown-phone").id, "iphone-15");
    assert.equal(phoneModel(undefined).id, "iphone-15");
  });

  await test("devices：fitScale 支持四边留白、最大倍数限制与零尺寸回退", () => {
    assert.equal(fitScale({ width: 500, height: 400 }, { width: 1000, height: 800 }), 2);
    assert.equal(fitScale({ width: 500, height: 400 }, { width: 1000, height: 800 }, { max: 1 }), 1);
    assert.equal(fitScale({ width: 1000, height: 500 }, { width: 600, height: 600 }, { padding: 50 }), 0.5);
    assert.equal(fitScale({ width: 0, height: 500 }, { width: 600, height: 600 }), 1);
    assert.equal(fitScale({ width: 500, height: 500 }, { width: 40, height: 40 }, { padding: 25 }), 1);
  });

  await test("devices：desktopWindowPlacement 正常居中、超大窗口按 24px 余量缩小、最大化铺满可用区", () => {
    assert.deepEqual(DESKTOP_SCREEN, { width: 1920, height: 1080, taskbar: 48 });

    // 正常放得下：可用区 1920×1032，窗口外框 800×(600+32)=800×632
    const normal = desktopWindowPlacement({ width: 800, height: 600 });
    assert.equal(normal.scale, 1);
    assert.deepEqual(normal.frame, { x: 560, y: 200, width: 800, height: 632 });
    assert.deepEqual(normal.content, { x: 560, y: 232, width: 800, height: 600 });

    // 超大窗口：可用区四边留 24px 后外框最多 1872×984，去掉 32px 标题栏后内容最多 1872×952
    const huge = desktopWindowPlacement({ width: 1872 * 2, height: 952 * 2 });
    assert.equal(huge.scale, 0.5);
    assert.deepEqual(huge.frame, { x: 24, y: 24, width: 1872, height: 984 });
    assert.deepEqual(huge.content, { x: 24, y: 56, width: 1872, height: 952 });

    // 最大化：外框占满 1920×1032，去掉 32px 标题栏后区域为 1920×1000，内容等比缩放并居中
    const max = desktopWindowPlacement({ width: 800, height: 500 }, { maximized: true });
    assert.equal(max.scale, 2); // min(1920/800=2.4, 1000/500=2) = 2
    assert.deepEqual(max.frame, { x: 0, y: 0, width: 1920, height: 1032 });
    assert.deepEqual(max.content, { x: 160, y: 32, width: 1600, height: 1000 });
  });

  await test("devices：phoneScreenPlacement 竖屏刚好、超高滚动、横屏左右避让与 viewFit 视口居中", () => {
    const ip15 = phoneModel("iphone-15"); // 393×852, safeTop 54, safeBottom 34 → 安全区 393×764

    // 竖屏刚好放进安全区
    const fit = phoneScreenPlacement({ width: 393, height: 700 }, ip15);
    assert.deepEqual(fit.screen, { width: 393, height: 852 });
    assert.equal(fit.scale, 1);
    assert.equal(fit.scroll, false);
    assert.deepEqual(fit.content, { x: 0, y: 54, width: 393, height: 700 });

    // 竖屏内容缩放后比安全区高，触发滚动
    const tall = phoneScreenPlacement({ width: 393, height: 900 }, ip15);
    assert.equal(tall.scroll, true);
    assert.deepEqual(tall.content, { x: 0, y: 54, width: 393, height: 900 });

    // 横屏：屏幕 852×393，左边去掉 safeTop(54)、右边去掉 safeBottom(34)，安全区宽 764、高 393
    const land = phoneScreenPlacement({ width: 382, height: 150 }, ip15, { landscape: true });
    assert.deepEqual(land.screen, { width: 852, height: 393 });
    assert.equal(land.scale, 2);
    assert.equal(land.scroll, false);
    assert.deepEqual(land.content, { x: 54, y: 0, width: 764, height: 300 });

    // viewFit：小于视口时不放大（max=1），大于视口时缩小并居中
    assert.deepEqual(viewFit({ width: 400, height: 300 }, { width: 1000, height: 800 }, 32), {
      scale: 1,
      x: 300,
      y: 250,
    });
    assert.deepEqual(viewFit({ width: 1800, height: 900 }, { width: 1000, height: 800 }, 50), {
      scale: 0.5,
      x: 50,
      y: 175,
    });
  });
}

async function main(): Promise<void> {
  await boardLayoutTests();
  await bookViewTests();
  await deviceTests();
  console.log(`\n全部 ${passed} 项画布排布与预览几何测试通过。`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
