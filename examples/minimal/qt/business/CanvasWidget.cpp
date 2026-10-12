#include "CanvasWidget.h"

#include "LayerModel.h"

#include <QPainter>

CanvasWidget::CanvasWidget(LayerModel *model, QWidget *parent)
    : QWidget(parent)
    , m_model(model)
{
    setObjectName(QStringLiteral("businessCanvas"));
    connect(model, &LayerModel::visibleChanged, this, [this] { update(); });
}

void CanvasWidget::paintEvent(QPaintEvent *)
{
    QPainter painter(this);
    painter.setRenderHint(QPainter::Antialiasing);
    painter.fillRect(rect(), Qt::white);

    painter.setPen(QColor(120, 120, 120));
    painter.drawText(rect().adjusted(8, 6, -8, -6), Qt::AlignTop | Qt::AlignLeft,
                     QStringLiteral("业务层的绘图区（通过外部容器放进界面）"));

    // 图层可见时画出图层的内容
    if (m_model->visible()) {
        painter.setPen(QPen(QColor(37, 99, 235), 3));
        painter.setBrush(QColor(37, 99, 235, 40));
        const int side = qMin(width(), height()) / 2;
        painter.drawEllipse(rect().center(), side / 2, side / 2);
    }
}
