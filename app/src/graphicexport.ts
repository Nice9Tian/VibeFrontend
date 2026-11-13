// 平面设计的“导出”对话框：导出成网页，或者导出 PDF 和图片。
// 真正干活的是命令行脚本 scripts/export-web.ts 和 scripts/export-print.ts；在浏览器里打开编辑器时（npm run dev），
// 对话框经开发服务器的 /__export/graphic 接口调用同一份代码。桌面窗口里还没有这条路，对话框给出要运行的命令。
import type { Project } from "./model.ts";

export interface GraphicExportDeps {
  getProject(): Project;
  /** 编辑器里有没存的文字时先存，存不上返回 false */
  flush(): Promise<boolean>;
  toast(message: string): void;
}

interface ExportResult {
  ok: boolean;
  outDir?: string;
  files?: string[];
  errors?: string[];
  message?: string;
}

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: Array<Node | string>): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

async function runExport(body: Record<string, unknown>): Promise<ExportResult> {
  const res = await fetch("/__export/graphic", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const text = await res.text();
  try {
    return JSON.parse(text) as ExportResult;
  } catch {
    return { ok: false, message: text || `导出失败（HTTP ${res.status}）` };
  }
}

function resultView(box: HTMLElement, result: ExportResult): void {
  box.replaceChildren();
  const notice = el("div", { className: `export-qt-notice ${result.ok && !result.errors?.length ? "success" : result.ok ? "warn" : "error"}` });
  if (!result.ok) notice.textContent = `导出失败：${result.message ?? "原因不明"}`;
  else if (result.errors?.length) notice.textContent = `已导出到 ${result.outDir}，但页面报了 ${result.errors.length} 个错，内容可能不对：\n${result.errors.slice(0, 8).join("\n")}`;
  else notice.textContent = `已导出到 ${result.outDir}：${(result.files ?? []).length} 个文件`;
  notice.style.whiteSpace = "pre-wrap";
  box.append(notice);
  if (result.ok && result.files?.length) {
    const list = el("div", { className: "export-graphic-files" });
    list.textContent = result.files.slice(0, 40).join("　") + (result.files.length > 40 ? `　…共 ${result.files.length} 个` : "");
    box.append(list);
  }
}

export function openGraphicExportModal(deps: GraphicExportDeps): void {
  document.getElementById("export-graphic-modal")?.remove();
  const project = deps.getProject();
  const backdrop = el("div", { id: "export-graphic-modal", className: "vf-modal-backdrop" });
  const modal = el("div", { className: "vf-modal" });
  modal.style.width = "min(640px, 92vw)";
  const close = el("button", { type: "button", textContent: "关闭" });
  close.addEventListener("click", () => backdrop.remove());
  const header = el("div", { className: "vf-modal-header" }, el("strong", { textContent: `导出 · ${project.name}` }), close);
  const body = el("div", { className: "export-qt-body" });
  const result = el("div", { id: "export-graphic-result" });
  result.style.display = "flex";
  result.style.flexDirection = "column";
  result.style.gap = "8px";

  const row = (label: string, control: HTMLElement, extra?: HTMLElement) => {
    const line = el("div", { className: "export-qt-row" }, el("label", { textContent: label }), control);
    if (extra) line.append(extra);
    return line;
  };

  // ---- 网页
  const webDir = el("input", { type: "text", id: "export-web-dir", value: project.webExportDir || "../web", spellcheck: false });
  webDir.placeholder = "相对于设计项目，或者完整路径";
  const webBtn = el("button", { type: "button", id: "export-web-run", textContent: "导出网页" });
  // ---- PDF 和图片
  const printDir = el("input", { type: "text", id: "export-print-dir", value: "../print", spellcheck: false });
  const scale = el("select", { id: "export-print-scale" });
  for (const [value, text] of [["1", "1 倍（96 dpi）"], ["2", "2 倍（192 dpi）"], ["3", "3 倍（288 dpi）"]]) scale.append(el("option", { value, textContent: text, selected: value === "2" }));
  const png = el("input", { type: "checkbox", id: "export-print-png", checked: true });
  const split = el("input", { type: "checkbox", id: "export-print-split", checked: true });
  const printBtn = el("button", { type: "button", id: "export-print-run", textContent: "导出 PDF 和图片" });

  body.append(
    el("div", { className: "export-graphic-title", textContent: "网页：能在浏览器里翻看，图形会动" }),
    row("导出到", webDir, webBtn),
    el("div", { className: "export-graphic-title", textContent: "PDF 和图片：每个页面一页，尺寸和页面一样；文字和矢量图形保持矢量" }),
    row("导出到", printDir, printBtn),
    row("图片像素", scale),
    el("label", { className: "export-graphic-check" }, png, " 每个页面另出一张图片"),
    el("label", { className: "export-graphic-check" }, split, " 有跨页时，另出一份按纸拆开的（一张纸一页）"),
  );

  if (inTauri) {
    // 桌面窗口里没有开发服务器：给出命令，复制到终端运行
    const root = project.root.replace(/\\/g, "/");
    const commands = [`npm run export:web -- "${root}"`, `npm run export:print -- "${root}"`].join("\n");
    const notice = el("div", { className: "export-qt-notice warn" });
    notice.style.whiteSpace = "pre-wrap";
    notice.textContent = `桌面窗口里还不能直接导出。在 VibeFrontend 的 app 文件夹里运行：\n${commands}`;
    body.append(notice);
    webBtn.disabled = true;
    printBtn.disabled = true;
  }
  body.append(result);

  let busy = false;
  const start = async (target: "web" | "print") => {
    if (busy) return;
    if (!(await deps.flush())) return deps.toast("编辑器里有内容没存上，先处理再导出");
    busy = true;
    webBtn.disabled = true;
    printBtn.disabled = true;
    result.replaceChildren(el("div", { className: "export-qt-notice", textContent: target === "web" ? "正在导出网页…" : "正在导出 PDF 和图片（要打开一个看不见的浏览器把每页画出来，可能要几十秒）…" }));
    try {
      const report = await runExport(
        target === "web"
          ? { target, outDir: webDir.value.trim() || undefined }
          : { target, outDir: printDir.value.trim() || undefined, scale: Number(scale.value), png: png.checked, split: split.checked },
      );
      resultView(result, report);
    } catch (e) {
      resultView(result, { ok: false, message: (e as Error).message });
    } finally {
      busy = false;
      webBtn.disabled = false;
      printBtn.disabled = false;
    }
  };
  webBtn.addEventListener("click", () => void start("web"));
  printBtn.addEventListener("click", () => void start("print"));

  modal.append(header, body);
  backdrop.append(modal);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop && !busy) backdrop.remove();
  });
  document.body.append(backdrop);
}
