// 无头浏览器测试共用：找 Chrome 或 Edge 的可执行文件，以及每次启动都要带的参数。
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

// 每个无头浏览器测试启动时都带的参数，各测试再在后面加自己的窗口大小、配置目录和网址。
// --password-store=basic / --use-mock-keychain：不用系统钥匙串加密 Cookie。Linux 上有会话 D-Bus 时（如 SSH 登录），
// Chrome 默认去 gnome-keyring 取密钥；钥匙串是锁着的、又没有界面弹出解锁框，Chrome 就一直等，
// 所有 http 请求都发不出去（data: 网址不用 Cookie，所以不受影响），测试只能等到超时。
export const HEADLESS_BROWSER_ARGS: readonly string[] = [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--password-store=basic",
  "--use-mock-keychain",
];
