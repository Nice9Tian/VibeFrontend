// 界面绑定层。由 VibeFrontend 导出，不要手改：下次导出会整个覆盖。
//
// 这个文件分两部分：
//   文件末尾“生成的部分”随设计项目变化：控件树、位置、排版、事件的连接、业务接口的实现、效果的调用；
//   其余是固定的：把逻辑脚本放进 Qt 自带的 JS 引擎运行，把鼠标事件交给它，再把算出的结果写到控件上。
#include "Ui.h"

#include <QAbstractAnimation>
#include <QAction>
#include <QApplication>
#include <QComboBox>
#include <QDialog>
#include <QDockWidget>
#include <QEvent>
#include <QFile>
#include <QFrame>
#include <QHash>
#include <QJSEngine>
#include <QJSValue>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonValue>
#include <QLabel>
#include <QListWidget>
#include <QMainWindow>
#include <QMenu>
#include <QMenuBar>
#include <QMetaMethod>
#include <QMouseEvent>
#include <QPointer>
#include <QSignalBlocker>
#include <QStatusBar>
#include <QTimer>
#include <QVBoxLayout>
#include <QVariant>
#include <QFont>
#include <QFontMetricsF>
#include <QPainter>
#include <QPainterPath>
#include <QPainterPathStroker>
#include <QPalette>
#include <QPen>
#include <QRegularExpression>
#include <cmath>
// （这个设计项目没有用到别的 Qt 控件类）

namespace vf {

namespace {

// 过渡动画超过它自己的时长这么多毫秒还没有结束，就不再等它
const int kTransitionGraceMs = 300;

struct PendingEvent
{
    QString kind;
    QString name;
    QJSValue args;
};

// 设计项目里的一个控件
struct Control
{
    QString id;
    QWidget *widget = nullptr;
    // 控件属性名 → Qt 属性名
    QList<QPair<QString, QByteArray>> props;
    // 显示和隐藏时播放的效果的编号，没有是 -1
    int effect = -1;
    bool shown = true;
    // 每次显示或隐藏加一，用来丢弃被打断的过渡
    int generation = 0;
    // 画布上定下的位置和大小，过渡结束后恢复成它
    QRect designRect;
    // 正在过渡中，以及这次过渡的动画
    bool transitioning = false;
    QPointer<QAbstractAnimation> transition;
    // 下面三项只有外部容器用
    QVBoxLayout *hostLayout = nullptr;
    QLabel *placeholder = nullptr;
    QPointer<QWidget> hosted;
};

QString readResource(const QString &path)
{
    QFile file(path);
    if (!file.open(QIODevice::ReadOnly))
        qFatal("读不到内置的文件 %s", qPrintable(path));
    return QString::fromUtf8(file.readAll());
}

QList<PendingEvent> toPendingList(const QJSValue &array)
{
    QList<PendingEvent> list;
    const int count = array.property(QStringLiteral("length")).toInt();
    for (int i = 0; i < count; ++i) {
        const QJSValue item = array.property(quint32(i));
        if (item.isString()) {
            list.append({ QStringLiteral("event"), item.toString(), QJSValue() });
        } else if (item.isObject()) {
            const QJSValue k = item.property(QStringLiteral("kind"));
            const QString kind = k.isString() ? k.toString() : QStringLiteral("event");
            list.append({ kind, item.property(QStringLiteral("name")).toString(), item.property(QStringLiteral("args")) });
        }
    }
    return list;
}

// 占位用的文字：居中，鼠标事件穿过它落到所在的控件上
QLabel *addPlaceholder(QFrame *frame, const QString &text, QVBoxLayout **layoutOut = nullptr)
{
    auto *layout = new QVBoxLayout(frame);
    layout->setContentsMargins(0, 0, 0, 0);
    auto *label = new QLabel(text, frame);
    label->setAlignment(Qt::AlignCenter);
    label->setAttribute(Qt::WA_TransparentForMouseEvents);
    layout->addWidget(label);
    if (layoutOut)
        *layoutOut = layout;
    return label;
}

double vecAngleRad(double ux, double uy, double vx, double vy)
{
    const double dot = ux * vx + uy * vy;
    const double len = std::hypot(ux, uy) * std::hypot(vx, vy);
    if (len <= 0.0)
        return 0.0;
    const double c = qBound(-1.0, dot / len, 1.0);
    const double ang = std::acos(c);
    return (ux * vy - uy * vx < 0.0) ? -ang : ang;
}

// 把工具生成的 SVG 路径（M / L / H / V / C / Q / T / A / Z）转成 QPainterPath
QPainterPath parseSvgPath(const QString &d)
{
    QPainterPath path;
    path.setFillRule(Qt::WindingFill);
    if (d.isEmpty())
        return path;

    static const QRegularExpression re(QStringLiteral("[MLHVCSQTAZmlhvcsqtaz]|[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[-+]?\\d+)?"));
    QRegularExpressionMatchIterator it = re.globalMatch(d);
    QStringList tokens;
    while (it.hasNext())
        tokens.append(it.next().captured(0));

    int idx = 0;
    QChar cmd = QLatin1Char('M');
    QChar lastCmd = QLatin1Char(' ');
    double curX = 0.0;
    double curY = 0.0;
    double startX = 0.0;
    double startY = 0.0;
    double prevQx = 0.0;
    double prevQy = 0.0;

    auto isCmdToken = [&](int i) -> bool {
        if (i >= tokens.size())
            return false;
        const QChar c = tokens.at(i).at(0);
        return c.isLetter();
    };
    auto nextNum = [&]() -> double {
        return idx < tokens.size() ? tokens.at(idx++).toDouble() : 0.0;
    };

    while (idx < tokens.size()) {
        if (isCmdToken(idx))
            cmd = tokens.at(idx++).at(0).toUpper();

        if (cmd == QLatin1Char('M')) {
            const double x = nextNum();
            const double y = nextNum();
            path.moveTo(x, y);
            curX = startX = x;
            curY = startY = y;
            lastCmd = QLatin1Char('M');
            cmd = QLatin1Char('L');
            continue;
        }
        if (cmd == QLatin1Char('L')) {
            const double x = nextNum();
            const double y = nextNum();
            path.lineTo(x, y);
            curX = x;
            curY = y;
            lastCmd = QLatin1Char('L');
            continue;
        }
        if (cmd == QLatin1Char('H')) {
            const double x = nextNum();
            path.lineTo(x, curY);
            curX = x;
            lastCmd = QLatin1Char('H');
            continue;
        }
        if (cmd == QLatin1Char('V')) {
            const double y = nextNum();
            path.lineTo(curX, y);
            curY = y;
            lastCmd = QLatin1Char('V');
            continue;
        }
        if (cmd == QLatin1Char('Q')) {
            const double x1 = nextNum();
            const double y1 = nextNum();
            const double x = nextNum();
            const double y = nextNum();
            path.quadTo(x1, y1, x, y);
            prevQx = x1;
            prevQy = y1;
            curX = x;
            curY = y;
            lastCmd = QLatin1Char('Q');
            continue;
        }
        if (cmd == QLatin1Char('T')) {
            const double x = nextNum();
            const double y = nextNum();
            const double x1 = (lastCmd == QLatin1Char('Q') || lastCmd == QLatin1Char('T')) ? (2.0 * curX - prevQx) : curX;
            const double y1 = (lastCmd == QLatin1Char('Q') || lastCmd == QLatin1Char('T')) ? (2.0 * curY - prevQy) : curY;
            path.quadTo(x1, y1, x, y);
            prevQx = x1;
            prevQy = y1;
            curX = x;
            curY = y;
            lastCmd = QLatin1Char('T');
            continue;
        }
        if (cmd == QLatin1Char('C')) {
            const double x1 = nextNum();
            const double y1 = nextNum();
            const double x2 = nextNum();
            const double y2 = nextNum();
            const double x = nextNum();
            const double y = nextNum();
            path.cubicTo(x1, y1, x2, y2, x, y);
            curX = x;
            curY = y;
            lastCmd = QLatin1Char('C');
            continue;
        }
        if (cmd == QLatin1Char('A')) {
            double rx = std::abs(nextNum());
            double ry = std::abs(nextNum());
            const double phi = nextNum() * M_PI / 180.0;
            const bool largeArc = nextNum() != 0.0;
            const bool sweep = nextNum() != 0.0;
            const double x = nextNum();
            const double y = nextNum();
            const double x1 = curX;
            const double y1 = curY;
            if (std::hypot(x - x1, y - y1) > 1e-6) {
                if (rx <= 1e-6 || ry <= 1e-6) {
                    path.lineTo(x, y);
                } else {
                    const double cosPhi = std::cos(phi);
                    const double sinPhi = std::sin(phi);
                    const double dx2 = (x1 - x) / 2.0;
                    const double dy2 = (y1 - y) / 2.0;
                    const double x1p = cosPhi * dx2 + sinPhi * dy2;
                    const double y1p = -sinPhi * dx2 + cosPhi * dy2;
                    const double lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
                    if (lambda > 1.0) {
                        const double s = std::sqrt(lambda);
                        rx *= s;
                        ry *= s;
                    }
                    const double rx2 = rx * rx;
                    const double ry2 = ry * ry;
                    const double x1p2 = x1p * x1p;
                    const double y1p2 = y1p * y1p;
                    const double numVal = std::max(0.0, rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2);
                    const double denVal = rx2 * y1p2 + ry2 * x1p2;
                    const double factor = ((largeArc == sweep) ? -1.0 : 1.0) * (denVal > 0.0 ? std::sqrt(numVal / denVal) : 0.0);
                    const double cxp = factor * ((rx * y1p) / ry);
                    const double cyp = factor * (-(ry * x1p) / rx);
                    const double cx = cosPhi * cxp - sinPhi * cyp + (x1 + x) / 2.0;
                    const double cy = sinPhi * cxp + cosPhi * cyp + (y1 + y) / 2.0;
                    const double theta1 = vecAngleRad(1.0, 0.0, (x1p - cxp) / rx, (y1p - cyp) / ry);
                    double dTheta = vecAngleRad((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
                    if (!sweep && dTheta > 0.0)
                        dTheta -= M_PI * 2.0;
                    if (sweep && dTheta < 0.0)
                        dTheta += M_PI * 2.0;
                    const int segs = std::max(1, int(std::ceil(std::abs(dTheta) / (M_PI / 2.0))));
                    const double delta = dTheta / segs;
                    const double alpha = (4.0 / 3.0) * std::tan(delta / 4.0);
                    auto mapPt = [&](double ux, double uy) -> QPointF {
                        return QPointF(cx + cosPhi * rx * ux - sinPhi * ry * uy,
                                       cy + sinPhi * rx * ux + cosPhi * ry * uy);
                    };
                    for (int s = 0; s < segs; ++s) {
                        const double a1 = theta1 + s * delta;
                        const double a2 = a1 + delta;
                        const double cos1 = std::cos(a1);
                        const double sin1 = std::sin(a1);
                        const double cos2 = std::cos(a2);
                        const double sin2 = std::sin(a2);
                        const QPointF c1 = mapPt(cos1 - alpha * sin1, sin1 + alpha * cos1);
                        const QPointF c2 = mapPt(cos2 + alpha * sin2, sin2 - alpha * cos2);
                        const QPointF p2 = (s == segs - 1) ? QPointF(x, y) : mapPt(cos2, sin2);
                        path.cubicTo(c1, c2, p2);
                    }
                }
            }
            curX = x;
            curY = y;
            lastCmd = QLatin1Char('A');
            continue;
        }
        if (cmd == QLatin1Char('Z')) {
            path.closeSubpath();
            curX = startX;
            curY = startY;
            lastCmd = QLatin1Char('Z');
            continue;
        }
        if (!isCmdToken(idx))
            nextNum();
    }
    return path;
}

// 基础图形（Shape）与线条（Line）绘制控件
class VfGraphicWidget : public QWidget
{
public:
    explicit VfGraphicWidget(QWidget *parent = nullptr)
        : QWidget(parent)
    {
        setAutoFillBackground(false);
    }

    void applySpec(const QJSValue &spec, bool updateGeometry)
    {
        m_kind = spec.property(QStringLiteral("kind")).toString();
        m_x = spec.property(QStringLiteral("x")).toInt();
        m_y = spec.property(QStringLiteral("y")).toInt();
        m_width = std::max(1, spec.property(QStringLiteral("width")).toInt());
        m_height = std::max(1, spec.property(QStringLiteral("height")).toInt());
        m_logicalX = spec.property(QStringLiteral("logicalX")).toInt();
        m_logicalY = spec.property(QStringLiteral("logicalY")).toInt();
        m_logicalWidth = std::max(1, spec.property(QStringLiteral("logicalWidth")).toInt());
        m_logicalHeight = std::max(1, spec.property(QStringLiteral("logicalHeight")).toInt());
        m_opacity = spec.property(QStringLiteral("opacity")).toNumber();
        m_stroke = spec.property(QStringLiteral("stroke")).toString();
        m_strokeWidth = spec.property(QStringLiteral("strokeWidth")).toNumber();
        m_strokeStyle = spec.property(QStringLiteral("strokeStyle")).toString();
        m_textColor = spec.property(QStringLiteral("textColor")).toString();
        m_fontSize = spec.property(QStringLiteral("fontSize")).toInt();

        if (m_kind == QLatin1String("shape")) {
            m_centerX = spec.property(QStringLiteral("centerX")).toNumber();
            m_centerY = spec.property(QStringLiteral("centerY")).toNumber();
            m_rotation = spec.property(QStringLiteral("rotation")).toNumber();
            m_bodyPath = parseSvgPath(spec.property(QStringLiteral("body")).toString());
            m_detailPaths.clear();
            const QJSValue details = spec.property(QStringLiteral("details"));
            const int dLen = details.property(QStringLiteral("length")).toInt();
            for (int i = 0; i < dLen; ++i)
                m_detailPaths.append(parseSvgPath(details.property(quint32(i)).toString()));
            m_fill = spec.property(QStringLiteral("fill")).toString();
            m_text = spec.property(QStringLiteral("text")).toString();
            m_textBox = QRectF(
                spec.property(QStringLiteral("textX")).toNumber(),
                spec.property(QStringLiteral("textY")).toNumber(),
                spec.property(QStringLiteral("textWidth")).toNumber(),
                spec.property(QStringLiteral("textHeight")).toNumber());
            m_fontWeight = spec.property(QStringLiteral("fontWeight")).toString();
            m_textAlign = spec.property(QStringLiteral("textAlign")).toString();
        } else if (m_kind == QLatin1String("line")) {
            m_originX = spec.property(QStringLiteral("originX")).toNumber();
            m_originY = spec.property(QStringLiteral("originY")).toNumber();
            m_mainPath = parseSvgPath(spec.property(QStringLiteral("mainPath")).toString());
            m_hitPath = parseSvgPath(spec.property(QStringLiteral("hitPath")).toString());
            m_startCapPath = parseSvgPath(spec.property(QStringLiteral("startCapPath")).toString());
            m_startCapFilled = spec.property(QStringLiteral("startCapFilled")).toBool();
            m_endCapPath = parseSvgPath(spec.property(QStringLiteral("endCapPath")).toString());
            m_endCapFilled = spec.property(QStringLiteral("endCapFilled")).toBool();
            m_label = spec.property(QStringLiteral("label")).toString();
            m_labelX = spec.property(QStringLiteral("labelX")).toNumber();
            m_labelY = spec.property(QStringLiteral("labelY")).toNumber();
        }

        if (updateGeometry && (!parentWidget() || !parentWidget()->layout() || m_kind == QLatin1String("line"))) {
            const QRect target(m_x, m_y, m_width, m_height);
            if (geometry() != target)
                setGeometry(target);
        }
        update();
    }

    bool hitTest(const QPointF &local) const
    {
        if (QPointF(local - QRectF(rect()).center()).manhattanLength() < 2.0)
            return true;
        if (m_kind == QLatin1String("shape")) {
            QTransform tr;
            tr.translate(m_centerX, m_centerY);
            if (std::abs(m_rotation) > 1e-4)
                tr.rotate(m_rotation);
            tr.translate(-m_logicalWidth / 2.0, -m_logicalHeight / 2.0);
            bool invOk = false;
            const QPointF pt = tr.inverted(&invOk).map(local);
            if (!invOk)
                return false;
            if (m_bodyPath.isEmpty())
                return QRectF(0, 0, m_logicalWidth, m_logicalHeight).contains(pt);
            if (m_fill != QLatin1String("none") && !m_fill.isEmpty() && m_bodyPath.contains(pt))
                return true;
            QPainterPathStroker stroker;
            stroker.setWidth(std::max(6.0, m_strokeWidth + 4.0));
            return stroker.createStroke(m_bodyPath).contains(pt);
        }
        if (m_kind == QLatin1String("line")) {
            const QPointF pt(local.x() + m_originX, local.y() + m_originY);
            QPainterPathStroker stroker;
            stroker.setWidth(std::max(12.0, m_strokeWidth + 10.0));
            return stroker.createStroke(m_hitPath).contains(pt);
        }
        return rect().contains(local.toPoint());
    }

protected:
    void paintEvent(QPaintEvent *) override
    {
        QPainter painter(this);
        painter.setRenderHint(QPainter::Antialiasing, true);
        painter.setRenderHint(QPainter::TextAntialiasing, true);
        painter.setOpacity(qBound(0.0, m_opacity, 1.0));

        auto makePen = [](const QString &colorStr, qreal width, const QString &style, Qt::PenCapStyle cap) -> QPen {
            if (width <= 0.0 || colorStr.isEmpty() || colorStr == QLatin1String("none"))
                return QPen(Qt::NoPen);
            QPen pen(QColor(colorStr), width, Qt::SolidLine, cap, Qt::RoundJoin);
            const qreal w = std::max(1.0, width);
            if (style == QLatin1String("dashed")) {
                pen.setDashPattern({ (w * 4.0) / width, (w * 2.5) / width });
            } else if (style == QLatin1String("dotted")) {
                pen.setCapStyle(Qt::RoundCap);
                pen.setDashPattern({ (w * 0.5) / width, (w * 2.5) / width });
            }
            return pen;
        };

        auto makeFont = [](int pixelSize, bool bold) -> QFont {
            QFont font(QStringLiteral("Microsoft YaHei UI"));
            font.setStyleHint(QFont::SansSerif);
            font.setPixelSize(std::max(1, pixelSize));
            font.setBold(bold);
            return font;
        };

        if (m_kind == QLatin1String("shape")) {
            painter.save();
            painter.translate(m_centerX, m_centerY);
            if (std::abs(m_rotation) > 1e-4)
                painter.rotate(m_rotation);
            painter.translate(-m_logicalWidth / 2.0, -m_logicalHeight / 2.0);

            const QBrush fillBrush = (m_fill.isEmpty() || m_fill == QLatin1String("none"))
                ? QBrush(Qt::NoBrush)
                : QBrush(QColor(m_fill));
            const Qt::PenCapStyle bodyCap = (m_strokeStyle == QLatin1String("dotted")) ? Qt::RoundCap : Qt::FlatCap;
            const QPen bodyPen = makePen(m_stroke, m_strokeWidth, m_strokeStyle, bodyCap);

            if (!m_bodyPath.isEmpty()) {
                painter.setBrush(fillBrush);
                painter.setPen(bodyPen);
                painter.drawPath(m_bodyPath);
            }
            if (!m_detailPaths.isEmpty()) {
                const QPen detailPen = makePen(m_stroke, m_strokeWidth, m_strokeStyle, Qt::RoundCap);
                painter.setBrush(Qt::NoBrush);
                painter.setPen(detailPen);
                for (const QPainterPath &dp : m_detailPaths)
                    painter.drawPath(dp);
            }
            if (!m_text.isEmpty()) {
                painter.setFont(makeFont(m_fontSize, m_fontWeight == QLatin1String("bold")));
                painter.setPen(QColor(m_textColor));
                int flags = Qt::AlignVCenter | Qt::TextWordWrap;
                if (m_textAlign == QLatin1String("left"))
                    flags |= Qt::AlignLeft;
                else if (m_textAlign == QLatin1String("right"))
                    flags |= Qt::AlignRight;
                else
                    flags |= Qt::AlignHCenter;
                painter.drawText(m_textBox, flags, m_text);
            }
            painter.restore();
            return;
        }

        if (m_kind == QLatin1String("line")) {
            painter.save();
            painter.translate(-m_originX, -m_originY);
            const Qt::PenCapStyle mainCap = (m_strokeStyle == QLatin1String("dotted")) ? Qt::RoundCap : Qt::FlatCap;
            const QPen mainPen = makePen(m_stroke, m_strokeWidth, m_strokeStyle, mainCap);
            painter.setBrush(Qt::NoBrush);
            painter.setPen(mainPen);
            painter.drawPath(m_mainPath);

            const QPen capPen = makePen(m_stroke, m_strokeWidth, QStringLiteral("solid"), Qt::RoundCap);
            if (!m_startCapPath.isEmpty()) {
                painter.setPen(capPen);
                painter.setBrush(m_startCapFilled ? QBrush(QColor(m_stroke)) : QBrush(Qt::NoBrush));
                painter.drawPath(m_startCapPath);
            }
            if (!m_endCapPath.isEmpty()) {
                painter.setPen(capPen);
                painter.setBrush(m_endCapFilled ? QBrush(QColor(m_stroke)) : QBrush(Qt::NoBrush));
                painter.drawPath(m_endCapPath);
            }
            painter.restore();

            if (!m_label.isEmpty()) {
                const QFont font = makeFont(m_fontSize, false);
                painter.setFont(font);
                const QFontMetricsF fm(font);
                const QRectF textBounds = fm.boundingRect(QRectF(0, 0, 1000, 200), Qt::AlignCenter, m_label);
                const qreal pillW = textBounds.width() + 10.0;
                const qreal pillH = textBounds.height() + 2.0;
                const QRectF pillRect(m_labelX - pillW / 2.0, m_labelY - pillH / 2.0, pillW, pillH);
                painter.setPen(Qt::NoPen);
                painter.setBrush(QColor(255, 255, 255));
                painter.drawRoundedRect(pillRect, 3.0, 3.0);
                painter.setPen(QColor(m_textColor));
                painter.drawText(pillRect, Qt::AlignCenter, m_label);
            }
        }
    }

private:
    QString m_kind;
    int m_x = 0;
    int m_y = 0;
    int m_width = 1;
    int m_height = 1;
    int m_logicalX = 0;
    int m_logicalY = 0;
    int m_logicalWidth = 1;
    int m_logicalHeight = 1;
    double m_centerX = 0.0;
    double m_centerY = 0.0;
    double m_rotation = 0.0;
    double m_opacity = 1.0;
    QPainterPath m_bodyPath;
    QList<QPainterPath> m_detailPaths;
    QString m_fill;
    QString m_stroke;
    double m_strokeWidth = 2.0;
    QString m_strokeStyle;
    QString m_text;
    QRectF m_textBox;
    QString m_textColor;
    int m_fontSize = 14;
    QString m_fontWeight;
    QString m_textAlign;
    double m_originX = 0.0;
    double m_originY = 0.0;
    QPainterPath m_mainPath;
    QPainterPath m_hitPath;
    QPainterPath m_startCapPath;
    bool m_startCapFilled = false;
    QPainterPath m_endCapPath;
    bool m_endCapFilled = false;
    QString m_label;
    double m_labelX = 0.0;
    double m_labelY = 0.0;
};

QWidget *widgetAtWithHitTest(QWidget *parent, const QPoint &posInParent)
{
    const QObjectList &children = parent->children();
    for (int i = int(children.size()) - 1; i >= 0; --i) {
        QWidget *child = qobject_cast<QWidget *>(children.at(i));
        if (!child || child->isHidden() || child->isWindow())
            continue;
        const QPoint childPos = child->mapFromParent(posInParent);
        if (!child->rect().contains(childPos))
            continue;
        if (QWidget *deep = widgetAtWithHitTest(child, childPos))
            return deep;
        if (auto *graphic = dynamic_cast<VfGraphicWidget *>(child)) {
            if (!graphic->hitTest(QPointF(childPos)))
                continue;
        }
        if (!child->testAttribute(Qt::WA_TransparentForMouseEvents))
            return child;
    }
    return nullptr;

}

} // namespace

struct Ui::Private
{
    explicit Private(Ui *ui) : q(ui) {}

    Ui *q;
    QMainWindow window;
    QJSEngine engine;
    QJSValue api;
    UiEffects effects;
    QList<Control> controls;          // 第 0 个是窗口本身
    QList<QWidget *> dialogs;         // 弹出窗口与模态对话框
    QList<QPair<QString, QAction *>> menuActions;
    QStatusBar *statusBar = nullptr;
    QWidget *statusBarControl = nullptr;
    QHash<QObject *, int> byWidget;
    int pressed = -1;                 // 鼠标左键是在哪个控件上按下的
    bool doubleClick = false;
    bool started = false;             // app.start 触发之前，显示和隐藏不播放效果
    // 界面销毁后，还没放完的效果再回调时靠它知道不能再碰界面
    std::shared_ptr<bool> alive = std::make_shared<bool>(true);

    QJSValue call(const char *function, const QJSValueList &args = {});
    int add(const QString &id, QWidget *widget, QList<QPair<QString, QByteArray>> props = {}, int effect = -1);
    int addExternal(const QString &id, QFrame *frame, const QString &text);
    void addMenuAction(const QString &id, QAction *action);
    int controlAt(const QPoint &globalPos) const;

    void dispatch(const QString &control, const QString &event, const QJSValue &value = QJSValue());
    void drain(const QJSValue &pending);
    void scheduleTimers();
    void syncStatusBar();
    void syncGraphics();
    void onDialogFinished(const QString &id);
    void applyView();
    void setShown(int index, bool shown);
    void clearTransition(int index);
    void finishTransition(int index, int generation);
    void setBusinessState(const QString &path, const QJSValue &value);
    void requestEvent(const QString &name, const QJSValue &args);
    void setExternal(const QString &id, QWidget *widget);

    // 生成的部分，见文件末尾
    void build();
    bool raiseBusinessEvent(const QString &name, const QJSValue &args);
    QAbstractAnimation *createVisibility(int effect, QWidget *target, bool showing);
};

Ui::Ui(QObject *parent)
    : BusinessInterface(parent)
    , d(new Private(this))
{
    // 逻辑：和工具里预览时运行的是同一份代码
    const QJSValue loaded = d->engine.evaluate(readResource(QStringLiteral(":/vf/logic/runtime.js")), QStringLiteral("runtime.js"));
    if (loaded.isError()) {
        qFatal("逻辑脚本加载失败（第 %d 行）：%s", loaded.property(QStringLiteral("lineNumber")).toInt(),
               qPrintable(loaded.toString()));
    }
    d->api = d->engine.globalObject().property(QStringLiteral("VF"));
    d->call("init", { readResource(QStringLiteral(":/vf/logic/project.json")) });

    d->build();
    d->applyView();
}

Ui::~Ui()
{
    *d->alive = false;
    if (d->statusBar)
        d->statusBar->removeEventFilter(this);
    for (const Control &control : d->controls) {
        if (control.widget)
            control.widget->removeEventFilter(this);
    }
    d->byWidget.clear();
    d->dialogs.clear();
    d->menuActions.clear();
    d->controls.clear();
    d->statusBar = nullptr;
    d->statusBarControl = nullptr;
    d->api = QJSValue();
    d->window.hide();
}

void Ui::show()
{
    d->window.show();
    d->syncStatusBar();
    start();
}

void Ui::start()
{
    if (d->started)
        return;
    d->drain(d->call("start"));
    d->started = true;
}

QWidget *Ui::window() const
{
    return &d->window;
}

UiEffects &Ui::effects()
{
    return d->effects;
}

QString Ui::stateDump() const
{
    return d->call("dump").toString();
}

QString Ui::widgetDump() const
{
    QJsonObject all;
    for (int index = 1; index < d->controls.size(); ++index) {
        const Control &control = d->controls.at(index);
        QJsonObject props;
        for (const auto &link : control.props)
            props.insert(link.first, QJsonValue::fromVariant(control.widget->property(link.second.constData())));
        QJsonObject one;
        // 只看这个控件自己的设置，不受外层控件影响
        one.insert(QStringLiteral("enabled"), !control.widget->testAttribute(Qt::WA_ForceDisabled));
        one.insert(QStringLiteral("props"), props);
        one.insert(QStringLiteral("visible"), !control.widget->isHidden());
        all.insert(control.id, one);
    }
    return QString::fromUtf8(QJsonDocument(all).toJson(QJsonDocument::Compact));
}

QString Ui::layoutDump() const
{
    QJsonObject all;
    for (int index = 1; index < d->controls.size(); ++index) {
        const Control &control = d->controls.at(index);
        QWidget *w = control.widget;
        if (!w || w->isHidden())
            continue;
        QWidget *topWin = w->window();
        if (topWin && topWin != &d->window && topWin->isHidden())
            continue;
        bool ancestorHidden = false;
        for (QWidget *cur = w; cur && cur != topWin; cur = cur->parentWidget()) {
            if (cur->isHidden()) {
                ancestorHidden = true;
                break;
            }
        }
        if (ancestorHidden)
            continue;
        const QPoint pos = (w == topWin) ? QPoint(0, 0) : w->mapTo(topWin, QPoint(0, 0));
        QJsonObject box;
        box.insert(QStringLiteral("x"), pos.x());
        box.insert(QStringLiteral("y"), pos.y());
        box.insert(QStringLiteral("width"), w->width());
        box.insert(QStringLiteral("height"), w->height());
        all.insert(control.id, box);
    }
    return QString::fromUtf8(QJsonDocument(all).toJson(QJsonDocument::Compact));
}

void Ui::triggerRequest(const QString &name, const QString &jsonArgs)
{
    QJSValue args = d->engine.newObject();
    if (!jsonArgs.isEmpty()) {
        const QJsonObject obj = QJsonDocument::fromJson(jsonArgs.toUtf8()).object();
        args = d->engine.toScriptValue(obj.toVariantMap());
    }
    d->requestEvent(name, args);
}

void Ui::setActionSimulation(const QString &name, const QString &mode, int delayMs)
{
    d->call("setActionSim", { name, mode, delayMs });
}

// ---- 鼠标事件 ----
//
// 和工具里的规则相同：每个控件都有 click、dblclick、mousedown、mouseup、mouseenter、mouseleave；
// 点击类事件只交给鼠标下最里面的那个控件；每次点击之后再触发一次全局事件 window.click。
bool Ui::eventFilter(QObject *watched, QEvent *event)
{
    if (watched == d->statusBar) {
        if (event->type() == QEvent::Resize || event->type() == QEvent::Show || event->type() == QEvent::LayoutRequest)
            d->syncStatusBar();
        return false;
    }

    const int index = d->byWidget.value(watched, -1);
    if (index < 0)
        return false;
    const QString id = d->controls.at(index).id;

    switch (event->type()) {
    case QEvent::Resize:
        if (watched == &d->window) {
            d->syncGraphics();
        }
        if (watched == &d->window)
            d->syncStatusBar();
        break;
    case QEvent::Close:
        if (index > 0 && d->dialogs.contains(d->controls.at(index).widget))
            d->onDialogFinished(id);
        break;
    case QEvent::Enter:
        if (index > 0)
            d->dispatch(id, QStringLiteral("mouseenter"));
        break;
    case QEvent::Leave:
        if (index > 0)
            d->dispatch(id, QStringLiteral("mouseleave"));
        break;
    case QEvent::MouseButtonPress:
    case QEvent::MouseButtonDblClick: {
        auto *mouse = static_cast<QMouseEvent *>(event);
        // 没被里面的控件处理的事件会再传给外层，外层在这里认出“不是点在我自己身上”，不重复处理
        const int hitIndex = (mouse->button() == Qt::LeftButton) ? d->controlAt(mouse->globalPosition().toPoint()) : -1;
        if (hitIndex < 0 || (hitIndex != index && !dynamic_cast<VfGraphicWidget *>(watched)))
            break;
        if (d->pressed == hitIndex && event->type() == QEvent::MouseButtonPress)
            break;
        d->pressed = hitIndex;
        d->doubleClick = event->type() == QEvent::MouseButtonDblClick;
        if (hitIndex > 0)
            d->dispatch(d->controls.at(hitIndex).id, QStringLiteral("mousedown"));
        if (true)
            break;
        d->pressed = index;
        d->doubleClick = event->type() == QEvent::MouseButtonDblClick;
        if (index > 0)
            d->dispatch(id, QStringLiteral("mousedown"));
        break;
    }
    case QEvent::MouseButtonRelease: {
        auto *mouse = static_cast<QMouseEvent *>(event);
        if (mouse->button() != Qt::LeftButton || d->pressed < 0 || (d->pressed != index && !dynamic_cast<VfGraphicWidget *>(watched)))
            break;
        const int pressedIndex = d->pressed;
        const QString pressedId = d->controls.at(pressedIndex).id;
        const int hitTarget = d->controlAt(mouse->globalPosition().toPoint());
        const bool wasDoubleClick = d->doubleClick;
        d->pressed = -1;
        d->doubleClick = false;
        if (hitTarget > 0)
            d->dispatch(d->controls.at(hitTarget).id, QStringLiteral("mouseup"));
        if (hitTarget == pressedIndex) {
            if (pressedIndex > 0)
                d->dispatch(pressedId, QStringLiteral("click"));
            d->dispatch(QString(), QStringLiteral("window.click"));
            if (wasDoubleClick && pressedIndex > 0)
                d->dispatch(pressedId, QStringLiteral("dblclick"));
        }
        if (true)
            break;
        const int target = d->controlAt(mouse->globalPosition().toPoint());
        const bool doubleClick = d->doubleClick;
        d->pressed = -1;
        d->doubleClick = false;
        if (target > 0)
            d->dispatch(d->controls.at(target).id, QStringLiteral("mouseup"));
        // 在同一个控件上按下又松开，才算一次点击
        if (target == index) {
            if (index > 0)
                d->dispatch(id, QStringLiteral("click"));
            d->dispatch(QString(), QStringLiteral("window.click"));
            if (doubleClick && index > 0)
                d->dispatch(id, QStringLiteral("dblclick"));
        }
        break;
    }
    default:
        break;
    }
    return false;
}

// ---- 固定的部分 ----

QJSValue Ui::Private::call(const char *function, const QJSValueList &args)
{
    QJSValue result = api.property(QString::fromLatin1(function)).call(args);
    if (result.isError())
        qWarning("逻辑运行出错（%s）：%s", function, qPrintable(result.toString()));
    return result;
}

int Ui::Private::add(const QString &id, QWidget *widget, QList<QPair<QString, QByteArray>> props, int effect)
{
    Control control;
    control.id = id;
    control.widget = widget;
    control.props = std::move(props);
    control.effect = effect;
    control.designRect = widget->geometry();
    // 对象名就是设计项目里的控件 ID，测试和调试都靠它找控件
    widget->setObjectName(id);
    widget->installEventFilter(q);
    controls.append(control);
    byWidget.insert(widget, int(controls.size()) - 1);
    return int(controls.size()) - 1;
}

// 外部容器：里面的控件由业务提供，界面不处理它上面的鼠标事件
int Ui::Private::addExternal(const QString &id, QFrame *frame, const QString &text)
{
    Control control;
    control.id = id;
    control.widget = frame;
    frame->setObjectName(id);
    frame->setFrameShape(QFrame::StyledPanel);
    control.placeholder = addPlaceholder(frame, text, &control.hostLayout);
    controls.append(control);
    byWidget.insert(frame, int(controls.size()) - 1);
    return int(controls.size()) - 1;
}

void Ui::Private::addMenuAction(const QString &id, QAction *action)
{
    action->setObjectName(id);
    menuActions.append({ id, action });
    QObject::connect(action, &QAction::triggered, q, [this, id] {
        dispatch(id, QStringLiteral("mousedown"));
        dispatch(id, QStringLiteral("mouseup"));
        dispatch(id, QStringLiteral("click"));
        dispatch(QString(), QStringLiteral("window.click"));
    });
}

// 某个位置上最里面的那个控件；不在任何控件上（包括窗口之外）时返回 -1，在窗口空白处返回 0。
int Ui::Private::controlAt(const QPoint &globalPos) const
{
    for (int i = dialogs.size() - 1; i >= 0; --i) {
        QWidget *dlg = dialogs.at(i);
        if (!dlg || dlg->isHidden())
            continue;
        const QPoint local = dlg->mapFromGlobal(globalPos);
        if (!dlg->rect().contains(local)) {
            if (dlg->property("modal").toBool())
                return -1;
            continue;
        }
        QWidget *widget = widgetAtWithHitTest(dlg, local);
        if (!widget)
            widget = dlg;
        while (widget) {
            const int index = byWidget.value(widget, -1);
            if (index >= 0)
                return index;
            widget = widget->parentWidget();
        }
    }
    QWidget *widget = widgetAtWithHitTest(const_cast<QMainWindow *>(&window), window.mapFromGlobal(globalPos));
    while (widget) {
        const int index = byWidget.value(widget, -1);
        if (index >= 0)
            return index;
        widget = widget->parentWidget();
    }
    return -1;
}

// control 为空表示全局事件
void Ui::Private::dispatch(const QString &control, const QString &event, const QJSValue &value)
{
    const QJSValue target = control.isNull() ? QJSValue(QJSValue::NullValue) : QJSValue(control);
    drain(call("dispatch", { target, event, value }));
}

// 处理逻辑交出来的业务事件与动作请求：业务连接了对应的信号，就发信号，由业务把结果写回来；
// 没有连接，就执行设计项目里写的模拟步骤或动作脚本。模拟步骤可能再引出别的事件，所以是一个队列。
void Ui::Private::drain(const QJSValue &pending)
{
    QList<PendingEvent> queue = toPendingList(pending);
    QApplication::sendPostedEvents();
    queue += toPendingList(call("takePending"));
    for (int guard = 0; !queue.isEmpty() && guard < 200; ++guard) {
        const PendingEvent ev = queue.takeFirst();
        if (!raiseBusinessEvent(ev.name, ev.args)) {
            const char *fn = (ev.kind == QLatin1String("action")) ? "simulateAction" : "simulate";
            queue += toPendingList(call(fn, { ev.name, ev.args }));
            QApplication::sendPostedEvents();
        }
        queue += toPendingList(call("takePending"));
    }
    scheduleTimers();
    applyView();
}

void Ui::Private::scheduleTimers()
{
    const QJSValue timers = call("takeTimers");
    const int count = timers.property(QStringLiteral("length")).toInt();
    for (int i = 0; i < count; ++i) {
        const QJSValue t = timers.property(quint32(i));
        const int id = t.property(QStringLiteral("id")).toInt();
        const int delayMs = t.property(QStringLiteral("delayMs")).toInt();
        QTimer::singleShot(qMax(0, delayMs), q, [this, alive = alive, id] {
            if (*alive)
                drain(call("fireTimer", { id }));
        });
    }
}

void Ui::Private::syncStatusBar()
{
    if (!statusBar || !statusBarControl)
        return;
    const QRect target(0, 0, statusBar->width(), statusBar->height());
    if (statusBarControl->geometry() != target)
        statusBarControl->setGeometry(target);
    if (statusBarControl->layout())
        statusBarControl->layout()->activate();
}

void Ui::Private::syncGraphics()
{
    QWidget *root = window.centralWidget();
    const int cw = root ? root->width() : window.width();
    const int ch = root ? root->height() : window.height();
    const QJSValue graphics = call("graphics", { cw, ch });
    if (!graphics.isObject())
        return;
    bool hasGraphics = false;
    for (int index = 1; index < controls.size(); ++index) {
        Control &control = controls[index];
        auto *graphic = dynamic_cast<VfGraphicWidget *>(control.widget);
        if (!graphic)
            continue;
        hasGraphics = true;
        const QJSValue g = graphics.property(control.id);
        if (g.isUndefined() || g.isNull())
            continue;
        const QRect target(
            qRound(g.property(QStringLiteral("x")).toNumber()),
            qRound(g.property(QStringLiteral("y")).toNumber()),
            qMax(1, qRound(g.property(QStringLiteral("width")).toNumber())),
            qMax(1, qRound(g.property(QStringLiteral("height")).toNumber()))
        );
        if (!control.transitioning && graphic->geometry() != target) {
            graphic->setGeometry(target);
            control.designRect = target;
        }
        graphic->applySpec(g, !control.transitioning);
    }
    if (hasGraphics && root && !root->autoFillBackground()) {
        QPalette pal = root->palette();
        pal.setColor(QPalette::Window, Qt::white);
        root->setPalette(pal);
        root->setAutoFillBackground(true);
    }
}

void Ui::Private::onDialogFinished(const QString &id)
{
    for (int i = 1; i < controls.size(); ++i) {
        if (controls.at(i).id == id) {
            if (!controls.at(i).shown)
                return;
            controls[i].shown = false;
            drain(call("closeWindow", { id }));
            return;
        }
    }
}

// 把逻辑算出的可见、可用和属性写到控件上
void Ui::Private::applyView()
{
    const QJSValue views = call("views");
    for (const auto &entry : menuActions) {
        const QJSValue view = views.property(entry.first);
        if (view.isUndefined())
            continue;
        QAction *act = entry.second;
        const QSignalBlocker blocker(act);
        act->setEnabled(view.property(QStringLiteral("enabled")).toBool());
        act->setVisible(view.property(QStringLiteral("visible")).toBool());
        const QJSValue p = view.property(QStringLiteral("props"));
        if (p.hasProperty(QStringLiteral("text")))
            act->setText(p.property(QStringLiteral("text")).toString());
        if (p.hasProperty(QStringLiteral("checked")))
            act->setChecked(p.property(QStringLiteral("checked")).toBool());
    }

    for (int index = 1; index < controls.size(); ++index) {
        const Control &control = controls.at(index);
        const QJSValue view = views.property(control.id);
        control.widget->setEnabled(view.property(QStringLiteral("enabled")).toBool());
        const QJSValue props = view.property(QStringLiteral("props"));
        {
            const QSignalBlocker blocker(control.widget);
            for (const auto &link : control.props) {
                const QJSValue value = props.property(link.first);
                if (value.isUndefined() || value.isNull())
                    continue;
                const QVariant wanted = value.toVariant();
                if (link.second == "vfOptions") {
                    if (auto *combo = qobject_cast<QComboBox *>(control.widget)) {
                        if (combo->property("vfOptions") != wanted) {
                            combo->clear();
                            const QString raw = wanted.toString();
                            for (const QString &part : raw.split(QLatin1Char(','), Qt::SkipEmptyParts))
                                combo->addItem(part.trimmed());
                            const QString curVal = props.property(QStringLiteral("value")).toString();
                            const int idx = combo->findText(curVal);
                            if (idx >= 0)
                                combo->setCurrentIndex(idx);
                        }
                    }
                } else if (link.second == "currentText") {
                    if (auto *combo = qobject_cast<QComboBox *>(control.widget)) {
                        const int idx = combo->findText(wanted.toString());
                        if (idx >= 0 && combo->currentIndex() != idx)
                            combo->setCurrentIndex(idx);
                    }
                } else if (link.second == "vfItems") {
                    if (auto *list = qobject_cast<QListWidget *>(control.widget)) {
                        if (list->property("vfItems") != wanted) {
                            list->clear();
                            const bool checkable = props.property(QStringLiteral("checkable")).toBool();
                            const QVariantList items = wanted.toList();
                            for (const QVariant &it : items) {
                                if (it.typeId() == QMetaType::QVariantMap) {
                                    const QVariantMap map = it.toMap();
                                    QString name = map.value(QStringLiteral("name")).toString();
                                    if (name.isEmpty())
                                        name = map.value(QStringLiteral("label")).toString();
                                    if (name.isEmpty())
                                        name = map.value(QStringLiteral("title")).toString();
                                    if (name.isEmpty())
                                        name = map.value(QStringLiteral("text")).toString();
                                    if (name.isEmpty())
                                        name = map.value(QStringLiteral("id")).toString();
                                    if (checkable) {
                                        const bool vis = map.value(QStringLiteral("visible"), true).toBool();
                                        list->addItem((vis ? QStringLiteral("● ") : QStringLiteral("○ ")) + name);
                                    } else {
                                        list->addItem(name);
                                    }
                                } else {
                                    list->addItem(it.toString());
                                }
                            }
                            const int curRow = props.property(QStringLiteral("value")).toInt();
                            if (curRow >= 0 && curRow < list->count())
                                list->setCurrentRow(curRow);
                        }
                    }
                } else if (link.second == "currentRow") {
                    if (auto *list = qobject_cast<QListWidget *>(control.widget)) {
                        const int row = wanted.toInt();
                        if (row >= -1 && row < list->count() && list->currentRow() != row)
                            list->setCurrentRow(row);
                    }
                } else if (link.second == "vfOrientation") {
                    if (auto *frame = qobject_cast<QFrame *>(control.widget)) {
                        frame->setFrameShape(wanted.toString() == QLatin1String("vertical") ? QFrame::VLine : QFrame::HLine);
                    }
                } else if (link.second == "vfAlign") {
                    if (auto *label = qobject_cast<QLabel *>(control.widget)) {
                        const QString align = wanted.toString();
                        if (align == QLatin1String("center"))
                            label->setAlignment(Qt::AlignCenter);
                        else if (align == QLatin1String("right"))
                            label->setAlignment(Qt::AlignRight | Qt::AlignVCenter);
                        else
                            label->setAlignment(Qt::AlignLeft | Qt::AlignVCenter);
                    }
                } else if (link.second == "windowTitle") {
                    if (auto *dock = qobject_cast<QDockWidget *>(control.widget)) {
                        if (auto *hdr = qobject_cast<QLabel *>(dock->titleBarWidget()))
                            hdr->setText(wanted.toString());
                    }
                }
                // 值没变就不写，免得输入框的光标被重置
                if (control.widget->property(link.second.constData()) != wanted)
                    control.widget->setProperty(link.second.constData(), wanted);
            }
        }
        setShown(index, view.property(QStringLiteral("visible")).toBool());
    }
    QApplication::sendPostedEvents(nullptr, QEvent::LayoutRequest);
    syncGraphics();
}

// 显示或隐藏一个控件。指定了效果、并且有人提供了实现时，带着过渡动画做：
// 显示是先显示再跑动画，隐藏是动画跑完再隐藏；中途又变了，旧的那次作废。
//
// 效果的实现只负责创建动画。启动、收尾、把控件定到最终状态，都在这里做，
// 所以效果的实现写漏了什么，控件也一定会到达最终的显示或隐藏状态。
void Ui::Private::setShown(int index, bool shown)
{
    Control &control = controls[index];
    if (control.shown == shown)
        return;
    control.shown = shown;
    const int generation = ++control.generation;
    // 上一次过渡还没跑完：停掉它，控件恢复原样，再开始这一次
    clearTransition(index);
    QWidget *widget = control.widget;
    if (!started || control.effect < 0) {
        widget->setVisible(shown);
        if (shown && widget->layout())
            widget->layout()->activate();
        return;
    }

    widget->setVisible(true);
    control.transitioning = true;
    QAbstractAnimation *animation = createVisibility(control.effect, widget, shown);
    if (!animation) {
        // 没有人提供实现，或者实现说没有动画可做：直接到最终状态
        finishTransition(index, generation);
        return;
    }
    control.transition = animation;
    auto finish = [this, alive = alive, index, generation] {
        if (*alive)
            finishTransition(index, generation);
    };
    QObject::connect(animation, &QAbstractAnimation::finished, q, finish);

    // 兜底：动画没有按时结束（比如被暂停了、被别处删掉了），到点也照样收尾
    const int duration = animation->totalDuration();
    if (duration < 0) {
        qWarning("控件 %s 的过渡动画没有结束时间（循环个不停），已跳过过渡", qPrintable(control.id));
        finishTransition(index, generation);
        return;
    }
    QTimer::singleShot(duration + kTransitionGraceMs, q, finish);
    if (animation->state() == QAbstractAnimation::Stopped)
        animation->start();
}

// 停掉并删除还在跑的过渡动画，把控件的位置、大小恢复原样，清掉动画加在控件上的图形效果。
void Ui::Private::clearTransition(int index)
{
    Control &control = controls[index];
    if (!control.transitioning)
        return;
    control.transitioning = false;
    if (QAbstractAnimation *animation = control.transition) {
        control.transition = nullptr;
        animation->stop();
        animation->deleteLater();
    }
    control.widget->setGeometry(control.designRect);
    control.widget->setGraphicsEffect(nullptr);
}

// 一次过渡结束：动画跑完、没有动画、超时，都走这里。已经被后来的一次取代的，不做任何事。
void Ui::Private::finishTransition(int index, int generation)
{
    Control &control = controls[index];
    if (control.generation != generation || !control.transitioning)
        return;
    // 先定到最终的显示或隐藏状态，再恢复大小，免得收起之后完整的面板闪一下
    control.widget->setVisible(control.shown);
    clearTransition(index);
}

void Ui::Private::setBusinessState(const QString &path, const QJSValue &value)
{
    const QJSValue problem = call("setState", { path, value });
    if (problem.isString())
        qWarning("业务写回状态失败：%s", qPrintable(problem.toString()));
    applyView();
}

void Ui::Private::requestEvent(const QString &name, const QJSValue &args)
{
    drain(call("request", { name, args }));
}

void Ui::Private::setExternal(const QString &id, QWidget *widget)
{
    for (Control &control : controls) {
        if (control.id != id || !control.hostLayout)
            continue;
        if (control.hosted && control.hosted != widget) {
            // 原来放着的控件交还给业务，不删除
            control.hostLayout->removeWidget(control.hosted);
            control.hosted->setParent(nullptr);
        }
        control.hosted = widget;
        control.placeholder->setVisible(widget == nullptr);
        if (widget)
            control.hostLayout->addWidget(widget);
        return;
    }
}

// ---- 生成的部分 ----

// 控件树和位置。每个控件的对象名就是它在设计项目里的 ID。
void Ui::Private::build()
{
    window.setWindowTitle(QStringLiteral("图形与连线导出样板"));
    auto *w_shapesWindow = new QWidget(&window);
    w_shapesWindow->setFixedSize(840, 520);
    window.setCentralWidget(w_shapesWindow);
    add(QStringLiteral("shapesWindow"), w_shapesWindow);

    // startBox：基础图形
    auto *w_startBox = new VfGraphicWidget(w_shapesWindow);
    w_startBox->setGeometry(36, 48, 130, 64);
    add(QStringLiteral("startBox"), w_startBox);

    // decisionDiamond：基础图形
    auto *w_decisionDiamond = new VfGraphicWidget(w_shapesWindow);
    w_decisionDiamond->setGeometry(250, 36, 140, 88);
    add(QStringLiteral("decisionDiamond"), w_decisionDiamond);

    // inputPara：基础图形
    auto *w_inputPara = new VfGraphicWidget(w_shapesWindow);
    w_inputPara->setGeometry(490, 48, 150, 64);
    add(QStringLiteral("inputPara"), w_inputPara);

    // dbCylinder：基础图形
    auto *w_dbCylinder = new VfGraphicWidget(w_shapesWindow);
    w_dbCylinder->setGeometry(260, 210, 120, 88);
    add(QStringLiteral("dbCylinder"), w_dbCylinder);

    // docReport：基础图形
    auto *w_docReport = new VfGraphicWidget(w_shapesWindow);
    w_docReport->setGeometry(495, 214, 140, 80);
    add(QStringLiteral("docReport"), w_docReport);

    // subProcess：基础图形
    auto *w_subProcess = new VfGraphicWidget(w_shapesWindow);
    w_subProcess->setGeometry(36, 214, 136, 80);
    add(QStringLiteral("subProcess"), w_subProcess);

    // starBadge：基础图形
    auto *w_starBadge = new VfGraphicWidget(w_shapesWindow);
    w_starBadge->setGeometry(44, 366, 110, 104);
    add(QStringLiteral("starBadge"), w_starBadge);

    // hexNode：基础图形
    auto *w_hexNode = new VfGraphicWidget(w_shapesWindow);
    w_hexNode->setGeometry(200, 376, 130, 84);
    add(QStringLiteral("hexNode"), w_hexNode);

    // cloudNote：基础图形
    auto *w_cloudNote = new VfGraphicWidget(w_shapesWindow);
    w_cloudNote->setGeometry(376, 368, 156, 96);
    add(QStringLiteral("cloudNote"), w_cloudNote);

    // rotatedRect：基础图形
    auto *w_rotatedRect = new VfGraphicWidget(w_shapesWindow);
    w_rotatedRect->setGeometry(686, 190, 116, 72);
    add(QStringLiteral("rotatedRect"), w_rotatedRect);

    // rotatedTri：基础图形
    auto *w_rotatedTri = new VfGraphicWidget(w_shapesWindow);
    w_rotatedTri->setGeometry(692, 366, 104, 92);
    add(QStringLiteral("rotatedTri"), w_rotatedTri);

    // lineStartToDecision：线条
    auto *w_lineStartToDecision = new VfGraphicWidget(w_shapesWindow);
    w_lineStartToDecision->setGeometry(166, 66, 84, 28);
    add(QStringLiteral("lineStartToDecision"), w_lineStartToDecision);

    // lineDecisionToInput：线条
    auto *w_lineDecisionToInput = new VfGraphicWidget(w_shapesWindow);
    w_lineDecisionToInput->setGeometry(390, 66, 115, 28);
    add(QStringLiteral("lineDecisionToInput"), w_lineDecisionToInput);

    // lineDecisionToDb：线条
    auto *w_lineDecisionToDb = new VfGraphicWidget(w_shapesWindow);
    w_lineDecisionToDb->setGeometry(306, 124, 28, 86);
    add(QStringLiteral("lineDecisionToDb"), w_lineDecisionToDb);

    // lineDbToDoc：线条
    auto *w_lineDbToDoc = new VfGraphicWidget(w_shapesWindow);
    w_lineDbToDoc->setGeometry(380, 240, 115, 28);
    add(QStringLiteral("lineDbToDoc"), w_lineDbToDoc);

    // lineDocToRotated：线条
    auto *w_lineDocToRotated = new VfGraphicWidget(w_shapesWindow);
    w_lineDocToRotated->setGeometry(635, 195, 65, 65);
    add(QStringLiteral("lineDocToRotated"), w_lineDocToRotated);

    // freeDecorLine：线条
    auto *w_freeDecorLine = new VfGraphicWidget(w_shapesWindow);
    w_freeDecorLine->setGeometry(556, 402, 112, 28);
    add(QStringLiteral("freeDecorLine"), w_freeDecorLine);
}

// 交给业务的事件：业务连接了对应的信号，就发信号并返回 true；没有连接，返回 false，由调用方执行模拟步骤。
bool Ui::Private::raiseBusinessEvent(const QString &name, const QJSValue &args)
{
    Q_UNUSED(args);
    Q_UNUSED(name);
    return false;
}

// 显示隐藏的过渡：有人提供了实现，就让它创建动画并返回；没有就返回空，由调用方直接切到结束状态。
QAbstractAnimation *Ui::Private::createVisibility(int effect, QWidget *target, bool showing)
{
    Q_UNUSED(effect);
    Q_UNUSED(target);
    Q_UNUSED(showing);
    return nullptr;
}

// 业务接口的实现
// （这个设计项目没有业务管的状态，也没有外部容器）

} // namespace vf
