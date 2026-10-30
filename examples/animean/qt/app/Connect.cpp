#include "Connect.h"

#include "BusinessInterface.h"
#include "CanvasWidget.h"
#include "LayerModel.h"

void connectBusiness(vf::BusinessInterface &ui, LayerModel &model, CanvasWidget *canvas)
{
    // 事件：界面 → 业务。连接之后，界面不再执行这个事件的模拟步骤
    QObject::connect(&ui, &vf::BusinessInterface::layerToggleVisibleRequested, &model,
                     [&model] { model.setVisible(!model.visible()); });

    // 状态：业务 → 界面
    QObject::connect(&model, &LayerModel::visibleChanged, &ui, [&ui](bool visible) { ui.setLayerVisible(visible); });
    ui.setLayerVisible(model.visible());

    // 外部容器：把业务的绘图区放进界面
    ui.setCanvasHostWidget(canvas);
}
