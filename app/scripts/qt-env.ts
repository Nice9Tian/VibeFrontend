// 启动导出的 Qt 程序时共用的设置。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** AnimeAn 例子编译出的 Qt 程序：按顺序取第一个存在的，都不存在时返回默认位置，方便报错时说明。 */
export function animeanQtExe(appRoot: string): string {
  const fallback = path.join(os.tmpdir(), "vf-build-animean/app/vf_animean.exe");
  const candidates = [process.env.VF_ANIMEAN_EXE, fallback, path.resolve(appRoot, "../examples/animean/qt/build/app/vf_animean.exe")];
  return candidates.find((p): p is string => Boolean(p) && fs.existsSync(p!)) ?? fallback;
}

export function buildQtEnv(): NodeJS.ProcessEnv {
  // Windows 上 Qt 的警告默认进调试输出，这里要它写到 stderr，调用方才查得到
  const env: NodeJS.ProcessEnv = { ...process.env, QT_FORCE_STDERR_LOGGING: "1" };
  // 默认不开窗口，不抢前台；几何和模拟鼠标的结果与真实窗口一致。要亲眼看时设 VF_QT_SHOW=1
  if (!env.VF_QT_SHOW) env.QT_QPA_PLATFORM ??= "offscreen";
  if (process.platform === "win32") {
    const extraDirs = ["C:\\Qt\\6.9.1\\mingw_64\\bin", "C:\\Qt\\Tools\\mingw1310_64\\bin"].filter((d) => fs.existsSync(d));
    if (extraDirs.length > 0) {
      const pathKey = Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
      env[pathKey] = [...extraDirs, env[pathKey] ?? ""].join(";");
    }
  }
  return env;
}
