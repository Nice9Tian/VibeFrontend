// 无头浏览器测试共用：找 Chrome 或 Edge 的可执行文件。
import fs from "node:fs";

// 环境变量优先（CHROME_BIN 是通行的名字，CHROME_PATH 是 test-mode-switch.ts 原来认的），其次各系统的默认安装位置
const CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/microsoft-edge",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

export function findBrowserExecutable(): string {
  const candidates = [process.env.CHROME_BIN, process.env.CHROME_PATH, ...CANDIDATES];
  const found = candidates.find((p): p is string => Boolean(p) && fs.existsSync(p!));
  if (!found) throw new Error("未找到无头浏览器可执行文件（Chrome 或 Edge），可以用环境变量 CHROME_BIN 指定");
  return found;
}
