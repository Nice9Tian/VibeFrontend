// npm test：按改动范围选测试，不碰 Qt 导出就不启动 Qt 程序。
//
//   npm test              快速测试；改动碰到 Qt 导出时再跑 Qt 测试
//   npm test -- --fast    只跑快速测试
//   npm test -- --full    快速测试和 Qt 测试都跑
//   npm test -- --qt      只跑 Qt 测试（npm run test:qt）
//
// 改动指当前工作区相对 origin/main 的全部差异，含未跟踪的文件。
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { animeanQtExe } from "./qt-env.ts";
import { qtRelevantFiles, qtSourceFiles } from "./test-tiers.ts";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.dirname(appRoot);
const FAST = ["test-editor.ts", "test-step2.ts", "test-library.ts", "test-docview.ts", "test-layout-edit.ts", "test-dock.ts"];
const ANIMEAN_DESIGN = "../examples/animean/design";

function changedFiles(): string[] | null {
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "core.quotepath=off", ...args], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split(/\r?\n/)
      .filter(Boolean);
  try {
    return [...git("diff", "--name-only", git("merge-base", "HEAD", "origin/main")[0]), ...git("ls-files", "--others", "--exclude-standard")];
  } catch {
    return null;
  }
}

/** 编译 Qt 程序之后才改过的文件：Qt 测试验证不到它们。测试脚本不进程序，不算。 */
function newerThanExe(files: string[], exe: string): string[] {
  if (!fs.existsSync(exe)) return [];
  const built = fs.statSync(exe).mtimeMs;
  return files.filter((file) => {
    const full = path.join(repoRoot, file);
    return !file.startsWith("app/scripts/") && fs.existsSync(full) && fs.statSync(full).mtimeMs > built;
  });
}

function planQt(flags: Set<string>, relevant: string[] | null): { run: boolean; reason: string } {
  if (flags.has("--fast")) return { run: false, reason: "--fast" };
  if (flags.has("--full") || flags.has("--qt")) return { run: true, reason: "命令行要求" };
  if (relevant === null) return { run: true, reason: "读不到 git 改动，保险起见" };
  if (relevant.length === 0) return { run: false, reason: "改动没有碰到 Qt 导出" };
  return { run: true, reason: `改动碰到 Qt 导出，共 ${relevant.length} 个文件，例如 ${relevant[0]}` };
}

function main(): void {
  const flags = new Set(process.argv.slice(2));
  const known = new Set(["--fast", "--full", "--qt"]);
  const unknown = [...flags].filter((flag) => !known.has(flag));
  if (unknown.length > 0) {
    console.error(`不认识的参数：${unknown.join(" ")}。可用：${[...known].join(" ")}`);
    process.exitCode = 2;
    return;
  }

  const changed = changedFiles();
  const relevant = changed && qtRelevantFiles(changed, qtSourceFiles(appRoot));
  const qt = planQt(flags, relevant);
  const exe = animeanQtExe(appRoot);
  // 带 --qt 的 test-dock 已经包含快速部分，不用跑两遍
  const fast = flags.has("--qt") ? [] : FAST.filter((script) => !(qt.run && script === "test-dock.ts"));
  const runs: Array<{ label: string; args: string[] }> = fast.map((script) => ({ label: script, args: [`scripts/${script}`] }));
  if (qt.run) {
    runs.push(
      { label: "test-dock.ts --qt", args: ["scripts/test-dock.ts", "--qt"] },
      { label: "run-case.ts --suite", args: ["scripts/run-case.ts", ANIMEAN_DESIGN, "--suite", exe] },
      { label: "compare-layout.ts", args: ["scripts/compare-layout.ts", ANIMEAN_DESIGN, exe] },
    );
  }
  console.log(`Qt 测试：${qt.run ? "运行" : "跳过"}（${qt.reason}）\n`);

  const failed: string[] = [];
  for (const { label, args } of runs) {
    console.log(`===== ${label} =====`);
    if (spawnSync(process.execPath, args, { cwd: appRoot, stdio: "inherit" }).status !== 0) failed.push(label);
  }

  console.log(`\n共 ${runs.length} 项，失败 ${failed.length} 项${failed.length > 0 ? `：${failed.join("、")}` : ""}。`);
  const stale = qt.run ? newerThanExe(relevant ?? [], exe) : [];
  if (stale.length > 0) {
    console.log(`注意：${exe} 编译之后又改了 ${stale.length} 个文件（例如 ${stale[0]}），上面的 Qt 结果没有验证这些改动。重新导出并编译后再跑一遍。`);
  }
  if (failed.length > 0) process.exitCode = 1;
}

main();
