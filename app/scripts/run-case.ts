// 在工具这一侧按步骤跑一遍设计项目的逻辑，输出每个 state 步骤时的状态。
//
//   npm run case -- <设计项目文件夹> "click:toggleButton;state;click:expandButton;state"
//
// 步骤的写法和导出的 Qt 程序的 --steps 相同（见导出工程里的 ui_binding/UiDriver.h）。
// 两边以 "state " 开头的行应该逐字相同。这里没有界面，wait 和 check 两种步骤直接跳过。
import path from "node:path";
import { dumpRuntime } from "../src/export/dump.ts";
import { loadProjectFiles } from "../src/loader.ts";
import { Runtime } from "../src/runtime.ts";
import { nodeIO } from "./node-io.ts";

async function main(): Promise<number> {
  const [projectArg, stepsArg] = process.argv.slice(2);
  if (!projectArg || stepsArg === undefined) {
    console.log('用法：npm run case -- <设计项目文件夹> "步骤;步骤;..."');
    return 2;
  }
  const project = await loadProjectFiles(nodeIO(path.resolve(projectArg)), null);
  const runtime = new Runtime(project);
  runtime.start();

  // 输入框里现在的文字，按控件记
  const typed = new Map<string, string>();
  for (const raw of stepsArg.split(";")) {
    const step = raw.trim();
    if (!step) continue;
    const [verb, id = ""] = step.split(":");
    if (verb === "state") {
      console.log(`state ${dumpRuntime(runtime, project.scene)}`);
    } else if (verb === "wait" || verb === "check" || verb === "size" || verb === "shot") {
      continue;
    } else if (!project.scene.nodes[id]) {
      console.log(`error 找不到控件 ${id}（步骤 ${step}）`);
    } else if (verb === "click" || verb === "dblclick") {
      // 和网页里的顺序相同：按下、松开、点击，然后是全局的 window.click
      const once = () => {
        runtime.dispatch(id, "mousedown");
        runtime.dispatch(id, "mouseup");
        runtime.dispatch(id, "click");
        runtime.dispatch(null, "window.click");
      };
      once();
      if (verb === "dblclick") {
        once();
        runtime.dispatch(id, "dblclick");
      }
    } else if (verb === "enter") {
      runtime.dispatch(id, "mouseenter");
    } else if (verb === "leave") {
      runtime.dispatch(id, "mouseleave");
    } else if (verb === "type") {
      for (const ch of step.split(":").slice(2).join(":")) {
        const next = (typed.get(id) ?? "") + ch;
        typed.set(id, next);
        runtime.dispatch(id, "change", next);
      }
    } else {
      console.log(`error 不认识的步骤 ${step}`);
    }
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
