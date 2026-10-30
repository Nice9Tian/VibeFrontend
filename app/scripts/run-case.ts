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
  {
    name: "13. [复审序列1] 新建项目 → 切换导出页签 → 触发动作完成 → 清理图层队列",
    steps:
      "click:newProjectBtn;input:projectNameInput:Clip01;click:confirmNewProjectBtn;check;state;click:tabExportBtn;mock:exportClip:success;click:exportBtn;check;state;click:removeLayerBtn;click:removeLayerBtn;check;state",
  },
  {
    name: "14. [复审序列2] 空白项目名回退与帧率边界联动导出",
    steps:
      "click:newProjectBtn;input:projectNameInput:   ;select:presetCombo:1080p;click:confirmNewProjectBtn;check;state;click:tabExportBtn;mock:exportClip:real;click:exportBtn;check;state",
  },
  {
    name: "15. [复审序列3] 请求事件 notifyStatus 与业务事件联动",
    steps:
      'request:notifyStatus:{"message":"渲染进度 45% (108 帧)"};check;state;click:nextFrameBtn;click:addLayerBtn;check;state',
  },
  {
    name: "16. [复审序列4] 对话框开关往返与菜单栏停靠面板切换往返",
    steps:
      "click:newProjectBtn;check;state;click:cancelNewProjectBtn;check;state;click:newProjectBtn;close:newProjectDialog;check;state;click:menuToggleTimeline;check;state;click:menuToggleTimeline;check;state",
  },
  {
    name: "17. [类别1：7种工具切换与可勾选图标按钮] 画笔/橡皮/填充/几何/套索/移动/吸管全部切换与动态选项表联动",
    steps:
      "click:toolShapeBtn;check;state;click:toolSelectBtn;check;state;click:toolMoveBtn;check;state;click:toolEyedropperBtn;check;state;click:toolBrushBtn;check;state",
  },
  {
    name: "18. [类别2：DataForm 滑条/下拉/复选与 visible_when 条件显隐] 笔刷半径、切换 Bezier 笔触显示平滑滑条、修改平滑等级",
    steps:
      "form:toolOptionsForm:brushSize:42;check;state;form:toolOptionsForm:strokeMode:Bezier;check;state;form:toolOptionsForm:smoothLevel:15;check;state;form:toolOptionsForm:pressureSize:false;check;state",
  },
  {
    name: "19. [类别3：DataForm 跨工具（填充/移动）参数修改与按钮触发] 填充工具闭合缺口开关、移动工具点击重置变换按钮",
    steps:
      "click:toolFillBtn;form:toolOptionsForm:tolerance:64;check;state;form:toolOptionsForm:closeGap:false;check;state;click:toolMoveBtn;form:toolOptionsForm:resetTransformBtn:true;check;state",
  },
  {
    name: "20. [类别4：DataForm 子窗口按钮触发压感设置对话框与 DialogButtonBox 确定/取消] 打开压感对话框与 accept/reject",
    steps:
      "form:toolOptionsForm:openAdvBrush:true;check;state;select:pressureCurveCombo:SoftS;input:minRadiusSpin:25;input:tiltSensitivitySlider:80;click:antiAliasCheck;accept:drawSettingsButtonBox;check;state;click:menuDrawSettings;check;state;reject:drawSettingsButtonBox;check;state",
  },
  {
    name: "21. [类别5：图层树 Tree 节点选择、显隐勾选 toggleCheck 与分组折叠 toggleCollapse]",
    steps:
      "select:layerTree:1;check;state;check:layerTree:1:false;check;state;check:layerTree:1:true;check;state;collapse:layerTree:0:true;check;state;collapse:layerTree:0:false;check;state",
  },
  {
    name: "22. [类别6：图层树 Tree 新建分组与拖拽重排 drag/reorder]",
    steps: "click:addGroupBtn;check;state;drag:layerTree:0:2;check;state;reorder:layerTree:2:0;check;state",
  },
  {
    name: "23. [类别7：图层列表 List 拖拽重排 drag/reorder 与选中同步]",
    steps: "drag:layerList:0:2;check;state;reorder:layerList:2:1;check;state",
  },
  {
    name: "24. [类别8：图层树右键菜单 contextMenu（复制/锁定/删除图层）]",
    steps: "click:ctxDuplicateLayer;check;state;click:ctxToggleLockLayer;check;state;click:ctxDeleteLayer;check;state",
  },
  {
    name: "25. [类别9：素材库面板 List 增删选、拖拽重排与多行文本 TextArea 备注编辑]",
    steps:
      "click:addAssetBtn;check;state;select:assetList:1;check;state;drag:assetList:3:0;check;state;input:assetNoteInput:水彩纹理第2版，用于背景叠加层;check;state;click:removeAssetBtn;check;state",
  },
  {
    name: "26. [类别10：历史记录面板 List 回溯置灰 mutedFrom、撤销/重做与新操作截断分支]",
    steps:
      "click:tabHistoryBtn;check;state;click:undoBtn;check;state;click:undoBtn;check;state;click:redoBtn;check;state;select:historyList:0;check;state;click:addFrameBtn;check;state;click:clearHistoryBtn;check;state",
  },
  {
    name: "27. [类别11：中央工作区 TabBar（Drawing/Texture）切换、缩放 Slider 与画布右键菜单]",
    steps:
      "select:workspaceTabBar:Texture;check;state;select:workspaceTabBar:0;check;state;input:zoomSlider:200;check;state;click:ctxResetZoom;check;state;click:ctxClearCanvas;check;state",
  },
  {
    name: "28. [类别12：时间轴关键帧增删、帧率下拉切换、帧定位 Slider 与视口 ScrollBar]",
    steps:
      "click:addFrameBtn;check;state;input:frameSlider:12;check;state;select:fpsSelectCombo:30 fps;check;state;input:timelineScrollBar:45;check;state;click:removeFrameBtn;check;state",
  },
  {
    name: "29. [类别13：时间轴播放/循环/洋葱皮可勾选按钮 toggle 与预览时钟 clock.tick 推进帧]",
    steps:
      "clock:120;check;state;toggle:playToggleBtn;check;state;clock:240;check;state;clock:360;check;state;toggle:loopToggleBtn;check;state;toggle:onionToggleBtn;check;state;toggle:playToggleBtn;check;state",
  },
  {
    name: "30. [类别14：时间轴循环边界回绕与非循环播放自动停止]",
    steps:
      "input:frameSlider:24;toggle:playToggleBtn;clock:500;check;state;input:frameSlider:24;toggle:loopToggleBtn;clock:1000;check;state",
  },
  {
    name: "31. [类别15：文件菜单（打开/保存/另存为）与二级子菜单（导入素材/导出视频）]",
    steps:
      "click:menuOpenProject;check;state;click:menuSaveProject;check;state;click:menuSaveAsProject;check;state;click:menuImportImage;check;state;mock:exportClip:success;click:menuExportClip;check;state",
  },
  {
    name: "32. [类别16：编辑菜单（撤销/重做/清空当前帧）联动历史面板]",
    steps: "click:menuClearFrame;check;state;click:menuUndo;check;state;click:menuRedo;check;state",
  },
  {
    name: "33. [类别17：自动映射菜单（一键自动上色/生成中间帧补间/同步纹理映射）]",
    steps: "click:menuAutoColorize;check;state;click:menuAutoInbetween;check;state;click:menuTextureSync;check;state",
  },
  {
    name: "34. [类别18：绘图设置二级子菜单单选组（抖动修正 S0/S5/S12 互斥切换）]",
    steps: "click:menuStabOff;check;state;click:menuStabHigh;check;state;click:menuStabMed;check;state",
  },
  {
    name: "35. [类别19：主题菜单单选组（深色/石墨灰/浅色互斥切换）]",
    steps: "click:menuThemeGraphite;check;state;click:menuThemeLight;check;state;click:menuThemeDark;check;state",
  },
  {
    name: "36. [类别20：视图菜单可勾选项（全部 4 个停靠面板显隐、洋葱皮开关、重置工作区布局）]",
    steps:
      "click:menuToggleTools;check;state;click:menuToggleTools;check;state;click:menuToggleInspector;check;state;click:menuToggleInspector;check;state;click:menuOnionSkinToggle;check;state;input:zoomSlider:250;select:workspaceTabBar:1;click:menuResetLayout;check;state",
  },
  {
    name: "37. [类别21：工具栏按钮弹出菜单 popupMenu（重置当前工具参数 / 打开压感设置）]",
    steps:
      "form:toolOptionsForm:brushSize:99;check;state;click:popupResetTool;check;state;click:popupOpenDrawSettings;check;state;reject:drawSettingsButtonBox;check;state",
  },
  {
    name: "38. [类别22：新增标准控件 Slider 与 ScrollBar 边界夹紧测试]",
    steps:
      "input:zoomSlider:999;check;state;input:zoomSlider:5;check;state;input:timelineScrollBar:250;check;state;input:timelineScrollBar:-30;check;state",
  },
  {
    name: "39. [类别23：新增标准控件 TextArea 逐字键入 type: 与完整输入 input: 一致性]",
    steps: "input:assetNoteInput:备注A;check;state;type:assetNoteInput:123;check;state",
  },
  {
    name: "40. [类别24：新增标准控件 TabBar 与 Tree 越界/折叠子节点选择忽略与恢复]",
    steps:
      "select:workspaceTabBar:99;select:workspaceTabBar:NotATab;check;state;collapse:layerTree:0:true;select:layerTree:1;check;state;collapse:layerTree:0:false;select:layerTree:1;check;state",
  },
];

interface FlatTreeRow {
  index: number;
  id: string;
  depth: number;
  isGroup: boolean;
  collapsed: boolean;
  hiddenByAncestor: boolean;
}

function buildFlatTreeRows(rawItems: unknown): FlatTreeRow[] {
  if (!Array.isArray(rawItems)) return [];
  const rows: FlatTreeRow[] = [];
  const walk = (list: unknown[], depthOffset: number) => {
    for (const item of list) {
      const idx = rows.length;
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        rows.push({
          index: idx,
          id: String(idx),
          depth: depthOffset,
          isGroup: false,
          collapsed: false,
          hiddenByAncestor: false,
        });
        continue;
      }
      const map = item as Record<string, unknown>;
      const children = Array.isArray(map.children) ? map.children : [];
      const depth = typeof map.depth === "number" ? map.depth : depthOffset;
      const isGroup = Boolean(map.isGroup || map.kind === "group" || children.length > 0);
      const id = String(map.id ?? map.name ?? idx);
      rows.push({
        index: idx,
        id,
        depth,
        isGroup,
        collapsed: Boolean(map.collapsed),
        hiddenByAncestor: false,
      });
      if (children.length > 0) walk(children, depth + 1);
    }
  };
  walk(rawItems, 0);
  let collapsedDepth = -1;
  for (const r of rows) {
    if (collapsedDepth >= 0) {
      if (r.depth > collapsedDepth) {
        r.hiddenByAncestor = true;
        continue;
      }
      collapsedDepth = -1;
    }
    if (r.isGroup && r.collapsed) collapsedDepth = r.depth;
  }
  return rows;
}

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
    } else if (
      verb === "wait" ||
      (verb === "check" && !id) ||
      verb === "size" ||
      verb === "shot" ||
      verb === "resize" ||
      verb === "layout"
    ) {
      continue;
    } else if (verb === "clock") {
      const ms = Number(id);
      if (Number.isFinite(ms)) runtime.setClock(ms);
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
    } else if (verb === "check") {
      const [rowStr = "0", boolStr = "false"] = rest.split(":");
      const row = Number(rowStr);
      const checked = boolStr === "1" || boolStr === "true";
      const rows = buildFlatTreeRows(runtime.view(id).props.items);
      const itemId = row >= 0 && row < rows.length ? rows[row].id : String(row);
      runtime.dispatch(id, "toggleCheck", { index: row, id: itemId, checked });
    } else if (verb === "collapse") {
      const [rowStr = "0", boolStr = "false"] = rest.split(":");
      const row = Number(rowStr);
      const collapsed = boolStr === "1" || boolStr === "true";
      const rows = buildFlatTreeRows(runtime.view(id).props.items);
      const itemId = row >= 0 && row < rows.length ? rows[row].id : String(row);
      runtime.dispatch(id, "toggleCollapse", { index: row, id: itemId, collapsed });
    } else if (verb === "drag" || verb === "reorder") {
      const [fromStr = "0", toStr = "0"] = rest.split(":");
      const from = Number(fromStr);
      const to = Number(toStr);
      if (Number.isInteger(from) && Number.isInteger(to) && from !== to) {
        runtime.dispatch(id, "reorder", { from, to });
      }
    } else if (verb === "form") {
      const [fieldName = "", ...valParts] = rest.split(":");
      const rawVal = valParts.join(":");
      const view = runtime.view(id);
      const schema = (view.props.schema ?? {}) as Record<string, unknown>;
      const ctrls = Array.isArray(schema.controls) ? (schema.controls as Array<Record<string, unknown>>) : [];
      const cm = ctrls.find((c) => String(c.name ?? "") === fieldName);
      if (cm) {
        const type = String(cm.type ?? "slider");
        const hook = String(cm.hook ?? "");
        let value: Value = rawVal;
        if (type === "slider") {
          const minV = Number(cm.min ?? 0);
          const maxV = Number(cm.max ?? 100);
          const rawNum = Number(rawVal);
          value = Math.max(minV, Math.min(maxV, Number.isFinite(rawNum) ? Math.trunc(rawNum) : 0));
        } else if (type === "check") {
          value = rawVal === "true" || rawVal === "1";
        } else if (type === "button" || type === "subwindow") {
          value = true;
        }
        runtime.dispatch(id, "change", { name: fieldName, value, hook, type });
      }
    } else if (verb === "accept") {
      const node = project.scene.nodes[id];
      if (node?.type === "DialogButtonBox") {
        runtime.dispatch(id, "accept");
      } else {
        runtime.closeWindow(id);
      }
    } else if (verb === "close" || verb === "reject") {
      const node = project.scene.nodes[id];
      if (node?.type === "DialogButtonBox") {
        runtime.dispatch(id, "reject");
      } else {
        runtime.closeWindow(id);
      }
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
      if (node?.type === "SpinBox" || node?.type === "Slider" || node?.type === "ScrollBar") {
        const view = runtime.view(id);
        const defMax = node.type === "SpinBox" ? 9999 : 100;
        const min = Number(view.props.min ?? 0);
        const max = Number(view.props.max ?? defMax);
        const rawNum = Number(rest);
        if (Number.isFinite(rawNum)) {
          const clamped = Math.max(min, Math.min(max, Math.trunc(rawNum)));
          if (clamped !== Number(view.props.value ?? 0)) {
            runtime.dispatch(id, "change", clamped);
          }
        }
      } else if (node?.type === "TextArea") {
        const cur = String(runtime.view(id).props.value ?? "");
        typed.set(id, rest);
        if (rest !== cur) {
          runtime.dispatch(id, "change", rest);
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
      } else if (node?.type === "TabBar") {
        const view = runtime.view(id);
        const rawTabs = view.props.tabs;
        const tabs = Array.isArray(rawTabs)
          ? rawTabs.map((it, i) =>
              typeof it === "object" && it !== null
                ? String(
                    (it as Record<string, unknown>).label ??
                      (it as Record<string, unknown>).title ??
                      (it as Record<string, unknown>).name ??
                      i,
                  )
                : String(it),
            )
          : String(rawTabs ?? "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
        let idx = tabs.indexOf(rest);
        if (idx < 0 && /^-?\d+$/.test(rest.trim())) {
          const n = Number(rest.trim());
          if (Number.isInteger(n) && n >= 0 && n < tabs.length) idx = n;
        }
        if (idx >= 0 && idx !== Number(view.props.value ?? 0)) {
          runtime.dispatch(id, "change", idx);
        }
      } else if (node?.type === "Tree") {
        const view = runtime.view(id);
        const rows = buildFlatTreeRows(view.props.items);
        if (/^-?\d+$/.test(rest.trim())) {
          const row = Number(rest.trim());
          if (
            Number.isInteger(row) &&
            row >= 0 &&
            row < rows.length &&
            !rows[row].hiddenByAncestor &&
            row !== Number(view.props.value ?? 0)
          ) {
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
