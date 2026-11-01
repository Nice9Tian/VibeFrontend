// 切换编辑模式和预览模式时，设计窗口在屏幕上的位置不能动：
// 用无头 Chrome 打开真实的编辑器，在几种窗口大小、缩放和滚动位置下来回切换，比较切换前后的位置。
//
// 这个错位出现过两次，来源都是“切换模式改变了某个东西的尺寸”：
// 1. 中间栏占着画布上方的空间，切到预览时换一组按钮，栏的高度一变，画布区域就跟着变；
// 2. 预览模式把设计窗口的边框加粗，窗口尺寸一变，里面的内容就挪了。
// 所以预览时要改外观，只能用不占尺寸的办法（颜色、box-shadow），不要改边框粗细、内外边距或显隐占位的元素。
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function findBrowser(): string {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  const found = candidates.find((p): p is string => Boolean(p) && fs.existsSync(p!));
  if (!found) throw new Error("未找到无头浏览器可执行文件（Chrome 或 Edge）");
  return found;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

class Cdp {
  private nextId = 1;
  private pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  private socket: WebSocket;

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message: string } };
      const waiting = message.id === undefined ? undefined : this.pending.get(message.id);
      if (!waiting) return;
      this.pending.delete(message.id!);
      if (message.error) waiting.reject(new Error(message.error.message));
      else waiting.resolve(message.result);
    });
  }

  static connect(url: string): Promise<Cdp> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.addEventListener("open", () => resolve(new Cdp(socket)));
      socket.addEventListener("error", () => reject(new Error("连接浏览器调试端口失败")));
    });
  }

  send<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate<T>(expression: string): Promise<T> {
    const result = await this.send<{ result: { value: T }; exceptionDetails?: { text: string; exception?: { description?: string } } }>("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }

  close(): void {
    this.socket.close();
  }
}

/** 等页面稳定：两帧之后再等一小会儿，ResizeObserver 和重排都该走完了。 */
const SETTLE = `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 120))))`;

interface Measure {
  scrollArea: number[];
  scrollOffset: number[];
  stage: number[];
  controls: Record<string, number[]>;
}

/** 量画布区域、滚动位置、设计窗口内容和每个看得见的控件。 */
const MEASURE = `(() => {
  const box = (el) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 100) / 100); };
  const scroll = document.getElementById("stage-scroll");
  const frame = document.getElementById("stage-iframe");
  const controls = {};
  for (const el of frame.contentDocument.querySelectorAll(".vf-node")) {
    if (getComputedStyle(el).display !== "none" && el.getClientRects().length > 0) controls[el.dataset.vfId] = box(el);
  }
  return { scrollArea: box(scroll), scrollOffset: [scroll.scrollLeft, scroll.scrollTop], stage: box(document.getElementById("stage")), controls };
})()`;

const clickZoom = (label: string) => `[...document.querySelectorAll("#zoom-bar button")].find((b) => b.textContent === ${JSON.stringify(label)}).click()`;

function differences(name: string, a: Measure, b: Measure): string[] {
  const found: string[] = [];
  for (const key of ["scrollArea", "scrollOffset", "stage"] as const) {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) found.push(`${name} ${key}: ${JSON.stringify(a[key])} → ${JSON.stringify(b[key])}`);
  }
  for (const [id, rect] of Object.entries(a.controls)) {
    const other = b.controls[id];
    if (other && JSON.stringify(rect) !== JSON.stringify(other)) found.push(`${name} 控件 ${id}: ${JSON.stringify(rect)} → ${JSON.stringify(other)}`);
  }
  return found;
}

async function main(): Promise<void> {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-mode-switch-"));
  // 复制一份，这样测试不依赖工作区里没提交的设计文件
  const designDir = path.join(workDir, "design");
  fs.cpSync(path.resolve(appRoot, "../examples/animean/design"), designDir, { recursive: true });
  process.env.VF_PROJECT = designDir;

  const { createServer } = await import("vite");
  const vitePort = await freePort();
  const server = await createServer({
    root: appRoot,
    configFile: path.join(appRoot, "vite.config.ts"),
    server: { port: vitePort, strictPort: true, host: "127.0.0.1" },
    logLevel: "silent",
  });
  await server.listen();

  const cdpPort = await freePort();
  let browser: ChildProcess | null = null;
  let cdp: Cdp | null = null;
  try {
    browser = spawn(
      findBrowser(),
      [
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${path.join(workDir, "profile")}`,
        `http://127.0.0.1:${vitePort}/`,
      ],
      { stdio: "ignore" },
    );

    let pageUrl = "";
    const deadline = Date.now() + 30000;
    while (!pageUrl && Date.now() < deadline) {
      try {
        const targets = (await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()) as Array<{ type: string; webSocketDebuggerUrl?: string }>;
        pageUrl = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl ?? "";
      } catch {
        // 浏览器还没起来
      }
      if (!pageUrl) await new Promise((resolve) => setTimeout(resolve, 80));
    }
    assert.ok(pageUrl, "30 秒内没有连上无头浏览器");
    cdp = await Cdp.connect(pageUrl);
    const page = cdp;
    // vite 第一次预构建依赖时会刷新页面，要连续一段时间都就绪才算数
    let readySince = 0;
    while (Date.now() - readySince < 1000 || readySince === 0) {
      assert.ok(Date.now() < deadline + 30000, "编辑器 60 秒内没有加载完");
      let ready = false;
      try {
        ready = await page.evaluate<boolean>(`Boolean(document.querySelector("#layers .layer"))`);
      } catch {
        // 页面正在刷新
      }
      if (!ready) readySince = 0;
      else if (readySince === 0) readySince = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const views: Array<[string, string]> = [
      ["刚打开", ""],
      ["适应窗口", clickZoom("适应")],
      ["100% 并滚动过", `document.getElementById("zoom-level").click(); document.getElementById("stage-scroll").scrollBy(60, 120)`],
    ];
    const failures: string[] = [];
    let checked = 0;
    for (const [width, height] of [
      [1600, 1000],
      [1000, 760],
    ]) {
      await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      await page.evaluate(SETTLE);
      for (const [viewName, setup] of views) {
        if (setup) await page.evaluate(setup);
        await page.evaluate(SETTLE);
        const label = `${width}x${height} ${viewName}`;
        const edit = await page.evaluate<Measure>(MEASURE);
        await page.evaluate(`document.getElementById("mode-preview").click()`);
        await page.evaluate(SETTLE);
        const preview = await page.evaluate<Measure>(MEASURE);
        await page.evaluate(`document.getElementById("mode-edit").click()`);
        await page.evaluate(SETTLE);
        const back = await page.evaluate<Measure>(MEASURE);
        failures.push(...differences(`${label} 编辑→预览`, edit, preview), ...differences(`${label} 预览→编辑`, preview, back));
        checked += Object.keys(edit.controls).length;
        console.log(`${differences(label, edit, preview).length + differences(label, preview, back).length === 0 ? "PASS" : "FAIL"} ${label}：比较了 ${Object.keys(edit.controls).length} 个控件`);
      }
    }
    assert.ok(checked > 0, "没有量到任何控件，测试没有起作用");
    assert.deepEqual(failures.slice(0, 12), [], `切换模式时位置变了，共 ${failures.length} 处`);
    console.log(`\n全部通过：切换模式时位置没有变化（共比较 ${checked} 个控件）。`);
  } finally {
    cdp?.close();
    if (browser && browser.exitCode === null) {
      const exited = new Promise((resolve) => browser!.once("exit", resolve));
      browser.kill();
      await exited;
    }
    await server.close();
    try {
      fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {
      // 浏览器的文件偶尔释放得慢，临时目录留着不影响结果
    }
  }
}

main().catch((error) => {
  console.error(error instanceof assert.AssertionError ? `${error.message}\n${JSON.stringify(error.actual, null, 1)}` : error);
  process.exitCode = 1;
});
