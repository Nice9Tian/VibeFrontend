// 业务接口层。由工具根据设计项目生成，不要手改。
//
// 业务代码只通过这个类和界面打交道：
//   事件      界面 → 业务   每个事件一个信号
//   状态      业务 → 界面   每个“业务管”的状态一对读写函数
//   请求      业务 → 界面   每个请求一个函数
//   外部容器  业务 → 界面   每个外部容器一个放入控件的函数
//
// 这一层按名字和类型对接：参数或类型改了、某一项被删掉或改名，业务那边的连接代码自然编译不过。
#pragma once

#include <QObject>
#include <QString>

class QWidget;

namespace vf {

class BusinessInterface : public QObject
{
    Q_OBJECT

public:
    using QObject::QObject;

    // ---- 状态（业务管）----
    // layer.visible：图层是否可见
    virtual void setLayerVisible(bool visible) = 0;
    virtual bool layerVisible() const = 0;

    // ---- 请求 ----
    // 在状态栏显示一句话
    virtual void showStatusMessage(const QString &text) = 0;

    // ---- 外部容器 ----
    // canvasHost：把业务提供的绘图区放进界面
    virtual void setCanvasWidget(QWidget *widget) = 0;

signals:
    // ---- 事件 ----
    // layerToggleVisible：用户点了“切换图层可见”
    // 业务没有连接这个信号时，界面会执行设计项目里写的模拟步骤。
    void layerToggleVisibleRequested();
};

} // namespace vf
