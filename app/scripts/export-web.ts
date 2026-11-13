// 把一个平面设计项目导出成能独立打开的网页：
//
//   npm run export:web -- <设计项目文件夹> [导出到哪个文件夹]
//
// 不写导出位置时，用设计项目 project.json 里的 export.web；那里也没写就导出到项目旁边的 web/。
// 导出的文件夹里是：index.html、vf-player.js（播放页的程序），加上项目里画面要用的文件
// （画布、样式表、控件、脚本、图片和字体）。说明文档、逻辑文件和工具自己的数据不带过去。
// 导出的网页要经一个本地服务打开（直接双击 index.html，浏览器不让脚本读文件）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rolldown } from "rolldown";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** 不带进导出的东西：工具自己的数据、说明文档、逻辑、给 Agent 的约定，以及导出目录自己。 */
const SKIP_DIRS = new Set(["docs", "logic", "functions", "actions", "effects"]);
const SKIP_FILES = new Set(["AGENTS.md", "CLAUDE.md", "README.md", "index.html", "vf-player.js", "vf-export.json"]);

export interface WebExportReport {
  outDir: string;
  /** 这次写出去的文件，相对于导出文件夹 */
  files: string[];
  /** 上次导出过、这次不再需要而删掉的文件 */
  removed: string[];
}

/** 把播放页的程序打成一个文件。 */
export async function bundlePlayer(): Promise<string> {
  const bundle = await rolldown({
    input: path.join(appRoot, "src/player/main.ts"),
    logLevel: "warn",
  });
  const { output } = await bundle.generate({ format: "esm" });
  await bundle.close();
  return output[0].code;
}

/** 控件类型 → components/ 下的文件夹名。 */
function componentFolders(projectDir: string): Record<string, string> {
  const folders: Record<string, string> = {};
  const dir = path.join(projectDir, "components");
  if (!fs.existsSync(dir)) return folders;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    let type = entry.name;
    try {
      const declared = (JSON.parse(fs.readFileSync(path.join(dir, entry.name, "component.json"), "utf8")) as { type?: unknown }).type;
      if (typeof declared === "string" && declared) type = declared;
    } catch {
      // 声明读不出来就按文件夹名找
    }
    folders[type] = entry.name;
  }
  return folders;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function indexHtml(name: string, folders: Record<string, string>): string {
  // 写进脚本里的 JSON 不能出现 </script>
  const foldersJson = JSON.stringify(folders).replace(/</g, "\\u003c");
  return `<!doctype html>
<!-- 这个文件是 VibeFrontend 导出的，不要手改：改设计项目，再重新导出。 -->
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(name)}</title>
    <script>
      window.VF_PROJECT_BASE = "./";
      window.VF_COMPONENT_FOLDERS = ${foldersJson};
    </script>
    <script type="module" src="vf-player.js"></script>
  </head>
  <body></body>
</html>
`;
}

function listProjectFiles(projectDir: string, outDir: string): string[] {
  const found: string[] = [];
  const walk = (rel: string) => {
    for (const entry of fs.readdirSync(path.join(projectDir, rel), { withFileTypes: true })) {
      const next = rel ? `${rel}/${entry.name}` : entry.name;
      const full = path.join(projectDir, next);
      // 导出目录在项目里面时，不把上一次的导出再抄进去
      if (path.resolve(full) === outDir) continue;
      // 只在项目文件夹的最上一层挑掉说明文档、逻辑和工具自己的文件；assets/docs/ 这样的素材照样带上。
      // 子项目（parts/<名字>/）也是一个项目：它的这一层同样挑掉，网页只要它的 project.json 和 ui/
      const top = rel === "" || /^parts\/[^/]+$/.test(rel);
      if (entry.isDirectory()) {
        if (!(top && SKIP_DIRS.has(entry.name)) && !entry.name.startsWith(".") && entry.name !== "node_modules") walk(next);
      } else if (!(top && (SKIP_FILES.has(entry.name) || entry.name.endsWith(".md")))) {
        found.push(next);
      }
    }
  };
  walk("");
  return found.sort();
}

function sameFile(a: string, b: string): boolean {
  if (!fs.existsSync(b)) return false;
  const sa = fs.statSync(a);
  const sb = fs.statSync(b);
  if (sa.size !== sb.size) return false;
  return fs.readFileSync(a).equals(fs.readFileSync(b));
}

function writeIfChanged(file: string, content: string): void {
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === content) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/**
 * 导出成网页。outDir 不给时按 project.json 的 export.web，再没有就是项目旁边的 web/。
 * 内容没变的文件不重写；上一次导出过、这一次不再需要的文件会删掉（只删导出记录 vf-export.json 里记着的）。
 */
export async function exportWeb(projectDir: string, outDir?: string): Promise<WebExportReport> {
  const project = path.resolve(projectDir);
  const configPath = path.join(project, "project.json");
  if (!fs.existsSync(configPath)) throw new Error(`${project} 里没有 project.json，它不是一个设计项目`);
  const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as { name?: string; kind?: string; export?: { web?: string } };
  if (config.kind !== "graphic") throw new Error("导出成网页只支持平面设计项目（project.json 的 kind 是 \"graphic\"）");
  const out = path.resolve(project, outDir ?? config.export?.web ?? "../web");
  if (out === project) throw new Error("导出位置不能是设计项目文件夹自己");
  fs.mkdirSync(out, { recursive: true });

  const files = listProjectFiles(project, out);
  for (const rel of files) {
    const from = path.join(project, rel);
    const to = path.join(out, rel);
    if (sameFile(from, to)) continue;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
  writeIfChanged(path.join(out, "vf-player.js"), await bundlePlayer());
  writeIfChanged(path.join(out, "index.html"), indexHtml(config.name ?? "未命名项目", componentFolders(project)));

  const written = [...files, "index.html", "vf-player.js"];
  const manifestPath = path.join(out, "vf-export.json");
  const removed: string[] = [];
  if (fs.existsSync(manifestPath)) {
    try {
      const previous = (JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { files?: string[] }).files ?? [];
      const keep = new Set(written);
      for (const rel of previous) {
        const full = path.resolve(out, rel);
        if (keep.has(rel) || !full.startsWith(out + path.sep) || !fs.existsSync(full)) continue;
        fs.unlinkSync(full);
        removed.push(rel);
      }
    } catch {
      // 导出记录坏了就不删旧文件，只重写记录
    }
  }
  writeIfChanged(manifestPath, JSON.stringify({ version: 1, files: written }, null, 2) + "\n");
  return { outDir: out, files: written, removed };
}

async function main(): Promise<void> {
  const [projectDir, outDir] = process.argv.slice(2);
  if (!projectDir) {
    console.error("用法：npm run export:web -- <设计项目文件夹> [导出到哪个文件夹]");
    process.exitCode = 2;
    return;
  }
  const report = await exportWeb(projectDir, outDir);
  console.log(`已导出到 ${report.outDir}：${report.files.length} 个文件${report.removed.length ? `，删掉 ${report.removed.length} 个不再需要的` : ""}。`);
  console.log("打开方式：在这个文件夹里起一个本地服务（例如 npx serve），再用浏览器打开；或者用 npm run export:print 出 PDF 和图片。");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  });
}
