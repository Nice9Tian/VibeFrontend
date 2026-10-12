// 业务和业务接口之间的连接。只做转发和数据转换，不写业务规则，也不直接操作控件。
#pragma once

namespace vf {
class BusinessInterface;
}
class LayerModel;
class CanvasWidget;

void connectBusiness(vf::BusinessInterface &ui, LayerModel &model, CanvasWidget *canvas);
