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
};

} // namespace vf
