// 测试共用的环境：测试起的开发服务器不许碰用户自己的项目清单。
// 开发服务器启动时会把当前项目记进项目清单（默认是 %APPDATA%\VibeFrontend\workspace.json），
// 测试的项目都是临时文件夹，记进去以后用户的项目面板里就多出一堆打不开的项目。
// 起开发服务器的测试第一行 import 这个文件；已经指定了 VF_WORKSPACE 的（test-workspace.ts）照它的来。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

if (!process.env.VF_WORKSPACE) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-test-workspace-"));
  process.env.VF_WORKSPACE = path.join(dir, "workspace.json");
}
