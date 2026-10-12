// 命令行里读设计项目用的文件接口，和工具界面里的 src/fs.ts 对应。
import fs from "node:fs";
import path from "node:path";
import type { ProjectIO } from "../src/loader.ts";

export function nodeIO(projectDir: string): ProjectIO {
  const root = path.resolve(projectDir);
  return {
    async root() {
      return root;
    },
    async readText(relative) {
      const full = path.join(root, relative);
      if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
      // Windows 换行符统一成 LF，和工具界面里的读法一致
      return fs.readFileSync(full, "utf8").replace(/\r\n/g, "\n");
    },
    async listDir(relative) {
      const full = path.join(root, relative);
      if (!fs.existsSync(full)) return [];
      return fs
        .readdirSync(full, { withFileTypes: true })
        .map((entry) => ({ name: entry.name, isDir: entry.isDirectory() }))
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    },
  };
}

/** 读出一个文件夹里的全部文件：相对路径（用 / 分隔）→ 内容。 */
export function readTree(dir: string): Record<string, string> {
  const result: Record<string, string> = {};
  const walk = (current: string, prefix: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full, `${prefix}${entry.name}/`);
      else result[prefix + entry.name] = fs.readFileSync(full, "utf8").replace(/\r\n/g, "\n");
    }
  };
  walk(dir, "");
  return result;
}
