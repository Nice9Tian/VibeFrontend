# AnimeAn 动画工作台界面说明（完整第一版）

本设计项目完整表达 AnimeAn 动画软件第一版的主窗口骨架、多级菜单栏（含快捷键、可勾选项、单选组、右键菜单、按钮弹出菜单）、顶部 7 种绘图工具栏、动态生成的工具选项面板（`DataForm`）、左侧图层树（`Tree`）与图层列表（`List`）及素材面板（含备注多行文本框 `TextArea`）、中央双页签绘图/纹理区（`TabBar` + `External` 画布）、右侧属性/历史/导出检查器（`Stack` + 支持回退置灰的历史 `List`）、底部支持窄窗口自动换行的流式时间轴面板（`Flow` + `Slider` + `ScrollBar`），以及“新建项目”与“画笔与压感设置”两个模态对话框（含 `DialogButtonBox`）。

<!-- ui-section: tools-dock -->
## 顶部工具栏（toolsDock）

位于主窗口顶部停靠区，采用横排（HBox）布局：
- 包含“新建项目”按钮与 7 个带矢量图标的可勾选工具按钮（画笔 `pen`、橡皮 `eraser`、填充 `bucket`、几何 `shape`、套索 `lasso`、移动 `move`、吸管 `eyedropper`）；
- 包含带弹出菜单（`popupMenu`）的“工具预设 ▾”按钮 `toolMoreMenuBtn`、弹性占位区 `toolbarSpacer`（`Spacer`）以及右侧项目摘要标签。
- 切换工具时调用 `functions/syncToolOptions.js`，动态更新右侧工具选项面板 `toolOptionsForm` 的表单结构与默认参数。
<!-- /ui-section -->

<!-- ui-section: layers-dock -->
## 图层与素材面板（layersDock）

位于主窗口左侧停靠区，采用竖排（VBox）布局：
- **图层树 `layerTree`（`Tree`）**：展示角色图层组与子图层，支持层级展开/折叠（`toggleCollapse`）、可见性勾选（`toggleCheck`）、拖动重排（`reorder`）以及右键上下文菜单（`contextMenu`）；
- **图层列表 `layerList`（`List`）**：支持新建、删除、上下移动和直接拖拽重排（`reorder`），底部提供由业务接管的切换按钮 `toggleVisibleBtn`。
<!-- /ui-section -->

<!-- ui-section: toggle-visible-btn -->
## 切换图层可见性（toggleVisibleBtn）

点击时发出业务事件 `layerToggleVisible`（`owner: business`）。未连接业务时执行模拟步骤；在 `examples/animean/qt/` 中由 C++ 业务模型 `LayerModel` 接管，切换可见性并写回 `layer.visible` 状态。
<!-- /ui-section -->

<!-- ui-section: assets-panel -->
## 素材库面板（assetList / assetNoteInput）

位于左侧停靠面板下半区，包含导入/移除按钮、支持拖动重排的素材列表 `assetList`（`List`），以及绑定 `assets.note` 的多行文本编辑框 `assetNoteInput`（`TextArea`）。
<!-- /ui-section -->

<!-- ui-section: central-area -->
## 中央绘图与纹理工作区（centralArea）

主窗口中央区，顶部栏包含 `workspaceTabBar`（`TabBar`，在 `Drawing` 绘图区与 `Texture` 纹理贴图区之间切换）、画布标题、缩放滑条 `zoomSlider`（`Slider`）和当前工具指示，下方为外部容器 `canvasHost`。
<!-- /ui-section -->

<!-- ui-section: canvas-host -->
## 绘图画布外部容器（canvasHost）

类型为 `External`，导出成 Qt 后在 `vf::BusinessInterface` 上生成 `setCanvasHostWidget(QWidget *)`，由业务工程放入真实的绘图画布控件 `CanvasWidget`，并配置了画布右键菜单。
<!-- /ui-section -->

<!-- ui-section: inspector-dock -->
## 右侧工具选项与检查器面板（inspectorDock）

位于主窗口右侧停靠区，上半部分固定展示当前工具的动态选项表单 `toolOptionsForm`，下半部分用 3 列网格页签按钮在“图层属性”“历史记录”“渲染导出”三个层叠页（`inspectorStack`）之间切换。
<!-- /ui-section -->

<!-- ui-section: tool-options-form -->
## 动态工具选项表单（toolOptionsForm）

类型为 `DataForm`，对照 `animean/childrenpanel/tool_controls/*.json` 的结构化定义动态生成滑条（`slider`）、下拉列表（`list`）、复选框（`check`）、按钮（`button`）和子窗口触发按钮（`subwindow`），支持 `visible_when` 条件显隐。修改任意字段时通过 `functions/applyToolOption.js` 写回 `toolOptions.values` 并记录操作历史。
<!-- /ui-section -->

<!-- ui-section: history-panel -->
## 历史记录面板（historyList）

位于检查器“历史记录”页签，包含撤销、重做、清空按钮与 `historyList`（`List`）。点击早期历史条目或执行撤销时，通过 `functions/rewindHistory.js` 更新 `history.mutedFrom`，将该位置之后的未生效历史条目置灰显示；当后续产生新操作时自动截断置灰分支并追加新记录。
<!-- /ui-section -->

<!-- ui-section: timeline-dock -->
## 底部时间轴面板（timelineDock）

位于主窗口底部停靠区：
- 第一行 `timelineTransportFlow` 采用自动换行流式布局（`Flow`），包含播放/暂停、上一帧/下一帧、增删关键帧、循环开关、洋葱皮开关、帧率选择、帧定位滑条 `frameSlider`（`Slider`）与帧信息标签。在宽窗口（1280/1440）下单行排布，在窄窗口（1024）下自动换为两行；
- 第二行包含时间轴视口滚动条 `timelineScrollBar`（`ScrollBar`）；
- 当处于播放状态且预览时钟（`clock`）推进触发 `clock.tick` 时，自动向前推进 `project.currentFrame`。
<!-- /ui-section -->

<!-- ui-section: new-project-dialog -->
## 新建项目模态对话框（newProjectDialog）

模态对话框（`type: Dialog, modal: true`），内部使用表单（Form）排版组织项目名称、画幅预设、画布宽高和透明底色选项。切换画幅预设时调用纯逻辑函数 `functions/syncPresetDimensions.js` 自动同步宽高与帧率。
<!-- /ui-section -->

<!-- ui-section: draw-settings-dialog -->
## 画笔与压感设置模态对话框（drawSettingsDialog）

模态对话框（`type: Dialog, modal: true`），可从“绘图设置 → 画笔与压感设置...”、工具栏弹出菜单或画笔工具选项中的“压感曲线...”按钮打开。底部使用标准对话框按钮组 `drawSettingsButtonBox`（`DialogButtonBox`），响应 `accept` 与 `reject` 事件。
<!-- /ui-section -->
