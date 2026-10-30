#include "ColorPickerDrawEffect.h"

#include <QColor>
#include <QFont>
#include <QLinearGradient>
#include <QPainter>
#include <QPen>

void ColorPickerDrawPainter::paint(QPainter *painter, const QRect &rect, const QVariantMap &props)
{
    const int w = qMax(40, rect.width());
    const int h = qMax(40, rect.height());

    const double hue = qBound(0.0, props.value(QStringLiteral("hue"), 210.0).toDouble(), 360.0);
    const double sat = qBound(0.0, props.value(QStringLiteral("saturation"), 78.0).toDouble(), 100.0);
    const double val = qBound(0.0, props.value(QStringLiteral("brightness"), 92.0).toDouble(), 100.0);
    QString hexColor = props.value(QStringLiteral("hexColor")).toString();
    if (hexColor.isEmpty())
        hexColor = QStringLiteral("#3394eb");

    const int pad = 6;
    const int barH = 22;
    const int hueBarW = 18;
    const int svX = rect.left() + pad;
    const int svY = rect.top() + pad;
    const int svW = qMax(20, w - pad * 3 - hueBarW);
    const int svH = qMax(20, h - pad * 3 - barH);
    const QRectF svRect(svX, svY, svW, svH);

    // 背景底板
    painter->fillRect(rect, QColor(QStringLiteral("#0f172a")));

    // 1. 饱和度-明度 (SV) 方块
    QColor baseHueColor;
    baseHueColor.setHsvF(float(qMin(hue, 359.9) / 360.0), 1.0f, 1.0f);
    painter->fillRect(svRect, baseHueColor);

    QLinearGradient whiteGrad(svRect.topLeft(), svRect.topRight());
    whiteGrad.setColorAt(0.0, QColor(255, 255, 255, 255));
    whiteGrad.setColorAt(1.0, QColor(255, 255, 255, 0));
    painter->fillRect(svRect, whiteGrad);

    QLinearGradient blackGrad(svRect.topLeft(), svRect.bottomLeft());
    blackGrad.setColorAt(0.0, QColor(0, 0, 0, 0));
    blackGrad.setColorAt(1.0, QColor(0, 0, 0, 255));
    painter->fillRect(svRect, blackGrad);

    painter->setPen(QPen(QColor(QStringLiteral("#334155")), 1.0));
    painter->setBrush(Qt::NoBrush);
    painter->drawRect(svRect.adjusted(0.5, 0.5, -0.5, -0.5));

    // SV 十字准星
    const qreal cx = svX + (sat / 100.0) * svW;
    const qreal cy = svY + (1.0 - val / 100.0) * svH;
    painter->setPen(QPen(QColor(QStringLiteral("#0f172a")), 2.5));
    painter->drawEllipse(QPointF(cx, cy), 5.0, 5.0);
    painter->setPen(QPen(QColor(QStringLiteral("#ffffff")), 1.5));
    painter->drawEllipse(QPointF(cx, cy), 5.0, 5.0);

    // 2. 右侧色相条 (Hue Bar)
    const int hx = svX + svW + pad;
    const int hy = svY;
    const QRectF hueRect(hx, hy, hueBarW, svH);
    QLinearGradient hueGrad(hueRect.topLeft(), hueRect.bottomLeft());
    hueGrad.setColorAt(0.0, QColor(QStringLiteral("#ff0000")));
    hueGrad.setColorAt(1.0 / 6.0, QColor(QStringLiteral("#ffff00")));
    hueGrad.setColorAt(2.0 / 6.0, QColor(QStringLiteral("#00ff00")));
    hueGrad.setColorAt(3.0 / 6.0, QColor(QStringLiteral("#00ffff")));
    hueGrad.setColorAt(4.0 / 6.0, QColor(QStringLiteral("#0000ff")));
    hueGrad.setColorAt(5.0 / 6.0, QColor(QStringLiteral("#ff00ff")));
    hueGrad.setColorAt(1.0, QColor(QStringLiteral("#ff0000")));
    painter->fillRect(hueRect, hueGrad);
    painter->setPen(QPen(QColor(QStringLiteral("#334155")), 1.0));
    painter->drawRect(hueRect.adjusted(0.5, 0.5, -0.5, -0.5));

    const qreal hueY = hy + (hue / 360.0) * svH;
    const QRectF markerRect(hx - 1.0, hueY - 2.0, hueBarW + 2.0, 4.0);
    painter->fillRect(markerRect, QColor(QStringLiteral("#ffffff")));
    painter->setPen(QPen(QColor(QStringLiteral("#0f172a")), 1.0));
    painter->drawRect(markerRect);

    // 3. 底部当前颜色预览条
    const int by = svY + svH + pad;
    const QRectF swatchRect(svX, by, 44.0, barH);
    painter->fillRect(swatchRect, QColor(hexColor));
    painter->setPen(QPen(QColor(QStringLiteral("#475569")), 1.0));
    painter->drawRect(swatchRect.adjusted(0.5, 0.5, -0.5, -0.5));

    QFont f = painter->font();
    f.setPixelSize(11);
    f.setWeight(QFont::DemiBold);
    painter->setFont(f);
    painter->setPen(QColor(QStringLiteral("#cbd5e1")));
    const QRectF textRect(svX + 52.0, by, w - 52.0 - pad * 2, barH);
    painter->drawText(
        textRect,
        Qt::AlignLeft | Qt::AlignVCenter,
        QStringLiteral("HSV(%1, %2%, %3%)  %4")
            .arg(qRound(hue))
            .arg(qRound(sat))
            .arg(qRound(val))
            .arg(hexColor)
    );
}
