// 把一个设计项目导出成 Qt 工程。
//
//   npm run export:qt -- <设计项目文件夹> [导出到哪个文件夹]
//
// 不写导出位置时，用设计项目 project.json 里的 export.qt（相对于设计项目文件夹）。
// 导出的文件夹里：工具生成的文件每次整个覆盖；交给 Agent 写的文件（ui_effects/）只在不存在时放一份起始内容，之后不再碰。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rolldown } from "rolldown";
import { exportQt, type Manifest } from "../src/export/qt.ts";
import { loadProjectFiles } from "../src/loader.ts";
import type { Problem } from "../src/model.ts";
import { nodeIO, readTree } from "./node-io.ts";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function printProblems(problems: Problem[]): void {
  for (const problem of problems) console.log(`  ${problem.level === "error" ? "错误" : "提示"}　${problem.message}`);
}

/** 把逻辑运行层打包成一个脚本，语法降到 Qt 自带的 JS 引擎认识的程度。 */
async function bundleRuntime(): Promise<string> {
  const bundle = await rolldown({
    input: path.join(appDir, "src/export/qt-runtime.ts"),
    cwd: appDir,
    transform: { target: "es2016" },
    logLevel: "warn",
  });
  const { output } = await bundle.generate({ format: "iife", name: "VF" });
  await bundle.close();
  return output[0].code.replace(/\r\n/g, "\n");
}

function sameText(file: string, content: string): boolean {
  return fs.existsSync(file) && fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n") === content;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (args.length < 1) {
    console.log("用法：npm run export:qt -- <设计项目文件夹> [导出到哪个文件夹]");
    return 2;
  }
  const projectDir = path.resolve(args[0]);
  const project = await loadProjectFiles(nodeIO(projectDir), null);
  console.log(`设计项目：${project.name}（${projectDir}）`);

  const outArg = args[1] ?? (project.qtExportDir ? path.resolve(projectDir, project.qtExportDir) : null);
  if (!outArg) {
    console.log("没有指定导出到哪里：在命令后面写上文件夹，或者在 project.json 里写 export.qt。");
    return 2;
  }
  const outDir = path.resolve(outArg);

  if (project.problems.length > 0) {
    console.log("设计项目的检查结果：");
    printProblems(project.problems);
  }
  if (project.problems.some((problem) => problem.level === "error")) {
    console.log("设计项目里有错误，没有导出。");
    return 1;
  }

  const manifestPath = path.join(outDir, "vf-export.json");
  let previous: Manifest | null = null;
  if (fs.existsSync(manifestPath)) {
    try {
      previous = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest;
    } catch {
      console.log("  提示　导出记录 vf-export.json 读不出来，按第一次导出处理");
    }
  }

  const result = exportQt(
    project,
    {
      runtimeJs: await bundleRuntime(),
      generated: readTree(path.join(appDir, "qt-templates/generated")),
      scaffold: readTree(path.join(appDir, "qt-templates/scaffold")),
    },
    previous,
  );
  if (result.problems.length > 0) {
    console.log("导出时发现：");
    printProblems(result.problems);
  }
  if (result.problems.some((problem) => problem.level === "error")) {
    console.log("有错误，没有导出。");
    return 1;
  }

  let written = 0;
  for (const [relative, content] of result.files) {
    const file = path.join(outDir, relative);
    // 内容没变就不写，免得白白触发重新编译
    if (sameText(file, content)) continue;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    written++;
  }
  let scaffolded = 0;
  for (const [relative, content] of result.scaffold) {
    const file = path.join(outDir, relative);
    if (fs.existsSync(file)) continue;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    scaffolded++;
  }
  // 上一次生成过、这一次不再生成的文件要删掉。只删记录在案的，不碰别的文件
  let removed = 0;
  for (const relative of previous?.generated ?? []) {
    const file = path.resolve(outDir, relative);
    if (result.files.has(relative) || !file.startsWith(outDir + path.sep) || !fs.existsSync(file)) continue;
    fs.rmSync(file);
    removed++;
  }

  console.log(`导出到：${outDir}`);
  console.log(`  生成的文件 ${result.files.size} 个，其中内容有变化的 ${written} 个；删除不再需要的 ${removed} 个；新放入的起始文件 ${scaffolded} 个`);
  const { states, events, externals, effects } = result.manifest.interface;
  console.log(`  业务接口：${events.length} 个事件，${states.length} 个业务管的状态，${externals.length} 个外部容器`);
  console.log(`  界面接口：${effects.length} 个需要翻译的效果${effects.map((effect) => `　${effect.name}=${effect.hash}`).join("")}`);
  if (!previous) console.log("  这是第一次导出到这个文件夹。");
  else if (result.changes.length === 0) console.log("  接口和上一次导出相同。");
  else {
    console.log("  接口和上一次导出相比有变化：");
    for (const change of result.changes) console.log(`    - ${change}`);
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
