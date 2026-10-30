# AnimeanBusiness 业务接口层说明

`animean/business/` 将 AnimeAn 主窗口中的核心业务状态与交互逻辑抽离为不依赖 `QtWidgets` 的独立业务接口类 `AnimeanBusiness`（仅依赖 `animean_core`、`QtCore`、`QtGui`）。

- **输入（事件接收）**：通过 `public slots` 接收外部界面（原 `MainWindow`、新生成的界面壳层或无界面测试程序）发出的操作指令。
- **输出（状态暴露）**：通过只读 `Q_PROPERTY`、查询方法以及 `signals` 向外广播状态变化。
- **编译期分层约束**：`business/CMakeLists.txt` 与 `business/LayerRules.cmake` 禁止 `business/` 包含任何 `QWidget` 头文件或使用 `../` 越层相对包含，并由 `violation_business_include_qwidget` 与 `violation_business_layer_rule` 两个测试在 `ctest` 中强制校验。

---

## 一、`AnimeanBusiness` 接口与 `mainwindow.cpp` 旧代码对应关系

以下行号均对应抽离前的 `animean/mainwindow.cpp`：

### 1. 画布视图提供与面板目标解析

| `AnimeanBusiness` 接口 | 说明 | 对应原 `mainwindow.cpp` 位置 |
| --- | --- | --- |
| `mainPaintViewObject()` / `childPaintViewObject()` / `activePaintViewObject()` | 以 `QObject *` 属性和取值函数提供主画布与纹理子画布对象（无界面模式下返回内部占位 `QObject`，有界面模式下返回绑定的 `PaintOpenGLWidget`） | `MainWindow::createMainPaintView` (802–829)、`createTexturePanel` (1177–1239)、`activePaintWidget` (2127–2130) |
| `bindPaintView()` / `unbindPaintView()` | 将真实 `PaintOpenGLWidget` 的模型、历史、重绘、缩略图、Python 消息等回调桥接到业务层 | 新增适配器注入入口，解耦 `PaintOpenGLWidget`（`QOpenGLWidget` 子类） |
| `activeViewName()` / `setActiveViewName()` / `activeViewChanged` | 查询和切换当前活动画布视图（`"main"` / `"child"`），触发停止播放、注册当前 Python 场景、状态栏提示等 | `MainWindow::setActivePaintView` (2174–2204) |
| `framePanelTargetViewName()` / `layerPanelTargetViewName()` / `assetPanelTargetViewName()` | 根据当前活动视图及纹理面板的 `changeableTimeline` / `changeableTexture` 开关，解析时间轴、图层、资产面板实际作用的画布视图 | `MainWindow::framePanelTarget` (2132–2139)、`layerPanelTarget` (2145–2152)、`assetPanelTarget` (2154–2157) |
| `setChangeableTimeline()` / `setChangeableTexture()` | 同步纹理面板是否允许时间轴/材质面板跟随子视图 | `MainWindow::setupConnections` 中 `changableTimelineToggled` / `changableTextureToggled` (2511–2516) |
| `attentionForView()` / `updateAttention()` | 维护每个视图的 `(frame, layer, asset)` 焦点状态，调用 `constrainAttention` 约束合法范围并按需发出 `timelineChanged`、`layersChanged`、`assetsChanged` 信号 | `MainWindow::attentionFor` (2169–2172)、`MainWindow::updateAttention` (3919–3963)、Python `registerAnimeanUiRefreshCallback` (498–546) |

### 2. 状态栏消息与窗口标题

| `AnimeanBusiness` 接口 | 说明 | 对应原 `mainwindow.cpp` 位置 |
| --- | --- | --- |
| `statusMessage()` / `setStatusMessage()` / `statusMessageChanged` | 读写状态栏文本并通知界面层更新显示 | `MainWindow::setStatusText` (3834–3837) |
| `windowTitle()` / `windowTitleChanged` | 根据当前主工程文件路径与独立纹理视图文件路径合成窗口标题 | `MainWindow::updateWindowTitle` (3818–3832) |

### 3. 工程新建、打开、保存与纹理视图文件读写

| `AnimeanBusiness` 接口 | 说明 | 对应原 `mainwindow.cpp` 位置 |
| --- | --- | --- |
| `ensureProjectFileExtension()` / `ensureTextureViewFileExtension()` / `*Filter()` | `.anproj` 与 `.textureview` 扩展名补全及文件对话框过滤串 | 匿名命名空间辅助函数 (49–91) |
| `newProject()` / `applyNewCanvasSize()` / `canvasSize()` / `canvasSizeChanged` | 修改主文档画布尺寸、提交 `"Canvas Size"` 历史记录并同步 Python 画布宽高全局变量 | `MainWindow::newProject` (3412–3424)、`applyNewCanvasSize` (3426–3446) |
| `saveProjectTo()` / `loadProjectFrom()` / `currentFilePath()` | 序列化/反序列化主画布与纹理画布双模型 JSON（`.anproj`），原子安装并激活两个模型 | `MainWindow::readJsonFromFile` (1966–1989)、`installLoadedModel` / `activateLoadedModel` / `adoptLoadedModel` (2011–2038)、`writeJsonToFile` (2040–2062)、`saveProjectTo` (3507–3528)、`loadProjectFrom` (3530–3574) |
| `openTextureViewFrom()` / `saveTextureViewTo()` / `childFilePath()` | 独立读写纹理视图文件（`.textureview`）并更新子视图模型与窗口标题 | `MainWindow::openTextureView` (1854–1888)、`saveTextureView` (1890–1907)、`saveTextureViewAs` (1909–1937) |

### 4. 图层增删、移动、显隐、分组与树结构重排

| `AnimeanBusiness` 接口 | 说明 | 对应原 `mainwindow.cpp` 位置 |
| --- | --- | --- |
| `layerCount()` / `currentLayer()` / `layerName()` / `isLayerVisible()` | 查询指定视图的图层数量、当前选中图层、图层名称与可见性 | `PaintOpenGLWidget` 转发查询及 `MainWindow::connectLayerPanel` (2561–2677) |
| `addLayer()` / `deleteLayer()` / `deleteLayerGroup()` / `dissolveLayerGroup()` | 新建图层、删除单个图层、删除图层组及其成员图层、解散图层组（保留成员图层） | `MainWindow::connectLayerPanel` (2646–2673)、`showLayerContextMenu` 内置菜单项 (4064–4086) |
| `moveLayer()` / `reorderLayerTree()` | 移动图层列顺序、同步移动被追踪的子图层、重映射填色源图层索引并更新图层树与历史记录 | `MainWindow::applyLayerPanelStructure` (4137–4308) |
| `setLayerVisible()` / `setLayerGroupCollapsed()` | 切换图层显隐（优先经由 Python `layervisibility` hook，无 hook 时直接改模型）及记录图层组折叠状态 | `MainWindow::connectLayerPanel` (2606–2641) |
| `selectLayer()` / `unselectLayer()` | 切换当前活动图层或取消选中图层 | `MainWindow::connectLayerPanel` (2563–2601, 2675–2677) |
| `layerRowsForView()` | 遍历图层组树、过滤内部层与当前帧无单元的层，并按 `parentLayerId` 合成父子追踪缩进与自动空组剔除，生成面板展示行 | `MainWindow::refreshLayerList` 中行收集与父子嵌套合成逻辑 (4318–4467) |

### 5. 当前工具与工具选项（含 `toolcontrol.options_for_tool_json`）

| `AnimeanBusiness` 接口 | 说明 | 对应原 `mainwindow.cpp` 位置 |
| --- | --- | --- |
| `toolControlName()` / `toolLockName()` / `loadExtraTools()` | 工具枚举到脚本名称的转换，以及调用 `extra_tools.tools_json()` 解析扩展工具定义 | 匿名命名空间辅助函数 (93–153)、`MainWindow::createToolDocks` (2865–2893) |
| `optionsForToolJson()` / `optionsForExtraToolJson()` / `toolOptionsLayout()` / `extraToolOptionsLayout()` / `refreshToolOptions()` / `refreshExtraToolOptions()` | 调用 Python `toolcontrol.options_for_tool_json(tool, state)` 与 `options_for_extra_tool_json(name, state)` 生成工具选项面板 JSON 描述；当 Python 未启用或返回空时回退到内置 `childrenpanel/tool_controls/*.json` | `MainWindow::refreshToolOptions` (1495–1503)、`refreshExtraToolOptions` (1939–1964)、`createToolDocks` 中 `loadToolOptions` (2896–2931)、`ToolControlConfig::loadBuiltInToolLayout` |
| `applyTool()` / `selectTool()` / `selectExtraTool()` / `currentTool()` / `activeExtraTool()` | 切换基础工具或脚本扩展工具，校验工具锁定策略，通知画布切换工具与画笔属性并触发 `extra_tools.run_tool_handler` | `MainWindow::createToolDocks` 中 `applyTool` 与 `extraToolSelected` (2933–3020) |
| `selectColor()` / `setDrawingColor()` / `setPenWidth()` / `setSmoothValue()` / `setFillScope()` / `setFillAllLayers()` / `setDrawSettings()` | 选色（自动切到 Pen/Fill 后设色）、线宽、平滑度、填充范围（当前层/全图层）及画笔拟合参数控制 | `MainWindow::createToolDocks` (3022–3058)、Python 回调 (586–629) |
| `isToolLocked()` / `applyLockedTools()` / `toolLockStateChanged` | 按视图维护被脚本锁定的工具集合（Arrow 永不锁定），当前工具被锁定时自动回退到 Arrow | `MainWindow::isToolLocked` (3065–3083)、`applyLockedTools` (3085–3098)、`refreshToolLockState` (3100–3117) |
| `sendToolOption()` / `sendPadEvent()` | 将工具选项面板变更（`optionChanged`）与 ForcePad 向量输入（`press`/`move`/`release`）转发给当前视图的 Python hook | `MainWindow::createForcePadDock` (950–958)、`createToolDocks` (3060–3062) |

### 6. 资产（Assets）管理

| `AnimeanBusiness` 接口 | 说明 | 对应原 `mainwindow.cpp` 位置 |
| --- | --- | --- |
| `assetCount()` / `currentAsset()` / `assetName()` / `visibleAssetNames()` | 查询目标视图的资产数量、当前资产及过滤掉脚本内部工作资产后的可见资产名称列表 | `MainWindow::refreshAssetList` (4659–4692) |
| `addAsset()` / `selectAsset()` / `unselectAsset()` | 在资产面板目标视图中新建资产、选中资产或取消选中 | `MainWindow::setupConnections` (2525–2543) |
| `addLayerForAsset()` / `assignAssetToLayer()` | 将资产拖入图层面板时为该资产新建图层，或将资产绑定到当前帧的指定图层单元 | `MainWindow::eventFilter` 拖拽落点处理 (2799–2835) |

### 7. 历史记录与跨视图撤销/重做

| `AnimeanBusiness` 接口 | 说明 | 对应原 `mainwindow.cpp` 位置 |
| --- | --- | --- |
| `canUndo()` / `canRedo()` / `undoTargetViewName()` / `redoTargetViewName()` | 跨主画布与纹理画布按全局提交序号（`currentSeq` / `redoSeq`）选择应撤销或重做的目标视图 | `MainWindow::undoTargetView` (1042–1057)、`redoTargetView` (1061–1075) |
| `historyLabels()` / `currentHistoryIndex()` | 查询指定视图的历史记录条目文本与当前游标位置 | `MainWindow::refreshHistoryList` (1092–1128) |
| `commitHistory()` / `resetHistory()` / `handleViewHistoryCommitted()` | 提交历史快照、重置初始基线，并在任一视图产生新提交时清空另一视图的 redo 尾（全局逆序一致性） | `MainWindow::setupDocks` (735–736)、`createHistoryDock` (1016–1022) |
| `undo()` / `redo()` / `goToHistory()` / `applyHistoryRestore()` | 执行撤销、重做或历史列表跳转，恢复主/子视图固定身份标识（`main_paint_view`/`child_paint_view`），刷新焦点与时间轴 | `MainWindow::createHistoryDock` (982–1036)、`applyHistoryRestore` (1130–1175)、Python 历史回调 (630–643) |

### 8. 时间轴、播放与洋葱皮

| `AnimeanBusiness` 接口 | 说明 | 对应原 `mainwindow.cpp` 位置 |
| --- | --- | --- |
| `frameCount()` / `currentFrame()` / `playbackFps()` / `timelineState()` / `renderFrameThumbnail()` | 汇总时间轴面板所需的帧数、当前帧、保持帧标记（`holds`）、帧名、帧率、播放状态与洋葱皮状态，并提供帧缩略图渲染 | `MainWindow::createTimeline` (3160–3162)、`refreshTimeline` (4623–4657) |
| `selectFrame()` / `addFrame()` / `addHoldFrame()` / `duplicateFrame()` / `deleteFrame()` / `moveFrame()` / `previousFrame()` / `nextFrame()` | 时间轴选帧、新帧、插入延长帧（Hold）、复制帧、删除帧、拖拽移动帧及前后步进翻帧 | `MainWindow::createTimeline` (3165–3253) |
| `setFps()` / `setPlaybackLoop()` / `startPlayback()` / `advancePlaybackFrame()` / `stopPlayback()` | 设置播放帧率（写入文档并提交历史）、切换循环开关、预渲染缓存并启动/步进/停止播放定时器 | `MainWindow::startPlayback` (841–881)、`advancePlaybackFrame` (883–908)、`stopPlayback` (910–933)、`createTimeline` (3238–3269) |
| `setOnionEnabled()` / `setOnionLines()` / `setOnionFills()` / `setOnionAmLayers()` / `setOnionGuideLines()` / `toggleOnionFrame()` / `pullOnionPolicy()` | 主画布洋葱皮开关、首次开启时自动填入相邻帧、线条/填充/自动映射层/辅助线过滤开关，以及从 Python 拉取洋葱皮排除属性与标签策略 | `MainWindow::createTimeline` (3276–3351)、`pullOnionPolicy` (3368–3410) |

### 9. 嵌入式 Python 状态同步

| `AnimeanBusiness` 接口 | 说明 | 对应原 `mainwindow.cpp` 位置 |
| --- | --- | --- |
| `pythonStateSyncRequested` | 在工程加载、画布尺寸变更、切换视图、注意力焦点刷新等时机发出信号，驱动界面层向 Python `__main__` 全局字典同步 `model`、`main_model`、`child_model`、`active_view` 及主/子画布宽高变量 | `MainWindow::syncEmbeddedPythonState` (2441–2474) |

---

## 二、尚未搬入 `AnimeanBusiness` 的部分及原因

根据“只搬业务与交互语义、不搬纯窗口/控件展现实现”的原则，以下部分保留在 `MainWindow` 或各 `QWidget` 子控件中：

1. **模态对话框与文件选择交互（`QFileDialog`、`QMessageBox`、`NewProjectDialog`、`openScriptSettings`）**
   - **位置**：`MainWindow::newProject`、`promptForNewCanvasOnStartup`、`openProject`、`saveProjectAs`、`openTextureView`、`saveTextureViewAs`、`confirmDivergentOverwrite`、`openScriptSettings`。
   - **原因**：弹出原生文件选择器、覆盖确认弹窗以及基于 `QDialog` 的模态窗口属于典型的 `QtWidgets` 界面交互壳层职责。实际的参数生效与文件读写已下沉到 `AnimeanBusiness` 的无弹窗方法（`applyNewCanvasSize`、`loadProjectFrom`、`saveProjectTo`、`openTextureViewFrom`、`saveTextureViewTo`），使无界面测试与新界面可以直接调用。

2. **停靠面板布局、纹理视图宿主切换与视口自适应（`ParentWindow`、`CentralPaintArea`、`SubControlFrame`、`updateTextureHome`、`autoFitTextureControlView`）**
   - **位置**：`MainWindow::setupDocks`、`createMainPaintView`、`createTexturePanel`、`updateTextureHome`、`saveTextureViewSlot`、`restoreTextureViewSlot`、`autoFitTextureControlView`。
   - **原因**：纹理画布在中央标签页与浮动/嵌入子控件（`SubControlFrame`）之间的 `QWidget::setParent` 重挂载、鼠标按键期间延迟重挂载以及基于控件像素尺寸的视口缩放平移（`zoom`/`pan`）属于窗口布局与视图几何表现层，强依赖 `QWidget` 树结构与尺寸事件。

3. **OpenGL 画布渲染、屏幕空间手柄绘制与鼠标笔刷手势（`PaintOpenGLWidget`）**
   - **位置**：`openglwidget.cpp` / `openglwidget.h` 以及 `MainWindow` 中转发给画布的 overlay、edit handle、cursor 与纹理导出 `grabFramebuffer`（`exportTextureImage`）。
   - **原因**：`PaintOpenGLWidget` 继承自 `QOpenGLWidget`（位于 `QtOpenGLWidgets`，会传递引入 `QtWidgets`）。业务层通过 `AnimePaintViewAdapter` 回调接口和 `QObject *` 属性与其解耦，避免业务层直接包含 `openglwidget.h`。

4. **`QTreeWidget` / `QListWidget` 内部拖拽事件过滤与滚动位置保持（`eventFilter`、`refreshLayerList`、`refreshAssetList`、`refreshHistoryList` 的控件写入部分）**
   - **位置**：`MainWindow::setupListDragDrop`、`eventFilter`、`layerPanelItems`、`refreshLayerList`（下半段 `QTreeWidgetItem` 原地更新与滚动条恢复）。
   - **原因**：`QAbstractItemView` 的拖拽起手距离判定、`QTreeWidget::dropEvent` 的 `rowsInserted` 时序信号以及 `QScrollBar` 视口位置保持均为具体 Qt Widgets 列表控件的实现细节；图层面板应展示的行数据计算（`layerRowsForView`）与拖拽后的树重排逻辑（`reorderLayerTree`）均已搬入 `AnimeanBusiness`。

5. **动态 `QMenu` 菜单栏构建与右键菜单弹窗（`createScriptMenus`、`attachChildScriptMenus`、`rebuildScriptMenu`、`showLayerContextMenu`）**
   - **位置**：`MainWindow::fillScriptMenu`、`rebuildScriptMenu`、`attachChildScriptMenus`、`createScriptMenus`、`showLayerContextMenu`。
   - **原因**：按需构造 `QMenu`、`QAction` 并在鼠标全局坐标弹出菜单依赖 `QtWidgets`；其中内置的图层解组（`dissolveLayerGroup`）与删组（`deleteLayerGroup`）业务动作已改为调用 `AnimeanBusiness`。

6. **Python Debug REPL 停靠面板与 UI 冻结遍历（`setupPythonDebugDock`、`setPythonUiFrozen`）**
   - **位置**：`MainWindow::setupPythonDebugDock`、`runPythonDebugCommand`、`setPythonUiFrozen`。
   - **原因**：REPL 面板是针对 `QPlainTextEdit` / `QLineEdit` 的开发者调试挂件；`setPythonUiFrozen` 遍历主窗口下所有 `QDockWidget`、`QMenuBar` 与 `SubControlFrame` 并切换 `setEnabled`，属于纯 `QWidget` 树使能控制。

7. **外部格式导入的交互式流程（`importRaster`、`importOpenToonzLines`、`importClipStudioPaint`）**
   - **位置**：`MainWindow::importRaster`、`importOpenToonzLines`、`importClipStudioPaint`。
   - **原因**：这三项流程混合了 `QFileDialog` 选文件、`QMessageBox::question` 询问是否按当前画布缩放尺寸，以及 `PaintOpenGLWidget::ImportedVectorFrame` 的画布导入接口，后续若有新界面触发需求，可在剥离弹窗询问策略后进一步迁入业务层。
