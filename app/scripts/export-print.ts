// 把一个平面设计项目导出成 PDF 和图片：
//
//   npm run export:print -- <设计项目文件夹> [输出文件夹] [--scale 2] [--no-png] [--no-split]
//
// 输出（默认在项目旁边的 print/ 里）：
//   boards.pdf         每个页面一页，尺寸就是页面的尺寸；文字和矢量图形保持矢量
//   sheets.pdf         有跨页时才有：把每个跨页按纸拆开，一张纸一页，按页码排（--no-split 时不出）。
//                      成册有包封时（scene.cover = "wrap"），封面是第 1 页，封底是最后一页
//   board-01.png …     每个页面一张图，--scale 是每个 CSS 像素出几个像素（2 约合 192 dpi）
//   sheet-01.png …     有跨页时才有：每张纸一张图，编号是页码
//   report.json        页面清单、加载时报的错
//
// 做法：先导出成网页放进临时文件夹，起一个只听本机的服务，用无头浏览器以 ?print=1 打开播放页，
// 等它报告准备好（字体、图片、各个控件的异步加载都到位）再出图。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exportWeb } from "./export-web.ts";
import { openHeadless, serveFolder, type Cdp } from "./headless.ts";

interface BoardInfo {
  id: string;
  label: string;
  width: number;
  height: number;
  unit: string;
}

interface PlayerReport {
  ready: boolean;
  errors: string[];
  pending: string[];
  boards: BoardInfo[];
}

export interface PrintExportOptions {
  /** 图片的像素比，默认 2 */
  scale?: number;
  /** 出不出图片，默认出 */
  png?: boolean;
  /** 有跨页时要不要另出一份按纸拆开的，默认要 */
  split?: boolean;
  /** 等播放页准备好最多等多少毫秒，默认两分钟 */
  timeoutMs?: number;
}

export interface PrintExportReport {
  outDir: string;
  files: string[];
  boards: BoardInfo[];
  /** 播放页加载和运行时报的错；有错时文件照样出，但内容可能不对 */
  errors: string[];
}

const READ_STATE = `(() => {
  const p = window.__vfPlayer;
  return p ? { ready: p.isReady, errors: p.errors, pending: p.pending(), boards: p.boards } : null;
})()`;

async function waitForPlayer(cdp: Cdp, timeoutMs: number): Promise<PlayerReport> {
  const deadline = Date.now() + timeoutMs;
  let last: PlayerReport | null = null;
  while (Date.now() < deadline) {
    try {
      last = await cdp.evaluate<PlayerReport | null>(READ_STATE);
    } catch {
      // 页面还在加载
    }
    if (last?.ready) return last;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`播放页在 ${Math.round(timeoutMs / 1000)} 秒内没有准备好${last?.pending.length ? `，还在等：${last.pending.join("、")}` : ""}`);
}

async function printPdf(cdp: Cdp, file: string): Promise<void> {
  const { data } = await cdp.send<{ data: string }>("Page.printToPDF", {
    printBackground: true,
    preferCSSPageSize: true,
    marginTop: 0,
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
  });
  fs.writeFileSync(file, Buffer.from(data, "base64"));
}

/** 每个页面框在文档里的位置（CSS 像素）、它由几张纸拼成、每张纸是第几页。 */
const FRAME_RECTS = `[...document.querySelectorAll(".vf-board-frame")].map((frame) => {
  const r = frame.getBoundingClientRect();
  const pages = (frame.dataset.vfPages || "").split(",").map(Number).filter((n) => n > 0);
  return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height, sheets: Number(frame.dataset.vfSheets || 1), pages };
})`;

async function capture(cdp: Cdp, clip: { x: number; y: number; width: number; height: number }, file: string): Promise<void> {
  const { data } = await cdp.send<{ data: string }>("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { ...clip, scale: 1 },
  });
  fs.writeFileSync(file, Buffer.from(data, "base64"));
}

const pad = (n: number) => String(n).padStart(2, "0");

export async function exportPrint(projectDir: string, outDir?: string, options: PrintExportOptions = {}): Promise<PrintExportReport> {
  const project = path.resolve(projectDir);
  const out = path.resolve(outDir ?? path.join(project, "..", "print"));
  const scale = options.scale ?? 2;
  const wantPng = options.png ?? true;
  const wantSplit = options.split ?? true;
  const timeoutMs = options.timeoutMs ?? 120000;
  fs.mkdirSync(out, { recursive: true });

  const webDir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-print-web-"));
  const files: string[] = [];
  let server: Awaited<ReturnType<typeof serveFolder>> | null = null;
  let page: Awaited<ReturnType<typeof openHeadless>> | null = null;
  try {
    await exportWeb(project, webDir);
    server = await serveFolder(webDir);
    page = await openHeadless(`${server.url}index.html?print=1`);
    const { cdp } = page;
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: scale, mobile: false });
    const state = await waitForPlayer(cdp, timeoutMs);

    await printPdf(cdp, path.join(out, "boards.pdf"));
    files.push("boards.pdf");

    const frames = await cdp.evaluate<Array<{ x: number; y: number; width: number; height: number; sheets: number; pages: number[] }>>(FRAME_RECTS);
    const hasSpreads = frames.some((frame) => frame.sheets > 1);
    if (wantPng) {
      let sheetNo = 0;
      const sheetFiles: string[] = [];
      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        await capture(cdp, frame, path.join(out, `board-${pad(i + 1)}.png`));
        files.push(`board-${pad(i + 1)}.png`);
        if (!wantSplit || !hasSpreads) continue;
        const sheetWidth = frame.width / frame.sheets;
        for (let s = 0; s < frame.sheets; s++) {
          sheetNo++;
          // 按页码起名，包封的左半（封底）是最后一页
          const name = `sheet-${pad(frame.pages[s] ?? sheetNo)}.png`;
          await capture(cdp, { x: frame.x + s * sheetWidth, y: frame.y, width: sheetWidth, height: frame.height }, path.join(out, name));
          sheetFiles.push(name);
        }
      }
      files.push(...sheetFiles.sort());
    }

    const errors = [...state.errors];
    if (wantSplit && hasSpreads) {
      // 按纸拆开的那份：播放页用 split=1 把每个跨页按纸各画一遍，一张纸一页
      await cdp.send("Page.navigate", { url: `${server.url}index.html?print=1&split=1` });
      await new Promise((resolve) => setTimeout(resolve, 300));
      const split = await waitForPlayer(cdp, timeoutMs);
      await printPdf(cdp, path.join(out, "sheets.pdf"));
      files.push("sheets.pdf");
      for (const message of split.errors) if (!errors.includes(message)) errors.push(message);
    }

    fs.writeFileSync(path.join(out, "report.json"), JSON.stringify({ boards: state.boards, errors, files }, null, 2) + "\n");
    files.push("report.json");
    return { outDir: out, files, boards: state.boards, errors };
  } finally {
    await page?.close();
    await server?.close();
    try {
      fs.rmSync(webDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {
      // 临时文件夹删不掉不影响结果
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: PrintExportOptions = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--scale") options.scale = Number(args[++i]);
    else if (arg === "--no-png") options.png = false;
    else if (arg === "--no-split") options.split = false;
    else if (arg.startsWith("--")) {
      console.error(`不认识的参数：${arg}。可用：--scale <倍数>、--no-png、--no-split`);
      process.exitCode = 2;
      return;
    } else positional.push(arg);
  }
  if (!positional[0] || (options.scale !== undefined && !(options.scale > 0))) {
    console.error("用法：npm run export:print -- <设计项目文件夹> [输出文件夹] [--scale 2] [--no-png] [--no-split]");
    process.exitCode = 2;
    return;
  }
  const report = await exportPrint(positional[0], positional[1], options);
  console.log(`已导出到 ${report.outDir}：${report.files.join("、")}`);
  console.log(`共 ${report.boards.length} 个页面：${report.boards.map((b) => `${b.label} ${b.width}×${b.height}${b.unit}`).join("；")}`);
  if (report.errors.length > 0) {
    console.error(`播放页报了 ${report.errors.length} 个错，导出的内容可能不对：\n  ${report.errors.join("\n  ")}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  });
}
