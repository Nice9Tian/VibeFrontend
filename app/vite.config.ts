import { defineConfig, type Plugin } from "vite";
import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const host = process.env.TAURI_DEV_HOST;
const here = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(process.env.VF_PROJECT ?? path.join(here, "..", "project"));

/**
 * 只在开发时使用：让网页在普通浏览器里也能读写项目文件夹，
 * 接口与 src-tauri/src/lib.rs 中的命令一一对应。Tauri 窗口中不走这里。
 */
function devProjectFs(): Plugin {
  const resolveInProject = (rel: string): string | null => {
    const full = path.resolve(projectDir, rel);
    const inside = full === projectDir || full.startsWith(projectDir + path.sep);
    return inside ? full : null;
  };
  return {
    name: "vf-dev-project-fs",
    configureServer(server) {
      server.middlewares.use("/__fs", (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const full = resolveInProject(url.searchParams.get("path") ?? "");
        const send = (status: number, body: string, type = "text/plain; charset=utf-8") => {
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
          const watcher = fs.watch(projectDir, { recursive: true }, () => res.write("data: changed\n\n"));
          req.on("close", () => watcher.close());
          return;
        }
        if (!full) return send(400, "路径不在项目文件夹内");
        if (url.pathname === "/read") {
          if (!fs.existsSync(full)) return send(404, "");
          return send(200, fs.readFileSync(full, "utf8"));
        }
        if (url.pathname === "/list") {
          if (!fs.existsSync(full)) return send(200, "[]", "application/json");
          const entries = fs
            .readdirSync(full, { withFileTypes: true })
            .map((e) => ({ name: e.name, isDir: e.isDirectory() }))
            .sort((a, b) => a.name.localeCompare(b.name));
          return send(200, JSON.stringify(entries), "application/json");
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
        send(404, "未知接口");
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [devProjectFs()],

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
