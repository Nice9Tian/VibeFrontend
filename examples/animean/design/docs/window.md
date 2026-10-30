# AnimeAn 动画工作台界面说明

本设计项目展示 AnimeAn 动画软件的主窗口骨架、图层面板、检查器面板、时间轴面板以及“新建项目”模态对话框。

<!-- ui-section: tools-dock -->
## 顶部工具栏（toolsDock）

位于主窗口顶部停靠区，采用横排（HBox）布局，包含“新建项目”按钮、画笔/橡皮/填充工具切换按钮，以及当前项目的尺寸摘要。点击“新建项目”或从“文件 → 新建项目...”菜单项触发 `openNewProject`，打开模态对话框 `newProjectDialog`。
<!-- /ui-section -->

<!-- ui-section: layers-dock -->
## 图层面板（layersDock）

位于主窗口左侧停靠区，采用竖排（VBox）布局：
- 顶部操作栏包含“新建”“删除”“上移”“下移”四个按钮，对数组状态 `layers.items` 执行 `push`、`remove`、`move` 操作；
- 中部 `layerList` 列表显示全部图层并双向绑定选中下标 `layers.selectedIndex`；
- 底部显示当前图层可见状态，并提供由业务接管的切换按钮 `toggleVisibleBtn`。
<!-- /ui-section -->

<!-- ui-section: toggle-visible-btn -->
## 切换图层可见性（toggleVisibleBtn）

点击时发出业务事件 `layerToggleVisible`（`owner: business`）。未连接业务时执行模拟步骤；在 `examples/animean/qt/` 中由 C++ 业务模型 `LayerModel` 接管，切换可见性并写回 `layer.visible` 状态。
<!-- /ui-section -->

<!-- ui-section: central-area -->
## 中央绘图区（centralArea）

主窗口中央区，顶部显示画布标题与当前工具，下方为外部容器 `canvasHost`。
<!-- /ui-section -->

<!-- ui-section: canvas-host -->
## 绘图画布外部容器（canvasHost）

类型为 `External`，导出成 Qt 后在 `vf::BusinessInterface` 上生成 `setCanvasHostWidget(QWidget *)`，由业务工程放入真实的绘图画布控件 `CanvasWidget`。
<!-- /ui-section -->

<!-- ui-section: inspector-dock -->
## 右侧检查器面板（inspectorDock）

位于主窗口右侧停靠区，顶部用 2 列网格（Grid）排列“图层属性”和“渲染导出”两个标签按钮，下方用层叠容器（Stack）在表单页 `layerPropsPage` 与导出页 `exportPage` 之间切换。导出页通过 `call: exportClip` 调用动作，支持在预览栏切换“真跑 / 模拟成功 / 模拟失败”。
<!-- /ui-section -->

<!-- ui-section: timeline-dock -->
## 底部时间轴面板（timelineDock）

位于主窗口底部停靠区，支持前后切换当前帧，并可从“视图”菜单显示或隐藏。
<!-- /ui-section -->

<!-- ui-section: new-project-dialog -->
## 新建项目模态对话框（newProjectDialog）

模态对话框（`type: Dialog, modal: true`），内部使用表单（Form）排版组织项目名称、画幅预设、画布宽高和透明底色选项。切换画幅预设时调用纯逻辑函数 `functions/syncPresetDimensions.js` 自动同步宽高与帧率。
<!-- /ui-section -->
