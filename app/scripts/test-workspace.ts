// 多项目开发服务器与项目清单（/__workspace/*、/__fs/*?root=、/__p/<id>/*）的测试：
// 起一个真实的 Vite 开发服务器（不开浏览器，只用 fetch 和 http.get），验证清单读写、多项目隔离、静态文件、越界与跨站防护、新建项目和文件监听。
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { projectPageUrl, type WorkspaceProject } from "../src/fs.ts";
import { freePort } from "./headless.ts";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const graphicExampleDir = path.resolve(appRoot, "../examples/graphic/design");
const minimalExampleDir = path.resolve(appRoot, "../examples/minimal/design");

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  await fn();
  passed++;
  console.log(`PASS ${name}`);
}

function expectedIdOf(dir: string): string {
  const full = path.resolve(dir);
  const key = process.platform === "win32" ? full.toLowerCase() : full;
  return crypto.createHash("sha1").update(key, "utf8").digest("hex").slice(0, 12);
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vf-workspace-"));
  const workspaceFile = path.join(tempRoot, "config", "workspace.json");
  const dirA = path.join(tempRoot, "proj-default");
  const dirB = path.join(tempRoot, "proj-second");
  fs.cpSync(graphicExampleDir, dirA, { recursive: true });
  fs.cpSync(minimalExampleDir, dirB, { recursive: true });

  const idA = expectedIdOf(dirA);
  const idB = expectedIdOf(dirB);

  process.env.VF_PROJECT = dirA;
  process.env.VF_WORKSPACE = workspaceFile;

  const { createServer } = await import("vite");
  const port = await freePort();
  const server = await createServer({
    root: appRoot,
    configFile: path.join(appRoot, "vite.config.ts"),
    configLoader: "native",
    cacheDir: path.join(tempRoot, "vite-cache"),
    server: { port, strictPort: true, host: "127.0.0.1" },
    logLevel: "silent",
  });
  await server.listen();
  const base = `http://127.0.0.1:${port}`;

  try {
    await test("启动时默认项目自动进清单，排第一个且 isDefault 为 true，清单文件不存 name/kind", async () => {
      const res = await fetch(`${base}/__workspace/projects`);
      assert.equal(res.status, 200);
      const data = (await res.json()) as { projects: WorkspaceProject[] };
      assert.equal(data.projects.length, 1);
      assert.equal(data.projects[0].id, idA);
      assert.equal(data.projects[0].path, dirA);
      assert.equal(data.projects[0].name, "平面设计示例");
      assert.equal(data.projects[0].kind, "graphic");
      assert.equal(data.projects[0].exists, true);
      assert.equal(data.projects[0].isDefault, true);

      const stored = JSON.parse(fs.readFileSync(workspaceFile, "utf8")) as {
        version: number;
        projects: Array<Record<string, unknown>>;
      };
      assert.equal(stored.version, 1);
      assert.equal(stored.projects.length, 1);
      assert.equal(stored.projects[0].id, idA);
      assert.equal("name" in stored.projects[0], false);
      assert.equal("kind" in stored.projects[0], false);
    });

    await test("add 登记第二个项目：没有 project.json 时 400，登记后列出 name/kind 正确且默认项目仍在第一个", async () => {
      const emptyDir = path.join(tempRoot, "not-a-project");
      fs.mkdirSync(emptyDir, { recursive: true });
      const bad = await fetch(`${base}/__workspace/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: emptyDir }),
      });
      assert.equal(bad.status, 400);
      const badMsg = await bad.text();
      assert.ok(badMsg.includes("project.json"), badMsg);

      await wait(15);
      const addedRes = await fetch(`${base}/__workspace/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: dirB }),
      });
      assert.equal(addedRes.status, 200);
      const added = (await addedRes.json()) as WorkspaceProject;
      assert.equal(added.id, idB);
      assert.equal(added.path, dirB);
      assert.equal(added.name, "导出样板");
      assert.equal(added.kind, "ui");
      assert.equal(added.exists, true);
      assert.equal(added.isDefault, false);

      const listRes = await fetch(`${base}/__workspace/projects`);
      const { projects } = (await listRes.json()) as { projects: WorkspaceProject[] };
      assert.deepEqual(
        projects.map((p) => [p.id, p.name, p.kind, p.isDefault]),
        [
          [idA, "平面设计示例", "graphic", true],
          [idB, "导出样板", "ui", false],
        ],
      );
    });

    await test("不带 root 与带两个不同 root 读同一个相对路径（project.json）和 /__fs/root，各自拿到自己的内容", async () => {
      assert.equal(await (await fetch(`${base}/__fs/root`)).text(), dirA);
      assert.equal(await (await fetch(`${base}/__fs/root?root=${idA}`)).text(), dirA);
      assert.equal(await (await fetch(`${base}/__fs/root?root=${idB}`)).text(), dirB);

      const noRoot = (await (await fetch(`${base}/__fs/read?path=project.json`)).json()) as { name: string };
      const withA = (await (await fetch(`${base}/__fs/read?root=${idA}&path=project.json`)).json()) as { name: string };
      const withB = (await (await fetch(`${base}/__fs/read?root=${idB}&path=project.json`)).json()) as { name: string };
      assert.equal(noRoot.name, "平面设计示例");
      assert.equal(withA.name, "平面设计示例");
      assert.equal(withB.name, "导出样板");
    });

    await test("带 root 写文件只写到目标项目文件夹里，不影响默认项目", async () => {
      const writeRes = await fetch(`${base}/__fs/write?root=${idB}&path=${encodeURIComponent("docs/only-b.md")}`, {
        method: "POST",
        body: "# 只在项目 B\n",
      });
      assert.equal(writeRes.status, 200);
      assert.equal(fs.readFileSync(path.join(dirB, "docs/only-b.md"), "utf8"), "# 只在项目 B\n");
      assert.equal(fs.existsSync(path.join(dirA, "docs/only-b.md")), false);
    });

    await test("静态文件 /__p/<id>/project.json 能取到，MIME 与 Cache-Control 正确", async () => {
      const resA = await fetch(`${base}/__p/${idA}/project.json`);
      assert.equal(resA.status, 200);
      assert.equal(resA.headers.get("content-type"), "application/json; charset=utf-8");
      assert.equal(resA.headers.get("cache-control"), "no-store");
      assert.equal(((await resA.json()) as { name: string }).name, "平面设计示例");

      const resB = await fetch(`${base}/__p/${idB}/project.json`);
      assert.equal(resB.status, 200);
      assert.equal(resB.headers.get("content-type"), "application/json; charset=utf-8");
      assert.equal(resB.headers.get("cache-control"), "no-store");
      assert.equal(((await resB.json()) as { name: string }).name, "导出样板");
    });

    await test("不存在的 root 返回 404，路径越界（../）返回 400", async () => {
      const missingFs = await fetch(`${base}/__fs/read?root=000000000000&path=project.json`);
      assert.equal(missingFs.status, 404);
      assert.equal(await missingFs.text(), "没有这个项目");

      const missingRoot = await fetch(`${base}/__fs/root?root=000000000000`);
      assert.equal(missingRoot.status, 404);

      const missingStatic = await fetch(`${base}/__p/000000000000/project.json`);
      assert.equal(missingStatic.status, 404);

      const escDefault = await fetch(`${base}/__fs/read?path=${encodeURIComponent("../outside.txt")}`);
      assert.equal(escDefault.status, 400);

      const escRoot = await fetch(`${base}/__fs/read?root=${idB}&path=${encodeURIComponent("../outside.txt")}`);
      assert.equal(escRoot.status, 400);

      // fetch 会先把 %2e%2e 规范成 .. 再发，这个请求到服务器时已经不带项目前缀了（404）；要紧的是拿不到文件夹外面的文件
      const escStaticEncoded = await fetch(`${base}/__p/${idB}/%2e%2e/outside.txt`);
      assert.ok(escStaticEncoded.status === 400 || escStaticEncoded.status === 404, `越界的静态地址应当被拒绝，实际 ${escStaticEncoded.status}`);

      const escStaticRawStatus = await new Promise<number>((resolve, reject) => {
        const req = http.get({ host: "127.0.0.1", port, path: `/__p/${idB}/../outside.txt` }, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        });
        req.on("error", reject);
      });
      assert.equal(escStaticRawStatus, 400);
    });

    await test("跨站 POST 到 /__fs/write 和 /__workspace/add 都返回 403", async () => {
      const crossHeaders = {
        Origin: "http://evil.example",
        "Sec-Fetch-Site": "cross-site",
        "Content-Type": "application/json",
      };
      const fsWrite = await fetch(`${base}/__fs/write?path=pwned.txt`, {
        method: "POST",
        headers: crossHeaders,
        body: "pwned",
      });
      assert.equal(fsWrite.status, 403);
      assert.equal(fs.existsSync(path.join(dirA, "pwned.txt")), false);

      const wsAdd = await fetch(`${base}/__workspace/add`, {
        method: "POST",
        headers: crossHeaders,
        body: JSON.stringify({ path: dirB }),
      });
      assert.equal(wsAdd.status, 403);

      const nonJson = await fetch(`${base}/__workspace/add`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ path: dirB }),
      });
      assert.equal(nonJson.status, 403);
    });

    await test("watch：对 root=B 开 /__fs/watch 流，往 B 写文件在 2 秒内收到带该文件名的事件", async () => {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          req.destroy();
          reject(new Error("2 秒内未收到 watch-target.txt 的变更事件"));
        }, 2000);
        const req = http.get(`http://127.0.0.1:${port}/__fs/watch?root=${idB}`, (res) => {
          assert.equal(res.statusCode, 200);
          res.setEncoding("utf8");
          let wrote = false;
          let buffer = "";
          res.on("data", (chunk: string) => {
            buffer += chunk;
            if (!wrote) {
              wrote = true;
              fs.writeFileSync(path.join(dirB, "watch-target.txt"), "hello", "utf8");
            }
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const name = JSON.parse(line.slice(6)) as string | null;
              if (name === "watch-target.txt" || name?.endsWith("/watch-target.txt")) {
                clearTimeout(timer);
                req.destroy();
                resolve();
                return;
              }
            }
          });
          res.on("error", (err) => {
            if ((err as NodeJS.ErrnoException).code !== "ECONNRESET") {
              clearTimeout(timer);
              reject(err);
            }
          });
        });
        req.on("error", (err) => {
          if ((err as NodeJS.ErrnoException).code !== "ECONNRESET") {
            clearTimeout(timer);
            reject(err);
          }
        });
      });
    });

    await test("create 新建 graphic 与 ui 项目（非空文件夹返回 400），并支持 touch 排序与导出指定 root", async () => {
      const nonEmptyRes = await fetch(`${base}/__workspace/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: dirB, kind: "graphic", name: "冲突项目" }),
      });
      assert.equal(nonEmptyRes.status, 400);

      await wait(15);
      const newGraphicDir = path.join(tempRoot, "created-graphic");
      const createRes = await fetch(`${base}/__workspace/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: newGraphicDir, kind: "graphic", name: "新建画册" }),
      });
      assert.equal(createRes.status, 200);
      const created = (await createRes.json()) as WorkspaceProject;
      assert.equal(created.id, expectedIdOf(newGraphicDir));
      assert.equal(created.name, "新建画册");
      assert.equal(created.kind, "graphic");
      assert.equal(created.exists, true);
      assert.equal(created.isDefault, false);

      const rawProj = fs.readFileSync(path.join(newGraphicDir, "project.json"), "utf8");
      const rawScene = fs.readFileSync(path.join(newGraphicDir, "ui/scene.json"), "utf8");
      const rawDoc = fs.readFileSync(path.join(newGraphicDir, "docs/page1.md"), "utf8");
      assert.ok(rawProj.endsWith("\n") && rawProj.includes('\n  "version": 1,'));
      assert.ok(rawScene.endsWith("\n") && rawScene.includes('\n  "unit": "mm",'));
      assert.equal(rawDoc, "# 新建画册\n");
      const parsedScene = JSON.parse(rawScene) as { unit: string; root: string; boards: string[]; nodes: Record<string, { type: string; width: number; height: number }> };
      assert.equal(parsedScene.root, "page1");
      assert.deepEqual(parsedScene.boards, ["page1"]);
      assert.equal(parsedScene.nodes.page1.type, "Page");

      const newUiDir = path.join(tempRoot, "created-ui");
      const createUiRes = await fetch(`${base}/__workspace/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: newUiDir, kind: "ui", name: "新建界面" }),
      });
      assert.equal(createUiRes.status, 200);
      assert.equal(fs.readFileSync(path.join(newUiDir, "logic/app.logic.yaml"), "utf8"), "states: {}\nobjects: {}\n");
      assert.equal(fs.readFileSync(path.join(newUiDir, "docs/main.md"), "utf8"), "# 新建界面\n");

      // touch 把旧的 B 提到其它非默认项目前面，默认项目仍在第一个
      await wait(15);
      const touchRes = await fetch(`${base}/__workspace/touch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: idB }),
      });
      assert.equal(touchRes.status, 200);

      const { projects } = (await (await fetch(`${base}/__workspace/projects`)).json()) as { projects: WorkspaceProject[] };
      assert.equal(projects[0].id, idA);
      assert.equal(projects[1].id, idB);
      assert.ok(projects.some((p) => p.id === created.id));

      // /__export/graphic 指定 root 导出新建的 graphic 项目
      const outWeb = path.join(tempRoot, "exported-web");
      const expRes = await fetch(`${base}/__export/graphic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ root: created.id, target: "web", outDir: outWeb }),
      });
      assert.equal(expRes.status, 200);
      const expBody = (await expRes.json()) as { ok: boolean; files: string[] };
      assert.equal(expBody.ok, true);
      assert.ok(fs.readFileSync(path.join(outWeb, "index.html"), "utf8").includes("新建画册"));
    });

    await test("remove：默认项目返回 400；移除其它项目后从清单消失但磁盘文件夹仍在", async () => {
      const rmDefault = await fetch(`${base}/__workspace/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: idA }),
      });
      assert.equal(rmDefault.status, 400);

      const rmB = await fetch(`${base}/__workspace/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: idB }),
      });
      assert.equal(rmB.status, 200);

      const { projects } = (await (await fetch(`${base}/__workspace/projects`)).json()) as { projects: WorkspaceProject[] };
      assert.equal(projects.some((p) => p.id === idB), false);
      assert.equal(fs.existsSync(path.join(dirB, "project.json")), true, "磁盘上的项目文件不该被删");

      // 移除后再用旧 id 读文件应返回 404
      const afterRemove = await fetch(`${base}/__fs/read?root=${idB}&path=project.json`);
      assert.equal(afterRemove.status, 404);
    });

    await test("清单文件损坏时当成空清单处理，服务器不崩；projectPageUrl 正确拼接参数", async () => {
      fs.writeFileSync(workspaceFile, "{ broken json", "utf8");
      const res = await fetch(`${base}/__workspace/projects`);
      assert.equal(res.status, 200);
      const { projects } = (await res.json()) as { projects: WorkspaceProject[] };
      assert.equal(projects.length, 1);
      assert.equal(projects[0].id, idA);
      assert.equal(projects[0].isDefault, true);

      assert.equal(projectPageUrl(null), "/");
      assert.equal(projectPageUrl(idB), `/?root=${idB}`);
      assert.equal(projectPageUrl(idB, "sub"), `/?root=${idB}&part=sub`);
      assert.equal(projectPageUrl(null, "sub"), "/?part=sub");
    });
  } finally {
    await server.close();
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {
      // 临时文件夹释放较慢时忽略
    }
  }

  console.log(`\n全部 ${passed} 项项目清单与多项目开发接口测试通过。`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
