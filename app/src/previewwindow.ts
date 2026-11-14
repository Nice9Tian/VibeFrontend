// 独立预览窗口（设计文档 1.1、3.3 节）：
// 顶部栏右侧的“▶ 独立预览”按钮弹出单独的预览窗口（?preview=1），
// 拥有自己独立的 Runtime 实例、条件开关、事件记录和可收起的预览工具条，
// 文件改动后自动刷新；按住 Alt 点击控件时通知主窗口选中该控件并打开文档页签。

import { LogicalSize } from "@tauri-apps/api/dpi";
import { emit, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { Project } from "./project.ts";
import { partNodeElement } from "./render.ts";

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const CHANNEL_NAME = "vf-standalone-preview";
const TAURI_EVENT = "vf-preview-select";
const TAURI_SETTINGS_EVENT = "vf-preview-settings";

/** 预览设备的一处改动（设备、手机型号、横竖），和 .designer/preview.json 一个格式 */
export type PreviewSettingsPatch = { device?: string; phone?: string; landscape?: boolean };

/**
 * 桌面版的独立预览窗口不能写盘（src-tauri 的 ensure_writable_window），换了预览设备要交给主窗口写进 .designer/preview.json。
 * 返回 false 表示不用转交（不在桌面版里），调用方自己写。
 */
export async function sendPreviewSettingsToMain(patch: PreviewSettingsPatch): Promise<boolean> {
  if (!inTauri) return false;
  try {
    await emit(TAURI_SETTINGS_EVENT, patch);
  } catch {
    // 主窗口不在了就不存，这一次的选择只在独立预览窗口里有效
  }
  return true;
}

/** 当前窗口是不是独立预览窗口（URL 带 ?preview=1）。 */
export function isStandalonePreview(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("preview") === "1";
}

/** 在独立预览窗口里按住 Alt 点击控件时，通知主窗口选中该控件并打开文档页签。 */
export async function notifyMainWindowSelect(id: string): Promise<void> {
  try {
    if ( typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel(CHANNEL_NAME);
      bc.postMessage({ type: "select", id });
      bc.close();
    }
  } catch {
    // 忽略 BroadcastChannel 异常
  }
  if (inTauri) {
    try {
      await emit(TAURI_EVENT, { id });
    } catch {
      // 忽略事件发送异常
    }
  }
}

/**
 * 打开或聚焦独立预览窗口。平面设计打开的是播放页（player.html），和导出的网页一样：能套书、电脑、手机的外框，也能一页页排开。
 * 界面设计打开的是编辑器的预览模式；device 是现在预览用的设备，套外框时窗口开大一点，设备缩放到装下整个窗口。
 */
export async function openStandalonePreviewWindow(project: Project, device = "plain"): Promise<void> {
  const root = project.scene.nodes[project.scene.root];
  const player = project.kind === "graphic";
  const framed = player || device !== "plain";
  const width = framed ? 1280 : Math.max(440, (root?.width ?? 520) + 48);
  const height = framed ? 900 : Math.max(340, (root?.height ?? 360) + 112);
  const title = `${player ? project.name : (root?.title ?? project.name)} · 独立预览`;
  // 多项目时带上 ?root（哪个项目）和 ?part（哪个子项目），预览的才是正在编辑的这一个
  const here = new URLSearchParams(location.search);
  const query = new URLSearchParams();
  for (const key of ["root", "part"]) {
    const value = here.get(key);
    if (value) query.set(key, value);
  }
  if (!player) query.set("preview", "1");
  const qs = query.toString() ? `?${query}` : "";
  const pageUrl = player ? `player.html${qs}` : `index.html${qs}`;
  const browserUrl = player ? `player.html${qs}` : qs;

  if (inTauri) {
    try {
      const existing = await WebviewWindow.getByLabel("preview");
      if (existing) {
        await existing.setTitle(title).catch(() => {});
        await existing.setSize(new LogicalSize(width, height)).catch(() => {});
        await existing.unminimize().catch(() => {});
        await existing.show().catch(() => {});
        await existing.setFocus().catch(() => {});
        return;
      }
      const win = new WebviewWindow("preview", {
        url: pageUrl,
        title,
        width,
        height,
        resizable: true,
      });
      win.once("tauri://error", () => {
        window.open(browserUrl, "vf-standalone-preview", `width=${width},height=${height},resizable=yes`);
      });
      return;
    } catch {
      // 回退到 window.open
    }
  }

  window.open(browserUrl, "vf-standalone-preview", `width=${width},height=${height},resizable=yes`);
}

/** 主窗口初始化：在顶部栏右侧挂载“▶ 独立预览”按钮，并监听来自独立预览窗口的 Alt+点击选中事件。 */
export function initPreviewLauncher(
  getProject: () => Project,
  onSelectFromPreview: (id: string) => void,
  getDevice: () => string = () => "plain",
  onPreviewSettings: (patch: PreviewSettingsPatch) => void = () => undefined,
): void {
  if (isStandalonePreview()) return;

  const topbar = document.getElementById("topbar");
  if (topbar && !document.getElementById("open-preview-window")) {
    const btn = document.createElement("button");
    btn.id = "open-preview-window";
    btn.type = "button";
    btn.className = "preview-window-btn";
    btn.textContent = "▶ 独立预览";
    btn.title = "打开独立的预览窗口，方便和编辑窗口并排对照";
    btn.addEventListener("click", () => {
      void openStandalonePreviewWindow(getProject(), getDevice());
    });
    topbar.append(btn);
  }

  // 接收独立预览窗口的 Alt+点击控件通知
  if (typeof BroadcastChannel !== "undefined") {
    try {
      const bc = new BroadcastChannel(CHANNEL_NAME);
      bc.addEventListener("message", (e) => {
        if (e.data?.type === "select" && typeof e.data.id === "string") {
          onSelectFromPreview(e.data.id);
        }
      });
    } catch {
      // 忽略
    }
  }

  if (inTauri) {
    void listen<{ id: string }>(TAURI_EVENT, (event) => {
      if (event.payload?.id) onSelectFromPreview(event.payload.id);
    }).catch(() => {});
    // 独立预览窗口换了预览设备（它自己不能写盘），由这里写
    void listen<PreviewSettingsPatch>(TAURI_SETTINGS_EVENT, (event) => {
      const p = event.payload;
      if (!p || typeof p !== "object") return;
      const patch: PreviewSettingsPatch = {};
      if (typeof p.device === "string") patch.device = p.device;
      if (typeof p.phone === "string") patch.phone = p.phone;
      if (typeof p.landscape === "boolean") patch.landscape = p.landscape;
      if (Object.keys(patch).length > 0) onPreviewSettings(patch);
    }).catch(() => {});
  }

  // 主窗口处于预览模式时，捕获阶段拦截 Alt+点击，防止触发控件内部原生按钮的 click 事件
  document.addEventListener(
    "click",
    (e) => {
      if (!e.altKey || !document.body.classList.contains("preview")) return;
      const wrapper = partNodeElement(e.target as Element | null);
      const id = wrapper?.dataset.vfId;
      if (id) {
        e.preventDefault();
        e.stopPropagation();
        onSelectFromPreview(id);
      }
    },
    true,
  );
}

/** 独立预览窗口初始化：切入预览模式，挂载可收起的预览工具条与事件记录开关。设备（电脑、手机、原样）在工具条左边选，和编辑器的预览共用 .designer/preview.json。 */
export function initStandalonePreviewWindow(hooks: {
  getProject: () => Project;
  enterPreviewMode: () => void;
}): void {
  if (!isStandalonePreview()) return;

  document.body.classList.add("standalone-preview");
  hooks.enterPreviewMode();
  syncStandalonePreviewTitle(hooks.getProject());

  const previewBar = document.getElementById("preview-bar");
  if (previewBar && !document.getElementById("preview-bar-actions")) {
    const actions = document.createElement("div");
    actions.id = "preview-bar-actions";
    actions.className = "preview-bar-actions";

    const logBtn = document.createElement("button");
    logBtn.id = "preview-toggle-log";
    logBtn.type = "button";
    logBtn.textContent = "事件记录";
    logBtn.title = "展开或收起底部的事件记录面板";
    logBtn.setAttribute("aria-pressed", "false");
    logBtn.addEventListener("click", () => {
      const shown = document.body.classList.toggle("standalone-show-log");
      logBtn.setAttribute("aria-pressed", String(shown));
    });

    const collapseBtn = document.createElement("button");
    collapseBtn.id = "preview-collapse-bar";
    collapseBtn.type = "button";
    collapseBtn.textContent = "收起工具条";
    collapseBtn.title = "收起顶部预览工具条";
    collapseBtn.addEventListener("click", () => {
      document.body.classList.add("preview-bar-collapsed");
    });

    actions.append(logBtn, collapseBtn);
    previewBar.append(actions);
  }

  if (!document.getElementById("preview-expand-bar")) {
    const expandBtn = document.createElement("button");
    expandBtn.id = "preview-expand-bar";
    expandBtn.type = "button";
    expandBtn.className = "preview-expand-btn";
    expandBtn.textContent = "展开工具条";
    expandBtn.title = "展开顶部预览工具条";
    expandBtn.addEventListener("click", () => {
      document.body.classList.remove("preview-bar-collapsed");
    });
    document.body.append(expandBtn);
  }

  document.addEventListener(
    "click",
    (e) => {
      if (!e.altKey) return;
      const wrapper = partNodeElement(e.target as Element | null);
      const id = wrapper?.dataset.vfId;
      if (id) {
        e.preventDefault();
        e.stopPropagation();
        void notifyMainWindowSelect(id);
      }
    },
    true,
  );
}

/** 刷新独立预览窗口标题。 */
export function syncStandalonePreviewTitle(project: Project): void {
  if (!isStandalonePreview()) return;
  const root = project.scene.nodes[project.scene.root];
  const title = `${root?.title ?? project.name} · 独立预览`;
  document.title = title;
}
