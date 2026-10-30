// 在工具这一侧按步骤跑一遍设计项目的逻辑，输出每个 state 步骤时的状态。
//
//   npm run case -- <设计项目文件夹> "click:toggleButton;state;click:expandButton;state"
//
// 步骤的写法和导出的 Qt 程序的 --steps 相同（见导出工程里的 ui_binding/UiDriver.h）。
// 两边以 "state " 开头的行应该逐字相同。这里没有界面，wait、check、size、shot、resize、layout 直接跳过。
import path from "node:path";
import { dumpRuntime } from "../src/export/dump.ts";
import type { Value } from "../src/expr.ts";
import { loadProjectFiles } from "../src/loader.ts";
import { findMenuItem } from "../src/model.ts";
import { Runtime, type ActionSimMode } from "../src/runtime.ts";
import { nodeIO } from "./node-io.ts";

async function main(): Promise<number> {
  const projectArg = process.argv[2];
  const restArgs = process.argv.slice(3);
  const stepsArg = restArgs.length > 0 ? restArgs.join(";") : undefined;
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
    const rest = step.split(":").slice(2).join(":");
    if (verb === "state") {
      console.log(`state ${dumpRuntime(runtime, project.scene)}`);
    } else if (verb === "wait" || verb === "check" || verb === "size" || verb === "shot" || verb === "resize" || verb === "layout") {
      continue;
    } else if (verb === "request") {
      let args: Record<string, Value> = {};
      if (rest) {
        try {
          args = JSON.parse(rest) as Record<string, Value>;
        } catch {
          // 忽略格式错误
        }
      }
      runtime.request(id, args);
    } else if (verb === "mock") {
      runtime.setActionSimulation(id, { mode: (rest || "real") as ActionSimMode });
    } else if (!project.scene.nodes[id] && !findMenuItem(project.scene, id)) {
      console.log(`error 找不到控件 ${id}（步骤 ${step}）`);
    } else if (verb === "click" || verb === "dblclick") {
      const node = project.scene.nodes[id];
      const cbBefore = node?.type === "CheckBox" ? Boolean(runtime.view(id).props.value) : false;
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
      if (node?.type === "CheckBox") {
        const view = runtime.view(id);
        if (view.visible && view.enabled && Boolean(view.props.value) === cbBefore) {
          runtime.dispatch(id, "change", !cbBefore);
        }
      }
    } else if (verb === "enter") {
      runtime.dispatch(id, "mouseenter");
    } else if (verb === "leave") {
      runtime.dispatch(id, "mouseleave");
    } else if (verb === "type") {
      for (const ch of rest) {
        const next = (typed.get(id) ?? "") + ch;
        typed.set(id, next);
        runtime.dispatch(id, "change", next);
      }
    } else if (verb === "input") {
      const node = project.scene.nodes[id];
      if (node?.type === "SpinBox") {
        runtime.dispatch(id, "change", Number(rest));
      } else {
        typed.set(id, rest);
        runtime.dispatch(id, "change", rest);
      }
    } else if (verb === "select") {
      const node = project.scene.nodes[id];
      if (node?.type === "ComboBox") {
        const options = String(runtime.view(id).props.options ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        let chosen = rest;
        if (!options.includes(rest)) {
          const idx = Number(rest);
          if (Number.isInteger(idx) && idx >= 0 && idx < options.length) chosen = options[idx];
        }
        runtime.dispatch(id, "change", chosen);
      } else if (node?.type === "List") {
        const row = Number(rest);
        runtime.dispatch(id, "change", row);
        runtime.dispatch(id, "select", row);
      }
    } else if (verb === "toggle") {
      const node = project.scene.nodes[id];
      const view = runtime.view(id);
      if (node?.type === "CheckBox") {
        runtime.dispatch(id, "change", !view.props.value);
      } else if (node?.type === "Button" && view.props.checkable) {
        runtime.dispatch(id, "toggle", !view.props.checked);
      }
    } else {
      console.log(`error 不认识的步骤 ${step}`);
    }
  }
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (e) => {
    console.error(e);
    process.exitCode = 1;
  },
);
