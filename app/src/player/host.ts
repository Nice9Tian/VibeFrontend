// 编辑器自带的播放页入口（player.html）：告诉播放页项目文件夹在哪、每种控件在哪个文件夹里、预览设备上次选的是什么，然后启动它。
// 导出的网页不用这个文件：项目文件夹和控件的位置导出时直接写进 index.html，预览设备存在看网页的浏览器里。
import { listDir, projectBaseUrl, readText, writeText } from "../fs";
import type { PreviewSettings } from "./screen.ts";

/** 和编辑器的预览共用：设备、手机型号、横竖（这台机器上的习惯，不进项目的设计） */
const PREVIEW_SETTINGS_PATH = ".designer/preview.json";

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

async function readPreviewSettings(): Promise<Record<string, unknown>> {
  try {
    const text = await readText(PREVIEW_SETTINGS_PATH);
    const parsed = text ? (JSON.parse(text) as unknown) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** 换过的设备存回去：先读一遍再合上，文件里编辑器自己记的别的东西不丢 */
let saving: Promise<void> = Promise.resolve();
function savePreviewSettings(patch: PreviewSettings): Promise<void> {
  saving = saving
    .then(async () => {
      const merged = { ...(await readPreviewSettings()), ...patch };
      await writeText(PREVIEW_SETTINGS_PATH, JSON.stringify(merged, null, 2) + "\n");
    })
    .catch(() => undefined);
  return saving;
}

window.VF_PROJECT_BASE = projectBaseUrl();
window.VF_COMPONENT_FOLDERS = await componentFolders().catch(() => ({}));
window.VF_PREVIEW_SETTINGS = (await readPreviewSettings()) as PreviewSettings;
window.VF_SAVE_PREVIEW_SETTINGS = savePreviewSettings;
await import("./main.ts");
