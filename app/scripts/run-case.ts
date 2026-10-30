// 在工具这一侧按步骤跑一遍设计项目的逻辑，输出每个 state 步骤时的状态。
//
//   npm run case -- <设计项目文件夹> "click:toggleButton;state;click:expandButton;state"
//   npm run case -- <设计项目文件夹> --suite <Qt可执行文件路径>
//
// 步骤的写法和导出的 Qt 程序的 --steps 相同（见导出工程里的 ui_binding/UiDriver.h）。
// 两边以 "state " 开头的行应该逐字相同。这里没有界面，wait、check、size、shot、resize、layout 直接跳过。
import { execFileSync } from "node:child_process";
import path from "node:path";
import { dumpRuntime } from "../src/export/dump.ts";
import type { Value } from "../src/expr.ts";
import { loadProjectFiles } from "../src/loader.ts";
import { findMenuItem, type Project } from "../src/model.ts";
import { Runtime, type ActionSimMode } from "../src/runtime.ts";
import { nodeIO } from "./node-io.ts";

export const ANIMEAN_SUITE_CASES: Array<{ name: string; steps: string }> = [
  {
    name: "1. 初始状态与工具栏切换",
    steps: "state;click:toolEraserBtn;check;state;click:toolFillBtn;check;state;click:toolBrushBtn;check;state",
  },
  {
    name: "2. 图层列表增删移与业务事件联动",
    steps:
      "click:addLayerBtn;check;state;select:layerList:1;check;state;click:moveLayerUpBtn;check;state;click:moveLayerDownBtn;check;state;click:toggleVisibleBtn;check;state;click:removeLayerBtn;check;state",
  },
  {
    name: "3. 属性检查器（ComboBox/SpinBox/CheckBox）与 Stack 页签切换",
    steps:
      "select:blendCombo:Multiply;input:opacitySpin:75;click:lockLayerCheck;check;state;click:tabExportBtn;check;state;click:tabPropsBtn;check;state",
  },
  {
    name: "4. 时间轴前后翻帧",
    steps: "click:nextFrameBtn;click:nextFrameBtn;check;state;click:prevFrameBtn;check;state",
  },
  {
    name: "5. 模态新建项目对话框、模态拦截与 JS 函数联动",
    steps:
      "click:newProjectBtn;check;state;click:addLayerBtn;state;select:presetCombo:720p;check;state;select:presetCombo:Square;check;state;input:projectNameInput:测试镜头A;check;state;click:confirmNewProjectBtn;check;state",
  },
  {
    name: "6. 模态新建项目对话框取消关闭",
    steps: "click:newProjectBtn;select:presetCombo:720p;click:cancelNewProjectBtn;check;state",
  },
  {
    name: "7. 菜单项切换停靠面板显隐",
    steps:
      "click:menuToggleLayers;check;state;click:menuToggleLayers;check;state;click:menuToggleTimeline;check;state;click:menuToggleTimeline;check;state",
  },
  {
    name: "8. 请求事件 notifyStatus 与动作 exportClip（real/success/error/delayMs）",
    steps:
      'request:notifyStatus:{"message":"自动保存成功"};check;state;click:tabExportBtn;mock:exportClip:real;click:exportBtn;check;state;mock:exportClip:success;click:exportBtn;check;state;mock:exportClip:error;click:exportBtn;check;state;mock:exportClip:success:20;click:exportBtn;wait:60;check;state',
  },
  {
    name: "9. [审核问题1] SpinBox 超出 [min, max] 边界夹紧（150 / -20）",
    steps:
      "input:opacitySpin:150;check;state;input:opacitySpin:-20;check;state;input:opacitySpin:50;check;state;input:opacitySpin:150;check;state",
  },
  {
    name: "10. [审核问题2a] TextInput type: 在初始绑定值基础上追加键入",
    steps: "click:newProjectBtn;type:projectNameInput:Abc;check;state;click:cancelNewProjectBtn;check;state",
  },
  {
    name: "11. [审核问题2b] ComboBox 与 List select: 非法选项与越界行号忽略",
    steps: "select:blendCombo:NotAnOption;select:layerList:99;select:layerList:-1;check;state",
  },
  {
    name: "12. [审核问题3] 模态 QDialog 通过 Esc/关闭按钮(close:)关闭后同步状态并解除主窗口锁定",
    steps: "click:newProjectBtn;check;state;close:newProjectDialog;check;state;click:addLayerBtn;check;state",
  },
];

async function runStepsOnWeb(project: Project, stepsArg: string): Promise<string[]> {
  const outLines: string[] = [];
  const runtime = new Runtime(project);
  runtime.start();
  await runtime.waitForIdle();

  // 输入框里现在的文字，按控件记
  const typed = new Map<string, string>();
  for (const raw of stepsArg.split(";")) {
    const step = raw.trim();
    if (!step) continue;
    const [verb, id = ""] = step.split(":");
    const rest = step.split(":").slice(2).join(":");
    if (verb === "state") {
      outLines.push(`state ${dumpRuntime(runtime, project.scene)}`);
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
      const [modeStr = "real", delayStr] = rest.split(":");
      const delayMs = delayStr !== undefined && Number.isFinite(Number(delayStr)) ? Math.max(0, Number(delayStr)) : 0;
      runtime.setActionSimulation(id, { mode: (modeStr || "real") as ActionSimMode, delayMs });
    } else if (!project.scene.nodes[id] && !findMenuItem(project.scene, id)) {
      outLines.push(`error 找不到控件 ${id}（步骤 ${step}）`);
    } else if (verb === "close" || verb === "reject") {
      runtime.closeWindow(id);
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
      const obj = project.logic.objects?.[id];
      let cur =
        obj?.bind || obj?.props?.value !== undefined || !typed.has(id)
          ? String(runtime.view(id).props.value ?? "")
          : typed.get(id)!;
      for (const ch of rest) {
        cur += ch;
        typed.set(id, cur);
        runtime.dispatch(id, "change", cur);
      }
    } else if (verb === "input") {
      const node = project.scene.nodes[id];
      if (node?.type === "SpinBox") {
        const view = runtime.view(id);
        const min = Number(view.props.min ?? 0);
        const max = Number(view.props.max ?? 9999);
        const rawNum = Number(rest);
        if (Number.isFinite(rawNum)) {
          const clamped = Math.max(min, Math.min(max, Math.trunc(rawNum)));
          if (clamped !== Number(view.props.value ?? 0)) {
            runtime.dispatch(id, "change", clamped);
          }
        }
      } else {
        typed.set(id, rest);
        runtime.dispatch(id, "change", rest);
      }
    } else if (verb === "select") {
      const node = project.scene.nodes[id];
      if (node?.type === "ComboBox") {
        const view = runtime.view(id);
        const options = String(view.props.options ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        let chosen: string | undefined;
        if (options.includes(rest)) {
          chosen = rest;
        } else if (/^-?\d+$/.test(rest.trim())) {
          const idx = Number(rest.trim());
          if (Number.isInteger(idx) && idx >= 0 && idx < options.length) chosen = options[idx];
        }
        if (chosen !== undefined && chosen !== String(view.props.value ?? "")) {
          runtime.dispatch(id, "change", chosen);
        }
      } else if (node?.type === "List") {
        const view = runtime.view(id);
        const items = Array.isArray(view.props.items) ? view.props.items : [];
        if (/^-?\d+$/.test(rest.trim())) {
          const row = Number(rest.trim());
          if (Number.isInteger(row) && row >= 0 && row < items.length && row !== Number(view.props.value ?? -1)) {
            runtime.dispatch(id, "change", row);
            runtime.dispatch(id, "select", row);
          }
        }
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
      outLines.push(`error 不认识的步骤 ${step}`);
    }
    await runtime.waitForIdle();
  }
  return outLines;
}

async function main(): Promise<number> {
  const projectArg = process.argv[2];
  const restArgs = process.argv.slice(3);
  if (!projectArg || restArgs.length === 0) {
    console.log('用法：npm run case -- <设计项目文件夹> "步骤;步骤;..."');
    console.log("  或：npm run case -- <设计项目文件夹> --suite <Qt可执行文件路径>");
    return 2;
  }
  const project = await loadProjectFiles(nodeIO(path.resolve(projectArg)), null);

  if (restArgs[0] === "--suite") {
    const qtExe = restArgs[1] ? path.resolve(restArgs[1]) : "";
    if (!qtExe) {
      console.log("错误：--suite 需要提供 Qt 可执行文件路径");
      return 2;
    }
    let failed = false;
    for (const c of ANIMEAN_SUITE_CASES) {
      const webLines = await runStepsOnWeb(project, c.steps);
      const webStates = webLines.filter((l) => l.startsWith("state "));
      const qtOut = execFileSync(qtExe, ["--steps", c.steps], { encoding: "utf8" });
      const qtLines = qtOut.split(/\r?\n/).filter(Boolean);
      const qtStates = qtLines.filter((l) => l.startsWith("state "));
      const qtChecks = qtLines.filter((l) => l.startsWith("check "));
      const badChecks = qtChecks.filter((l) => l !== "check ok");

      let stateMatch = webStates.length === qtStates.length;
      if (stateMatch) {
        for (let i = 0; i < webStates.length; i++) {
          if (webStates[i] !== qtStates[i]) {
            stateMatch = false;
            break;
          }
        }
      }
      if (!stateMatch || badChecks.length > 0) {
        failed = true;
        console.log(`FAIL ${c.name}`);
        if (!stateMatch) {
          console.log(`  state 行数：web=${webStates.length}, qt=${qtStates.length}`);
          const maxLen = Math.max(webStates.length, qtStates.length);
          for (let i = 0; i < maxLen; i++) {
            if (webStates[i] !== qtStates[i]) {
              console.log(`  第 ${i + 1} 个 state 不一致：`);
              console.log(`    web: ${webStates[i] ?? "<无>"}`);
              console.log(`    qt : ${qtStates[i] ?? "<无>"}`);
            }
          }
        }
        for (const bc of badChecks) console.log(`  Qt check 失败：${bc}`);
      } else {
        console.log(`PASS ${c.name}（state=${webStates.length} 处逐字一致，check=${qtChecks.length} 处全部 ok）`);
      }
    }
    console.log(`用例套件汇总：共 ${ANIMEAN_SUITE_CASES.length} 组，结果：${failed ? "存在失败" : "全部通过"}`);
    return failed ? 1 : 0;
  }

  const stepsArg = restArgs.join(";");
  const lines = await runStepsOnWeb(project, stepsArg);
  for (const line of lines) console.log(line);
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
