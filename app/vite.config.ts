import type { IncomingMessage } from "node:http";
import { defineConfig, type Plugin } from "vite";
import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const host = process.env.TAURI_DEV_HOST;
const here = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(process.env.VF_PROJECT ?? path.join(here, "..", "project"));

function mimeTypeForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".bmp":
      return "image/bmp";
    case ".ico":
      return "image/x-icon";
    case ".svg":
      return "image/svg+xml";
    case ".json":
      return "application/json; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".woff2":
      return "font/woff2";
    case ".woff":
      return "font/woff";
    case ".ttf":
      return "font/ttf";
    case ".otf":
      return "font/otf";
    case ".wasm":
      return "application/wasm";
    case ".avif":
      return "image/avif";
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    default:
      return "text/plain; charset=utf-8";
  }
}

/**
 * 请求是不是别的网站的页面发来的。浏览器会带上 Sec-Fetch-Site 和 Origin；命令行和测试脚本直接发的请求两样都没有，算本机的。
 */
function isCrossSite(req: IncomingMessage): boolean {
  const site = req.headers["sec-fetch-site"];
  if (site && site !== "same-origin" && site !== "none") return true;
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    return new URL(origin).host !== req.headers.host;
  } catch {
    return true;
  }
}

/**
 * 只在开发时使用：让网页在普通浏览器里也能读写项目文件夹，
 * 接口与 src-tauri/src/lib.rs 中的命令一一对应。Tauri 窗口中不走这里。
 */
function devProjectFs(): Plugin {
  const resolveInProject = (rel: string, allowRoot = false): string | null => {
    if (!rel) return allowRoot ? projectDir : null;
    const normalized = rel.replace(/\\/g, "/");
    if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) return null;
    const parts = normalized.split("/");
    if (parts.some((p) => !p || p === "." || p === ".." || p.includes(":") || /[\u0000-\u001f\u007f]/.test(p))) {
      return null;
    }
    const full = path.resolve(projectDir, ...parts);
    const inside = full.startsWith(projectDir + path.sep);
    return inside ? full : null;
  };
  return {
    name: "vf-dev-project-fs",
    configureServer(server) {
      server.middlewares.use("/__fs", (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (req.method === "POST" && isCrossSite(req)) {
          res.statusCode = 403;
          return res.end("不接受别的网站发来的写请求");
        }
        const rawRel = url.searchParams.get("path") ?? "";
        const send = (status: number, body: string | Buffer, type = "text/plain; charset=utf-8") => {
          res.statusCode = status;
          res.setHeader("Content-Type", type);
          res.end(body);
        };
        if (url.pathname === "/root") return send(200, projectDir);
        if (url.pathname === "/watch") {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });
          res.write("retry: 1000\n\n");
          // 把变了的文件名一起发出去（相对于项目文件夹，用 / 分隔）；系统没给文件名时发 null
          const watcher = fs.watch(projectDir, { recursive: true }, (_event, filename) =>
            res.write(`data: ${JSON.stringify(filename ? String(filename).replace(/\\/g, "/") : null)}\n\n`),
          );
          req.on("close", () => watcher.close());
          return;
        }
        if (url.pathname === "/list") {
          const full = resolveInProject(rawRel, true);
          if (!full) return send(400, "路径不在项目文件夹内");
          if (!fs.existsSync(full)) return send(200, "[]", "application/json");
          const entries = fs
            .readdirSync(full, { withFileTypes: true })
            .map((e) => ({ name: e.name, isDir: e.isDirectory() }))
            .sort((a, b) => a.name.localeCompare(b.name));
          return send(200, JSON.stringify(entries), "application/json");
        }
        const full = resolveInProject(rawRel, false);
        if (!full) return send(400, "路径不在项目文件夹内");
        if (url.pathname === "/read") {
          if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return send(404, "");
          return send(200, fs.readFileSync(full), mimeTypeForPath(full));
        }
        if (url.pathname === "/write" && req.method === "POST") {
          const chunks: Buffer[] = [];
          req.on("data", (c: Buffer) => chunks.push(c));
          req.on("end", () => {
            fs.mkdirSync(path.dirname(full), { recursive: true });
            fs.writeFileSync(full, Buffer.concat(chunks));
            send(200, "ok");
          });
          return;
        }
        if (url.pathname === "/remove" && req.method === "POST") {
          if (fs.existsSync(full) && fs.statSync(full).isFile()) {
            fs.unlinkSync(full);
            const parent = path.dirname(full);
            const compsRoot = path.join(projectDir, "components");
            if (parent !== compsRoot && parent.startsWith(compsRoot + path.sep)) {
              try {
                if (fs.readdirSync(parent).length === 0) fs.rmdirSync(parent);
              } catch {
                // 忽略非空或删除失败
              }
            }
          }
          return send(200, "ok");
        }
        send(404, "未知接口");
      });

      // 平面设计的导出：编辑器里的“导出”对话框调用它，干活的是命令行用的同一份脚本。
      // 一次只做一个导出；导出 PDF 要开一个看不见的浏览器，可能要几十秒。
      let exporting = false;
      server.middlewares.use("/__export/graphic", (req, res) => {
        const reply = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify(body));
        };
        if (req.method !== "POST") return reply(405, { ok: false, message: "要用 POST" });
        // 只接受编辑器自己发来的请求：别的网站的页面也能往本机端口发请求，而导出会往本机任意位置写文件
        if (isCrossSite(req) || !String(req.headers["content-type"] ?? "").startsWith("application/json")) {
          return reply(403, { ok: false, message: "不接受别的网站发来的导出请求" });
        }
        if (exporting) return reply(409, { ok: false, message: "上一次导出还没做完" });
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", async () => {
          exporting = true;
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as {
              target?: string;
              outDir?: string;
              scale?: number;
              png?: boolean;
              split?: boolean;
            };
            if (body.target === "web") {
              const { exportWeb } = (await import(pathToFileURL(path.join(here, "scripts/export-web.ts")).href)) as typeof import("./scripts/export-web.ts");
              const report = await exportWeb(projectDir, body.outDir || undefined);
              return reply(200, { ok: true, outDir: report.outDir, files: report.files, errors: [] });
            }
            if (body.target === "print") {
              const { exportPrint } = (await import(pathToFileURL(path.join(here, "scripts/export-print.ts")).href)) as typeof import("./scripts/export-print.ts");
              const out = body.outDir ? path.resolve(projectDir, body.outDir) : undefined;
              const report = await exportPrint(projectDir, out, { scale: body.scale, png: body.png, split: body.split });
              return reply(200, { ok: true, outDir: report.outDir, files: report.files, errors: report.errors });
            }
            reply(400, { ok: false, message: `不认识的导出目标：${String(body.target)}` });
          } catch (e) {
            reply(500, { ok: false, message: (e as Error).message });
          } finally {
            exporting = false;
          }
        });
      });

      // 把项目文件夹当成一个静态网站：设计窗口和播放页以 /__project/ 为基准地址，
      // 项目里的脚本、样式表、图片、字体用相对路径互相引用。和 src-tauri 里的 vfproject 协议对应。
      server.middlewares.use("/__project", (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        let rel: string;
        try {
          rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
        } catch {
          res.statusCode = 400;
          return res.end("地址不合法");
        }
        const full = resolveInProject(rel, false);
        if (!full || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
          res.statusCode = 404;
          return res.end("");
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", mimeTypeForPath(full));
        // 项目文件随时会被改，不让浏览器留旧的
        res.setHeader("Cache-Control", "no-store");
        res.end(fs.readFileSync(full));
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [devProjectFs()],

  // 两个页面：编辑器（index.html）和不带编辑器的播放页（player.html）
  build: {
    rollupOptions: {
      input: {
        main: path.join(here, "index.html"),
        player: path.join(here, "player.html"),
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
