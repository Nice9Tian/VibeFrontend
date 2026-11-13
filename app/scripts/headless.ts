// 无头浏览器的共用部分：找到本机的 Chrome 或 Edge、起一个不带任何扩展的实例、用调试协议和页面说话。
// 导出 PDF 和图片（export-print.ts）以及平面设计的测试（test-graphic.ts）用它。
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";

export function findBrowser(): string {
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
  if (!found) throw new Error("未找到无头浏览器可执行文件（Chrome 或 Edge）；可以用环境变量 CHROME_PATH 指定");
  return found;
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

export class Cdp {
  private nextId = 1;
  private pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  private listeners = new Map<string, Array<(params: unknown) => void>>();
  private socket: WebSocket;

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; method?: string; params?: unknown; result?: unknown; error?: { message: string } };
      if (message.id === undefined) {
        for (const listener of this.listeners.get(message.method ?? "") ?? []) listener(message.params);
        return;
      }
      const waiting = this.pending.get(message.id);
      if (!waiting) return;
      this.pending.delete(message.id);
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

  on(method: string, listener: (params: unknown) => void): void {
    const list = this.listeners.get(method) ?? [];
    list.push(listener);
    this.listeners.set(method, list);
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

export interface HeadlessPage {
  cdp: Cdp;
  /** 关掉浏览器，删掉它的临时用户目录 */
  close(): Promise<void>;
}

/**
 * 起一个无头浏览器并打开 url。不加载任何扩展（本机的浏览器装了扩展时，新的用户目录也会被塞进扩展的界面）。
 * 用完一定要调用 close()：浏览器不关会一直留在后台，临时用户目录也不会自己消失。
 */
export async function openHeadless(url: string, options: { width?: number; height?: number } = {}): Promise<HeadlessPage> {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-headless-"));
  const cdpPort = await freePort();
  let browser: ChildProcess | null = spawn(
    findBrowser(),
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-extensions",
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      `--window-size=${options.width ?? 1600},${options.height ?? 1000}`,
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${path.join(workDir, "profile")}`,
      url,
    ],
    { stdio: "ignore" },
  );
  const close = async () => {
    if (browser && browser.exitCode === null) {
      const exited = new Promise((resolve) => browser!.once("exit", resolve));
      browser.kill();
      await exited;
    }
    browser = null;
    try {
      fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {
      // 浏览器的文件偶尔释放得慢，临时目录留着不影响结果
    }
  };
  try {
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
    if (!pageUrl) throw new Error("30 秒内没有连上无头浏览器");
    const cdp = await Cdp.connect(pageUrl);
    return {
      cdp,
      close: async () => {
        cdp.close();
        await close();
      },
    };
  } catch (e) {
    await close();
    throw e;
  }
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

/** 把一个文件夹当静态网站开在本机的一个空闲端口上。只听 127.0.0.1。 */
export async function serveFolder(root: string): Promise<{ url: string; close(): Promise<void> }> {
  const base = path.resolve(root);
  const server = http.createServer((req, res) => {
    let rel: string;
    try {
      rel = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (rel.endsWith("/")) rel += "index.html";
    const full = path.resolve(base, `.${rel}`);
    if (!full.startsWith(base + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(full).toLowerCase()] ?? "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(full).pipe(res);
  });
  const port = await freePort();
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
