import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, type Plugin } from "vite";
import os from "node:os";
import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const host = process.env.TAURI_DEV_HOST;
const here = path.dirname(fileURLToPath(import.meta.url));
const defaultProjectFallback = path.join(here, "..", "project");

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

interface StoredProject {
  id: string;
  path: string;
  lastOpened: string;
}

interface WorkspaceProjectInfo {
  id: string;
  path: string;
  name: string;
  kind: "ui" | "graphic";
  exists: boolean;
  isDefault: boolean;
  lastOpened: string;
}

/** 项目 id：绝对路径（Windows 转小写）的 sha1 前 12 位十六进制。 */
function projectIdOf(dir: string): string {
  const resolved = path.resolve(dir);
  const key = process.platform === "win32" ? resolved.toLowerCase() : resolved;
  return crypto.createHash("sha1").update(key, "utf8").digest("hex").slice(0, 12);
}

function resolveWorkspaceFile(): string {
  if (process.env.VF_WORKSPACE) return path.resolve(process.env.VF_WORKSPACE);
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "VibeFrontend", "workspace.json");
  }
  return path.join(os.homedir(), ".config", "vibefrontend", "workspace.json");
}

function readWorkspaceProjects(workspaceFile: string): StoredProject[] {
  try {
    if (!fs.existsSync(workspaceFile)) return [];
    const parsed = JSON.parse(fs.readFileSync(workspaceFile, "utf8")) as { projects?: unknown };
    if (!Array.isArray(parsed?.projects)) return [];
    const seen = new Set<string>();
    const list: StoredProject[] = [];
    for (const item of parsed.projects) {
      if (!item || typeof item !== "object") continue;
      const raw = item as { id?: unknown; path?: unknown; lastOpened?: unknown };
      if (typeof raw.id !== "string" || !raw.id || typeof raw.path !== "string" || !raw.path) continue;
      if (seen.has(raw.id)) continue;
      seen.add(raw.id);
      list.push({
        id: raw.id,
        path: raw.path,
        lastOpened: typeof raw.lastOpened === "string" ? raw.lastOpened : "",
      });
    }
    return list;
  } catch {
    return [];
  }
}

function writeWorkspaceProjects(workspaceFile: string, projects: StoredProject[]): void {
  fs.mkdirSync(path.dirname(workspaceFile), { recursive: true });
  const tmp = `${workspaceFile}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2, 8)}.tmp`;
  const content = JSON.stringify({ version: 1, projects }, null, 2) + "\n";
  fs.writeFileSync(tmp, content, "utf8");
  try {
    fs.renameSync(tmp, workspaceFile);
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // 忽略临时文件清理失败
    }
    throw e;
  }
}

function resolveInDir(baseDir: string, rel: string, allowRoot = false): string | null {
  if (!rel) return allowRoot ? baseDir : null;
  const normalized = rel.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) return null;
  const parts = normalized.split("/");
  if (parts.some((p) => !p || p === "." || p === ".." || p.includes(":") || /[\u0000-\u001f\u007f]/.test(p))) {
    return null;
  }
  const full = path.resolve(baseDir, ...parts);
  const prefix = baseDir.endsWith(path.sep) ? baseDir : baseDir + path.sep;
  return full.startsWith(prefix) ? full : null;
}

function serveStaticInDir(baseDir: string, rel: string, res: ServerResponse): void {
  if (!rel) {
    res.statusCode = 404;
    res.end("");
    return;
  }
  const full = resolveInDir(baseDir, rel, false);
  if (!full) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("路径不在项目文件夹内");
    return;
  }
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    res.statusCode = 404;
    res.end("");
    return;
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", mimeTypeForPath(full));
  // 项目文件随时会被改，不让浏览器留旧的
  res.setHeader("Cache-Control", "no-store");
  res.end(fs.readFileSync(full));
}

function createMinimalProject(dir: string, kind: "ui" | "graphic", name: string): void {
  const toJson = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
  const write = (rel: string, text: string) => {
    const target = path.join(dir, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text, "utf8");
  };
  const uuid = crypto.randomUUID();
  if (kind === "graphic") {
    write(
      "project.json",
      toJson({
        version: 1,
        id: uuid,
        name,
        kind: "graphic",
        boards: [{ id: "page1", doc: "docs/page1.md" }],
      }),
    );
    write(
      "ui/scene.json",
      toJson({
        version: 1,
        unit: "mm",
        root: "page1",
        boards: ["page1"],
        nodes: {
          page1: {
            type: "Page",
            width: 210,
            height: 297,
            props: { marginTop: 14, marginBottom: 14, marginOuter: 14, marginInner: 14 },
            children: [],
          },
        },
      }),
    );
    write("docs/page1.md", `# ${name}\n`);
  } else {
    write("project.json", toJson({ version: 1, id: uuid, name }));
    write(
      "ui/scene.json",
      toJson({
        version: 1,
        root: "main",
        nodes: {
          main: {
            type: "Window",
            width: 960,
            height: 640,
            props: { title: name },
            children: [],
          },
        },
      }),
    );
    write("logic/app.logic.yaml", "states: {}\nobjects: {}\n");
    write("docs/main.md", `# ${name}\n`);
  }
}

/**
 * 只在开发时使用：让网页在普通浏览器里也能读写项目文件夹，
 * 接口与 src-tauri/src/lib.rs 中的命令一一对应。Tauri 窗口中不走这里。
 */
function devProjectFs(): Plugin {
  return {
    name: "vf-dev-project-fs",
    configureServer(server) {
      const defaultDir = path.resolve(process.env.VF_PROJECT ?? defaultProjectFallback);
      const defaultId = projectIdOf(defaultDir);
      const workspaceFile = resolveWorkspaceFile();
      let defaultFallbackOpened = new Date().toISOString();

      const loadProjects = (): StoredProject[] => {
        const list = readWorkspaceProjects(workspaceFile);
        const existingDefault = list.find((p) => p.id === defaultId);
        if (existingDefault) {
          if (existingDefault.lastOpened) defaultFallbackOpened = existingDefault.lastOpened;
        } else {
          list.unshift({ id: defaultId, path: defaultDir, lastOpened: defaultFallbackOpened });
        }
        return list;
      };

      const startupList = readWorkspaceProjects(workspaceFile);
      if (!startupList.some((p) => p.id === defaultId)) {
        startupList.unshift({ id: defaultId, path: defaultDir, lastOpened: defaultFallbackOpened });
        try {
          writeWorkspaceProjects(workspaceFile, startupList);
        } catch {
          // 沙盒或只读用户目录写不进去时保留内存里的默认项目，不让开发服务器崩
        }
      }

      const findProjectDir = (id: string): string | null => {
        const found = loadProjects().find((p) => p.id === id);
        return found ? path.resolve(found.path) : null;
      };

      const describeProject = (entry: StoredProject): WorkspaceProjectInfo => {
        const dir = path.resolve(entry.path);
        const configPath = path.join(dir, "project.json");
        let exists = false;
        let name = path.basename(dir) || dir;
        let kind: "ui" | "graphic" = "ui";
        try {
          if (fs.existsSync(configPath) && fs.statSync(configPath).isFile()) {
            exists = true;
            const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as { name?: unknown; kind?: unknown };
            if (typeof parsed?.name === "string" && parsed.name.trim()) name = parsed.name;
            if (parsed?.kind === "graphic") kind = "graphic";
          }
        } catch {
          // project.json 损坏时仍算存在，名字和类型用兜底值
        }
        return {
          id: entry.id,
          path: dir,
          name,
          kind,
          exists,
          isDefault: entry.id === defaultId,
          lastOpened: entry.lastOpened,
        };
      };

      server.middlewares.use("/__fs", (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (req.method === "POST" && isCrossSite(req)) {
          res.statusCode = 403;
          return res.end("不接受别的网站发来的写请求");
        }
        const send = (status: number, body: string | Buffer, type = "text/plain; charset=utf-8") => {
          res.statusCode = status;
          res.setHeader("Content-Type", type);
          res.end(body);
        };
        const rootId = url.searchParams.get("root");
        const targetDir = rootId ? findProjectDir(rootId) : defaultDir;
        if (!targetDir) {
          // 和“文件不存在”（也是 404）分开：编辑器读到它要报错，而不是当成空项目打开
          res.setHeader("X-VF-Error", "no-project");
          return send(404, "没有这个项目");
        }

        const rawRel = url.searchParams.get("path") ?? "";
        if (url.pathname === "/root") return send(200, targetDir);
        if (url.pathname === "/watch") {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });
          // 把变了的文件名一起发出去（相对于项目文件夹，用 / 分隔）；系统没给文件名时发 null
          try {
            const watcher = fs.watch(targetDir, { recursive: true }, (_event, filename) => {
              if (!res.writableEnded) {
                res.write(`data: ${JSON.stringify(filename ? String(filename).replace(/\\/g, "/") : null)}\n\n`);
              }
            });
            const stop = () => watcher.close();
            req.on("close", stop);
            res.on("close", stop);
          } catch {
            // 文件夹不存在时不崩
          }
          res.write("retry: 1000\n\n");
          return;
        }
        if (url.pathname === "/list") {
          const full = resolveInDir(targetDir, rawRel, true);
          if (!full) return send(400, "路径不在项目文件夹内");
          if (!fs.existsSync(full)) return send(200, "[]", "application/json");
          const entries = fs
            .readdirSync(full, { withFileTypes: true })
            .map((e) => ({ name: e.name, isDir: e.isDirectory() }))
            .sort((a, b) => a.name.localeCompare(b.name));
          return send(200, JSON.stringify(entries), "application/json");
        }
        const full = resolveInDir(targetDir, rawRel, false);
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
            const compsRoot = path.join(targetDir, "components");
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

      server.middlewares.use("/__workspace", (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const reply = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify(body));
        };
        if (url.pathname === "/projects") {
          if (req.method !== "GET") return reply(405, { ok: false, message: "要用 GET" });
          const sorted = [...loadProjects()].sort((a, b) => {
            if (a.id === defaultId && b.id !== defaultId) return -1;
            if (b.id === defaultId && a.id !== defaultId) return 1;
            const ta = a.lastOpened ? Date.parse(a.lastOpened) : 0;
            const tb = b.lastOpened ? Date.parse(b.lastOpened) : 0;
            return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
          });
          return reply(200, { projects: sorted.map(describeProject) });
        }
        if (req.method !== "POST") return reply(405, { ok: false, message: "要用 POST" });
        if (isCrossSite(req) || !String(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
          return reply(403, { ok: false, message: "不接受别的网站发来的写请求" });
        }
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          try {
            let body: Record<string, unknown>;
            try {
              const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
              if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                return reply(400, { ok: false, message: "请求体必须是 JSON 对象" });
              }
              body = parsed as Record<string, unknown>;
            } catch {
              return reply(400, { ok: false, message: "请求体不是有效的 JSON" });
            }

            if (url.pathname === "/add") {
              const rawPath = typeof body.path === "string" ? body.path.trim() : "";
              if (!rawPath || !path.isAbsolute(rawPath)) {
                return reply(400, { ok: false, message: "请提供项目文件夹的绝对路径" });
              }
              const dir = path.resolve(rawPath);
              const configPath = path.join(dir, "project.json");
              if (!fs.existsSync(configPath) || !fs.statSync(configPath).isFile()) {
                return reply(400, { ok: false, message: `${dir} 里没有 project.json，它不是一个设计项目` });
              }
              const id = projectIdOf(dir);
              const now = new Date().toISOString();
              const projects = loadProjects();
              let entry = projects.find((p) => p.id === id);
              if (entry) {
                entry.lastOpened = now;
              } else {
                entry = { id, path: dir, lastOpened: now };
                projects.push(entry);
              }
              if (id === defaultId) defaultFallbackOpened = now;
              writeWorkspaceProjects(workspaceFile, projects);
              return reply(200, describeProject(entry));
            }

            if (url.pathname === "/remove") {
              const id = typeof body.id === "string" ? body.id.trim() : "";
              if (!id) return reply(400, { ok: false, message: "缺少项目 id" });
              if (id === defaultId) return reply(400, { ok: false, message: "默认项目不能从清单里移除" });
              const projects = loadProjects().filter((p) => p.id !== id);
              writeWorkspaceProjects(workspaceFile, projects);
              return reply(200, { ok: true });
            }

            if (url.pathname === "/touch") {
              const id = typeof body.id === "string" ? body.id.trim() : "";
              if (!id) return reply(400, { ok: false, message: "缺少项目 id" });
              const projects = loadProjects();
              const entry = projects.find((p) => p.id === id);
              if (!entry) return reply(404, { ok: false, message: "没有这个项目" });
              entry.lastOpened = new Date().toISOString();
              if (id === defaultId) defaultFallbackOpened = entry.lastOpened;
              writeWorkspaceProjects(workspaceFile, projects);
              return reply(200, { ok: true, lastOpened: entry.lastOpened });
            }

            if (url.pathname === "/create") {
              const rawPath = typeof body.path === "string" ? body.path.trim() : "";
              const kind = body.kind;
              const name = typeof body.name === "string" ? body.name.trim() : "";
              if (!rawPath || !path.isAbsolute(rawPath)) {
                return reply(400, { ok: false, message: "请提供新项目文件夹的绝对路径" });
              }
              if (kind !== "ui" && kind !== "graphic") {
                return reply(400, { ok: false, message: "项目类型只能是 ui 或 graphic" });
              }
              if (!name) {
                return reply(400, { ok: false, message: "请填写项目名称" });
              }
              const dir = path.resolve(rawPath);
              if (fs.existsSync(dir)) {
                if (!fs.statSync(dir).isDirectory()) {
                  return reply(400, { ok: false, message: `${dir} 已存在且不是文件夹` });
                }
                if (fs.readdirSync(dir).length > 0) {
                  return reply(400, { ok: false, message: `文件夹 ${dir} 已存在且不为空` });
                }
              }
              createMinimalProject(dir, kind, name);
              const id = projectIdOf(dir);
              const now = new Date().toISOString();
              const projects = loadProjects();
              let entry = projects.find((p) => p.id === id);
              if (entry) {
                entry.path = dir;
                entry.lastOpened = now;
              } else {
                entry = { id, path: dir, lastOpened: now };
                projects.push(entry);
              }
              if (id === defaultId) defaultFallbackOpened = now;
              writeWorkspaceProjects(workspaceFile, projects);
              return reply(200, describeProject(entry));
            }

            reply(404, { ok: false, message: "未知接口" });
          } catch (e) {
            reply(500, { ok: false, message: (e as Error).message });
          }
        });
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
              root?: string;
              target?: string;
              outDir?: string;
              scale?: number;
              png?: boolean;
              split?: boolean;
            };
            const targetDir = body.root ? findProjectDir(body.root) : defaultDir;
            if (!targetDir) return reply(404, { ok: false, message: "没有这个项目" });
            if (body.target === "web") {
              const { exportWeb } = (await import(pathToFileURL(path.join(here, "scripts/export-web.ts")).href)) as typeof import("./scripts/export-web.ts");
              const report = await exportWeb(targetDir, body.outDir || undefined);
              return reply(200, { ok: true, outDir: report.outDir, files: report.files, errors: [] });
            }
            if (body.target === "print") {
              const { exportPrint } = (await import(pathToFileURL(path.join(here, "scripts/export-print.ts")).href)) as typeof import("./scripts/export-print.ts");
              const out = body.outDir ? path.resolve(targetDir, body.outDir) : undefined;
              const report = await exportPrint(targetDir, out, { scale: body.scale, png: body.png, split: body.split });
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
        const rawPath = (req.url ?? "/").split("?")[0];
        let rel: string;
        try {
          rel = decodeURIComponent(rawPath).replace(/^\/+/, "");
        } catch {
          res.statusCode = 400;
          return res.end("地址不合法");
        }
        serveStaticInDir(defaultDir, rel, res);
      });

      // 按项目 id 提供任意已登记项目的静态文件：/__p/<id>/<路径>
      server.middlewares.use("/__p", (req, res) => {
        const rawPath = (req.url ?? "/").split("?")[0].replace(/^\/+/, "");
        const slashIdx = rawPath.indexOf("/");
        let id: string;
        let rel: string;
        try {
          id = decodeURIComponent(slashIdx < 0 ? rawPath : rawPath.slice(0, slashIdx));
          rel = slashIdx < 0 ? "" : decodeURIComponent(rawPath.slice(slashIdx + 1));
        } catch {
          res.statusCode = 400;
          return res.end("地址不合法");
        }
        const targetDir = id ? findProjectDir(id) : null;
        if (!targetDir) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          return res.end("没有这个项目");
        }
        serveStaticInDir(targetDir, rel, res);
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
