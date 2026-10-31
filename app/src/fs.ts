// 项目文件的读写接口。在 Tauri 窗口里走 Rust 命令；在普通浏览器里（npm run dev）走 Vite 的开发接口。
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface DirEntry {
  name: string;
  isDir: boolean;
}

const inTauri = "__TAURI_INTERNALS__" in window;

async function devFetch(endpoint: string, path = "", init?: RequestInit): Promise<Response> {
  return fetch(`/__fs/${endpoint}?path=${encodeURIComponent(path)}`, init);
}

export async function projectRoot(): Promise<string> {
  if (inTauri) return invoke<string>("project_root");
  return (await devFetch("root")).text();
}

/** 文件不存在时返回 null。Windows 换行符统一成 LF，这样行号和文本框里的内容保持一致。 */
export async function readText(path: string): Promise<string | null> {
  let text: string | null;
  if (inTauri) {
    text = await invoke<string | null>("read_text", { path });
  } else {
    const res = await devFetch("read", path);
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
    if (inTauri) return invoke<void>("write_text", { path, content });
    await devFetch("write", path, { method: "POST", body: content });
  });
}

export function removeFile(path: string): Promise<void> {
  return enqueueFileChange(path, async () => {
    if (inTauri) return invoke<void>("remove_file", { path });
    await devFetch("remove", path, { method: "POST" });
  });
}

export async function listDir(path: string): Promise<DirEntry[]> {
  if (inTauri) return invoke<DirEntry[]>("list_dir", { path });
  return (await devFetch("list", path)).json();
}

/** 项目文件夹里有任何变化时调用 onChange（已合并 200 毫秒内的连续变化）。 */
export function watchProject(onChange: () => void): void {
  let timer: number | undefined;
  const fire = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(onChange, 200);
  };
  if (inTauri) {
    void listen("project-changed", fire);
  } else {
    new EventSource("/__fs/watch?path=").onmessage = fire;
  }
}
