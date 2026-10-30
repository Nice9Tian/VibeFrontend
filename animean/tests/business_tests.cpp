#include "business/animeanbusiness.h"

#include "algorithm/animemodel.h"
#include "algorithm/scenehistory.h"

#include <QCoreApplication>
#include <QDir>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonObject>
#include <QTemporaryDir>
#include <QVariant>

#include <cstdio>
#include <cstdlib>

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

    // 扩展工具、工具选项消息与 ForcePad 事件转发
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

} // namespace

int main(int argc, char **argv)
{
    QCoreApplication app(argc, argv);

    testPaintViewProvisionAndStatus();
    testLayersAndAssetsAndHistory();
    testToolsAndToolOptions();
    testTimelinePlaybackAndOnion();
    testProjectNewOpenSave();

    std::printf("business_tests: all headless business checks passed.\n");
    return 0;
}
