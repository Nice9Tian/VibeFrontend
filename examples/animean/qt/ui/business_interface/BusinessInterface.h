// 业务接口层。由 VibeFrontend 导出，不要手改：下次导出会整个覆盖。
//
// 业务代码只通过这个类和界面打交道：
//   事件      界面 → 业务   每个业务事件一个信号
//   状态      业务 → 界面   每个“业务管”的状态一对读写函数
//   外部容器  业务 → 界面   每个外部容器一个放入控件的函数
//
// 这一层按名字和类型对接：类型改了、某一项被删掉或改名，业务那边的连接代码自然编译不过。
// 界面换颜色、调位置、改动画，都不影响这里。
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
    // 业务的数据变了，调用写函数把新值告诉界面。界面自己不会改这些状态。
    // layer.visible：真或假
    virtual void setLayerVisible(bool value) = 0;
    virtual bool layerVisible() const = 0;

    // ---- 请求事件（业务 → 界面）----
    // 业务主动通知界面执行其中写的步骤（如更新提示、切换状态）。
    // notifyStatus：业务通知界面在状态栏显示一条消息
    virtual void requestNotifyStatus(const QString &message) = 0;

    // ---- 外部容器 ----
    // 把业务自己的控件放进界面。传空指针表示拿走，界面重新显示占位的文字。
    // canvasHost
    virtual void setCanvasHostWidget(QWidget *widget) = 0;

signals:
    // ---- 事件 ----
    // 连接了某个信号，界面就把这个事件交给业务，不再执行设计项目里为它写的模拟步骤。
    // 没有连接的信号，界面照旧执行模拟步骤。
    // layerToggleVisible：用户请求切换当前图层的显示与隐藏
    void layerToggleVisibleRequested();
};

} // namespace vf
