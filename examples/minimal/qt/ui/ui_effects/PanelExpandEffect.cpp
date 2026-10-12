#include "PanelExpandEffect.h"

#include <QEasingCurve>
#include <QGraphicsOpacityEffect>
#include <QParallelAnimationGroup>
#include <QPropertyAnimation>
#include <QVariant>
#include <QWidget>

namespace {
const int kDurationMs = 180;
const char kGroupName[] = "vfPanelExpand";
const char kFullSize[] = "vfFullSize";

void restore(QWidget *target, const QSize &fullSize)
{
    target->resize(fullSize);
    target->setGraphicsEffect(nullptr);
}
}

void PanelExpandAnimation::play(QWidget *target, bool showing, std::function<void()> finished)
{
    // 上一次过渡还没放完就又来了：停掉旧的，从完整的样子重新开始
    if (auto *running = target->findChild<QParallelAnimationGroup *>(QLatin1String(kGroupName), Qt::FindDirectChildrenOnly)) {
        running->stop();
        restore(target, running->property(kFullSize).toSize());
        delete running;
    }

    const QSize fullSize = target->size();
    const QSize closedSize(fullSize.width(), 0);

    // 控件按当前高度裁掉里面的内容，所以只改高度就够了
    auto *size = new QPropertyAnimation(target, "size");
    size->setDuration(kDurationMs);
    size->setEasingCurve(QEasingCurve::OutCubic);
    size->setStartValue(showing ? closedSize : fullSize);
    size->setEndValue(showing ? fullSize : closedSize);

    auto *opacity = new QGraphicsOpacityEffect(target);
    target->setGraphicsEffect(opacity); // 控件接管它，换掉或清除时自动删除
    auto *fade = new QPropertyAnimation(opacity, "opacity");
    fade->setDuration(kDurationMs);
    fade->setEasingCurve(QEasingCurve::OutCubic);
    fade->setStartValue(showing ? 0.0 : 1.0);
    fade->setEndValue(showing ? 1.0 : 0.0);

    auto *group = new QParallelAnimationGroup(target);
    group->setObjectName(QLatin1String(kGroupName));
    group->setProperty(kFullSize, fullSize);
    group->addAnimation(size);
    group->addAnimation(fade);
    QObject::connect(group, &QParallelAnimationGroup::finished, target, [target, group, fullSize, finished] {
        // 先让界面把控件定到最终的显示或隐藏状态，再恢复大小，免得收起后完整的面板闪一下
        finished();
        restore(target, fullSize);
        group->deleteLater();
    });
    if (showing)
        target->resize(closedSize);
    group->start();
}
