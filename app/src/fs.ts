// 项目文件的读写接口。在 Tauri 窗口里走 Rust 命令；在普通浏览器里（npm run dev）走 Vite 的开发接口。
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface DirEntry {
  name: string;
  isDir: boolean;
}

const inTauri = "__TAURI_INTERNALS__" in window;

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  }
}

async function devFetch(endpoint: string, path = "", init?: RequestInit, allow404 = false): Promise<Response> {
  const res = await fetch(`/__fs/${endpoint}?path=${encodeURIComponent(path)}`, init);
  if (!res.ok && !(allow404 && res.status === 404)) {
    const detail = (await res.text().catch(() => "")).trim();
    throw new Error(detail || `${endpoint} ${path} 失败（HTTP ${res.status}）`);
  }
  return res;
}

/**
 * 项目文件夹的网址，以 / 结尾。设计窗口拿它当基准地址：项目里的脚本、样式表、图片、字体
 * 用相对路径就能互相引用，和导出成网页之后一样。
 * 桌面窗口里走 Rust 注册的 vfproject 协议，浏览器里走 Vite 的 /__project/。
 */
export function projectBaseUrl(): string {
  if (!inTauri) return `${location.origin}/__project/`;
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
    text = await tauriInvoke<string | null>("read_text", { path });
  } else {
    const res = await devFetch("read", path, undefined, true);
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
  return enqueueFileChange(path, async () => {
    if (inTauri) return tauriInvoke<void>("write_text", { path, content });
    await devFetch("write", path, { method: "POST", body: content });
  });
}

export function removeFile(path: string): Promise<void> {
  return enqueueFileChange(path, async () => {
    if (inTauri) return tauriInvoke<void>("remove_file", { path });
    await devFetch("remove", path, { method: "POST" });
  });
}

export async function listDir(path: string): Promise<DirEntry[]> {
  if (inTauri) return tauriInvoke<DirEntry[]>("list_dir", { path });
  return (await devFetch("list", path)).json();
}

/**
 * 项目文件夹里有任何变化时调用 onChange（已合并 200 毫秒内的连续变化）。
 * paths 是这段时间里变过的文件，相对于项目文件夹，用 / 分隔；系统没告诉是哪个文件时为空。
 */
export function watchProject(onChange: (paths: string[]) => void): void {
  let timer: number | undefined;
  const changed = new Set<string>();
  const fire = (paths: unknown) => {
    for (const path of Array.isArray(paths) ? paths : [paths]) {
      if (typeof path === "string" && path) changed.add(path.replace(/\\/g, "/"));
    }
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
    new EventSource("/__fs/watch?path=").onmessage = (event) => {
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
