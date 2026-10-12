#include "PanelExpandEffect.h"

#include <QEasingCurve>
#include <QGraphicsOpacityEffect>
#include <QParallelAnimationGroup>
#include <QPropertyAnimation>
#include <QWidget>

namespace {
const int kDurationMs = 180;
}

// 只创建动画。启动、结束后把控件恢复原样、清掉透明度效果、定到最终的显示或隐藏状态，都由界面绑定层负责。
QAbstractAnimation *PanelExpandAnimation::createTransition(QWidget *target, bool showing)
{
    const QSize fullSize = target->size();
    const QSize closedSize(fullSize.width(), 0);

    // 控件按当前高度裁掉里面的内容，所以只改高度就够了
    auto *size = new QPropertyAnimation(target, "size");
    size->setDuration(kDurationMs);
    size->setEasingCurve(QEasingCurve::OutCubic);
    size->setStartValue(showing ? closedSize : fullSize);
    size->setEndValue(showing ? fullSize : closedSize);

    auto *opacity = new QGraphicsOpacityEffect(target);
    opacity->setOpacity(showing ? 0.0 : 1.0);
    target->setGraphicsEffect(opacity);
    auto *fade = new QPropertyAnimation(opacity, "opacity");
    fade->setDuration(kDurationMs);
    fade->setEasingCurve(QEasingCurve::OutCubic);
    fade->setStartValue(showing ? 0.0 : 1.0);
    fade->setEndValue(showing ? 1.0 : 0.0);

    // 摆成动画开始时的样子
    if (showing)
        target->resize(closedSize);

    auto *group = new QParallelAnimationGroup(target);
    group->addAnimation(size);
    group->addAnimation(fade);
    return group;
}
