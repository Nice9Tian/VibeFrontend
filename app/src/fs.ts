// 项目文件的读写接口。在 Tauri 窗口里走 Rust 命令；在普通浏览器里（npm run dev）走 Vite 的开发接口。
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isValidPartPath, mapPartPath, unmapChangedPath } from "./parts.ts";

export interface DirEntry {
  name: string;
  isDir: boolean;
}

export interface WorkspaceProject {
  id: string;
  path: string;
  name: string;
  kind: "ui" | "graphic";
  exists: boolean;
  isDefault: boolean;
  lastOpened?: string;
}

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
let defaultProjectId: string | null = null;

/** 当前网页地址栏里的 ?root=<项目 id>，默认项目时为 null。 */
export function currentRootId(): string | null {
  if (typeof location === "undefined") return null;
  const root = new URLSearchParams(location.search).get("root");
  return root || null;
}

/**
 * 当前打开的子项目文件夹（地址栏里的 ?part=parts/<名字>），打开的是总项目时为 null。
 * 写得不对的（不在 parts/ 下、带 ..）当作没写，免得读写到项目外面去。
 */
export function currentPart(): string | null {
  if (typeof location === "undefined") return null;
  const part = (new URLSearchParams(location.search).get("part") ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
  return part && isValidPartPath(part) ? part : null;
}

/** 编辑器里的路径 → 总项目文件夹里的路径（打开子项目时，项目自己的文件在子项目文件夹里） */
function resolve(path: string): string {
  return mapPartPath(path, currentPart());
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  }
}

async function devFetch(endpoint: string, path = "", init?: RequestInit, allow404 = false): Promise<Response> {
  const params = new URLSearchParams({ path });
  const root = currentRootId();
  if (root) params.set("root", root);
  const res = await fetch(`/__fs/${endpoint}?${params}`, init);
  if (!res.ok) {
    // 404 是文件不存在；项目本身不在（?root= 指向的项目不在清单里）时开发服务器另外标一个 X-VF-Error，那要报错
    if (allow404 && res.status === 404 && res.headers.get("X-VF-Error") !== "no-project") return res;
    const detail = (await res.text().catch(() => "")).trim();
    throw new Error(detail || `${endpoint} ${path} 失败（HTTP ${res.status}）`);
  }
  return res;
}

/**
 * 项目文件夹的网址，以 / 结尾。设计窗口拿它当基准地址：项目里的脚本、样式表、图片、字体
 * 用相对路径就能互相引用，和导出成网页之后一样。
 * 桌面窗口里走 Rust 注册的 vfproject 协议，浏览器里走 Vite 的 /__project/（或 /__p/<id>/）。
 */
export function projectBaseUrl(): string {
  if (!inTauri) {
    const root = currentRootId();
    return root ? `${location.origin}/__p/${encodeURIComponent(root)}/` : `${location.origin}/__project/`;
  }
  // Tauri 的自定义协议在 Windows 和 Android 上是 http://<协议名>.localhost/，其他平台是 <协议名>://localhost/
  return /Windows|Android/i.test(navigator.userAgent) ? "http://vfproject.localhost/" : "vfproject://localhost/";
}

/** 项目里一个文件的网址。path 相对于项目文件夹。 */
export function projectUrl(path: string): string {
  const clean = path.replace(/\\/g, "/").replace(/^\/+/, "");
  return projectBaseUrl() + clean.split("/").map(encodeURIComponent).join("/");
}

export async function projectRoot(): Promise<string> {
  if (inTauri) return tauriInvoke<string>("project_root");
  return (await devFetch("root")).text();
}

/** 文件不存在时返回 null。Windows 换行符统一成 LF，这样行号和文本框里的内容保持一致。 */
export async function readText(path: string): Promise<string | null> {
  let text: string | null;
  if (inTauri) {
    text = await tauriInvoke<string | null>("read_text", { path: resolve(path) });
  } else {
    const res = await devFetch("read", resolve(path), undefined, true);
    text = res.status === 404 ? null : await res.text();
  }
  return text === null ? null : text.replace(/\r\n/g, "\n");
}

// 同一个文件的写入和删除按发起顺序一个接一个做：两个请求同时在路上时，后到磁盘的不一定是后发起的
const fileQueues = new Map<string, Promise<unknown>>();
let localWrites = 0;

function enqueueFileChange<T>(path: string, change: () => Promise<T>): Promise<T> {
  localWrites++;
  const result = (fileQueues.get(path) ?? Promise.resolve()).then(change, change);
  const settled = result.catch(() => undefined);
  fileQueues.set(path, settled);
  void settled.then(() => {
    if (fileQueues.get(path) === settled) fileQueues.delete(path);
  });
  return result;
}

/** 本窗口发起过多少次文件修改。读文件前后比较它，就知道读的过程中有没有新的本地修改。 */
export function localWriteCount(): number {
  return localWrites;
}

/** 等本窗口已发起的文件修改全部做完。 */
export async function writesSettled(): Promise<void> {
  while (fileQueues.size > 0) await Promise.all(fileQueues.values());
}

export function writeText(path: string, content: string): Promise<void> {
  const real = resolve(path);
  return enqueueFileChange(real, async () => {
    if (inTauri) return tauriInvoke<void>("write_text", { path: real, content });
    await devFetch("write", real, { method: "POST", body: content });
  });
}

export function removeFile(path: string): Promise<void> {
  const real = resolve(path);
  return enqueueFileChange(real, async () => {
    if (inTauri) return tauriInvoke<void>("remove_file", { path: real });
    await devFetch("remove", real, { method: "POST" });
  });
}

export async function listDir(path: string): Promise<DirEntry[]> {
  if (inTauri) return tauriInvoke<DirEntry[]>("list_dir", { path: resolve(path) });
  return (await devFetch("list", resolve(path))).json();
}

/**
 * 项目文件夹里有任何变化时调用 onChange（已合并 200 毫秒内的连续变化）。
 * paths 是这段时间里变过的文件，相对于项目文件夹，用 / 分隔；系统没告诉是哪个文件时为空。
 * 打开子项目时，路径按编辑器的眼光换算：子项目自己的文件去掉 parts/<名字>/ 前缀，总项目自己的画布和文档不报，
 * 别的子项目的文件带 @root/ 前缀报（子项目里可能又放了别的子项目）。
 */
export function watchProject(onChange: (paths: string[]) => void): void {
  let timer: number | undefined;
  const changed = new Set<string>();
  const part = currentPart();
  const fire = (paths: unknown) => {
    const list = (Array.isArray(paths) ? paths : [paths]).filter((p): p is string => typeof p === "string" && p !== "");
    let relevant = list.length === 0; // 没说是哪个文件：照旧重读
    for (const path of list) {
      const mapped = unmapChangedPath(path.replace(/\\/g, "/"), part);
      if (mapped === null) continue;
      changed.add(mapped);
      relevant = true;
    }
    if (!relevant) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const list = [...changed];
      changed.clear();
      onChange(list);
    }, 200);
  };
  if (inTauri) {
    void listen<string[]>("project-changed", (event) => fire(event.payload));
  } else {
    const root = currentRootId();
    const watchUrl = root ? `/__fs/watch?root=${encodeURIComponent(root)}` : "/__fs/watch?path=";
    new EventSource(watchUrl).onmessage = (event) => {
      let path: unknown = null;
      try {
        path = JSON.parse(String(event.data));
      } catch {
        // 老格式只发一个 changed
      }
      fire(path);
    };
  }
}

async function workspaceFetch<T>(endpoint: string, body?: unknown): Promise<T> {
  const res = await fetch(
    `/__workspace/${endpoint}`,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const text = await res.text().catch(() => "");
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // 非 JSON 说明
  }
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && typeof (data as { message?: unknown }).message === "string"
        ? (data as { message: string }).message
        : text.trim();
    throw new Error(msg || `workspace/${endpoint} 失败（HTTP ${res.status}）`);
  }
  return data as T;
}

/** 列出项目清单：默认项目在第一个，其余按最近打开时间排。 */
export async function listWorkspaceProjects(): Promise<WorkspaceProject[]> {
  if (inTauri) {
    const root = await tauriInvoke<string>("project_root");
    const configText = await readText("project.json").catch(() => null);
    let name = root.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || root;
    let kind: "ui" | "graphic" = "ui";
    if (configText !== null) {
      try {
        const parsed = JSON.parse(configText) as { name?: unknown; kind?: unknown };
        if (typeof parsed?.name === "string" && parsed.name.trim()) name = parsed.name;
        if (parsed?.kind === "graphic") kind = "graphic";
      } catch {
        // project.json 损坏时用文件夹名兜底
      }
    }
    defaultProjectId = "default";
    return [{ id: "default", path: root, name, kind, exists: configText !== null, isDefault: true }];
  }
  const { projects } = await workspaceFetch<{ projects: WorkspaceProject[] }>("projects");
  defaultProjectId = projects.find((p) => p.isDefault)?.id ?? null;
  return projects;
}

/** 把已有设计项目加进清单（已存在则只刷新打开时间）。 */
export async function addWorkspaceProject(path: string): Promise<WorkspaceProject> {
  if (inTauri) throw new Error("桌面版还不能管理多个项目");
  const item = await workspaceFetch<WorkspaceProject>("add", { path });
  if (item.isDefault) defaultProjectId = item.id;
  return item;
}

/** 从清单里移除一个项目（不删文件夹）。 */
export async function removeWorkspaceProject(id: string): Promise<void> {
  if (inTauri) throw new Error("桌面版还不能管理多个项目");
  await workspaceFetch("remove", { id });
}

/** 把项目的最近打开时间更新为现在。 */
export async function touchWorkspaceProject(id: string): Promise<void> {
  if (inTauri) throw new Error("桌面版还不能管理多个项目");
  await workspaceFetch("touch", { id });
}

/** 新建一个最小设计项目并加进清单。 */
export async function createWorkspaceProject(options: { path: string; kind: "ui" | "graphic"; name: string }): Promise<WorkspaceProject> {
  if (inTauri) throw new Error("桌面版还不能管理多个项目");
  const item = await workspaceFetch<WorkspaceProject>("create", options);
  if (item.isDefault) defaultProjectId = item.id;
  return item;
}

/** 编辑器打开某个项目的网址：同源、同路径，默认项目不带 root，part 有值时带上 part。 */
export function projectPageUrl(id: string | null, part?: string | null): string {
  const base = typeof location !== "undefined" ? `${location.origin}${location.pathname}` : "/";
  const params = new URLSearchParams();
  if (id && id !== "default" && id !== defaultProjectId) params.set("root", id);
  if (part) params.set("part", part);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
