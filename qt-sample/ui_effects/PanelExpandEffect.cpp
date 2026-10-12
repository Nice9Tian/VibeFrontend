#include "PanelExpandEffect.h"

#include <QEasingCurve>
#include <QGraphicsOpacityEffect>
#include <QParallelAnimationGroup>
#include <QPropertyAnimation>
#include <QWidget>

namespace {
const int kDurationMs = 180;
const int kNoLimit = 16777215; // QWIDGETSIZE_MAX
}

void PanelExpandAnimation::play(QWidget *panel, bool expanding)
{
    auto *opacity = new QGraphicsOpacityEffect(panel);
    panel->setGraphicsEffect(opacity); // 面板接管它，换新的时旧的自动删除

    panel->setMaximumHeight(kNoLimit);
    const int fullHeight = panel->sizeHint().height();
    if (expanding) {
        panel->setMaximumHeight(0);
        panel->setVisible(true);
    }

    auto *height = new QPropertyAnimation(panel, "maximumHeight");
    height->setDuration(kDurationMs);
    height->setEasingCurve(QEasingCurve::OutCubic);
    height->setStartValue(expanding ? 0 : fullHeight);
    height->setEndValue(expanding ? fullHeight : 0);

    auto *fade = new QPropertyAnimation(opacity, "opacity");
    fade->setDuration(kDurationMs);
    fade->setStartValue(expanding ? 0.0 : 1.0);
    fade->setEndValue(expanding ? 1.0 : 0.0);

    auto *group = new QParallelAnimationGroup(panel);
    group->addAnimation(height);
    group->addAnimation(fade);
    QObject::connect(group, &QParallelAnimationGroup::finished, panel, [panel, expanding] {
        if (!expanding)
            panel->setVisible(false);
        panel->setMaximumHeight(kNoLimit);
        panel->setGraphicsEffect(nullptr);
    });
    group->start(QAbstractAnimation::DeleteWhenStopped);
}
