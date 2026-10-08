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

export async function writeText(path: string, content: string): Promise<void> {
  if (inTauri) return invoke("write_text", { path, content });
  await devFetch("write", path, { method: "POST", body: content });
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
