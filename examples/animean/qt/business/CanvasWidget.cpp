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
    painter.fillRect(rect(), QColor(248, 250, 252));

    painter.setPen(QColor(100, 116, 139));
    painter.drawText(rect().adjusted(12, 10, -12, -10), Qt::AlignTop | Qt::AlignLeft,
                     QStringLiteral("AnimeAn 业务绘图画板（通过外部容器 canvasHost 放进界面）"));

    if (m_model->visible()) {
        painter.setPen(QPen(QColor(37, 99, 235), 3));
        painter.setBrush(QColor(37, 99, 235, 36));
        const int side = qMin(width(), height()) / 2;
        painter.drawEllipse(rect().center(), side / 2, side / 2);
    }
}
