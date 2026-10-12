#include "Connect.h"

#include "BusinessInterface.h"
#include "CanvasWidget.h"
#include "LayerModel.h"

void connectBusiness(vf::BusinessInterface &ui, LayerModel &model, CanvasWidget *canvas)
{
    // 事件：界面 → 业务
    QObject::connect(&ui, &vf::BusinessInterface::layerToggleVisibleRequested, &model,
                     [&model] { model.setVisible(!model.visible()); });

    // 状态：业务 → 界面
    QObject::connect(&model, &LayerModel::visibleChanged, &ui, [&ui](bool visible) {
        ui.setLayerVisible(visible);
        ui.showStatusMessage(visible ? QStringLiteral("图层已显示") : QStringLiteral("图层已隐藏"));
    });
    ui.setLayerVisible(model.visible());

    // 外部容器：把业务的绘图区放进界面
    ui.setCanvasWidget(canvas);
}
