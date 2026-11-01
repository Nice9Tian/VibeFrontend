// 测试分级的判断：哪些改动需要跑真实的 Qt 程序。这里只有判断，运行在 test-all.ts。
import fs from "node:fs";
import path from "node:path";

/** 不经 import 也会进 Qt 工程，或者本身就是 Qt 测试的路径（相对仓库根）。 */
const QT_PATHS = [
  /^app\/src\/export\//,
  /^app\/qt-templates\//,
  /^app\/standard\//,
  /^examples\/[^/]+\/(design|qt)\//,
  /^app\/scripts\/(compare-layout|export-qt|qt-env|run-case|test-dock)\.ts$/,
];

/** 导出代码顺着 import 用到的全部源文件（相对仓库根）。名单不用手工维护，新加的依赖自动算进来。 */
export function qtSourceFiles(appRoot: string): Set<string> {
  const repoRoot = path.dirname(appRoot);
  const exportDir = path.join(appRoot, "src/export");
  const pending = fs.readdirSync(exportDir).map((name) => path.join(exportDir, name));
  const seen = new Set<string>();
  while (pending.length > 0) {
    const file = pending.pop()!;
    if (seen.has(file) || !fs.existsSync(file)) continue;
    seen.add(file);
    for (const match of fs.readFileSync(file, "utf8").matchAll(/from\s+"(\.\.?\/[^"]+)"/g)) {
      pending.push(path.resolve(path.dirname(file), match[1]));
    }
  }
  return new Set([...seen].map((file) => path.relative(repoRoot, file).replace(/\\/g, "/")));
}

/** 改动里需要真实 Qt 程序来验证的那些文件。 */
export function qtRelevantFiles(changed: string[], sources: Set<string>): string[] {
  return changed.filter((file) => sources.has(file) || QT_PATHS.some((pattern) => pattern.test(file)));
}
