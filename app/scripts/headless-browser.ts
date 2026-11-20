// 无头浏览器测试共用：找 Chrome 或 Edge，带上每次都要的参数启动，结束时连同子进程一起停掉、删掉临时配置目录。
//
// 测试只用这两个入口，不要自己 spawn 浏览器、建配置目录：
//   launchHeadlessBrowser(url, args)       一直开着、由测试来关的浏览器，用完 await close()
//   runHeadlessBrowserCommand(url, args)   --screenshot 这类自己会退出的一次性命令，等它退出并清理完
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";

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

function findBrowserExecutable(): string {
  const candidates = [process.env.CHROME_BIN, process.env.CHROME_PATH, ...CANDIDATES];
  const found = candidates.find((p): p is string => Boolean(p) && fs.existsSync(p!));
  if (!found) throw new Error("未找到无头浏览器可执行文件（Chrome 或 Edge），可以用环境变量 CHROME_BIN 指定");
  return found;
}

// 每次启动都带的参数，调用方再在后面加自己的窗口大小、调试端口等。
// --password-store=basic / --use-mock-keychain：不用系统钥匙串加密 Cookie。Linux 上有会话 D-Bus 时（如 SSH 登录），
// Chrome 默认去 gnome-keyring 取密钥；钥匙串是锁着的、又没有界面弹出解锁框，Chrome 就一直等，
// 所有 http 请求都发不出去（data: 网址不用 Cookie，所以不受影响），测试只能等到超时。
const BASE_ARGS: readonly string[] = [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--password-store=basic",
  "--use-mock-keychain",
];

const IS_WINDOWS = process.platform === "win32";

// 配置目录名里带建它的 node 进程号：这个进程已经不在了，目录就是上次没删掉的（进程被 SIGKILL、内存超限被杀），下次启动时删
const PROFILE_PREFIX = "vf-headless-";
const PROFILE_OWNER = new RegExp(`^${PROFILE_PREFIX}(\\d+)-`);

export interface HeadlessBrowser {
  /** 浏览器主进程，需要时可以自己监听它的 exit 事件 */
  readonly process: ChildProcess;
  /** 停掉浏览器和它的全部子进程，等都退出了再删掉配置目录。可以重复调用。 */
  close(): Promise<void>;
}

interface Running {
  proc: ChildProcess;
  profileDir: string;
  exited: Promise<void>;
}

/** 还没关的浏览器。本进程退出或收到中断信号时同步清理，测试中途抛错、process.exit 也不会留下。 */
const running = new Set<Running>();

/**
 * 启动一个由调用方来关的浏览器。带 --remote-debugging-pipe：管道连着本进程，
 * 本进程一死（包括 SIGKILL）管道就断，浏览器随之退出，不会留下没人管的浏览器进程。
 */
export function launchHeadlessBrowser(url: string, args: readonly string[] = []): HeadlessBrowser {
  const browser = start(url, ["--remote-debugging-pipe", ...args], ["ignore", "ignore", "ignore", "pipe", "pipe"]);
  // 不发调试命令，浏览器也就不会写这条管道；读空它只是以防万一写满了卡住浏览器
  (browser.proc.stdio[4] as Readable | null)?.resume();
  let closing: Promise<void> | null = null;
  return {
    process: browser.proc,
    close: () => (closing ??= stop(browser)),
  };
}

/** 运行 --screenshot、--dump-dom 这类做完自己退出的命令（带调试管道时它们做完不退出，所以单独一个入口）。 */
export async function runHeadlessBrowserCommand(url: string, args: readonly string[]): Promise<void> {
  const browser = start(url, args, "ignore");
  try {
    await browser.exited;
  } finally {
    await stop(browser);
  }
}

function start(url: string, args: readonly string[], stdio: "ignore" | Array<"ignore" | "pipe">): Running {
  const exe = findBrowserExecutable();
  sweepStaleProfiles();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), `${PROFILE_PREFIX}${process.pid}-`));
  installExitCleanup();
  // POSIX 上让浏览器自成一个进程组（组号就是它的进程号），停的时候连同渲染、GPU、网络等子进程一起停。
  // Windows 上没有进程组，主进程一停，沙箱里的子进程随它的作业对象一起结束；删目录时再重试几次兜底。
  const proc = spawn(exe, [...BASE_ARGS, `--user-data-dir=${profileDir}`, ...args, url], { stdio, detached: !IS_WINDOWS });
  const exited = new Promise<void>((resolve, reject) => {
    proc.once("exit", () => resolve());
    proc.once("error", reject);
  });
  exited.catch(() => {}); // 启动失败的错误留给 await exited 的调用方，没人等时不算未处理
  const browser = { proc, profileDir, exited };
  running.add(browser);
  return browser;
}

// 直接 SIGKILL，不让浏览器正常退出：配置目录反正要扔，而正常退出时网络进程还会往里写
// Network Persistent State 和缓存索引，以前就是这样在删完目录之后又把它建了回来。
function kill(proc: ChildProcess): void {
  if (proc.pid === undefined) return;
  try {
    if (IS_WINDOWS) proc.kill();
    else process.kill(-proc.pid, "SIGKILL");
  } catch {
    // 已经退出了
  }
}

/** 进程组里还有没有进程（只在 POSIX 上有意义）。 */
function groupAlive(pgid: number): boolean {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

async function stop(browser: Running): Promise<void> {
  kill(browser.proc);
  await browser.exited.catch(() => {});
  const pgid = browser.proc.pid;
  if (!IS_WINDOWS && pgid !== undefined) {
    for (const deadline = Date.now() + 5000; groupAlive(pgid) && Date.now() < deadline; ) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  running.delete(browser);
  removeProfile(browser.profileDir);
}

function removeProfile(dir: string): void {
  try {
    // Windows 上文件句柄偶尔释放得慢，重试几次
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch (err) {
    console.warn(`没能删掉无头浏览器的临时配置目录 ${dir}：${(err as Error).message}（下次启动无头浏览器时会再试）`);
  }
}

let exitCleanupInstalled = false;

function installExitCleanup(): void {
  if (exitCleanupInstalled) return;
  exitCleanupInstalled = true;
  const cleanupNow = () => {
    for (const browser of running) kill(browser.proc);
    const pause = new Int32Array(new SharedArrayBuffer(4));
    for (const browser of running) {
      const pgid = browser.proc.pid;
      for (const deadline = Date.now() + 2000; !IS_WINDOWS && pgid !== undefined && groupAlive(pgid) && Date.now() < deadline; ) {
        Atomics.wait(pause, 0, 0, 25);
      }
      removeProfile(browser.profileDir);
    }
    running.clear();
  };
  process.once("exit", cleanupNow);
  // 收到这些信号时 node 默认直接退出、不触发 exit 事件；清理完再按原信号退出，退出码照旧
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.once(signal, () => {
      cleanupNow();
      process.kill(process.pid, signal);
    });
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** 目录对应的浏览器是否还在跑：Chrome 在 POSIX 上把 SingletonLock 建成指向「主机名-进程号」的符号链接。 */
function browserStillRunning(dir: string): boolean {
  try {
    const pid = Number(/-(\d+)$/.exec(fs.readlinkSync(path.join(dir, "SingletonLock")))?.[1]);
    return pid > 0 && processAlive(pid);
  } catch {
    return false; // 没有锁（浏览器已正常退出）或读不了
  }
}

let swept = false;

/** 删掉以前的进程没删掉的配置目录。只删自己的、建它的进程已经不在、浏览器也不在跑的。 */
function sweepStaleProfiles(): void {
  if (swept) return;
  swept = true;
  const tmp = os.tmpdir();
  let names: string[];
  try {
    names = fs.readdirSync(tmp);
  } catch {
    return;
  }
  const uid = process.getuid?.();
  for (const name of names) {
    const owner = Number(PROFILE_OWNER.exec(name)?.[1]);
    if (!owner || owner === process.pid || processAlive(owner)) continue;
    const dir = path.join(tmp, name);
    try {
      // /tmp 是各账号共用的（Windows 的临时目录是每个用户自己的，没有 uid 可比）
      if (uid !== undefined && fs.statSync(dir).uid !== uid) continue;
      if (browserStillRunning(dir)) continue;
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // 顺手清理，失败了下次再说
    }
  }
}
