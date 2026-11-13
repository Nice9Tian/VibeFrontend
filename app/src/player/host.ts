// 编辑器自带的播放页入口（player.html）：告诉播放页项目文件夹在哪、每种控件在哪个文件夹里，然后启动它。
// 导出的网页不用这个文件：导出时这两样直接写进 index.html。
import { listDir, projectBaseUrl, readText } from "../fs";

/** 控件类型 → components/ 下的文件夹名。文件夹名通常就是类型名，声明里另写了 type 的以声明为准。 */
async function componentFolders(): Promise<Record<string, string>> {
  const folders: Record<string, string> = {};
  for (const entry of await listDir("components")) {
    if (!entry.isDir) continue;
    let type = entry.name;
    try {
      const text = await readText(`components/${entry.name}/component.json`);
      const declared = text ? (JSON.parse(text) as { type?: unknown }).type : undefined;
      if (typeof declared === "string" && declared) type = declared;
    } catch {
      // 声明读不出来就按文件夹名找，播放页自己会报出具体的错
    }
    folders[type] = entry.name;
  }
  return folders;
}

window.VF_PROJECT_BASE = projectBaseUrl();
window.VF_COMPONENT_FOLDERS = await componentFolders().catch(() => ({}));
await import("./main.ts");
