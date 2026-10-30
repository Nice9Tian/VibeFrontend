#include "business/animeanbusiness.h"

#include "algorithm/animemodel.h"
#include "algorithm/scenehistory.h"

#include <QCoreApplication>
#include <QDir>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QTemporaryDir>
#include <QVariant>

#ifdef ANIMEAN_WITH_PYTHON
#ifdef slots
#undef slots
#define ANIMEAN_RESTORE_QT_SLOTS
#endif
#include <pybind11/embed.h>
#ifdef ANIMEAN_RESTORE_QT_SLOTS
#define slots Q_SLOTS
#undef ANIMEAN_RESTORE_QT_SLOTS
#endif
#include "pythonbind/python_bindings.h"
namespace py = pybind11;
#endif

#include <cstdio>
#include <cstdlib>
#include <string>

#define CHECK(cond)                                                                     \
    do {                                                                                \
        if (!(cond)) {                                                                  \
            std::fprintf(stderr, "FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond);        \
            std::exit(1);                                                               \
        }                                                                               \
    } while (false)

namespace {

void testPaintViewProvisionAndStatus()
{
    AnimeanBusiness biz;

    // 1. PaintView 对象与适配器绑定
    CHECK(biz.mainPaintViewObject() != nullptr);
    CHECK(biz.childPaintViewObject() != nullptr);
    CHECK(biz.activeViewName() == QStringLiteral("main"));
    CHECK(biz.activePaintViewObject() == biz.mainPaintViewObject());
    CHECK(biz.property("mainPaintViewObject").value<QObject *>() == biz.mainPaintViewObject());
    CHECK(biz.property("childPaintViewObject").value<QObject *>() == biz.childPaintViewObject());

    QObject dummyMainView;
    dummyMainView.setObjectName(QStringLiteral("DummyMainGL"));
    int repaints = 0;
    int thumbCalls = 0;
    AnimePaintViewAdapter adapter;
    adapter.viewObject = &dummyMainView;
    adapter.requestUpdate = [&repaints]() { ++repaints; };
    adapter.renderFrameThumbnail = [&thumbCalls](int frame, const QSize &size) {
        ++thumbCalls;
        QImage img(size, QImage::Format_ARGB32_Premultiplied);
        img.fill(QColor(frame * 10, 20, 30));
        return img;
    };
    biz.bindPaintView(QStringLiteral("main"), adapter);
    CHECK(biz.mainPaintViewObject() == &dummyMainView);

    const QImage thumb = biz.renderFrameThumbnail(0, QSize(32, 24));
    CHECK(thumbCalls == 1);
    CHECK(thumb.size() == QSize(32, 24));

    biz.unbindPaintView(QStringLiteral("main"));
    CHECK(biz.mainPaintViewObject() != &dummyMainView);
    CHECK(biz.mainPaintViewObject() != nullptr);

    // 2. 状态栏消息与属性信号
    QStringList statusLog;
    QObject::connect(&biz, &AnimeanBusiness::statusMessageChanged, &biz,
                     [&statusLog](const QString &msg) { statusLog.append(msg); });
    biz.setStatusMessage(QStringLiteral("Hello Headless"));
    CHECK(biz.statusMessage() == QStringLiteral("Hello Headless"));
    CHECK(biz.property("statusMessage").toString() == QStringLiteral("Hello Headless"));
    CHECK(statusLog.size() == 1);
    CHECK(statusLog.first() == QStringLiteral("Hello Headless"));

    // 切换当前画布视图
    int surfaceTextureCount = 0;
    QObject::connect(&biz, &AnimeanBusiness::requestSurfaceTextureView, &biz,
                     [&surfaceTextureCount]() { ++surfaceTextureCount; });
    biz.setActiveViewName(QStringLiteral("child"));
    CHECK(biz.activeViewName() == QStringLiteral("child"));
    CHECK(biz.activePaintViewObject() == biz.childPaintViewObject());
    biz.setActiveViewName(QStringLiteral("main"));
    CHECK(biz.activeViewName() == QStringLiteral("main"));
}

void testLayersAndAssetsAndHistory()
{
    AnimeanBusiness biz;

    // AnimeSceneModel 默认初始化包含 2 帧、2 图层、0 资产
    CHECK(biz.frameCount() == 2);
    CHECK(biz.layerCount() == 2);
    CHECK(biz.assetCount() == 0);
    CHECK(!biz.canUndo());
    CHECK(!biz.canRedo());

    // 新建图层
    const int layer2 = biz.addLayer(QStringLiteral("main"));
    CHECK(layer2 == 2);
    CHECK(biz.layerCount() == 3);
    CHECK(biz.currentLayer() == 2);
    CHECK(biz.canUndo());

    // 显隐图层
    CHECK(biz.isLayerVisible(2));
    biz.setLayerVisible(2, false);
    CHECK(!biz.isLayerVisible(2));
    biz.setLayerVisible(2, true);
    CHECK(biz.isLayerVisible(2));

    // 图层面板行结构查询（仅展示当前帧已绑定资产的非内部图层）
    QVector<AnimeLayerPanelRow> rows = biz.layerRowsForView(QStringLiteral("main"));
    CHECK(rows.size() == 1);
    CHECK(rows.first().layerIndex == layer2);

    // 移动图层顺序
    const int id0Before = biz.modelForView(QStringLiteral("main")).layerIdAt(0);
    const int id1Before = biz.modelForView(QStringLiteral("main")).layerIdAt(1);
    CHECK(biz.moveLayer(0, 1, QStringLiteral("main")));
    CHECK(biz.modelForView(QStringLiteral("main")).layerIdAt(0) == id1Before);
    CHECK(biz.modelForView(QStringLiteral("main")).layerIdAt(1) == id0Before);

    // 取消选中与重新选中图层（仅当该图层在当前帧绑定了资产时可被选中）
    biz.unselectLayer(QStringLiteral("main"));
    CHECK(biz.currentLayer() == -1);
    biz.selectLayer(layer2, QStringLiteral("main"));
    CHECK(biz.currentLayer() == layer2);

    // 资产操作：新增资产、从资产创建图层、取消选中资产
    const int newAsset = biz.addAsset();
    CHECK(newAsset >= 0);
    CHECK(biz.currentAsset() == newAsset);
    CHECK(biz.visibleAssetNames().size() == biz.assetCount());

    const int assetLayer = biz.addLayerForAsset(newAsset, QStringLiteral("main"));
    CHECK(assetLayer >= 0);
    CHECK(biz.layerCount() == 4);
    CHECK(biz.currentLayer() == assetLayer);

    biz.unselectAsset();
    CHECK(biz.currentAsset() == -1);
    biz.selectAsset(newAsset);
    CHECK(biz.currentAsset() == newAsset);

    // 删除图层
    CHECK(biz.deleteLayer(assetLayer, QStringLiteral("main")));
    CHECK(biz.layerCount() == 3);

    // 图层分组、折叠与解组/删组
    AnimeSceneModel &mainModel = biz.modelForView(QStringLiteral("main"));
    const int gId = mainModel.createLayerGroup(
        QStringLiteral("Group A"),
        {0, 1},
        {});
    CHECK(gId > 0);
    biz.setLayerGroupCollapsed(gId, true, QStringLiteral("main"));
    CHECK(mainModel.layerGroupCollapsed(gId));
    CHECK(biz.dissolveLayerGroup(gId, QStringLiteral("main")));

    // 跨视图按时间序撤销/重做与全局重做尾清除
    biz.addLayer(QStringLiteral("child"));
    CHECK(biz.layerCount(QStringLiteral("child")) == 3);
    CHECK(biz.undoTargetViewName() == QStringLiteral("child"));

    // Undo 应先撤销最近在 child 上的提交
    CHECK(biz.undo());
    CHECK(biz.layerCount(QStringLiteral("child")) == 2);
    CHECK(biz.canRedo());
    CHECK(biz.redoTargetViewName() == QStringLiteral("child"));

    // Redo 恢复 child 上的提交
    CHECK(biz.redo());
    CHECK(biz.layerCount(QStringLiteral("child")) == 3);

    // 再 Undo 一次，此时 child 有 redo 尾；在 main 上做新提交应清空 child 的 redo 尾
    CHECK(biz.undo());
    CHECK(biz.canRedo());
    biz.setActiveViewName(QStringLiteral("main"));
    biz.commitHistory(QStringLiteral("Main Edit"), QStringLiteral("main"));
    CHECK(!biz.canRedo());

    // 历史跳转 goToHistory
    const int histCount = biz.historyLabels(QStringLiteral("main")).size();
    CHECK(histCount >= 2);
    CHECK(biz.goToHistory(0, QStringLiteral("main")));
    CHECK(biz.currentHistoryIndex(QStringLiteral("main")) == 0);
    CHECK(biz.layerCount(QStringLiteral("main")) == 2);
}

void testToolsAndToolOptions()
{
    AnimeanBusiness biz;

    int toolOptionsSignals = 0;
    QObject::connect(&biz, &AnimeanBusiness::toolOptionsLayoutChanged, &biz,
                     [&toolOptionsSignals](const QJsonObject &, int, bool) { ++toolOptionsSignals; });

    // 默认工具为 Pen
    CHECK(biz.currentTool() == int(AnimeanBusiness::Tool::Pen));
    const QString penJsonText = biz.optionsForToolJson(AnimeanBusiness::Tool::Pen);
    CHECK(!penJsonText.isEmpty());
    const QJsonObject penOptions = biz.toolOptionsLayout(AnimeanBusiness::Tool::Pen);
    CHECK(!penOptions.isEmpty());
    CHECK(penOptions.contains(QStringLiteral("controls")));

    // 切换到 Fill 工具并检查工具选项 JSON
    CHECK(biz.applyTool(int(AnimeanBusiness::Tool::Fill), true));
    CHECK(biz.currentTool() == int(AnimeanBusiness::Tool::Fill));
    CHECK(toolOptionsSignals >= 1);
    const QJsonObject fillOptions = biz.toolOptionsLayout(AnimeanBusiness::Tool::Fill);
    CHECK(!fillOptions.isEmpty());
    CHECK(fillOptions.contains(QStringLiteral("controls")));

    // 颜色选择：在 Fill 下选色保持 Fill；在其它工具下选色切回 Pen
    biz.selectColor(QColor(255, 64, 32));
    CHECK(biz.currentTool() == int(AnimeanBusiness::Tool::Fill));
    CHECK(biz.drawingColor() == QColor(255, 64, 32));

    CHECK(biz.applyTool(int(AnimeanBusiness::Tool::Arrow), true));
    biz.selectColor(QColor(10, 20, 30));
    CHECK(biz.currentTool() == int(AnimeanBusiness::Tool::Pen));
    CHECK(biz.drawingColor() == QColor(10, 20, 30));

    // 笔宽、平滑度、填充范围
    biz.setPenWidth(12);
    CHECK(biz.toolPenWidth() == 12);
    biz.setSmoothValue(65);
    CHECK(biz.toolSmoothValue() == 65);
    biz.setFillScope(int(AnimeanBusiness::FillScope::AllLayers));
    CHECK(biz.toolFillScope() == AnimeanBusiness::FillScope::AllLayers);
    CHECK(biz.toolFillAllLayers());

    // 工具锁定策略：锁定 Pen 和 Fill 时应自动退回 Arrow，且拒绝切回 Pen
    CHECK(biz.applyTool(int(AnimeanBusiness::Tool::Pen), true));
    biz.applyLockedTools(QStringLiteral("main"), {QStringLiteral("pen"), QStringLiteral("fill")});
    CHECK(biz.isToolLocked(int(AnimeanBusiness::Tool::Pen)));
    CHECK(!biz.isToolLocked(int(AnimeanBusiness::Tool::Arrow)));
    CHECK(biz.currentTool() == int(AnimeanBusiness::Tool::Arrow));

    CHECK(!biz.applyTool(int(AnimeanBusiness::Tool::Pen), true));
    CHECK(biz.currentTool() == int(AnimeanBusiness::Tool::Arrow));

    // 解除锁定后可再次选中 Pen
    biz.applyLockedTools(QStringLiteral("main"), {});
    CHECK(biz.applyTool(int(AnimeanBusiness::Tool::Pen), true));
    CHECK(biz.currentTool() == int(AnimeanBusiness::Tool::Pen));

    // 扩展工具、工具选项消息与 ForcePad 事件转发（适配器分支）
    QString lastExtraName;
    QString lastOptName;
    QString lastPadPhase;
    AnimePaintViewAdapter adapter;
    adapter.sendExtraToolMessage = [&lastExtraName](const QString &name, const QString &) {
        lastExtraName = name;
    };
    adapter.sendToolOptionMessage = [&lastOptName](const QString &, const QString &name,
                                                   const QString &, const QVariant &,
                                                   int, int, int) {
        lastOptName = name;
    };
    adapter.sendPadMessage = [&lastPadPhase](const QString &, const QString &phase,
                                             double, double) {
        lastPadPhase = phase;
    };
    biz.bindPaintView(QStringLiteral("main"), adapter);

    AnimeExtraToolDefinition extra;
    extra.name = QStringLiteral("auto_mapping");
    extra.baseTool = QStringLiteral("arrow");
    extra.property = QStringLiteral("guide_h");
    biz.selectExtraTool(extra);
    CHECK(biz.activeExtraTool() == QStringLiteral("auto_mapping"));
    CHECK(biz.currentTool() == int(AnimeanBusiness::Tool::Arrow));
    CHECK(lastExtraName == QStringLiteral("auto_mapping"));

    biz.sendToolOption(QStringLiteral("draw"), QStringLiteral("width"),
                       QStringLiteral("slider"), 8, 0, 0, 1);
    CHECK(lastOptName == QStringLiteral("width"));

    biz.sendPadEvent(QStringLiteral("force_pad"), QStringLiteral("press"), 0.5, -0.25);
    CHECK(lastPadPhase == QStringLiteral("press"));

    biz.unbindPaintView(QStringLiteral("main"));
}

void testTimelinePlaybackAndOnion()
{
    AnimeanBusiness biz;

    // 帧增删改移与前后翻帧（初始 2 帧）
    CHECK(biz.frameCount() == 2);
    const int f2 = biz.addFrame();
    CHECK(f2 == 2);
    CHECK(biz.frameCount() == 3);
    CHECK(biz.currentFrame() == 2);

    // 需先在帧 0 上创建带资产的图层，以便 insertHoldFrameAfter / duplicateFrame 复制非空单元
    biz.selectFrame(0);
    const int drawnLayer = biz.addLayer(QStringLiteral("main"));
    CHECK(drawnLayer >= 0);

    const int holdIdx = biz.addHoldFrame();
    CHECK(holdIdx == 1);
    CHECK(biz.frameCount() == 4);
    CHECK(biz.modelForView(QStringLiteral("main")).isHoldFrame(1));

    const int dupIdx = biz.duplicateFrame();
    CHECK(dupIdx >= 0);
    CHECK(biz.frameCount() == 5);

    biz.selectFrame(2);
    biz.previousFrame();
    CHECK(biz.currentFrame() == 1);
    biz.nextFrame();
    CHECK(biz.currentFrame() == 2);

    biz.selectFrame(0);
    CHECK(biz.currentFrame() == 0);

    CHECK(biz.moveFrame(0, 2));
    CHECK(biz.currentFrame() == 2);

    CHECK(biz.deleteFrame());
    CHECK(biz.frameCount() == 4);
    CHECK(biz.deleteFrame());
    CHECK(biz.frameCount() == 3);

    // FPS 与洋葱皮
    biz.setFps(12);
    CHECK(biz.playbackFps() == 12);

    biz.selectFrame(1);
    biz.setOnionEnabled(true);
    CHECK(biz.isOnionEnabled());
    // 开启洋葱皮且集合为空时，自动加入前后相邻帧 (0 与 2)
    CHECK(biz.onionFrames().contains(0));
    CHECK(biz.onionFrames().contains(2));

    biz.setOnionLines(false);
    CHECK(!biz.isOnionLines());
    biz.setOnionFills(false);
    CHECK(!biz.isOnionFills());
    biz.setOnionAmLayers(true);
    CHECK(biz.isOnionAmLayers());
    biz.setOnionGuideLines(true);
    CHECK(biz.isOnionGuideLines());
    biz.toggleOnionFrame(0, false);
    CHECK(!biz.onionFrames().contains(0));

    const AnimeTimelineState state = biz.timelineState();
    CHECK(state.frameCount == 3);
    CHECK(state.fps == 12);
    CHECK(state.onionAvailable);
    CHECK(state.onionEnabled);

    // 播放控制（不循环时播到最后一帧后再次步进自动停止）
    biz.selectFrame(0);
    biz.setPlaybackLoop(false);
    CHECK(!biz.isPlaybackLoop());
    biz.startPlayback();
    CHECK(biz.isPlaybackActive());
    biz.advancePlaybackFrame(); // -> frame 1
    CHECK(biz.isPlaybackActive());
    biz.advancePlaybackFrame(); // -> frame 2 (last frame)
    CHECK(biz.isPlaybackActive());
    biz.advancePlaybackFrame(); // non-loop stops at last frame
    CHECK(!biz.isPlaybackActive());
    CHECK(biz.currentFrame() == 2);
}

void testProjectNewOpenSave()
{
    QTemporaryDir tempDir;
    CHECK(tempDir.isValid());

    AnimeanBusiness biz;
    biz.newProject(QSize(800, 600));
    CHECK(biz.canvasSize() == QSize(800, 600));

    biz.addFrame();
    biz.addLayer(QStringLiteral("main"));
    biz.setFps(15);

    const QString projPath = QDir(tempDir.path()).filePath(QStringLiteral("sample_scene"));
    QString error;
    CHECK(biz.saveProjectTo(projPath, &error));
    CHECK(error.isEmpty());
    CHECK(QFileInfo::exists(biz.currentFilePath()));
    CHECK(biz.windowTitle().contains(QStringLiteral("sample_scene.anproj")));

    const QString texPath = QDir(tempDir.path()).filePath(QStringLiteral("sample_tex"));
    CHECK(biz.saveTextureViewTo(texPath, &error));
    CHECK(error.isEmpty());
    CHECK(QFileInfo::exists(biz.childFilePath()));
    CHECK(biz.windowTitle().contains(QStringLiteral("[texture: sample_tex.textureview]")));

    // 用新实例加载刚保存的工程和纹理视图
    AnimeanBusiness loadedBiz;
    CHECK(loadedBiz.loadProjectFrom(biz.currentFilePath(), &error));
    CHECK(error.isEmpty());
    CHECK(loadedBiz.canvasSize() == QSize(800, 600));
    CHECK(loadedBiz.frameCount(QStringLiteral("main")) == 3);
    CHECK(loadedBiz.layerCount(QStringLiteral("main")) == 3);
    CHECK(loadedBiz.playbackFps() == 15);

    CHECK(loadedBiz.openTextureViewFrom(biz.childFilePath(), &error));
    CHECK(error.isEmpty());
    CHECK(loadedBiz.childFilePath() == biz.childFilePath());
}

#ifdef ANIMEAN_WITH_PYTHON

// 发现 7：初始化真实 Python 运行时，覆盖 Python 业务联动分支（而非仅测 C++ 桩）
void testRealPythonIntegration()
{
    CHECK(Py_IsInitialized());

    AnimeanBusiness biz;
    QStringList debugMessages;
    QObject::connect(&biz, &AnimeanBusiness::pythonDebugMessage, &biz,
                     [&debugMessages](const QString &msg) { debugMessages.append(msg); });

    QString initOutput;
    const QString returnedOutput = biz.runPythonInitializationScript(&initOutput);
    CHECK(returnedOutput == initOutput);
    CHECK(!initOutput.contains(QStringLiteral("Traceback")));
    CHECK(initOutput.contains(QStringLiteral("[OK] import toolcontrol")));
    CHECK(initOutput.contains(QStringLiteral("[OK] import extra_tools")));
    CHECK(initOutput.contains(QStringLiteral("[OK] import layer_tool_policy")));
    CHECK(initOutput.contains(QStringLiteral("[OK] import visibility_tool")));
    CHECK(!debugMessages.isEmpty());

    // 1. 验证 __main__ 全局变量与 animean_python.get_current() / get_scene()
    {
        py::gil_scoped_acquire acquire;
        py::module_ mainMod = py::module_::import("__main__");
        CHECK(py::hasattr(mainMod, "model"));
        CHECK(py::hasattr(mainMod, "main_model"));
        CHECK(py::hasattr(mainMod, "child_model"));
        CHECK(mainMod.attr("active_view").cast<std::string>() == "main");
        CHECK(mainMod.attr("canvas_width").cast<int>() == biz.canvasSize(QStringLiteral("main")).width());
        CHECK(mainMod.attr("canvas_height").cast<int>() == biz.canvasSize(QStringLiteral("main")).height());

        py::module_ ap = py::module_::import("animean_python");
        py::dict cur = ap.attr("get_current")().cast<py::dict>();
        CHECK(cur["sceneName"].cast<std::string>() == "main_paint_view");
    }

    // 2. 验证真实 toolcontrol.options_for_tool_json(tool, state) 路径
    biz.setPenWidth(19);
    biz.setSmoothValue(73);
    const QString penJsonStr = biz.optionsForToolJson(AnimeanBusiness::Tool::Pen);
    CHECK(!penJsonStr.isEmpty());
    {
        py::gil_scoped_acquire acquire;
        py::module_ tc = py::module_::import("toolcontrol");
        py::dict state;
        state["smooth"] = 73;
        state["pen_width"] = 19;
        state["fill_scope"] = 0;
        const std::string directJson = tc.attr("options_for_tool_json")("pen", state).cast<std::string>();
        CHECK(QString::fromUtf8(directJson.c_str()) == penJsonStr);
    }

    // 3. 验证真实 extra_tools.tools_json()、options_for_extra_tool_json() 与 run_tool_handler()
    const QVector<AnimeExtraToolDefinition> extras = biz.loadExtraTools();
    CHECK(!extras.isEmpty());
    const AnimeExtraToolDefinition firstExtra = extras.first();
    CHECK(!firstExtra.name.isEmpty());
    const QString extraJson = biz.optionsForExtraToolJson(firstExtra.name);
    CHECK(!extraJson.isEmpty());

    // 选中真实扩展工具（触发 extra_tools.run_tool_handler 与 options_for_extra_tool_json）
    biz.selectExtraTool(firstExtra);
    CHECK(biz.activeExtraTool() == firstExtra.name);

    // 4. 验证 pullOnionPolicy() 从真实 Python 模块读取排除属性与标签
    biz.pullOnionPolicy();
    CHECK(!biz.onionLayerTag().isEmpty());
    CHECK(!biz.onionExcludeProperties().isEmpty());

    // 5. 验证无界面下真实 Python 钩子派发（无需绑定任何 AnimePaintViewAdapter）
    const QString hookSetupOut = biz.runEmbeddedPythonCommand(QStringLiteral(
        "import python_hooks\n"
        "_headless_hook_types = []\n"
        "def _headless_cb(msg):\n"
        "    _headless_hook_types.append(msg.get('event', ''))\n"
        "python_hooks.set_hook(_headless_cb,\n"
        "    framechange=True, layerchange=True, historyrestore=True,\n"
        "    handle=True, extra=True, option=True, pad=True, visibility=True)\n"));
    CHECK(!hookSetupOut.contains(QStringLiteral("Traceback")));

    biz.selectFrame(1);
    const int l2 = biz.addLayer(QStringLiteral("main"));
    biz.unselectLayer(QStringLiteral("main"));
    biz.selectLayer(l2, QStringLiteral("main"));
    CHECK(biz.undo());
    CHECK(biz.redo());
    biz.selectExtraTool(firstExtra);
    biz.sendToolOption(QStringLiteral("draw"), QStringLiteral("width"),
                       QStringLiteral("slider"), 10, 0, 0, 1);
    biz.sendPadEvent(QStringLiteral("force_pad"), QStringLiteral("press"), 0.25, 0.75);
    // setLayerVisible 走真实 visibility_tool.py 钩子并修改模型可见性
    biz.setLayerVisible(l2, false, QStringLiteral("main"));
    CHECK(!biz.isLayerVisible(l2, QStringLiteral("main")));

    {
        py::gil_scoped_acquire acquire;
        py::list ev = py::module_::import("__main__").attr("_headless_hook_types").cast<py::list>();
        QStringList types;
        for (py::handle h : ev) {
            types.append(QString::fromStdString(h.cast<std::string>()));
        }
        CHECK(types.contains(QStringLiteral("framechange")));
        CHECK(types.contains(QStringLiteral("layerchange")));
        CHECK(types.contains(QStringLiteral("handle")));
        CHECK(types.contains(QStringLiteral("historyrestore")));
        CHECK(types.contains(QStringLiteral("extra")));
        CHECK(types.contains(QStringLiteral("option")));
        CHECK(types.contains(QStringLiteral("pad")));
        CHECK(types.contains(QStringLiteral("visibility")));
    }
    biz.runEmbeddedPythonCommand(QStringLiteral("python_hooks.del_hook(_headless_cb)\n"));
}

// 回归测试 1（对应审核发现 1）：
// ui.set_locked_tools（含 layer_tool_policy.py 联动）触发 toolLockStateChanged，
// 当前工具被锁定时自动回退到 Arrow 并发出 toolChanged 与 toolOptionsLayoutChanged；
// 切换视图 setActiveViewName 时同样同步锁定状态并按需回退 Arrow。
void testRegression1ToolLockAndFallbackSync()
{
    AnimeanBusiness biz;
    CHECK(biz.applyTool(int(AnimeanBusiness::Tool::Pen), true));
    CHECK(biz.currentTool() == int(AnimeanBusiness::Tool::Pen));

    int lockSignals = 0;
    QVector<QPair<int, QString>> toolChanges;
    QVector<int> layoutToolUpdates;
    QObject::connect(&biz, &AnimeanBusiness::toolLockStateChanged, &biz, [&]() { ++lockSignals; });
    QObject::connect(&biz, &AnimeanBusiness::toolChanged, &biz,
                     [&](int tool, const QString &extra) { toolChanges.append({tool, extra}); });
    QObject::connect(&biz, &AnimeanBusiness::toolOptionsLayoutChanged, &biz,
                     [&](const QJsonObject &, int tool, bool isExtra) {
                         if (!isExtra) {
                             layoutToolUpdates.append(tool);
                         }
                     });

    // 通过真实 Python 调用 animean_python.ui.set_locked_tools("main", ["pen", "eraser", "connect", "transfer"])
    const QString out = biz.runEmbeddedPythonCommand(QStringLiteral(
        "import animean_python\n"
        "animean_python.ui.set_locked_tools('main', ['pen', 'eraser', 'connect', 'transfer'])\n"));
    CHECK(!out.contains(QStringLiteral("Traceback")));

    CHECK(lockSignals == 1);
    CHECK(biz.isToolLocked(int(AnimeanBusiness::Tool::Pen)));
    CHECK(biz.isToolLocked(int(AnimeanBusiness::Tool::Eraser)));
    CHECK(biz.isToolLocked(int(AnimeanBusiness::Tool::Connect)));
    CHECK(biz.isToolLocked(int(AnimeanBusiness::Tool::Transfer)));
    CHECK(!biz.isToolLocked(int(AnimeanBusiness::Tool::Arrow)));
    CHECK(!biz.isToolLocked(int(AnimeanBusiness::Tool::Fill)));
    CHECK(biz.currentTool() == int(AnimeanBusiness::Tool::Arrow));
    CHECK(!toolChanges.isEmpty());
    CHECK(toolChanges.last().first == int(AnimeanBusiness::Tool::Arrow));
    CHECK(toolChanges.last().second.isEmpty());
    CHECK(!layoutToolUpdates.isEmpty());
    CHECK(layoutToolUpdates.last() == int(AnimeanBusiness::Tool::Arrow));

    // 切换到 child 视图（child 未锁定 Pen），先切到 Pen，再切回 main 视图时应自动回退 Arrow 并发出信号
    biz.setActiveViewName(QStringLiteral("child"));
    CHECK(lockSignals == 2);
    CHECK(!biz.isToolLocked(int(AnimeanBusiness::Tool::Pen)));
    CHECK(biz.applyTool(int(AnimeanBusiness::Tool::Pen), true));
    CHECK(biz.currentTool() == int(AnimeanBusiness::Tool::Pen));

    toolChanges.clear();
    biz.setActiveViewName(QStringLiteral("main"));
    CHECK(lockSignals == 3);
    CHECK(biz.currentTool() == int(AnimeanBusiness::Tool::Arrow));
    CHECK(!toolChanges.isEmpty());
    CHECK(toolChanges.last().first == int(AnimeanBusiness::Tool::Arrow));

    // 解除锁定
    biz.runEmbeddedPythonCommand(QStringLiteral(
        "import animean_python\n"
        "animean_python.ui.set_locked_tools('main', [])\n"));
    CHECK(!biz.isToolLocked(int(AnimeanBusiness::Tool::Pen)));
}

// 回归测试 2（对应审核发现 2）：
// 切换激活视图 setActiveViewName 时必须调用 registerAnimeanUiScene(&modelForView(target))，
// 使 Python 的 animean_python.get_current()、animemodel.current 与 ui.set_current() 指向切换后的视图。
void testRegression2ActiveViewRegistersCurrentPythonScene()
{
    AnimeanBusiness biz;

    const int mainLayer = biz.addLayer(QStringLiteral("main"));
    const int childLayer0 = biz.addLayer(QStringLiteral("child"));
    const int childLayer1 = biz.addLayer(QStringLiteral("child"));
    CHECK(mainLayer >= 0 && childLayer0 >= 0 && childLayer1 >= 0);

    // 初始激活视图为 main
    {
        py::gil_scoped_acquire acquire;
        py::dict cur = py::module_::import("animean_python").attr("get_current")().cast<py::dict>();
        CHECK(cur["sceneName"].cast<std::string>() == "main_paint_view");
    }

    // 切换到 child 视图
    biz.setActiveViewName(QStringLiteral("child"));
    CHECK(biz.activeViewName() == QStringLiteral("child"));
    {
        py::gil_scoped_acquire acquire;
        py::dict cur = py::module_::import("animean_python").attr("get_current")().cast<py::dict>();
        CHECK(cur["sceneName"].cast<std::string>() == "child_paint_view");
    }

    // 在 child 激活时通过 Python animean_python.ui.set_current(layer=childLayer0) 修改当前层，
    // 必须作用在 child 视图而非 main 视图
    const int mainLayerBefore = biz.currentLayer(QStringLiteral("main"));
    const QString cmdOut = biz.runEmbeddedPythonCommand(
        QStringLiteral("import animean_python\nanimean_python.ui.set_current(layer=%1)\n").arg(childLayer0));
    CHECK(!cmdOut.contains(QStringLiteral("Traceback")));
    CHECK(biz.currentLayer(QStringLiteral("child")) == childLayer0);
    CHECK(biz.currentLayer(QStringLiteral("main")) == mainLayerBefore);

    // 切回 main 视图后，get_current() 恢复为 main_paint_view
    biz.setActiveViewName(QStringLiteral("main"));
    {
        py::gil_scoped_acquire acquire;
        py::dict cur = py::module_::import("animean_python").attr("get_current")().cast<py::dict>();
        CHECK(cur["sceneName"].cast<std::string>() == "main_paint_view");
    }
}

// 回归测试 3（对应审核发现 3）：
// 播放期间 advancePlaybackFrame() 发出带当前播放帧号的 playbackStateChanged(true, frameIndex, viewName)，
// timelineState().currentFrame 随播放推进，且播放期间不触发 Python framechange 钩子（停止播放才落帧）。
void testRegression3PlaybackAdvancesFrameIndexAndTimelineState()
{
    AnimeanBusiness biz;
    biz.addFrame(); // 共 3 帧 (0, 1, 2)
    biz.selectFrame(0);
    biz.setPlaybackLoop(false);

    struct PlaybackEvent {
        bool active = false;
        int frame = -1;
        QString view;
    };
    QVector<PlaybackEvent> playbackEvents;
    QObject::connect(&biz, &AnimeanBusiness::playbackStateChanged, &biz,
                     [&playbackEvents](bool active, int frameIndex, const QString &viewName) {
                         playbackEvents.append({active, frameIndex, viewName});
                     });

    biz.runEmbeddedPythonCommand(QStringLiteral(
        "import python_hooks\n"
        "_reg3_frame_hooks = []\n"
        "def _reg3_fc(msg):\n"
        "    _reg3_frame_hooks.append(msg.get('cell', {}).get('row', -1))\n"
        "python_hooks.set_hook(_reg3_fc, framechange=True)\n"));

    biz.startPlayback();
    CHECK(playbackEvents.size() == 1);
    CHECK(playbackEvents.last().active == true);
    CHECK(playbackEvents.last().frame == 0);
    CHECK(playbackEvents.last().view == QStringLiteral("main"));
    CHECK(biz.timelineState().currentFrame == 0);

    // 第 1 次 tick -> frame 1
    biz.advancePlaybackFrame();
    CHECK(playbackEvents.size() == 2);
    CHECK(playbackEvents.last().active == true);
    CHECK(playbackEvents.last().frame == 1);
    CHECK(biz.timelineState().currentFrame == 1);
    // 播放中不改动模型 currentFrame，因此不触发 framechange 钩子
    {
        py::gil_scoped_acquire acquire;
        py::list fc = py::module_::import("__main__").attr("_reg3_frame_hooks").cast<py::list>();
        CHECK(fc.size() == 0);
    }

    // 第 2 次 tick -> frame 2
    biz.advancePlaybackFrame();
    CHECK(playbackEvents.size() == 3);
    CHECK(playbackEvents.last().active == true);
    CHECK(playbackEvents.last().frame == 2);
    CHECK(biz.timelineState().currentFrame == 2);

    // 非循环模式下再次 tick 自动停止播放并落帧到 2，触发 1 次 framechange
    biz.advancePlaybackFrame();
    CHECK(playbackEvents.size() == 4);
    CHECK(playbackEvents.last().active == false);
    CHECK(playbackEvents.last().frame == 2);
    CHECK(biz.currentFrame() == 2);
    {
        py::gil_scoped_acquire acquire;
        py::list fc = py::module_::import("__main__").attr("_reg3_frame_hooks").cast<py::list>();
        CHECK(fc.size() == 1);
        CHECK(fc[0].cast<int>() == 2);
    }

    biz.runEmbeddedPythonCommand(QStringLiteral("python_hooks.del_hook(_reg3_fc)\n"));
}

// 回归测试 4（对应审核发现 4）：
// 切换激活视图与常规业务操作只通过信号触发 1 次刷新，无重复发射。
void testRegression4NoDuplicateSignalsOnViewSwitchAndEdits()
{
    AnimeanBusiness biz;

    int statusCount = 0;
    int titleCount = 0;
    int surfaceTexCount = 0;
    int autoFitCount = 0;
    int clearThumbsCount = 0;
    int timelineCount = 0;
    int mainLayersCount = 0;
    int childLayersCount = 0;
    int assetsCount = 0;
    int historyCount = 0;
    int lockCount = 0;

    QObject::connect(&biz, &AnimeanBusiness::statusMessageChanged, &biz, [&](const QString &) { ++statusCount; });
    QObject::connect(&biz, &AnimeanBusiness::windowTitleChanged, &biz, [&](const QString &) { ++titleCount; });
    QObject::connect(&biz, &AnimeanBusiness::requestSurfaceTextureView, &biz, [&]() { ++surfaceTexCount; });
    QObject::connect(&biz, &AnimeanBusiness::requestAutoFitTextureControlView, &biz, [&]() { ++autoFitCount; });
    QObject::connect(&biz, &AnimeanBusiness::requestClearTimelineThumbnails, &biz, [&]() { ++clearThumbsCount; });
    QObject::connect(&biz, &AnimeanBusiness::timelineChanged, &biz, [&]() { ++timelineCount; });
    QObject::connect(&biz, &AnimeanBusiness::layersChanged, &biz, [&](const QString &v, int) {
        if (v == QStringLiteral("main")) {
            ++mainLayersCount;
        } else if (v == QStringLiteral("child")) {
            ++childLayersCount;
        }
    });
    QObject::connect(&biz, &AnimeanBusiness::assetsChanged, &biz, [&](const QString &, int) { ++assetsCount; });
    QObject::connect(&biz, &AnimeanBusiness::historyChanged, &biz, [&]() { ++historyCount; });
    QObject::connect(&biz, &AnimeanBusiness::toolLockStateChanged, &biz, [&]() { ++lockCount; });

    // setActiveViewName("child") 每个关联信号精确触发 1 次
    biz.setActiveViewName(QStringLiteral("child"));
    CHECK(statusCount == 1);
    CHECK(clearThumbsCount == 1);
    CHECK(timelineCount == 1);
    CHECK(childLayersCount == 1);
    CHECK(assetsCount == 1);
    CHECK(historyCount == 1);
    CHECK(lockCount == 1);

    // selectFrame(1) 在 child 上精确触发 1 次 timelineChanged 和 1 次 childLayersCount
    statusCount = clearThumbsCount = timelineCount = childLayersCount = assetsCount = historyCount = lockCount = 0;
    biz.setChangeableTimeline(true);
    timelineCount = clearThumbsCount = 0;
    biz.selectFrame(1);
    CHECK(timelineCount == 1);
    CHECK(childLayersCount == 1);
}

// 回归测试 5（对应审核发现 5）：
// 扩展工具激活期间，调用 refreshToolOptions()、setDrawSettings() 或 applyNewCanvasSize()
// 必须刷新当前扩展工具布局，绝不能用基础工具（如 Arrow）布局覆盖扩展工具选项面板。
void testRegression5ExtraToolOptionsPreservedOnRefreshAndDrawSettings()
{
    AnimeanBusiness biz;
    const QVector<AnimeExtraToolDefinition> extras = biz.loadExtraTools();
    CHECK(!extras.isEmpty());

    // 选取 baseTool 为 arrow 的扩展工具（如 auto_mapping_2）
    AnimeExtraToolDefinition targetExtra = extras.first();
    for (const AnimeExtraToolDefinition &item : extras) {
        if (item.baseTool == QStringLiteral("arrow")) {
            targetExtra = item;
            break;
        }
    }

    biz.selectExtraTool(targetExtra);
    CHECK(biz.activeExtraTool() == targetExtra.name);
    CHECK(biz.currentTool() == int(AnimeanBusiness::Tool::Arrow));

    QVector<QPair<bool, QJsonObject>> emittedLayouts;
    QObject::connect(&biz, &AnimeanBusiness::toolOptionsLayoutChanged, &biz,
                     [&emittedLayouts](const QJsonObject &layout, int, bool isExtraTool) {
                         emittedLayouts.append({isExtraTool, layout});
                     });

    // 1. 直接调用 refreshToolOptions()：应转发到 refreshExtraToolOptions()，isExtraTool 必须为 true
    biz.refreshToolOptions();
    CHECK(emittedLayouts.size() == 1);
    CHECK(emittedLayouts.last().first == true);
    CHECK(biz.activeExtraTool() == targetExtra.name);

    // 2. 通过 Python 调用 ui.set_draw_settings(42, 50, 50)：仍保持扩展工具选项布局
    emittedLayouts.clear();
    biz.runEmbeddedPythonCommand(QStringLiteral(
        "import animean_python\n"
        "animean_python.ui.set_draw_settings(42, 50, 50)\n"));
    CHECK(emittedLayouts.size() == 1);
    CHECK(emittedLayouts.last().first == true);
    CHECK(biz.activeExtraTool() == targetExtra.name);

    // 3. 调用 applyNewCanvasSize(QSize(1024, 768))：不会把选项面板重置成内置 Arrow 布局
    emittedLayouts.clear();
    biz.applyNewCanvasSize(QSize(1024, 768));
    for (const auto &entry : emittedLayouts) {
        CHECK(entry.first == true);
    }
    CHECK(biz.activeExtraTool() == targetExtra.name);
}

// 回归测试 6（对应审核发现 6）：
// (a) 切换内置工具只构建 1 次选项布局；
// (b) sendToolOption 修改颜色/橡皮模式只调用 1 次 applyTool、每个视图只派发 1 次 handle(phase="arm")；
// (c) 选中扩展工具 selectExtraTool 时严格保持：setTool/setStrokeProperty(arm) -> extratool 钩子
//     -> toolChanged 信号 -> toolOptionsLayoutChanged(扩展布局) -> extra_tools.run_tool_handler 顺序。
void testRegression6ToolSwitchExtraToolOrderAndSingleOptionApply()
{
    AnimeanBusiness biz;

    int layoutCount = 0;
    QObject::connect(&biz, &AnimeanBusiness::toolOptionsLayoutChanged, &biz,
                     [&layoutCount](const QJsonObject &, int, bool) { ++layoutCount; });

    // (a) 切换内置工具只触发 1 次 toolOptionsLayoutChanged
    CHECK(biz.applyTool(int(AnimeanBusiness::Tool::Fill), true));
    CHECK(layoutCount == 1);

    // (b) sendToolOption 选色或切换橡皮模式时，只向 main 派发 1 次 handle(phase="arm")
    biz.runEmbeddedPythonCommand(QStringLiteral(
        "import python_hooks\n"
        "_reg6_arm_events = []\n"
        "def _reg6_arm(msg):\n"
        "    if msg.get('event') == 'handle' and msg.get('phase') == 'arm' and msg.get('view') == 'main':\n"
        "        _reg6_arm_events.append(msg.get('tool'))\n"
        "python_hooks.set_hook(_reg6_arm, handle=True)\n"));

    biz.sendToolOption(QStringLiteral("eraser_mode"),
                       QStringLiteral("mode"),
                       QStringLiteral("mode"),
                       int(AnimeanBusiness::Tool::DeleteLine),
                       0, 0, 1);
    CHECK(biz.currentTool() == int(AnimeanBusiness::Tool::DeleteLine));
    {
        py::gil_scoped_acquire acquire;
        py::list ev = py::module_::import("__main__").attr("_reg6_arm_events").cast<py::list>();
        CHECK(ev.size() == 1);
    }
    biz.runEmbeddedPythonCommand(QStringLiteral("python_hooks.del_hook(_reg6_arm)\n"));

    // (c) 验证 selectExtraTool 的完整事件与钩子顺序
    QStringList sequenceLog;
    biz.runEmbeddedPythonCommand(QStringLiteral(
        "import python_hooks, extra_tools\n"
        "_reg6_seq = []\n"
        "def _reg6_seq_hook(msg):\n"
        "    t = msg.get('event')\n"
        "    if t == 'handle' and msg.get('view') == 'main' and msg.get('phase') == 'arm':\n"
        "        _reg6_seq.append('hook:arm')\n"
        "    elif t == 'extra':\n"
        "        _reg6_seq.append('hook:extra')\n"
        "python_hooks.set_hook(_reg6_seq_hook, handle=True, extra=True)\n"
        "def _reg6_custom_handler(name, property_value):\n"
        "    _reg6_seq.append(f'handler:{name}')\n"
        "extra_tools._reg6_custom_handler = _reg6_custom_handler\n"));

    QMetaObject::Connection c1 = QObject::connect(
        &biz, &AnimeanBusiness::toolChanged, &biz,
        [&](int, const QString &) {
            biz.runEmbeddedPythonCommand(QStringLiteral("_reg6_seq.append('signal:toolChanged')\n"));
        });
    QMetaObject::Connection c2 = QObject::connect(
        &biz, &AnimeanBusiness::toolOptionsLayoutChanged, &biz,
        [&](const QJsonObject &, int, bool isExtra) {
            if (isExtra) {
                biz.runEmbeddedPythonCommand(QStringLiteral("_reg6_seq.append('signal:toolOptionsLayoutChanged')\n"));
            }
        });

    AnimeExtraToolDefinition customExtra;
    customExtra.name = QStringLiteral("auto_mapping");
    customExtra.baseTool = QStringLiteral("arrow");
    customExtra.property = QStringLiteral("guide_h");
    customExtra.handler = QStringLiteral("extra_tools._reg6_custom_handler");
    biz.selectExtraTool(customExtra);

    QObject::disconnect(c1);
    QObject::disconnect(c2);

    {
        py::gil_scoped_acquire acquire;
        py::list seq = py::module_::import("__main__").attr("_reg6_seq").cast<py::list>();
        for (py::handle h : seq) {
            sequenceLog.append(QString::fromStdString(h.cast<std::string>()));
        }
    }
    biz.runEmbeddedPythonCommand(QStringLiteral("python_hooks.del_hook(_reg6_seq_hook)\n"));

    const int idxArm = sequenceLog.indexOf(QStringLiteral("hook:arm"));
    const int idxExtraHook = sequenceLog.indexOf(QStringLiteral("hook:extra"));
    const int idxToolChanged = sequenceLog.indexOf(QStringLiteral("signal:toolChanged"));
    const int idxLayoutChanged = sequenceLog.indexOf(QStringLiteral("signal:toolOptionsLayoutChanged"));
    const int idxHandler = sequenceLog.indexOf(QStringLiteral("handler:auto_mapping"));

    CHECK(idxArm >= 0);
    CHECK(idxExtraHook > idxArm);
    CHECK(idxToolChanged > idxExtraHook);
    CHECK(idxLayoutChanged > idxToolChanged);
    CHECK(idxHandler > idxLayoutChanged);
}

// 补充验证：图层选中/取消选中、从资产建层/绑定资产、加载工程/打开纹理视图的 Python 钩子顺序与次数
void testPythonHooksForLayersAssetsAndProjectIo()
{
    // 1. selectLayer 与 unselectLayer 的钩子顺序与次数
    {
        AnimeanBusiness biz;
        const int layerA = biz.addLayer(QStringLiteral("main"));
        const int layerB = biz.addLayer(QStringLiteral("main"));
        CHECK(layerA >= 0 && layerB >= 0 && layerA != layerB);

        biz.runEmbeddedPythonCommand(QStringLiteral(
            "import python_hooks\n"
            "_layer_events = []\n"
            "def _layer_hook(msg):\n"
            "    t = msg.get('event', '')\n"
            "    if t == 'handle':\n"
            "        _layer_events.append(f\"handle:{msg.get('phase', '')}:{msg.get('cell', {}).get('layer', -99)}\")\n"
            "    elif t == 'layerchange':\n"
            "        _layer_events.append(f\"layerchange:{msg.get('layer', -99)}\")\n"
            "python_hooks.set_hook(_layer_hook, handle=True, layerchange=True)\n"));

        biz.selectLayer(layerA, QStringLiteral("main"));
        {
            py::gil_scoped_acquire acquire;
            py::list ev = py::module_::import("__main__").attr("_layer_events").cast<py::list>();
            CHECK(ev.size() == 1);
            CHECK(ev[0].cast<std::string>() == QStringLiteral("layerchange:%1").arg(layerA).toStdString());
        }

        biz.runEmbeddedPythonCommand(QStringLiteral("_layer_events.clear()\n"));
        biz.unselectLayer(QStringLiteral("main"));
        CHECK(biz.currentLayer() == -1);
        {
            py::gil_scoped_acquire acquire;
            py::list ev = py::module_::import("__main__").attr("_layer_events").cast<py::list>();
            CHECK(ev.size() == 1);
            CHECK(ev[0].cast<std::string>() == "layerchange:-1");
        }
        biz.runEmbeddedPythonCommand(QStringLiteral("python_hooks.del_hook(_layer_hook)\n"));
    }

    // 2. addLayerForAsset 与 assignAssetToLayer 的 layerchange 钩子
    {
        AnimeanBusiness biz;
        const int asset0 = biz.addAsset();
        const int asset1 = biz.addAsset();
        biz.runEmbeddedPythonCommand(QStringLiteral(
            "import python_hooks\n"
            "_asset_events = []\n"
            "def _asset_hook(msg):\n"
            "    if msg.get('event') == 'layerchange':\n"
            "        _asset_events.append((msg.get('view'), msg.get('layer')))\n"
            "python_hooks.set_hook(_asset_hook, layerchange=True)\n"));

        const int createdLayer = biz.addLayerForAsset(asset0, QStringLiteral("main"));
        CHECK(createdLayer >= 0);
        {
            py::gil_scoped_acquire acquire;
            py::list ev = py::module_::import("__main__").attr("_asset_events").cast<py::list>();
            CHECK(ev.size() == 1);
        }

        biz.runEmbeddedPythonCommand(QStringLiteral("_asset_events.clear()\n"));
        CHECK(biz.assignAssetToLayer(0, asset1, QStringLiteral("main")));
        {
            py::gil_scoped_acquire acquire;
            py::list ev = py::module_::import("__main__").attr("_asset_events").cast<py::list>();
            CHECK(ev.size() == 1);
        }
        biz.runEmbeddedPythonCommand(QStringLiteral("python_hooks.del_hook(_asset_hook)\n"));
    }

    // 3. loadProjectFrom 与 openTextureViewFrom 的 historyrestore 钩子与当前场景恢复
    {
        QTemporaryDir tempDir;
        CHECK(tempDir.isValid());
        AnimeanBusiness writer;
        writer.addFrame();
        writer.selectFrame(2);
        writer.addLayer(QStringLiteral("main"));
        QString err;
        const QString projPath = QDir(tempDir.path()).filePath(QStringLiteral("io_hooks.anproj"));
        const QString texPath = QDir(tempDir.path()).filePath(QStringLiteral("io_hooks.textureview"));
        CHECK(writer.saveProjectTo(projPath, &err));
        CHECK(writer.saveTextureViewTo(texPath, &err));

        AnimeanBusiness loader;
        loader.setActiveViewName(QStringLiteral("child"));
        loader.runEmbeddedPythonCommand(QStringLiteral(
            "import python_hooks\n"
            "_io_events = []\n"
            "def _io_hook(msg):\n"
            "    _io_events.append(f\"{msg.get('event')}:{msg.get('view')}\")\n"
            "python_hooks.set_hook(_io_hook, historyrestore=True, framechange=True, layerchange=True)\n"));

        CHECK(loader.loadProjectFrom(projPath, &err));
        CHECK(loader.activeViewName() == QStringLiteral("main"));
        {
            py::gil_scoped_acquire acquire;
            py::dict cur = py::module_::import("animean_python").attr("get_current")().cast<py::dict>();
            CHECK(cur["sceneName"].cast<std::string>() == "main_paint_view");
            py::list ev = py::module_::import("__main__").attr("_io_events").cast<py::list>();
            QStringList events;
            for (py::handle h : ev) {
                events.append(QString::fromStdString(h.cast<std::string>()));
            }
            CHECK(events.contains(QStringLiteral("historyrestore:main")));
            CHECK(events.contains(QStringLiteral("historyrestore:child")));
            CHECK(!events.contains(QStringLiteral("framechange:main")));
        }

        loader.runEmbeddedPythonCommand(QStringLiteral("_io_events.clear()\n"));
        CHECK(loader.openTextureViewFrom(texPath, &err));
        {
            py::gil_scoped_acquire acquire;
            py::list ev = py::module_::import("__main__").attr("_io_events").cast<py::list>();
            QStringList events;
            for (py::handle h : ev) {
                events.append(QString::fromStdString(h.cast<std::string>()));
            }
            CHECK(events.contains(QStringLiteral("historyrestore:child")));
        }
        loader.runEmbeddedPythonCommand(QStringLiteral("python_hooks.del_hook(_io_hook)\n"));
    }
}

#endif // ANIMEAN_WITH_PYTHON

} // namespace

int main(int argc, char **argv)
{
    QCoreApplication app(argc, argv);

#ifdef ANIMEAN_WITH_PYTHON
    const QString appDir = QCoreApplication::applicationDirPath();
    QString pythonHome = QDir(appDir).filePath(QStringLiteral(ANIMEAN_PYTHON_DIR_NAME));
    if (!QFileInfo::exists(QDir(pythonHome).filePath(QStringLiteral("python312.dll")))) {
        pythonHome = QStringLiteral(ANIMEAN_PYTHON_HOME);
    }
    if (!QFileInfo::exists(QDir(pythonHome).filePath(QStringLiteral("python312.dll")))) {
        const QString envHome = qEnvironmentVariable("PYTHONHOME");
        if (!envHome.isEmpty() && QFileInfo::exists(QDir(envHome).filePath(QStringLiteral("python312.dll")))) {
            pythonHome = envHome;
        }
    }

    QStringList pythonPath;
    if (QFileInfo::exists(QDir(QStringLiteral(ANIMEAN_PYFILE_DIR)).filePath(QStringLiteral("hello_world.py")))) {
        pythonPath << QStringLiteral(ANIMEAN_PYFILE_DIR);
    }
    pythonPath << appDir;
    if (QFileInfo::exists(QDir(QStringLiteral(ANIMEAN_PYTHONBIND_DIR)).filePath(QStringLiteral("animemodel.py")))) {
        pythonPath << QStringLiteral(ANIMEAN_PYTHONBIND_DIR);
    }
    if (QFileInfo::exists(QDir(QStringLiteral(ANIMEAN_OPENTOONZ_TOOLS_DIR)).filePath(QStringLiteral("toonz_to_dict.py")))) {
        pythonPath << QStringLiteral(ANIMEAN_OPENTOONZ_TOOLS_DIR);
    }

    QStringList dllPath;
    dllPath << pythonHome << QDir(pythonHome).filePath(QStringLiteral("DLLs"));
    const QByteArray existingPath = qgetenv("PATH");
    if (!existingPath.isEmpty()) {
        dllPath << QString::fromLocal8Bit(existingPath);
    }

    qputenv("PATH", QDir::toNativeSeparators(dllPath.join(QLatin1Char(';'))).toLocal8Bit());
    qputenv("PYTHONHOME", QDir::toNativeSeparators(pythonHome).toLocal8Bit());
    qputenv("PYTHONPATH", QDir::toNativeSeparators(pythonPath.join(QLatin1Char(';'))).toLocal8Bit());

    py::scoped_interpreter guard;
#endif

    testPaintViewProvisionAndStatus();
    testLayersAndAssetsAndHistory();
    testToolsAndToolOptions();
    testTimelinePlaybackAndOnion();
    testProjectNewOpenSave();

#ifdef ANIMEAN_WITH_PYTHON
    testRealPythonIntegration();
    testRegression1ToolLockAndFallbackSync();
    testRegression2ActiveViewRegistersCurrentPythonScene();
    testRegression3PlaybackAdvancesFrameIndexAndTimelineState();
    testRegression4NoDuplicateSignalsOnViewSwitchAndEdits();
    testRegression5ExtraToolOptionsPreservedOnRefreshAndDrawSettings();
    testRegression6ToolSwitchExtraToolOrderAndSingleOptionApply();
    testPythonHooksForLayersAssetsAndProjectIo();
#endif

    std::printf("business_tests: all headless business and real Python integration checks passed.\n");
    return 0;
}
