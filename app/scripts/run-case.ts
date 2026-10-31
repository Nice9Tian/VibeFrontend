// 在工具这一侧按步骤跑一遍设计项目的逻辑，输出每个 state 步骤时的状态。
//
//   npm run case -- <设计项目文件夹> "click:toggleButton;state;click:expandButton;state"
//   npm run case -- <设计项目文件夹> --suite <Qt可执行文件路径>
//
// 步骤的写法和导出的 Qt 程序的 --steps 相同（见导出工程里的 ui_binding/UiDriver.h）。
// 两边以 "state " 开头的行应该逐字相同。这里没有界面，wait、check、size、shot、resize、layout 直接跳过。
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function buildQtEnv(): NodeJS.ProcessEnv {
  // Windows 上 Qt 的警告默认进调试输出，这里要它写到 stderr，下面才查得到
  const env: NodeJS.ProcessEnv = { ...process.env, QT_FORCE_STDERR_LOGGING: "1" };
  if (process.platform === "win32") {
    const extraDirs = ["C:\\Qt\\6.9.1\\mingw_64\\bin", "C:\\Qt\\Tools\\mingw1310_64\\bin"].filter((d) =>
      fs.existsSync(d),
    );
    if (extraDirs.length > 0) {
      const pathKey = Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
      env[pathKey] = [...extraDirs, env[pathKey] ?? ""].join(";");
    }
  }
  return env;
}
import { dumpRuntime } from "../src/export/dump.ts";
import type { Value } from "../src/expr.ts";
import { loadProjectFiles } from "../src/loader.ts";
import { findMenuItem, type Project } from "../src/model.ts";
import { Runtime, type ActionSimMode } from "../src/runtime.ts";
import { nodeIO } from "./node-io.ts";

export const ANIMEAN_SUITE_CASES: Array<{ name: string; steps: string; noEffects?: boolean }> = [
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
    name: "17. [Step 6] 状态图片按钮 StateButton 五种状态切换（selected/normal/hover/pressed/disabled）与调色盘过渡效果",
    steps:
      "state;click:colorPanelToggleBtn;wait:220;check;state;enter:colorPanelToggleBtn;check;state;input:colorPanelToggleBtn:pressed;check;state;input:colorPanelToggleBtn:released;leave:colorPanelToggleBtn;check;state;click:lockLayerCheck;check;state;click:lockLayerCheck;click:colorPanelToggleBtn;wait:220;check;state",
  },
  {
    name: "18. [Step 6] --no-effects 降级模式下调色盘显隐与状态图片按钮逐字一致",
    steps:
      "state;click:colorPanelToggleBtn;check;state;enter:colorPanelToggleBtn;state;leave:colorPanelToggleBtn;click:colorPanelToggleBtn;check;state",
    noEffects: true,
  },
  {
    name: "19. [类别1：基础8种绘图工具切换与真实 tool_controls 表单联动] 选择/画笔/橡皮/填充/连接/套索/变换/吸管全部切换",
    steps:
      "click:toolArrowBtn;check;state;click:toolEraserBtn;check;state;click:toolFillBtn;check;state;click:toolShapeBtn;check;state;click:toolSelectBtn;check;state;click:toolMoveBtn;check;state;click:toolEyedropperBtn;check;state;click:toolBrushBtn;check;state",
  },
  {
    name: "20. [类别2：Mapping 扩展工具5种切换与工具锁定策略回退] H中线/V中线/映射区/辅助线/自动映射切换及锁定自动回退 Arrow",
    steps:
      "click:toolHLineBtn;check;state;click:toolVLineBtn;check;state;click:toolMapAreaBtn;check;state;click:toolAddLineBtn;check;state;click:toolAutoMapBtn;check;state;toggle:toolLockPolicyBtn;check;state;toggle:toolLockPolicyBtn;check;state",
  },
  {
    name: "21. [类别3：压感板 ForcePad 二维向量与压力交互] 连续触发 forcePadBox 更新二维力向量 (fx, fy) 与压力百分比",
    steps: "click:forcePadBox;check;state;click:forcePadBox;check;state;click:forcePadBox;check;state",
  },
  {
    name: "22. [类别4：DataForm 对齐 pen.json/fill.json 同名颜色按钮与调色板] 切换 Black/Blue/Green 颜色按钮、吸管调色板选色与对象数组下拉框",
    steps:
      "form:toolOptionsForm:color:blue;check;state;form:toolOptionsForm:color:green;check;state;form:toolOptionsForm:pen_width:18;check;state;click:toolFillBtn;form:toolOptionsForm:color:blue;check;state;form:toolOptionsForm:fill_scope:all;check;state;click:toolEyedropperBtn;form:toolOptionsForm:palette_color:#dc2626;check;state",
  },
  {
    name: "23. [类别5：DataForm 对齐 connect.json/toolcontrol.py 的 on/off 复选与对象式 visible_when 条件显隐]",
    steps:
      "click:toolShapeBtn;check;state;form:toolOptionsForm:connect_auto_snap:off;check;state;form:toolOptionsForm:connect_mode:smooth;check;state;form:toolOptionsForm:connect_smooth:75;check;state;click:toolHLineBtn;check;state;form:toolOptionsForm:fold_split:off;check;state;form:toolOptionsForm:bridge_topology:on;check;state;form:toolOptionsForm:bridge_tension:60;check;state",
  },
  {
    name: "24. [类别6：画笔与压感设置模态对话框及 DialogButtonBox 确定/取消] 从 DataForm 子窗口按钮和菜单呼出并执行 accept/reject",
    steps:
      "form:toolOptionsForm:openAdvBrush:true;check;state;select:pressureCurveCombo:SoftS;input:minRadiusSpin:25;input:tiltSensitivitySlider:80;click:antiAliasCheck;accept:drawSettingsButtonBox;check;state;click:menuDrawSettings;check;state;reject:drawSettingsButtonBox;check;state",
  },
  {
    name: "25. [类别7：统一图层树 layerList 主/子视图页签、新建图层/建组、上下移动与取消选中]",
    steps:
      "select:layerViewTabBar:Child Layers;check;state;select:layerViewTabBar:Main Layers;check;state;click:addLayerBtn;check;state;click:addGroupBtn;check;state;click:moveLayerUpBtn;check;state;click:unselectLayerBtn;check;state;select:layerList:0;check;state",
  },
  {
    name: "26. [类别8：统一图层树 layerList 显隐勾选 toggleCheck、分组折叠 toggleCollapse 与拖拽重排 drag/reorder]",
    steps:
      "select:layerList:1;check;state;check:layerList:1:false;check;state;check:layerList:1:true;check;state;collapse:layerList:0:true;check;state;collapse:layerList:0:false;check;state;drag:layerList:2:0;check;state;reorder:layerList:0:2;check;state",
  },
  {
    name: "27. [类别9：图层树右键菜单（复制图层 / 切换锁定 / 删除图层）直接作用于统一图层树]",
    steps:
      "select:layerList:1;click:ctxDuplicateLayer;check;state;click:ctxToggleLockLayer;check;state;click:ctxDeleteLayer;check;state",
  },
  {
    name: "28. [类别10：图层组右键菜单“解组保留图层”与“删组及成员图层”对比验证]",
    steps:
      "select:layerList:0;click:ctxDissolveGroup;check;state;click:addGroupBtn;check;state;select:layerList:2;click:ctxDeleteGroup;check;state",
  },
  {
    name: "29. [类别11：素材库面板导入/移除、素材转图层绑定 assetToLayerBtn、取消选中、拖拽重排与多行备注编辑]",
    steps:
      "click:addAssetBtn;check;state;select:assetList:1;check;state;click:assetToLayerBtn;check;state;drag:assetList:3:0;check;state;input:assetNoteInput:水彩纹理第2版，用于背景叠加层;check;state;click:removeAssetBtn;check;state;click:unselectAssetBtn;check;state",
  },
  {
    name: "30. [类别12：纹理子视图 FloatBox 在中央页签、独立浮窗与工具面板嵌入槽位间切换及跟随开关]",
    steps:
      "click:floatTextureBtn;check;state;click:embedTextureBtn;check;state;click:menuToggleTextureFloat;check;state;click:dockTextureToTabBtn;check;state;click:toolHLineBtn;form:toolOptionsForm:texture_view:true;check;state;click:followTimelineCheck;check;state;click:followTextureCheck;check;state",
  },
  {
    name: "31. [类别13：文件菜单与纹理文件子菜单（打开/保存 .textureview、打开/保存/另存为工程、导入素材/导出片段）]",
    steps:
      "click:menuOpenTexture;check;state;click:menuSaveTexture;check;state;click:menuOpenProject;check;state;click:menuSaveProject;check;state;click:menuSaveAsProject;check;state;click:menuImportImage;check;state;mock:exportClip:success;click:menuExportClip;check;state",
  },
  {
    name: "32. [类别14：历史记录面板回溯置灰 mutedFrom、编辑菜单撤销/重做/清空当前帧与新操作截断分支]",
    steps:
      "click:tabHistoryBtn;check;state;click:menuClearFrame;check;state;click:menuUndo;check;state;click:undoBtn;check;state;click:redoBtn;check;state;select:historyList:0;check;state;click:addFrameBtn;check;state;click:clearHistoryBtn;check;state",
  },
  {
    name: "33. [类别15：中央工作区 Drawing/Texture 页签切换、画布缩放 Slider 与画布右键菜单（重置缩放/清空当前帧）]",
    steps:
      "select:workspaceTabBar:Texture;check;state;select:workspaceTabBar:0;check;state;input:zoomSlider:200;check;state;click:ctxResetZoom;check;state;click:ctxClearCanvas;check;state",
  },
  {
    name: "34. [类别16：时间轴关键帧、延长帧 Hold、复制帧、帧前移重排、删除帧、帧率切换与视口滚动]",
    steps:
      "click:addFrameBtn;check;state;click:addHoldFrameBtn;check;state;click:duplicateFrameBtn;check;state;click:moveFrameBackBtn;check;state;input:frameSlider:12;check;state;select:fpsSelectCombo:30 fps;check;state;input:timelineScrollBar:45;check;state;click:removeFrameBtn;check;state",
  },
  {
    name: "35. [类别17：时间轴洋葱皮总开关与 4 项分层过滤复选框（线稿/填充/映射/辅助）]",
    steps:
      "toggle:onionToggleBtn;check;state;click:onionLinesCheck;check;state;click:onionFillsCheck;check;state;click:onionAmCheck;check;state;click:onionGuideCheck;check;state;click:menuOnionSkinToggle;check;state",
  },
  {
    name: "36. [类别18：时间轴播放/暂停、循环边界回绕、非循环自动停止与预览时钟 clock.tick 推进帧]",
    steps:
      "clock:120;check;state;toggle:playToggleBtn;check;state;clock:240;check;state;input:frameSlider:24;clock:360;check;state;input:frameSlider:24;toggle:loopToggleBtn;clock:480;check;state",
  },
  {
    name: "37. [类别19：自动映射菜单（一键自动上色 / 生成中间帧补间 / 同步纹理映射）]",
    steps: "click:menuAutoColorize;check;state;click:menuAutoInbetween;check;state;click:menuTextureSync;check;state",
  },
  {
    name: "38. [类别20：绘图设置抖动修正单选组（S0/S5/S12）、主题单选组（深色/石墨灰/浅色）与工具栏弹出菜单重置参数]",
    steps:
      "click:menuStabOff;check;state;click:menuStabHigh;check;state;click:menuStabMed;check;state;click:menuThemeGraphite;check;state;click:menuThemeLight;check;state;click:menuThemeDark;check;state;form:toolOptionsForm:pen_width:40;check;state;click:popupResetTool;check;state",
  },
  {
    name: "39. [类别21：视图菜单全部 4 个停靠面板显隐切换与重置工作区布局]",
    steps:
      "click:menuToggleTools;check;state;click:menuToggleTools;check;state;click:menuToggleInspector;check;state;click:menuToggleInspector;check;state;input:zoomSlider:250;select:workspaceTabBar:1;click:floatTextureBtn;check;state;click:menuResetLayout;check;state",
  },
  {
    name: "40. [类别22：新增标准控件 Slider 与 ScrollBar 边界夹紧测试] 超出 min/max 自动夹紧到合法区间",
    steps:
      "input:zoomSlider:10;check;state;input:zoomSlider:900;check;state;input:frameSlider:0;check;state;input:frameSlider:99;check;state;input:timelineScrollBar:-50;check;state;input:timelineScrollBar:500;check;state",
  },
  {
    name: "41. [类别23：新增标准控件 TextArea 逐字键入 type: 与完整输入 input: 一致性]",
    steps:
      "select:assetList:1;input:assetNoteInput:;check;state;type:assetNoteInput:LineA;check;state;type:assetNoteInput:_B;check;state",
  },
  {
    name: "42. [类别24：新增标准控件 TabBar 与 Tree 越界/折叠子节点选择忽略与恢复]",
    steps:
      "select:workspaceTabBar:9;check;state;collapse:layerList:0:true;check;state;select:layerList:1;check;state;select:layerList:2;check;state;collapse:layerList:0:false;check;state;select:layerList:1;check;state",
  },
  {
    name: "43. 停靠面板连续编排（叠页签 → 切页签 → 浮出 → 恢复 → 改大小 → 分栏并排 → 改分栏大小 → 关闭与菜单重开）",
    steps:
      "dock:tabify:layersDock:inspectorDock;check;state;dock:tab:layersDock;check;state;dock:float:inspectorDock:320,140,280,460;check;state;dock:restore:inspectorDock;check;state;dock:resize:left:260;check;state;dock:split:layersDock:inspectorDock:after;check;state;dock:resizeSplit:left:0:240;check;state;dock:close:timelineDock;check;state;click:menuToggleTimeline;check;state;dock:move:inspectorDock:right;dock:resize:left:240;check;state",
  },
  {
    name: "44. 浮动嵌入框（FloatBox）嵌入与窗口内浮出切换及拖拽移位",
    steps:
      "toggle:onionSkinBox;check;state;floatbox:move:onionSkinBox:420,180;check;state;toggle:onionSkinBox;check;state",
  },
  {
    name: "45. 底部与顶部停靠区：缩小、侧边面板移入后厚度跟随停靠区，只有换行面板按内容撑高",
    steps:
      "dock:resize:bottom:100;check;state;dock:resize:bottom:132;check;state;dock:tabify:timelineDock:inspectorDock;check;state;dock:tab:timelineDock;check;state;dock:move:inspectorDock:top;check;state;dock:move:layersDock:bottom;check;state",
  },
  {
    name: "46. 底部竖向分栏：分栏后厚度不变，拖停靠区分隔条按比例缩放各组，拖分栏分隔条改比例",
    steps:
      "dock:split:timelineDock:inspectorDock:after:vertical;check;state;dock:resize:bottom:200;check;state;dock:resizeSplit:bottom:0:80;check;state",
  },
  {
    name: "47. 三个页签占满标题栏：拖激活页签拆出分栏不产生浮窗，组里其余页签保持",
    steps:
      "dock:tabify:layersDock:inspectorDock;check;state;dock:tabify:layersDock:timelineDock;check;state;dock:split:layersDock:timelineDock:after;check;state",
  },
  {
    name: "48. 三个页签：直接拖没激活的页签拆分栏、移到别的停靠区、切页签",
    steps:
      "dock:tabify:layersDock:inspectorDock;dock:tabify:layersDock:timelineDock;check;state;dock:split:layersDock:inspectorDock:after;check;state;dock:tabify:layersDock:inspectorDock;check;state;dock:tab:layersDock;check;state;dock:move:timelineDock:right;check;state",
  },
  {
    name: "49. 叠页签组与分栏在窗口来回缩放后保持，换行面板在窄窗口撑高",
    steps:
      "dock:tabify:layersDock:inspectorDock;dock:split:layersDock:timelineDock:after;check;state;resize:800x600;wait:120;check;state;resize:1280x800;wait:120;check;state",
  },
  {
    name: "50. 窗口放不下的停靠区厚度：只收窄实际尺寸，中央区保留余地，缩小后恢复",
    steps: "dock:resize:bottom:700;check;state;resize:1024x720;wait:120;check;dock:resize:bottom:132;check;state",
  },
  {
    name: "51. 关闭的组夹在并排组中间：并排方向与分隔条序号不错位，关闭的激活页签叠入后显示另一个页签",
    steps:
      "dock:split:layersDock:timelineDock:after:horizontal;dock:split:timelineDock:inspectorDock:after;dock:close:timelineDock;check;state;dock:resizeSplit:left:0:100;check;state;click:menuToggleTimeline;check;state;dock:close:inspectorDock;dock:tabify:layersDock:inspectorDock;check;state",
  },
  {
    name: "52. 悬停的按钮所在面板切走页签再切回：悬停状态不残留",
    steps:
      "dock:tabify:layersDock:inspectorDock;enter:colorPanelToggleBtn;check;state;dock:tab:layersDock;check;state;dock:tab:inspectorDock;check;state",
  },
  {
    name: "53. 悬停或按下的按钮所在面板关闭再打开、重排：状态不残留",
    steps:
      "enter:colorPanelToggleBtn;check;state;dock:close:inspectorDock;dock:open:inspectorDock;check;state;press:colorPanelToggleBtn;check;state;dock:close:inspectorDock;dock:open:inspectorDock;check;state;enter:colorPanelToggleBtn;dock:move:inspectorDock:left;check;state",
  },
  {
    name: "54. 最小化再恢复窗口：停靠面板不被当成关闭",
    steps:
      "dock:tabify:layersDock:inspectorDock;check;state;window:minimize;wait:200;state;window:restore;wait:200;check;state",
  },
  {
    name: "55. 悬停时弹出模态框：背景控件不残留悬停，模态拦截不变",
    steps:
      "enter:colorPanelToggleBtn;check;state;click:newProjectBtn;leave:colorPanelToggleBtn;check;state;click:confirmNewProjectBtn;check;state",
  },
  {
    name: "56. 拖停靠区分隔条后面板恢复原宽度，再拖分隔条：分隔条位置和起始尺寸不过期",
    steps: "dock:resize:left:320;check;state;dock:move:layersDock:left;check;state;dock:resize:left:260;check;state",
  },
  {
    name: "57. 拖分栏分隔条后分栏恢复原比例，再拖分隔条：分隔条位置和起始尺寸不过期",
    steps:
      "dock:split:timelineDock:inspectorDock:after:horizontal;dock:resizeSplit:bottom:0:400;check;state;dock:split:timelineDock:inspectorDock:after:horizontal;check;state;dock:resizeSplit:bottom:0:500;check;state",
  },
  {
    name: "58. 左侧竖向分栏后点按钮：布局不撑大主窗口",
    steps: "dock:split:layersDock:inspectorDock:after;check;click:toolEraserBtn;click:toolBrushBtn;check;state",
  },
  {
    name: "59. 横向分栏、竖向分栏与不同窗口尺寸：布局不撑大主窗口",
    steps:
      "resize:1024x720;wait:120;dock:split:layersDock:inspectorDock:after:horizontal;click:toolEraserBtn;check;state;dock:split:layersDock:timelineDock:after:vertical;click:toolBrushBtn;check;state;resize:800x600;wait:120;check;click:toolEraserBtn;check;state",
  },
  {
    name: "60. 已关闭的面板换区后分隔条序号跟着变",
    steps:
      "dock:split:layersDock:timelineDock:after;dock:split:timelineDock:inspectorDock:after;dock:close:layersDock;dock:move:layersDock:right;check;state;dock:resizeSplit:left:0:220;check;state",
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
      verb === "window" ||
      verb === "break" ||
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
    } else if (verb === "dock") {
      const op = id.trim();
      const parts = rest.split(":").map((s) => s.trim());
      const arg1 = parts[0] ?? "";
      const arg2 = parts[1] ?? "";
      const arg3 = parts[2] ?? "";
      const arg4 = parts[3] ?? "";
      const args: Record<string, Value> = {};
      if (op === "tabify") {
        args.target = arg1;
        args.dock = arg2;
      } else if (op === "tab" || op === "activateTab") {
        args.dock = arg1;
      } else if (op === "float") {
        args.dock = arg1;
        if (arg2) {
          const coords = arg2.split(",").map((s) => Number(s.trim()));
          if (coords.length >= 2) {
            args.x = coords[0];
            args.y = coords[1];
          }
          if (coords.length >= 4) {
            args.width = coords[2];
            args.height = coords[3];
          }
        }
      } else if (op === "restore") {
        args.dock = arg1;
        if (arg2) args.area = arg2;
      } else if (op === "move") {
        args.dock = arg1;
        args.area = arg2;
        if (arg3) args.index = Number(arg3);
      } else if (op === "split") {
        args.target = arg1;
        args.dock = arg2;
        if (arg3) args.position = arg3;
        if (arg4) args.orientation = arg4;
      } else if (op === "resize" || op === "resizeArea") {
        args.area = arg1;
        args.size = Number(arg2);
      } else if (op === "resizeSplit") {
        args.area = arg1;
        args.groupIndex = Number(arg2);
        args.size = Number(arg3);
      } else if (op === "close" || op === "open" || op === "toggle") {
        args.dock = arg1;
      }
      runtime.dockOp(op, args);
    } else if (verb === "floatbox" && id.trim() === "move") {
      const parts = rest.split(":").map((s) => s.trim());
      const fbId = parts[0] ?? "";
      const coords = (parts[1] ?? "").split(",").map((s) => Number(s.trim()));
      if (fbId && coords.length >= 2) {
        runtime.dispatch(fbId, "move", {
          x: coords[0],
          y: coords[1],
        });
      }
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
      let cm: Record<string, unknown> | undefined;
      for (const c of ctrls) {
        if (String(c.name ?? "") !== fieldName) continue;
        if (!cm) cm = c;
        if (c.value !== undefined && String(c.value) === rawVal) {
          cm = c;
          break;
        }
      }
      if (cm) {
        const type = String(cm.type ?? "slider");
        const hook = String(cm.hook ?? "");
        let value: Value = rawVal;
        if (type === "slider") {
          const minV = Number(cm.min ?? 0);
          const maxV = Number(cm.max ?? 100);
          const rawNum = Number(rawVal);
          value = Math.max(minV, Math.min(maxV, Number.isFinite(rawNum) ? Math.trunc(rawNum) : 0));
        } else if (type === "check" || type === "checkbox") {
          const defVal = cm.value;
          const usesOnOff =
            typeof defVal === "string" && (defVal.toLowerCase() === "on" || defVal.toLowerCase() === "off");
          const lowerRaw = rawVal.trim().toLowerCase();
          const b = lowerRaw === "on" || lowerRaw === "true" || lowerRaw === "1";
          if (usesOnOff || lowerRaw === "on" || lowerRaw === "off") {
            value = b ? "on" : "off";
          } else {
            value = b;
          }
        } else if (type === "button" || type === "subwindow") {
          if (rawVal && rawVal !== "true" && rawVal !== "1") {
            value = rawVal;
          } else if (cm.value !== undefined && cm.value !== null && String(cm.value) !== "") {
            value = String(cm.value);
          } else if (type === "subwindow") {
            value = "embedded";
          } else {
            value = true;
          }
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
    } else if (verb === "press") {
      runtime.dispatch(id, "mousedown");
    } else if (verb === "release") {
      runtime.dispatch(id, "mouseup");
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
      } else if (node?.type !== "TextInput" && rest === "pressed") {
        runtime.dispatch(id, "mousedown");
      } else if (node?.type !== "TextInput" && rest === "released") {
        runtime.dispatch(id, "mouseup");
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
      } else if (node?.type === "FloatBox") {
        const nextVal = !Boolean(view.props.floating);
        runtime.dispatch(id, "toggle", nextVal);
        runtime.dispatch(id, "change", nextVal);
      }
    } else {
      outLines.push(`error 不认识的步骤 ${step}`);
    }
    await runtime.waitForIdle();
  }
  return outLines;
}

/** 两行 state 的差异字段，一行一个，不打印整段 JSON。 */
function stateDiffLines(web: string | undefined, qt: string | undefined): string[] {
  if (web === undefined || qt === undefined) return [`web: ${web ?? "<无>"}`, `qt : ${qt ?? "<无>"}`];
  const out: string[] = [];
  const walk = (a: unknown, b: unknown, at: string) => {
    if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const k of keys) {
        walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], at ? `${at}.${k}` : k);
      }
    } else if (a !== b) {
      out.push(`${at}: web=${JSON.stringify(a)} qt=${JSON.stringify(b)}`);
    }
  };
  walk(JSON.parse(web.slice("state ".length)), JSON.parse(qt.slice("state ".length)), "");
  return out.length > 0 ? out : ["JSON 内容相同，只有键的顺序或空白不同"];
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
    const qtEnv = buildQtEnv();
    const concurrency = 12;
    const results: Array<{
      name: string;
      webStates: string[];
      qtStates: string[];
      qtChecks: string[];
      badChecks: string[];
      qtWarnings: string[];
      stateMatch: boolean;
    }> = new Array(ANIMEAN_SUITE_CASES.length);

    let nextIdx = 0;
    const workers = Array.from({ length: Math.min(concurrency, ANIMEAN_SUITE_CASES.length) }, async () => {
      while (nextIdx < ANIMEAN_SUITE_CASES.length) {
        const idx = nextIdx++;
        const c = ANIMEAN_SUITE_CASES[idx];
        const webLines = await runStepsOnWeb(project, c.steps);
        const webStates = webLines.filter((l) => l.startsWith("state "));
        const qtArgs = c.noEffects ? ["--no-effects", "--steps", c.steps] : ["--steps", c.steps];
        const { stdout: qtOut, stderr: qtErr } = await execFileAsync(qtExe, qtArgs, {
          encoding: "utf8",
          env: qtEnv,
          maxBuffer: 16 * 1024 * 1024,
        });
        const qtLines = qtOut.split(/\r?\n/).filter(Boolean);
        const qtStates = qtLines.filter((l) => l.startsWith("state "));
        const qtChecks = qtLines.filter((l) => l.startsWith("check "));
        const badChecks = qtChecks.filter((l) => l !== "check ok");
        const qtWarnings = qtErr.split(/\r?\n/).filter((l) => l.includes("resizeDocks"));

        let stateMatch = webStates.length === qtStates.length;
        if (stateMatch) {
          for (let i = 0; i < webStates.length; i++) {
            if (webStates[i] !== qtStates[i]) {
              stateMatch = false;
              break;
            }
          }
        }
        results[idx] = { name: c.name, webStates, qtStates, qtChecks, badChecks, qtWarnings, stateMatch };
      }
    });
    await Promise.all(workers);

    let failed = false;
    for (const r of results) {
      if (!r.stateMatch || r.badChecks.length > 0 || r.qtWarnings.length > 0) {
        failed = true;
        console.log(`FAIL ${r.name}`);
        if (!r.stateMatch) {
          console.log(`  state 行数：web=${r.webStates.length}, qt=${r.qtStates.length}`);
          const maxLen = Math.max(r.webStates.length, r.qtStates.length);
          for (let i = 0; i < maxLen; i++) {
            if (r.webStates[i] !== r.qtStates[i]) {
              console.log(`  第 ${i + 1} 个 state 不一致：`);
              for (const line of stateDiffLines(r.webStates[i], r.qtStates[i])) console.log(`    ${line}`);
            }
          }
        }
        for (const bc of r.badChecks) console.log(`  Qt check 失败：${bc}`);
        for (const w of r.qtWarnings) console.log(`  Qt 警告：${w}`);
      } else {
        console.log(`PASS ${r.name}（state=${r.webStates.length} 处逐字一致，check=${r.qtChecks.length} 处全部 ok）`);
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
