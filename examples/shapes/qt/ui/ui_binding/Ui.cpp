// 界面绑定层。由 VibeFrontend 导出，不要手改：下次导出会整个覆盖。
//
// 这个文件分两部分：
//   文件末尾“生成的部分”随设计项目变化：控件树、位置、排版、事件的连接、业务接口的实现、效果的调用；
//   其余是固定的：把逻辑脚本放进 Qt 自带的 JS 引擎运行，把鼠标事件交给它，再把算出的结果写到控件上。
#include "Ui.h"

#include <QAbstractAnimation>
#include <QAbstractItemModel>
#include <QAbstractScrollArea>
#include <QAbstractSlider>
#include <QAction>
#include <QActionGroup>
#include <QApplication>
#include <QBoxLayout>
#include <QCheckBox>
#include <QComboBox>
#include <QCursor>
#include <QDialog>
#include <QDialogButtonBox>
#include <QDockWidget>
#include <QDropEvent>
#include <QEvent>
#include <QFile>
#include <QFormLayout>
#include <QFrame>
#include <QGridLayout>
#include <QHBoxLayout>
#include <QHash>
#include <QHeaderView>
#include <QIcon>
#include <QJSEngine>
#include <QJSValue>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonValue>
#include <QKeySequence>
#include <QLabel>
#include <QLayout>
#include <QLineEdit>
#include <QListWidget>
#include <QMainWindow>
#include <QMap>
#include <QMargins>
#include <QMenu>
#include <QMenuBar>
#include <QMetaMethod>
#include <QMimeData>
#include <QMouseEvent>
#include <QPainter>
#include <QPen>
#include <QPixmap>
#include <QPlainTextEdit>
#include <QPointer>
#include <QPushButton>
#include <QScrollBar>
#include <QSet>
#include <QSignalBlocker>
#include <QSizePolicy>
#include <QSlider>
#include <QSpinBox>
#include <QStackedLayout>
#include <QStatusBar>
#include <QTabBar>
#include <QSvgRenderer>
#include <QTabBar>
#include <QTimer>
#include <QTreeWidget>
#include <QTreeWidgetItem>
#include <QVBoxLayout>
#include <QVariant>
#include <QFont>
#include <QFontMetricsF>
#include <QPainterPath>
#include <QPainterPathStroker>
#include <QPalette>
#include <QRegularExpression>
#include <QVariantAnimation>
#include <algorithm>
#include <cmath>
#include <functional>
// （这个设计项目没有用到别的 Qt 控件类）

namespace vf {

namespace {

// 过渡动画超过它自己的时长这么多毫秒还没有结束，就不再等它
const int kTransitionGraceMs = 300;

// 状态图片控件：同一套 5 状态 SVG（normal / hover / pressed / selected / disabled）用 QSvgRenderer 九宫格绘制，
// 状态切换带透明度过渡，文字由控件另外画在上面。
class StateImageWidget : public QWidget
{
public:
    explicit StateImageWidget(QWidget *parent = nullptr)
        : QWidget(parent)
        , m_anim(new QVariantAnimation(this))
    {
        setAttribute(Qt::WA_Hover, true);
        m_anim->setStartValue(0.0);
        m_anim->setEndValue(1.0);
        QObject::connect(m_anim, &QVariantAnimation::valueChanged, this, [this](const QVariant &v) {
            m_transitionProgress = v.toReal();
            update();
        });
        QObject::connect(m_anim, &QVariantAnimation::finished, this, [this] {
            m_transitionProgress = 1.0;
            m_prevImage.clear();
            update();
        });
    }

    void configure(const QString &basePath, const QMap<QString, QString> &stateFiles, const QMargins &slice, int transitionMs)
    {
        m_basePath = basePath;
        m_stateFiles = stateFiles;
        m_slice = slice;
        m_transitionMs = qMax(0, transitionMs);
        for (auto it = m_stateFiles.begin(); it != m_stateFiles.end(); ++it) {
            const QString file = it.value();
            if (!file.isEmpty() && !m_renderers.contains(file)) {
                auto *renderer = new QSvgRenderer(m_basePath + file, this);
                m_renderers.insert(file, renderer);
            }
        }
        m_currentImage = m_stateFiles.value(QStringLiteral("normal"));
    }

    void applyViewState(const QVariantMap &props, const QString &visualState, const QString &stateImage, bool animate)
    {
        m_props = props;
        m_visualState = visualState.isEmpty() ? QStringLiteral("normal") : visualState;
        const QString nextImg = stateImage.isEmpty() ? m_stateFiles.value(m_visualState, m_stateFiles.value(QStringLiteral("normal"))) : stateImage;
        if (!nextImg.isEmpty() && nextImg != m_currentImage) {
            if (animate && m_transitionMs > 0 && !m_currentImage.isEmpty()) {
                m_prevImage = m_currentImage;
                m_currentImage = nextImg;
                m_transitionProgress = 0.0;
                m_anim->stop();
                m_anim->setDuration(m_transitionMs);
                m_anim->setStartValue(0.0);
                m_anim->setEndValue(1.0);
                m_anim->start();
            } else {
                m_anim->stop();
                m_prevImage.clear();
                m_currentImage = nextImg;
                m_transitionProgress = 1.0;
            }
        }
        update();
    }

    QString visualState() const { return m_visualState; }
    QString currentStateImage() const { return m_currentImage; }

protected:
    void paintEvent(QPaintEvent *) override
    {
        QPainter painter(this);
        painter.setRenderHint(QPainter::Antialiasing, true);
        const QRectF bounds(rect());

        if (m_transitionProgress < 1.0 && !m_prevImage.isEmpty()) {
            painter.setOpacity(1.0 - m_transitionProgress);
            renderNineSlice(&painter, m_renderers.value(m_prevImage), bounds);
            painter.setOpacity(m_transitionProgress);
            renderNineSlice(&painter, m_renderers.value(m_currentImage), bounds);
        } else {
            painter.setOpacity(1.0);
            renderNineSlice(&painter, m_renderers.value(m_currentImage), bounds);
        }
        painter.setOpacity(1.0);

        const QString text = m_props.value(QStringLiteral("text")).toString();
        if (!text.isEmpty()) {
            QColor color(QStringLiteral("#e2e8f0"));
            if (m_visualState == QLatin1String("disabled")) {
                const QString disCol = m_props.value(QStringLiteral("disabledTextColor")).toString();
                color = QColor(disCol.isEmpty() ? QStringLiteral("#64748b") : disCol);
            } else if (m_visualState == QLatin1String("selected")) {
                const QString selCol = m_props.value(QStringLiteral("selectedTextColor")).toString();
                color = QColor(selCol.isEmpty() ? QStringLiteral("#ffffff") : selCol);
            } else {
                const QString txtCol = m_props.value(QStringLiteral("textColor")).toString();
                if (!txtCol.isEmpty())
                    color = QColor(txtCol);
            }
            QFont f = font();
            const int fontSize = m_props.value(QStringLiteral("fontSize")).toInt();
            f.setPixelSize(fontSize > 0 ? fontSize : 13);
            f.setWeight(QFont::DemiBold);
            painter.setFont(f);
            painter.setPen(color);
            const QString alignStr = m_props.value(QStringLiteral("align")).toString();
            Qt::Alignment align = Qt::AlignCenter;
            if (alignStr == QLatin1String("left"))
                align = Qt::AlignLeft | Qt::AlignVCenter;
            else if (alignStr == QLatin1String("right"))
                align = Qt::AlignRight | Qt::AlignVCenter;
            painter.drawText(rect().adjusted(10, 0, -10, 0), align, text);
        }
    }

private:
    void renderNineSlice(QPainter *painter, QSvgRenderer *renderer, const QRectF &target) const
    {
        if (!renderer || !renderer->isValid() || target.isEmpty())
            return;
        QRectF vb = renderer->viewBoxF();
        if (vb.isEmpty())
            vb = QRectF(QPointF(0, 0), QSizeF(renderer->defaultSize()));
        if (vb.isEmpty())
            vb = QRectF(0, 0, 100, 36);

        const qreal slTop = m_slice.top();
        const qreal slRight = m_slice.right();
        const qreal slBottom = m_slice.bottom();
        const qreal slLeft = m_slice.left();
        if (slTop <= 0 && slRight <= 0 && slBottom <= 0 && slLeft <= 0) {
            renderer->render(painter, target);
            return;
        }

        const qreal vw = vb.width();
        const qreal vh = vb.height();
        const qreal tw = target.width();
        const qreal th = target.height();

        const qreal sx[4] = { 0.0, qMin(slLeft, vw * 0.5), qMax(qMin(slLeft, vw * 0.5), vw - qMin(slRight, vw * 0.5)), vw };
        const qreal sy[4] = { 0.0, qMin(slTop, vh * 0.5), qMax(qMin(slTop, vh * 0.5), vh - qMin(slBottom, vh * 0.5)), vh };
        const qreal dx[4] = { 0.0, qMin(slLeft, tw * 0.5), qMax(qMin(slLeft, tw * 0.5), tw - qMin(slRight, tw * 0.5)), tw };
        const qreal dy[4] = { 0.0, qMin(slTop, th * 0.5), qMax(qMin(slTop, th * 0.5), th - qMin(slBottom, th * 0.5)), th };

        for (int r = 0; r < 3; ++r) {
            for (int c = 0; c < 3; ++c) {
                const qreal sw = sx[c + 1] - sx[c];
                const qreal sh = sy[r + 1] - sy[r];
                const qreal dw = dx[c + 1] - dx[c];
                const qreal dh = dy[r + 1] - dy[r];
                if (sw <= 0.0 || sh <= 0.0 || dw <= 0.0 || dh <= 0.0)
                    continue;
                const QRectF dstPatch(target.left() + dx[c], target.top() + dy[r], dw, dh);
                const qreal scaleX = dw / sw;
                const qreal scaleY = dh / sh;
                const QRectF fullTarget(
                    dstPatch.left() - sx[c] * scaleX,
                    dstPatch.top() - sy[r] * scaleY,
                    vw * scaleX,
                    vh * scaleY
                );
                painter->save();
                painter->setClipRect(dstPatch, Qt::IntersectClip);
                renderer->render(painter, fullTarget);
                painter->restore();
            }
        }
    }

    QString m_basePath;
    QMap<QString, QString> m_stateFiles;
    QMap<QString, QSvgRenderer *> m_renderers;
    QMargins m_slice;
    int m_transitionMs = 120;
    QString m_visualState = QStringLiteral("normal");
    QString m_currentImage;
    QString m_prevImage;
    qreal m_transitionProgress = 1.0;
    QVariantAnimation *m_anim = nullptr;
    QVariantMap m_props;
};

// 自绘效果控件：已注册绘制效果时调用实现绘制，未注册（或 --no-effects）时显示虚线占位框。
class PaintEffectWidget : public QWidget
{
public:
    using PaintCallback = std::function<bool(QPainter *, const QRect &, const QVariantMap &)>;

    explicit PaintEffectWidget(QWidget *parent = nullptr) : QWidget(parent) {}

    void configure(const QString &effectName, PaintCallback paintFn)
    {
        m_effectName = effectName;
        m_paintFn = std::move(paintFn);
    }

    void applyProps(const QVariantMap &props)
    {
        m_props = props;
        update();
    }

protected:
    void paintEvent(QPaintEvent *) override
    {
        QPainter painter(this);
        painter.setRenderHint(QPainter::Antialiasing, true);
        if (m_paintFn && m_paintFn(&painter, rect(), m_props))
            return;

        painter.setPen(QPen(QColor(217, 119, 6, 190), 1, Qt::DashLine));
        painter.setBrush(QColor(40, 32, 20, 120));
        painter.drawRoundedRect(rect().adjusted(1, 1, -1, -1), 6, 6);
        painter.setPen(QColor(251, 191, 36));
        painter.drawText(
            rect().adjusted(6, 6, -6, -6),
            Qt::AlignCenter | Qt::TextWordWrap,
            QStringLiteral("%1\n[绘制效果占位：%2]").arg(objectName(), m_effectName)
        );
    }

private:
    QString m_effectName;
    PaintCallback m_paintFn;
    QVariantMap m_props;
};

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
    StateImageWidget *stateImageWidget = nullptr;
    PaintEffectWidget *paintEffectWidget = nullptr;
    // 控件属性名 → Qt 属性名
    QList<QPair<QString, QByteArray>> props;
    // 显示和隐藏时播放的效果的编号，没有是 -1
    int effect = -1;
    bool shown = true;
    // 每次显示或隐藏加一，用来丢弃被打断的过渡
    int generation = 0;
    // 画布上定下的位置和大小，过渡结束后恢复成它
    QRect designRect;
    QSize designMinSize;
    QSize designMaxSize;
    // 正在过渡中，以及这次过渡的动画
    bool transitioning = false;
    QPointer<QAbstractAnimation> transition;
    // 下面三项只有外部容器用
    QVBoxLayout *hostLayout = nullptr;
    QLabel *placeholder = nullptr;
    QPointer<QWidget> hosted;
};

// 与 model.ts 中 computeFlowRows / flowHeightForWidth 完全一致的换行流式布局
class VfFlowLayout : public QLayout
{
public:
    struct FlowItem
    {
        QLayoutItem *item = nullptr;
        QWidget *widget = nullptr;
        int prefW = 100;
        int prefH = 32;
        int minW = 0;
        int maxW = 1000000;
        int stretch = 0;
    };

    VfFlowLayout(QWidget *parent, int padLeft, int padTop, int padRight, int padBottom,
                 int colGap, int rowGap, int minContainerH, int maxContainerH, bool autoHeight)
        : QLayout(parent)
        , m_padLeft(padLeft)
        , m_padTop(padTop)
        , m_padRight(padRight)
        , m_padBottom(padBottom)
        , m_colGap(colGap)
        , m_rowGap(rowGap)
        , m_minContainerH(minContainerH)
        , m_maxContainerH(maxContainerH)
        , m_autoHeight(autoHeight)
    {
        setContentsMargins(0, 0, 0, 0);
    }

    ~VfFlowLayout() override
    {
        for (const FlowItem &fi : m_items)
            delete fi.item;
    }

    void addFlowWidget(QWidget *w, int prefW, int prefH, int minW, int maxW, int stretch)
    {
        addChildWidget(w);
        m_items.append({ new QWidgetItem(w), w, prefW, prefH, minW, maxW, stretch });
    }

    void addItem(QLayoutItem *item) override
    {
        m_items.append({ item, item->widget(), 100, 32, 0, 1000000, 0 });
    }

    int count() const override { return int(m_items.size()); }
    QLayoutItem *itemAt(int index) const override
    {
        return (index >= 0 && index < m_items.size()) ? m_items.at(index).item : nullptr;
    }
    QLayoutItem *takeAt(int index) override
    {
        if (index < 0 || index >= m_items.size())
            return nullptr;
        return m_items.takeAt(index).item;
    }

    bool hasHeightForWidth() const override { return true; }
    int heightForWidth(int width) const override
    {
        return qBound(m_minContainerH, doLayout(QRect(0, 0, width, 0), false), m_maxContainerH);
    }
    int rawHeightForWidth(int width) const
    {
        return doLayout(QRect(0, 0, width, 0), false);
    }
    int minContainerH() const { return m_minContainerH; }
    int maxContainerH() const { return m_maxContainerH; }
    bool autoHeight() const { return m_autoHeight; }

    QSize sizeHint() const override
    {
        const int w = parentWidget() && parentWidget()->width() > 0 ? parentWidget()->width() : 400;
        return QSize(m_padLeft + m_padRight, heightForWidth(w));
    }
    QSize minimumSize() const override
    {
        return QSize(m_padLeft + m_padRight, m_minContainerH);
    }

    void setGeometry(const QRect &rect) override
    {
        QLayout::setGeometry(rect);
        doLayout(rect, true);
    }

private:
    int doLayout(const QRect &rect, bool apply) const
    {
        const int innerW = qMax(0, rect.width() - m_padLeft - m_padRight);
        QList<FlowItem> visible;
        for (const FlowItem &fi : m_items) {
            if (fi.widget && !fi.widget->isHidden())
                visible.append(fi);
        }
        if (visible.isEmpty())
            return m_padTop + m_padBottom;

        struct Row
        {
            QList<FlowItem> items;
            int height = 0;
        };
        QList<Row> rows;
        QList<FlowItem> current;
        int usedW = 0;

        for (const FlowItem &fi : visible) {
            const int gapBefore = current.isEmpty() ? 0 : m_colGap;
            if (!current.isEmpty() && usedW + gapBefore + fi.prefW > innerW) {
                int rh = 0;
                for (const FlowItem &it : current)
                    rh = qMax(rh, it.prefH);
                rows.append({ current, rh });
                current.clear();
                current.append(fi);
                usedW = fi.prefW;
            } else {
                current.append(fi);
                usedW += gapBefore + fi.prefW;
            }
        }
        if (!current.isEmpty()) {
            int rh = 0;
            for (const FlowItem &it : current)
                rh = qMax(rh, it.prefH);
            rows.append({ current, rh });
        }

        if (apply) {
            int cursorY = rect.y() + m_padTop;
            for (const Row &row : rows) {
                int totalStretch = 0;
                int fixedSum = 0;
                for (const FlowItem &it : row.items) {
                    if (it.stretch > 0)
                        totalStretch += it.stretch;
                    else
                        fixedSum += it.prefW;
                }
                const int totalGaps = m_colGap * qMax(0, int(row.items.size()) - 1);
                const int leftover = qMax(0, innerW - totalGaps - fixedSum);
                int cursorX = rect.x() + m_padLeft;
                for (const FlowItem &it : row.items) {
                    const int w = (it.stretch > 0 && totalStretch > 0)
                        ? qBound(it.minW, qRound(double(leftover * it.stretch) / double(totalStretch)), it.maxW)
                        : it.prefW;
                    it.widget->setGeometry(cursorX, cursorY, w, it.prefH);
                    cursorX += w + m_colGap;
                }
                cursorY += row.height + m_rowGap;
            }
        }

        int totalRowH = 0;
        for (const Row &row : rows)
            totalRowH += row.height;
        return m_padTop + m_padBottom + totalRowH + m_rowGap * qMax(0, int(rows.size()) - 1);
    }

    QList<FlowItem> m_items;
    int m_padLeft = 0, m_padTop = 0, m_padRight = 0, m_padBottom = 0;
    int m_colGap = 0, m_rowGap = 0;
    int m_minContainerH = 0, m_maxContainerH = 1000000;
    bool m_autoHeight = true;
};

QIcon makeVectorIcon(const QString &name)
{
    if (name.isEmpty())
        return QIcon();
    QPixmap pix(16, 16);
    pix.fill(Qt::transparent);
    QPainter p(&pix);
    p.setRenderHint(QPainter::Antialiasing);
    QPen pen(QColor(226, 232, 240), 1.6, Qt::SolidLine, Qt::RoundCap, Qt::RoundJoin);
    p.setPen(pen);
    if (name == QLatin1String("pen") || name == QLatin1String("brush")) {
        p.drawLine(QPointF(3, 13), QPointF(12, 4));
        p.drawEllipse(QPointF(12, 4), 1.5, 1.5);
    } else if (name == QLatin1String("eraser")) {
        p.drawRoundedRect(QRectF(3, 5, 10, 6), 1.5, 1.5);
        p.drawLine(QPointF(2, 13), QPointF(14, 13));
    } else if (name == QLatin1String("fill") || name == QLatin1String("bucket")) {
        p.drawEllipse(QPointF(8, 9), 4, 4);
        p.drawLine(QPointF(8, 3), QPointF(8, 6));
    } else if (name == QLatin1String("connect") || name == QLatin1String("remap")) {
        p.drawEllipse(QPointF(4, 11), 2, 2);
        p.drawEllipse(QPointF(12, 5), 2, 2);
        p.drawLine(QPointF(5.5, 10), QPointF(10.5, 6));
    } else if (name == QLatin1String("arrow")) {
        QPolygonF poly;
        poly << QPointF(4, 3) << QPointF(13, 8.5) << QPointF(8.5, 10) << QPointF(7, 14);
        p.setBrush(QColor(226, 232, 240));
        p.drawPolygon(poly);
    } else if (name == QLatin1String("transfer")) {
        p.drawLine(QPointF(3, 6), QPointF(13, 6));
        p.drawLine(QPointF(10, 3), QPointF(13, 6));
        p.drawLine(QPointF(13, 10), QPointF(3, 10));
        p.drawLine(QPointF(6, 13), QPointF(3, 10));
    } else if (name == QLatin1String("hline")) {
        p.drawLine(QPointF(2, 8), QPointF(14, 8));
        p.drawLine(QPointF(5, 5), QPointF(5, 11));
        p.drawLine(QPointF(11, 5), QPointF(11, 11));
    } else if (name == QLatin1String("vline")) {
        p.drawLine(QPointF(8, 2), QPointF(8, 14));
        p.drawLine(QPointF(5, 5), QPointF(11, 5));
        p.drawLine(QPointF(5, 11), QPointF(11, 11));
    } else if (name == QLatin1String("area")) {
        QPen dashPen = pen;
        dashPen.setStyle(Qt::DashLine);
        p.setPen(dashPen);
        p.drawRect(QRectF(3, 4, 10, 8));
    } else if (name == QLatin1String("addline")) {
        p.drawLine(QPointF(3, 13), QPointF(11, 5));
        p.drawLine(QPointF(10, 12), QPointF(14, 12));
        p.drawLine(QPointF(12, 10), QPointF(12, 14));
    } else if (name == QLatin1String("automap")) {
        QPolygonF star;
        star << QPointF(8, 2) << QPointF(9.8, 6.2) << QPointF(14, 8) << QPointF(9.8, 9.8)
             << QPointF(8, 14) << QPointF(6.2, 9.8) << QPointF(2, 8) << QPointF(6.2, 6.2);
        p.drawPolygon(star);
    } else if (name == QLatin1String("shape")) {
        p.drawRect(QRectF(3, 3, 6, 6));
        p.drawEllipse(QPointF(10.5, 10.5), 3, 3);
    } else if (name == QLatin1String("move")) {
        p.drawLine(QPointF(8, 2), QPointF(8, 14));
        p.drawLine(QPointF(2, 8), QPointF(14, 8));
    } else if (name == QLatin1String("lasso")) {
        p.drawEllipse(QPointF(8, 7), 5, 3.5);
        p.drawEllipse(QPointF(5, 12), 1.5, 1.5);
    } else if (name == QLatin1String("eyedropper")) {
        p.drawLine(QPointF(4, 12), QPointF(11, 5));
        p.drawRect(QRectF(10, 3, 3, 3));
    } else if (name == QLatin1String("play")) {
        QPolygonF poly;
        poly << QPointF(5, 3) << QPointF(13, 8) << QPointF(5, 13);
        p.setBrush(QColor(226, 232, 240));
        p.drawPolygon(poly);
    } else if (name == QLatin1String("pause")) {
        p.drawLine(QPointF(6, 4), QPointF(6, 12));
        p.drawLine(QPointF(10, 4), QPointF(10, 12));
    } else if (name == QLatin1String("prev")) {
        p.drawLine(QPointF(4, 4), QPointF(4, 12));
        p.drawLine(QPointF(12, 4), QPointF(6, 8));
        p.drawLine(QPointF(12, 12), QPointF(6, 8));
    } else if (name == QLatin1String("next")) {
        p.drawLine(QPointF(12, 4), QPointF(12, 12));
        p.drawLine(QPointF(4, 4), QPointF(10, 8));
        p.drawLine(QPointF(4, 12), QPointF(10, 8));
    } else if (name == QLatin1String("loop")) {
        p.drawRoundedRect(QRectF(3, 5, 10, 6), 2, 2);
    } else if (name == QLatin1String("onion")) {
        p.drawEllipse(QPointF(6.5, 8), 3.5, 3.5);
        p.drawEllipse(QPointF(9.5, 8), 3.5, 3.5);
    } else if (name == QLatin1String("clear")) {
        p.drawLine(QPointF(4, 4), QPointF(12, 12));
        p.drawLine(QPointF(12, 4), QPointF(4, 12));
    } else if (name == QLatin1String("hold")) {
        p.drawLine(QPointF(4, 4), QPointF(4, 12));
        p.drawLine(QPointF(7, 4), QPointF(7, 12));
        p.drawLine(QPointF(10, 8), QPointF(14, 8));
        p.drawLine(QPointF(12, 6), QPointF(12, 10));
    } else if (name == QLatin1String("duplicate")) {
        p.drawRect(QRectF(5, 5, 8, 8));
        p.drawLine(QPointF(3, 10), QPointF(3, 3));
        p.drawLine(QPointF(3, 3), QPointF(10, 3));
    } else if (name == QLatin1String("folder")) {
        p.drawRoundedRect(QRectF(2.5, 5, 11, 8), 1.2, 1.2);
        p.drawLine(QPointF(3, 5), QPointF(7, 5));
    } else if (name == QLatin1String("eye")) {
        p.drawEllipse(QPointF(8, 8), 5, 3);
        p.drawEllipse(QPointF(8, 8), 1.5, 1.5);
    } else if (name == QLatin1String("lock")) {
        p.drawRect(QRectF(4, 8, 8, 6));
        p.drawArc(QRectF(5.5, 4, 5, 6), 0, 180 * 16);
    } else if (name == QLatin1String("unselect")) {
        p.drawRect(QRectF(3, 3, 10, 10));
        p.drawLine(QPointF(5, 5), QPointF(11, 11));
    } else if (name == QLatin1String("to_layer") || name == QLatin1String("float")) {
        p.drawRect(QRectF(3, 4, 10, 8));
        p.drawLine(QPointF(8, 2), QPointF(8, 9));
    } else if (name == QLatin1String("add") || name == QLatin1String("plus")) {
        p.drawLine(QPointF(8, 3), QPointF(8, 13));
        p.drawLine(QPointF(3, 8), QPointF(13, 8));
    } else if (name == QLatin1String("remove") || name == QLatin1String("minus")) {
        p.drawLine(QPointF(3, 8), QPointF(13, 8));
    } else if (name == QLatin1String("up")) {
        p.drawLine(QPointF(8, 3), QPointF(8, 13));
        p.drawLine(QPointF(4, 7), QPointF(8, 3));
        p.drawLine(QPointF(12, 7), QPointF(8, 3));
    } else if (name == QLatin1String("down")) {
        p.drawLine(QPointF(8, 3), QPointF(8, 13));
        p.drawLine(QPointF(4, 9), QPointF(8, 13));
        p.drawLine(QPointF(12, 9), QPointF(8, 13));
    } else {
        p.drawRoundedRect(QRectF(3, 3, 10, 10), 2, 2);
    }
    return QIcon(pix);
}

void applyButtonVisualStyle(QPushButton *btn)
{
    if (!btn)
        return;
    const QString variant = btn->property("vfVariant").toString();
    const bool checked = btn->isCheckable() && btn->isChecked();
    QString bg = QStringLiteral("#263042");
    QString fg = QStringLiteral("#e2e8f0");
    QString border = QStringLiteral("#3b4963");
    QString weight = QStringLiteral("500");
    if (checked || variant == QLatin1String("primary")) {
        bg = QStringLiteral("#2563eb");
        fg = QStringLiteral("#ffffff");
        border = QStringLiteral("#60a5fa");
        weight = QStringLiteral("600");
    } else if (variant == QLatin1String("danger")) {
        bg = QStringLiteral("#451a1a");
        fg = QStringLiteral("#fca5a5");
        border = QStringLiteral("#dc2626");
    } else if (variant == QLatin1String("ghost")) {
        bg = QStringLiteral("transparent");
        fg = QStringLiteral("#cbd5e1");
        border = QStringLiteral("#334155");
    }
    const QString qss = QStringLiteral(
        "QPushButton { background-color: %1; color: %2; border: 1px solid %3; border-radius: 5px; padding: 0px 4px; font-weight: %4; }"
        "QPushButton:disabled { background-color: #1e2533; color: #64748b; border-color: #293246; }"
    ).arg(bg, fg, border, weight);
    if (btn->styleSheet() != qss)
        btn->setStyleSheet(qss);
}

void applyLabelVisualStyle(QLabel *lbl)
{
    if (!lbl)
        return;
    const QString tone = lbl->property("vfTone").toString();
    QString qss;
    if (tone == QLatin1String("title")) {
        qss = QStringLiteral("QLabel { color: #f8fafc; font-size: 13px; font-weight: 600; }");
    } else if (tone == QLatin1String("muted")) {
        qss = QStringLiteral("QLabel { color: #94a3b8; font-size: 11px; }");
    } else if (tone == QLatin1String("error")) {
        qss = QStringLiteral("QLabel { color: #f87171; font-weight: 500; }");
    } else if (tone == QLatin1String("accent")) {
        qss = QStringLiteral("QLabel { color: #60a5fa; font-weight: 600; }");
    } else {
        qss = QStringLiteral("QLabel { color: #e2e8f0; }");
    }
    if (lbl->styleSheet() != qss)
        lbl->setStyleSheet(qss);
}

bool isCheckValueOn(const QVariant &v)
{
    if (!v.isValid() || v.isNull())
        return false;
    if (v.typeId() == QMetaType::Bool)
        return v.toBool();
    if (v.typeId() == QMetaType::Int || v.typeId() == QMetaType::LongLong || v.typeId() == QMetaType::Double)
        return v.toDouble() != 0.0;
    const QString s = v.toString().trimmed().toLower();
    return s == QLatin1String("on") || s == QLatin1String("true") || s == QLatin1String("1") || s == QLatin1String("yes");
}

QString resolveColorHex(const QString &raw)
{
    const QString s = raw.trimmed().toLower();
    if (s.startsWith(QLatin1Char('#')) && (s.size() == 4 || s.size() == 7))
        return s;
    if (s == QLatin1String("black")) return QStringLiteral("#1e1e1e");
    if (s == QLatin1String("blue")) return QStringLiteral("#2563eb");
    if (s == QLatin1String("green")) return QStringLiteral("#16a34a");
    if (s == QLatin1String("red")) return QStringLiteral("#dc2626");
    if (s == QLatin1String("white")) return QStringLiteral("#f8fafc");
    if (s == QLatin1String("yellow")) return QStringLiteral("#eab308");
    return QStringLiteral("#4a90d9");
}

bool evalVisibleWhen(const QString &expr, const QVariantMap &values)
{
    const QString s = expr.trimmed();
    if (s.isEmpty())
        return true;
    if (s.contains(QStringLiteral("||"))) {
        for (const QString &part : s.split(QStringLiteral("||"))) {
            if (evalVisibleWhen(part, values))
                return true;
        }
        return false;
    }
    if (s.contains(QStringLiteral("&&"))) {
        for (const QString &part : s.split(QStringLiteral("&&"))) {
            if (!evalVisibleWhen(part, values))
                return false;
        }
        return true;
    }
    const int neIdx = s.indexOf(QStringLiteral("!="));
    if (neIdx > 0) {
        const QString key = s.left(neIdx).trimmed();
        QString rhs = s.mid(neIdx + 2).trimmed();
        if ((rhs.startsWith(QLatin1Char('\'')) && rhs.endsWith(QLatin1Char('\''))) ||
            (rhs.startsWith(QLatin1Char('"')) && rhs.endsWith(QLatin1Char('"')))) {
            rhs = rhs.mid(1, rhs.size() - 2);
        }
        return values.value(key).toString() != rhs;
    }
    const int eqIdx = s.indexOf(QStringLiteral("=="));
    if (eqIdx > 0) {
        const QString key = s.left(eqIdx).trimmed();
        QString rhs = s.mid(eqIdx + 2).trimmed();
        if ((rhs.startsWith(QLatin1Char('\'')) && rhs.endsWith(QLatin1Char('\''))) ||
            (rhs.startsWith(QLatin1Char('"')) && rhs.endsWith(QLatin1Char('"')))) {
            rhs = rhs.mid(1, rhs.size() - 2);
        }
        return values.value(key).toString() == rhs;
    }
    if (s.startsWith(QLatin1Char('!')))
        return !isCheckValueOn(values.value(s.mid(1).trimmed()));
    return isCheckValueOn(values.value(s));
}

bool evalVisibleWhenVariant(const QVariant &vw, const QVariantMap &values)
{
    if (!vw.isValid() || vw.isNull())
        return true;
    if (vw.typeId() == QMetaType::QVariantMap) {
        const QVariantMap cond = vw.toMap();
        QString target = cond.value(QStringLiteral("name")).toString();
        if (target.isEmpty())
            target = cond.value(QStringLiteral("control")).toString();
        if (target.isEmpty())
            target = cond.value(QStringLiteral("field")).toString();
        if (target.isEmpty())
            return true;
        const QVariant actual = values.value(target);
        const QString actualStr = actual.toString();
        if (cond.contains(QStringLiteral("values"))) {
            for (const QVariant &item : cond.value(QStringLiteral("values")).toList()) {
                if (item.toString() == actualStr)
                    return true;
            }
            return false;
        }
        if (cond.contains(QStringLiteral("value")))
            return cond.value(QStringLiteral("value")).toString() == actualStr;
        if (cond.contains(QStringLiteral("equals")))
            return cond.value(QStringLiteral("equals")).toString() == actualStr;
        if (cond.contains(QStringLiteral("not_equals")))
            return cond.value(QStringLiteral("not_equals")).toString() != actualStr;
        if (cond.contains(QStringLiteral("in"))) {
            for (const QVariant &item : cond.value(QStringLiteral("in")).toList()) {
                if (item.toString() == actualStr)
                    return true;
            }
            return false;
        }
        return true;
    }
    return evalVisibleWhen(vw.toString(), values);
}

struct FlatTreeRow
{
    int index = 0;
    QString id;
    QString name;
    QString kind;
    int depth = 0;
    bool isGroup = false;
    bool collapsed = false;
    bool checked = true;
    bool locked = false;
    bool hiddenByAncestor = false;
};

void flattenTreeVariantList(const QVariantList &list, int depth, bool parentCollapsed, QList<FlatTreeRow> &out)
{
    for (const QVariant &it : list) {
        const int idx = int(out.size());
        if (it.typeId() == QMetaType::QVariantMap) {
            const QVariantMap map = it.toMap();
            QString name = map.value(QStringLiteral("name")).toString();
            if (name.isEmpty()) name = map.value(QStringLiteral("label")).toString();
            if (name.isEmpty()) name = map.value(QStringLiteral("title")).toString();
            if (name.isEmpty()) name = map.value(QStringLiteral("text")).toString();
            if (name.isEmpty()) name = map.value(QStringLiteral("id")).toString();
            QString id = map.value(QStringLiteral("id")).toString();
            if (id.isEmpty()) id = map.value(QStringLiteral("name"), idx).toString();
            const QString kind = map.value(QStringLiteral("kind"), map.value(QStringLiteral("type"))).toString();
            const QVariantList children = map.value(QStringLiteral("children")).toList();
            const bool isGroup = map.value(QStringLiteral("isGroup")).toBool() ||
                                 kind == QLatin1String("group") || !children.isEmpty();
            const bool collapsed = map.value(QStringLiteral("collapsed")).toBool();
            const bool checked = map.contains(QStringLiteral("visible"))
                ? map.value(QStringLiteral("visible")).toBool()
                : map.value(QStringLiteral("checked"), true).toBool();
            const bool locked = map.value(QStringLiteral("locked")).toBool();
            const int d = map.contains(QStringLiteral("depth")) ? map.value(QStringLiteral("depth")).toInt() : depth;
            out.append({ idx, id, name, kind, d, isGroup, collapsed, checked, locked, parentCollapsed });
            if (!children.isEmpty())
                flattenTreeVariantList(children, d + 1, parentCollapsed || collapsed, out);
        } else {
            out.append({ idx, QString::number(idx), it.toString(), QString(), depth, false, false, true, false, parentCollapsed });
        }
    }
}

QList<FlatTreeRow> buildFlatTreeRows(const QVariantList &raw)
{
    QList<FlatTreeRow> rows;
    flattenTreeVariantList(raw, 0, false, rows);
    int collapsedDepth = -1;
    for (FlatTreeRow &r : rows) {
        if (collapsedDepth >= 0) {
            if (r.depth > collapsedDepth) {
                r.hiddenByAncestor = true;
                continue;
            }
            collapsedDepth = -1;
        }
        if (r.isGroup && r.collapsed)
            collapsedDepth = r.depth;
    }
    return rows;
}

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

struct DockEntry
{
    QString id;
    QDockWidget *dock = nullptr;
    QWidget *header = nullptr;
    QWidget *body = nullptr;
    QWidget *resizer = nullptr;
    QString defaultArea;
    QString lastArea;
    QString activeIdInHeader;
    QString tabGroupAnchorId;
    QString headerSignature;
    int headerHeight = 26;
    int designWidth = 240;
    int designHeight = 180;
    int groupOrder = 0;
    int tabOrder = 0;
    int floatOrder = 0;
    bool isClosed = false;
    bool isActiveInGroup = true;
};

struct DockDropAction
{
    QString op;
    QJsonObject args;
};

struct DockSplitterEntry
{
    QString kind; // "area" or "split"
    QString area;
    int groupIndex = -1;
    int initialSize = 0;
    Qt::Orientation orientation = Qt::Horizontal;
    QWidget *widget = nullptr;
};

struct FloatBoxEntry
{
    QString id;
    QFrame *frame = nullptr;
    QWidget *header = nullptr;
    QWidget *body = nullptr;
    QLabel *titleLabel = nullptr;
    QPushButton *toggleBtn = nullptr;
    QWidget *origParent = nullptr;
    QBoxLayout *origBoxLayout = nullptr;
    QGridLayout *origGridLayout = nullptr;
    QFormLayout *origFormLayout = nullptr;
    QStackedLayout *origStackedLayout = nullptr;
    int origIndex = -1;
    int origStretch = 0;
    int origGridRow = 0;
    int origGridCol = 0;
    int origGridRowSpan = 1;
    int origGridColSpan = 1;
    int origFormRow = -1;
    QFormLayout::ItemRole origFormRole = QFormLayout::SpanningRole;
    QRect origGeometry;
    QSize origMinSize;
    QSize origMaxSize;
    int headerHeight = 24;
    int designWidth = 200;
    int designHeight = 120;
    QSizePolicy origSizePolicy;
    bool isFloating = false;
};

Qt::DockWidgetArea qtAreaFor(const QString &area)
{
    if (area == QLatin1String("right"))
        return Qt::RightDockWidgetArea;
    if (area == QLatin1String("top"))
        return Qt::TopDockWidgetArea;
    if (area == QLatin1String("bottom"))
        return Qt::BottomDockWidgetArea;
    return Qt::LeftDockWidgetArea;
}

QString areaKeyFor(Qt::DockWidgetArea area, const QString &fallback = QStringLiteral("left"))
{
    switch (area) {
    case Qt::LeftDockWidgetArea:
        return QStringLiteral("left");
    case Qt::RightDockWidgetArea:
        return QStringLiteral("right");
    case Qt::TopDockWidgetArea:
        return QStringLiteral("top");
    case Qt::BottomDockWidgetArea:
        return QStringLiteral("bottom");
    default:
        return fallback.isEmpty() ? QStringLiteral("left") : fallback;
    }
}

QString defaultSplitOrientFor(const QString &area)
{
    return (area == QLatin1String("left") || area == QLatin1String("right"))
        ? QStringLiteral("vertical")
        : QStringLiteral("horizontal");
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
    QTimer clockTimer;
    QList<Control> controls;          // 第 0 个是窗口本身
    QList<QWidget *> dialogs;         // 弹出窗口与模态对话框
    QList<QPair<QString, QAction *>> menuActions;
    QMap<QString, DockEntry> docks;
    QHash<QObject *, QString> dockHeaderIds;
    QHash<QObject *, QString> dockTabButtonIds;
    QHash<QObject *, QString> dockResizerIds;
    QList<DockSplitterEntry> dockSplitters;
    QSet<QString> inactiveTabDocks;
    QList<FloatBoxEntry> floatBoxes;
    QHash<QObject *, QString> floatBoxHeaderIds;

    // 浮动框拖拽状态
    QString draggingFloatBoxId;
    QPoint dragStartGlobal;
    QPoint dragStartBoxPos;

    // 停靠面板标题栏拖拽/缩放与分隔条拖拽状态
    QString draggingDockId;
    QString resizingDockId;
    int draggingSplitterIdx = -1;
    int dragStartSplitterSize = 0;
    QRect dragStartDockRect;
    bool dockDragMoved = false;
    QString lastDockStructureKey;
    QString lastDockPassKey;          // 上一遍布局的全部输入，没变就不用再动 QDockWidget
    QString lastSplitterKey;          // 上次放分隔条时各面板的位置
    QJSValue dockPassBoxes;           // 这一遍算出的几何，FloatBox 接着用

    QHash<QWidget *, QMenu *> popupMenus;
    QStatusBar *statusBar = nullptr;
    QWidget *statusBarControl = nullptr;
    QHash<QObject *, int> byWidget;
    int pressed = -1;                 // 鼠标左键是在哪个控件上按下的
    bool doubleClick = false;
    bool started = false;             // app.start 触发之前，显示和隐藏不播放效果
    bool applyingLayout = false;
    bool manualClock = false;         // 显式调用 setClock 时停止自动定时器避免竞态
    bool syncingLayout = false;
    bool dockPassRunning = false;     // applyDockLayout 正在执行
    bool dockPassPending = false;     // 执行期间又有刷新请求，结束后补一次
    bool dockPassCatchingUp = false;  // 正在补这一次
    // 界面销毁后，还没放完的效果再回调时靠它知道不能再碰界面
    std::shared_ptr<bool> alive = std::make_shared<bool>(true);

    QJSValue call(const char *function, const QJSValueList &args = {});
    int add(const QString &id, QWidget *widget, QList<QPair<QString, QByteArray>> props = {}, int effect = -1);
    int addExternal(const QString &id, QFrame *frame, const QString &text);
    void addMenuAction(const QString &id, QAction *action);
    void registerDock(const QString &id, QDockWidget *dock, QWidget *header, QWidget *body, const QString &defaultArea, int headerHeight, int designWidth = 240, int designHeight = 180);
    void registerFloatBox(const QString &id, QFrame *frame, QWidget *header, QWidget *body, int headerHeight, int designWidth, int designHeight);
    void applyDockLayout(const QJSValue &views);
    void rebuildDockSplitters();
    void applyFloatBoxes(const QJSValue &views, const QJSValue *knownBoxes = nullptr);
    void finishDockPass(bool prevApplying);
    void beginDockDrag(const QString &dockId, const QString &visibleDockId, const QPoint &globalPos);
    void updateDockDrag(const QMouseEvent *mouse);
    bool finishDockDrag(const QMouseEvent *mouse);
    void toggleDockFloating(const QString &dockId);
    DockDropAction dockDropActionAt(const QString &dockId, const QPoint &globalPos, Qt::KeyboardModifiers mods);
    void handleDockDropAt(const QString &dockId, const QPoint &globalPos, Qt::KeyboardModifiers mods);
    void addPopupMenu(QWidget *widget, QMenu *menu);
    void rebuildDataForm(const QString &id, QFrame *frame, const QJSValue &props);
    void syncDataFormValues(QFrame *frame, const QJSValue &props);
    int controlAt(const QPoint &globalPos) const;

    void dispatch(const QString &control, const QString &event, const QJSValue &value = QJSValue());
    void drain(const QJSValue &pending);
    void scheduleTimers();
    void syncFlowDocks();
    void syncWindowLayout(bool relayoutDocks = true);
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
    bool paintCustomEffect(int effect, QPainter *painter, const QRect &rect, const QVariantMap &props);
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

    d->clockTimer.setInterval(100);
    QObject::connect(&d->clockTimer, &QTimer::timeout, this, [this] {
        const int nextMs = clock() + 100;
        d->drain(d->call("setClock", { nextMs }));
    });

    d->build();
    // 中央区的大小由停靠排列决定：放不下时和预览一样裁切内容，不能反过来把窗口撑大
    if (!d->docks.isEmpty() && d->window.centralWidget())
        d->window.centralWidget()->setMinimumSize(1, 1);
    const QString globalQss = d->window.styleSheet() + QStringLiteral(
        " QListWidget, QTreeWidget { background-color: #182030; color: #e2e8f0; border: 1px solid #334155; border-radius: 5px; outline: none; }"
        " QListWidget::item, QTreeWidget::item { padding: 3px 4px; border-radius: 3px; }"
        " QListWidget::item:selected, QListWidget::item:selected:active, QListWidget::item:selected:!active,"
        " QTreeWidget::item:selected, QTreeWidget::item:selected:active, QTreeWidget::item:selected:!active {"
        "   background-color: #2563eb; color: #ffffff; font-weight: 600;"
        " }"
        " QTabBar::tab { background: #1e293b; color: #94a3b8; border: 1px solid #334155; border-bottom: none;"
        "   border-top-left-radius: 4px; border-top-right-radius: 4px; padding: 3px 6px; margin-right: 2px; }"
        " QTabBar::tab:selected { background: #2563eb; color: #ffffff; border-color: #60a5fa; font-weight: 600; }"
        " QComboBox, QSpinBox, QLineEdit, QPlainTextEdit {"
        "   background-color: #182030; color: #e2e8f0; border: 1px solid #334155; border-radius: 4px; padding: 1px 4px;"
        " }"
    );
    d->window.setStyleSheet(globalQss);
    d->window.installEventFilter(this);
    d->applyView();
}

Ui::~Ui()
{
    *d->alive = false;
    d->clockTimer.stop();
    d->window.removeEventFilter(this);
    if (d->statusBar)
        d->statusBar->removeEventFilter(this);
    for (const DockSplitterEntry &sp : d->dockSplitters) {
        if (sp.widget)
            sp.widget->removeEventFilter(this);
    }
    for (const Control &control : d->controls) {
        if (control.widget)
            control.widget->removeEventFilter(this);
    }
    d->byWidget.clear();
    d->dialogs.clear();
    d->menuActions.clear();
    d->dockSplitters.clear();
    d->dockHeaderIds.clear();
    d->dockTabButtonIds.clear();
    d->dockResizerIds.clear();
    d->docks.clear();
    d->inactiveTabDocks.clear();
    d->floatBoxes.clear();
    d->floatBoxHeaderIds.clear();
    d->controls.clear();
    d->statusBar = nullptr;
    d->statusBarControl = nullptr;
    d->api = QJSValue();
    d->window.hide();
}

void Ui::show()
{
    d->window.show();
    d->syncWindowLayout();
    start();
    const QJSValue views = d->call("views");
    d->applyDockLayout(views);
    d->applyFloatBoxes(views);
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
        // isHidden 只反映控件自己被隐藏：面板关闭时为真，主窗口最小化时面板仍算开着
        one.insert(QStringLiteral("visible"), !control.widget->isHidden());
        if (control.stateImageWidget) {
            one.insert(QStringLiteral("visualState"), control.stateImageWidget->visualState());
            one.insert(QStringLiteral("stateImage"), control.stateImageWidget->currentStateImage());
        }
        all.insert(control.id, one);
    }
    return QString::fromUtf8(QJsonDocument(all).toJson(QJsonDocument::Compact));
}

QString Ui::layoutDump() const
{
    QJsonObject all;
    for (int index = 1; index < d->controls.size(); ++index) {
        const Control &control = d->controls.at(index);
        if (d->inactiveTabDocks.contains(control.id))
            continue;
        QWidget *w = control.widget;
        if (!w || w->isHidden())
            continue;
        if (d->docks.contains(control.id) && d->docks.value(control.id).isClosed)
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
        QPoint pos;
        if (d->dialogs.contains(topWin)) {
            pos = (w == topWin) ? QPoint(0, 0) : w->mapTo(topWin, QPoint(0, 0));
        } else {
            pos = d->window.mapFromGlobal(w->mapToGlobal(QPoint(0, 0)));
        }
        QJsonObject box;
        box.insert(QStringLiteral("x"), pos.x());
        box.insert(QStringLiteral("y"), pos.y());
        box.insert(QStringLiteral("width"), w->width());
        box.insert(QStringLiteral("height"), w->height());
        all.insert(control.id, box);
    }
    return QString::fromUtf8(QJsonDocument(all).toJson(QJsonDocument::Compact));
}

// 完全从 QMainWindow 与各 QDockWidget 的实际 Qt 状态读取停靠布局，不读取 JS 状态。
QString Ui::dockDump() const
{
    QHash<QDockWidget *, QString> idByDock;
    for (auto it = d->docks.begin(); it != d->docks.end(); ++it)
        idByDock.insert(it->dock, it.key());

    QJsonObject areasObj;
    const QList<QPair<QString, Qt::DockWidgetArea>> areaDefs = {
        { QStringLiteral("top"), Qt::TopDockWidgetArea },
        { QStringLiteral("bottom"), Qt::BottomDockWidgetArea },
        { QStringLiteral("left"), Qt::LeftDockWidgetArea },
        { QStringLiteral("right"), Qt::RightDockWidgetArea },
    };

    for (const auto &areaDef : areaDefs) {
        const QString &areaKey = areaDef.first;
        const Qt::DockWidgetArea qtArea = areaDef.second;

        // 收集当前停靠在该 Qt 停靠区的所有非浮动 QDockWidget
        QList<QString> areaDockIds;
        for (auto it = d->docks.begin(); it != d->docks.end(); ++it) {
            QDockWidget *dw = it->dock;
            if (!dw || dw->isFloating())
                continue;
            const Qt::DockWidgetArea actualArea = d->window.dockWidgetArea(dw);
            if (actualArea == qtArea) {
                areaDockIds.append(it.key());
            } else if (actualArea == Qt::NoDockWidgetArea && it->lastArea == areaKey) {
                areaDockIds.append(it.key());
            }
        }

        // 按 groupOrder 与 tabOrder 排序以便稳定遍历连通分量
        std::sort(areaDockIds.begin(), areaDockIds.end(), [this](const QString &a, const QString &b) {
            const DockEntry &da = d->docks.value(a);
            const DockEntry &db = d->docks.value(b);
            if (da.groupOrder != db.groupOrder)
                return da.groupOrder < db.groupOrder;
            return da.tabOrder < db.tabOrder;
        });

        struct MeasuredGroup
        {
            QStringList tabs;
            QString active;
            QDockWidget *repDock = nullptr;
            int groupOrder = 0;
        };
        QList<MeasuredGroup> groups;
        QSet<QString> visited;

        for (const QString &did : areaDockIds) {
            if (visited.contains(did))
                continue;
            const DockEntry &seedEntry = d->docks.value(did);
            QStringList component;
            QList<QString> queue = { did };
            visited.insert(did);

            while (!queue.isEmpty()) {
                const QString curId = queue.takeFirst();
                component.append(curId);
                const DockEntry &curEntry = d->docks.value(curId);
                // 通过 QMainWindow::tabifiedDockWidgets 实测同组页签
                const QList<QDockWidget *> peers = d->window.tabifiedDockWidgets(curEntry.dock);
                for (QDockWidget *peerDock : peers) {
                    const QString peerId = idByDock.value(peerDock);
                    if (!peerId.isEmpty() && areaDockIds.contains(peerId) && !visited.contains(peerId)) {
                        visited.insert(peerId);
                        queue.append(peerId);
                    }
                }
                // 若某个页签当前处于关闭（isClosed）状态，Qt 的 tabifiedDockWidgets 可能跳过隐藏面板，按记录的同组锚点归组
                for (const QString &candId : areaDockIds) {
                    if (visited.contains(candId))
                        continue;
                    const DockEntry &cand = d->docks.value(candId);
                    if ((cand.isClosed || curEntry.isClosed)
                        && !cand.tabGroupAnchorId.isEmpty()
                        && cand.tabGroupAnchorId == curEntry.tabGroupAnchorId) {
                        visited.insert(candId);
                        queue.append(candId);
                    }
                }
            }

            std::sort(component.begin(), component.end(), [this](const QString &a, const QString &b) {
                return d->docks.value(a).tabOrder < d->docks.value(b).tabOrder;
            });

            // 实测当前组内的激活页签：在所有未隐藏（!dock->isHidden()）的页签中取主窗口子控件栈最上层（raise() 后 Z 序最高）的 QDockWidget
            const QObjectList &winChildren = d->window.children();
            QString activeId;
            QDockWidget *repDock = nullptr;
            int bestZ = -2;
            for (const QString &tid : component) {
                const DockEntry &te = d->docks.value(tid);
                if (!te.dock->isHidden()) {
                    const int z = int(winChildren.indexOf(te.dock));
                    if (z >= bestZ) {
                        bestZ = z;
                        activeId = tid;
                        repDock = te.dock;
                    }
                }
            }
            if (activeId.isEmpty() && !component.isEmpty()) {
                bestZ = -2;
                for (const QString &tid : component) {
                    const DockEntry &te = d->docks.value(tid);
                    const int z = int(winChildren.indexOf(te.dock));
                    if (z >= bestZ) {
                        bestZ = z;
                        activeId = tid;
                        repDock = te.dock;
                    }
                }
            }

            MeasuredGroup mg;
            mg.tabs = component;
            mg.active = activeId;
            mg.repDock = repDock;
            mg.groupOrder = seedEntry.groupOrder;
            groups.append(mg);
        }

        QJsonObject areaObj;
        if (groups.isEmpty()) {
            areaObj.insert(QStringLiteral("groups"), QJsonArray());
            areasObj.insert(areaKey, areaObj);
            continue;
        }

        // 若有多个并排组，从看得见的组的实际坐标判定拆分方向与先后顺序；
        // 全部页签都关闭的组量不到位置，留在原来的序号上
        QString splitOrient = defaultSplitOrientFor(areaKey);
        if (groups.size() >= 2) {
            std::stable_sort(groups.begin(), groups.end(), [](const MeasuredGroup &a, const MeasuredGroup &b) {
                return a.groupOrder < b.groupOrder;
            });
            QList<int> shownSlots;
            QList<MeasuredGroup> shownGroups;
            for (int gi = 0; gi < groups.size(); ++gi) {
                if (groups.at(gi).repDock && !groups.at(gi).repDock->isHidden()) {
                    shownSlots.append(gi);
                    shownGroups.append(groups.at(gi));
                }
            }
            if (shownGroups.size() >= 2) {
                QDockWidget *d0 = shownGroups.at(0).repDock;
                QDockWidget *d1 = shownGroups.at(1).repDock;
                const int dx = qAbs(d1->x() - d0->x());
                const int dy = qAbs(d1->y() - d0->y());
                if (dx > dy)
                    splitOrient = QStringLiteral("horizontal");
                else if (dy > dx)
                    splitOrient = QStringLiteral("vertical");
                std::stable_sort(shownGroups.begin(), shownGroups.end(), [&splitOrient](const MeasuredGroup &a, const MeasuredGroup &b) {
                    return splitOrient == QLatin1String("horizontal") ? a.repDock->x() < b.repDock->x() : a.repDock->y() < b.repDock->y();
                });
                for (int si = 0; si < shownSlots.size(); ++si)
                    groups[shownSlots.at(si)] = shownGroups.at(si);
            }
            areaObj.insert(QStringLiteral("splitOrientation"), splitOrient);
        }

        // 从该区域所有可见代表 QDockWidget 实测读取区域总厚度 size（若沿厚度方向分栏则累加各组代表面板厚度以避免计入 1px 分隔线）
        const bool isHorizThickness = (areaKey == QLatin1String("left") || areaKey == QLatin1String("right"));
        const bool splitAlongThickness = (groups.size() >= 2)
            && ((isHorizThickness && splitOrient == QLatin1String("horizontal"))
                || (!isHorizThickness && splitOrient == QLatin1String("vertical")));
        int sumThickness = 0;
        QRect areaRect;
        for (const MeasuredGroup &mg : groups) {
            if (mg.repDock && !mg.repDock->isHidden()) {
                areaRect = areaRect.isEmpty() ? mg.repDock->geometry() : areaRect.united(mg.repDock->geometry());
                sumThickness += isHorizThickness ? mg.repDock->width() : mg.repDock->height();
            }
        }
        if (areaRect.isEmpty() && groups.first().repDock) {
            areaRect = groups.first().repDock->geometry();
            sumThickness = isHorizThickness ? areaRect.width() : areaRect.height();
        }

        if (!areaRect.isEmpty()) {
            const int areaThickness = splitAlongThickness
                ? sumThickness
                : (isHorizThickness ? areaRect.width() : areaRect.height());
            areaObj.insert(QStringLiteral("size"), areaThickness);
        }

        QJsonArray groupsArr;
        for (int gi = 0; gi < groups.size(); ++gi) {
            const MeasuredGroup &mg = groups.at(gi);
            QJsonObject gObj;
            QJsonArray tabsArr;
            for (const QString &tid : mg.tabs)
                tabsArr.append(tid);
            gObj.insert(QStringLiteral("tabs"), tabsArr);
            gObj.insert(QStringLiteral("active"), mg.active);
            if (groups.size() >= 2 && mg.repDock) {
                const int gSpan = (splitOrient == QLatin1String("horizontal"))
                    ? mg.repDock->width()
                    : mg.repDock->height();
                gObj.insert(QStringLiteral("size"), gSpan);
            }
            groupsArr.append(gObj);
        }
        areaObj.insert(QStringLiteral("groups"), groupsArr);
        areasObj.insert(areaKey, areaObj);
    }

    // 收集所有处于浮动状态（dock->isFloating()）的 QDockWidget
    QList<QString> floatingIds;
    for (auto it = d->docks.begin(); it != d->docks.end(); ++it) {
        if (it->dock && it->dock->isFloating())
            floatingIds.append(it.key());
    }
    std::sort(floatingIds.begin(), floatingIds.end(), [this](const QString &a, const QString &b) {
        return d->docks.value(a).floatOrder < d->docks.value(b).floatOrder;
    });

    QJsonArray floatingArr;
    for (const QString &did : floatingIds) {
        const DockEntry &fe = d->docks.value(did);
        const QPoint relPos = d->window.mapFromGlobal(fe.dock->mapToGlobal(QPoint(0, 0)));
        const QString lastArea = areaKeyFor(d->window.dockWidgetArea(fe.dock), fe.lastArea.isEmpty() ? fe.defaultArea : fe.lastArea);
        QJsonObject fObj;
        fObj.insert(QStringLiteral("dockId"), did);
        fObj.insert(QStringLiteral("lastArea"), lastArea);
        fObj.insert(QStringLiteral("x"), relPos.x());
        fObj.insert(QStringLiteral("y"), relPos.y());
        fObj.insert(QStringLiteral("width"), fe.dock->width());
        fObj.insert(QStringLiteral("height"), fe.dock->height());
        floatingArr.append(fObj);
    }

    QJsonObject rootObj;
    rootObj.insert(QStringLiteral("areas"), areasObj);
    rootObj.insert(QStringLiteral("floating"), floatingArr);
    return QString::fromUtf8(QJsonDocument(rootObj).toJson(QJsonDocument::Compact));
}

QString Ui::wantedDockDump() const
{
    return d->call("effectiveDockLayoutAt", { d->window.width(), d->window.height() }).toString();
}

void Ui::hideDockBehindLogic(const QString &dockId)
{
    if (!d->docks.contains(dockId))
        return;
    const bool prev = d->applyingLayout;
    d->applyingLayout = true;
    d->docks.value(dockId).dock->hide();
    d->applyingLayout = prev;
}

QString Ui::dockDropAt(const QString &dockId, const QPoint &globalPos) const
{
    if (!d->docks.contains(dockId))
        return QString();
    const DockDropAction action = d->dockDropActionAt(dockId, globalPos, Qt::NoModifier);
    const QString position = action.args.value(QStringLiteral("position")).toString();
    if (action.op == QLatin1String("move"))
        return action.op + QLatin1Char(':') + action.args.value(QStringLiteral("area")).toString();
    if (action.op == QLatin1String("split"))
        return action.op + QLatin1Char(':') + position + QLatin1Char(':') + action.args.value(QStringLiteral("orientation")).toString();
    return action.op;
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

void Ui::runDockOp(const QString &op, const QString &jsonArgs)
{
    d->drain(d->call("dockOp", { op, jsonArgs }));
}

void Ui::setClock(int ms)
{
    d->manualClock = true;
    if (d->clockTimer.isActive())
        d->clockTimer.stop();
    d->drain(d->call("setClock", { ms }));
}

int Ui::clock() const
{
    return d->call("getClock").toInt();
}

void Ui::reorderControl(const QString &id, int from, int to)
{
    if (from == to)
        return;
    QJSValue payload = d->engine.newObject();
    payload.setProperty(QStringLiteral("from"), from);
    payload.setProperty(QStringLiteral("to"), to);
    d->dispatch(id, QStringLiteral("reorder"), payload);
}

void Ui::toggleTreeCheck(const QString &id, int row, bool checked)
{
    QString itemId = QString::number(row);
    for (const Control &c : d->controls) {
        if (c.id == id) {
            const QList<FlatTreeRow> rows = buildFlatTreeRows(c.widget->property("vfItems").toList());
            if (row >= 0 && row < rows.size())
                itemId = rows.at(row).id;
            break;
        }
    }
    QJSValue payload = d->engine.newObject();
    payload.setProperty(QStringLiteral("index"), row);
    payload.setProperty(QStringLiteral("id"), itemId);
    payload.setProperty(QStringLiteral("checked"), checked);
    d->dispatch(id, QStringLiteral("toggleCheck"), payload);
}

void Ui::toggleTreeCollapse(const QString &id, int row, bool collapsed)
{
    QString itemId = QString::number(row);
    for (const Control &c : d->controls) {
        if (c.id == id) {
            const QList<FlatTreeRow> rows = buildFlatTreeRows(c.widget->property("vfItems").toList());
            if (row >= 0 && row < rows.size())
                itemId = rows.at(row).id;
            break;
        }
    }
    QJSValue payload = d->engine.newObject();
    payload.setProperty(QStringLiteral("index"), row);
    payload.setProperty(QStringLiteral("id"), itemId);
    payload.setProperty(QStringLiteral("collapsed"), collapsed);
    d->dispatch(id, QStringLiteral("toggleCollapse"), payload);
}

void Ui::setDataFormField(const QString &id, const QString &fieldName, const QString &rawValue)
{
    for (const Control &c : d->controls) {
        if (c.id != id)
            continue;
        const QVariantMap schema = c.widget->property("vfSchema").toMap();
        const QVariantList ctrls = schema.value(QStringLiteral("controls")).toList();
        QVariantMap matched;
        for (const QVariant &cv : ctrls) {
            const QVariantMap cm = cv.toMap();
            if (cm.value(QStringLiteral("name")).toString() != fieldName)
                continue;
            if (matched.isEmpty())
                matched = cm;
            if (cm.contains(QStringLiteral("value")) && cm.value(QStringLiteral("value")).toString() == rawValue) {
                matched = cm;
                break;
            }
        }
        if (matched.isEmpty())
            return;
        const QString type = matched.value(QStringLiteral("type"), QStringLiteral("slider")).toString();
        const QString hook = matched.value(QStringLiteral("hook")).toString();
        QJSValue payload = d->engine.newObject();
        payload.setProperty(QStringLiteral("name"), fieldName);
        payload.setProperty(QStringLiteral("hook"), hook);
        payload.setProperty(QStringLiteral("type"), type);
        if (type == QLatin1String("slider")) {
            const int minV = matched.value(QStringLiteral("min"), 0).toInt();
            const int maxV = matched.value(QStringLiteral("max"), 100).toInt();
            const int clamped = qBound(minV, rawValue.toInt(), maxV);
            payload.setProperty(QStringLiteral("value"), clamped);
        } else if (type == QLatin1String("check") || type == QLatin1String("checkbox")) {
            const QVariant defVal = matched.value(QStringLiteral("value"));
            const bool usesOnOff = (defVal.typeId() == QMetaType::QString &&
                                    (defVal.toString().compare(QLatin1String("on"), Qt::CaseInsensitive) == 0 ||
                                     defVal.toString().compare(QLatin1String("off"), Qt::CaseInsensitive) == 0));
            const bool b = isCheckValueOn(rawValue);
            if (usesOnOff || rawValue.compare(QLatin1String("on"), Qt::CaseInsensitive) == 0 ||
                rawValue.compare(QLatin1String("off"), Qt::CaseInsensitive) == 0) {
                payload.setProperty(QStringLiteral("value"), b ? QStringLiteral("on") : QStringLiteral("off"));
            } else {
                payload.setProperty(QStringLiteral("value"), b);
            }
        } else if (type == QLatin1String("button") || type == QLatin1String("subwindow")) {
            const QVariant defVal = matched.value(QStringLiteral("value"));
            if (!rawValue.isEmpty() && rawValue != QLatin1String("true") && rawValue != QLatin1String("1")) {
                payload.setProperty(QStringLiteral("value"), rawValue);
            } else if (defVal.isValid() && !defVal.isNull() && !defVal.toString().isEmpty()) {
                payload.setProperty(QStringLiteral("value"), defVal.toString());
            } else if (type == QLatin1String("subwindow")) {
                payload.setProperty(QStringLiteral("value"), QStringLiteral("embedded"));
            } else {
                payload.setProperty(QStringLiteral("value"), true);
            }
        } else {
            payload.setProperty(QStringLiteral("value"), rawValue);
        }
        d->dispatch(id, QStringLiteral("change"), payload);
        return;
    }
}

// ---- 鼠标事件 ----
//
// 和工具里的规则相同：每个控件都有 click、dblclick、mousedown、mouseup、mouseenter、mouseleave；
// 点击类事件只交给鼠标下最里面的那个控件；每次点击之后再触发一次全局事件 window.click。
bool Ui::eventFilter(QObject *watched, QEvent *event)
{
    if (watched == &d->window) {
        if (event->type() == QEvent::Resize || event->type() == QEvent::Show) {
            d->lastDockPassKey.clear();
            d->syncWindowLayout();
        }
    }

    if (watched == d->statusBar) {
        if (event->type() == QEvent::Resize || event->type() == QEvent::Show || event->type() == QEvent::LayoutRequest)
            d->syncStatusBar();
        return false;
    }

    if (watched == &d->window && event->type() == QEvent::Resize && d->started && !d->applyingLayout) {
        d->applyingLayout = true;
        const QJSValue views = d->call("views");
        d->applyDockLayout(views);
        d->applyFloatBoxes(views);
        d->syncStatusBar();
        d->applyingLayout = false;
    }

    // 停靠区与分栏分隔条拖拽
    for (int si = 0; si < d->dockSplitters.size(); ++si) {
        const DockSplitterEntry sp = d->dockSplitters.at(si);
        if (sp.widget != watched)
            continue;
        if (event->type() == QEvent::MouseButtonPress) {
            auto *mouse = static_cast<QMouseEvent *>(event);
            if (mouse->button() == Qt::LeftButton) {
                d->draggingSplitterIdx = si;
                d->dragStartGlobal = mouse->globalPosition().toPoint();
                d->dragStartSplitterSize = sp.initialSize;
                return true;
            }
        } else if (event->type() == QEvent::MouseMove && d->draggingSplitterIdx == si) {
            auto *mouse = static_cast<QMouseEvent *>(event);
            const QPoint delta = mouse->globalPosition().toPoint() - d->dragStartGlobal;
            int newSize = d->dragStartSplitterSize;
            if (sp.kind == QLatin1String("area")) {
                if (sp.area == QLatin1String("left"))
                    newSize += delta.x();
                else if (sp.area == QLatin1String("right"))
                    newSize -= delta.x();
                else if (sp.area == QLatin1String("top"))
                    newSize += delta.y();
                else if (sp.area == QLatin1String("bottom"))
                    newSize -= delta.y();
                const QJsonObject args{
                    { QStringLiteral("area"), sp.area },
                    { QStringLiteral("size"), newSize },
                };
                runDockOp(QStringLiteral("resizeArea"), QString::fromUtf8(QJsonDocument(args).toJson(QJsonDocument::Compact)));
            } else {
                newSize += (sp.orientation == Qt::Horizontal) ? delta.x() : delta.y();
                const QJsonObject args{
                    { QStringLiteral("area"), sp.area },
                    { QStringLiteral("groupIndex"), sp.groupIndex },
                    { QStringLiteral("size"), newSize },
                };
                runDockOp(QStringLiteral("resizeSplit"), QString::fromUtf8(QJsonDocument(args).toJson(QJsonDocument::Compact)));
            }
            return true;
        } else if (event->type() == QEvent::MouseButtonRelease && d->draggingSplitterIdx == si) {
            d->draggingSplitterIdx = -1;
            d->rebuildDockSplitters();
            return true;
        }
        return false;
    }

    // 浮窗右下角缩放手柄拖拽
    if (d->dockResizerIds.contains(watched)) {
        const QString did = d->dockResizerIds.value(watched);
        if (event->type() == QEvent::MouseButtonPress) {
            auto *mouse = static_cast<QMouseEvent *>(event);
            if (mouse->button() == Qt::LeftButton && d->docks.contains(did)) {
                const DockEntry &de = d->docks.value(did);
                if (de.dock->isFloating()) {
                    d->resizingDockId = did;
                    d->dragStartGlobal = mouse->globalPosition().toPoint();
                    const QPoint relPos = d->window.mapFromGlobal(de.dock->mapToGlobal(QPoint(0, 0)));
                    d->dragStartDockRect = QRect(relPos, de.dock->size());
                    return true;
                }
            }
        } else if (event->type() == QEvent::MouseMove && d->resizingDockId == did) {
            auto *mouse = static_cast<QMouseEvent *>(event);
            const QPoint delta = mouse->globalPosition().toPoint() - d->dragStartGlobal;
            const int nw = qMax(120, d->dragStartDockRect.width() + delta.x());
            const int nh = qMax(80, d->dragStartDockRect.height() + delta.y());
            const QJsonObject args{
                { QStringLiteral("dock"), did },
                { QStringLiteral("x"), d->dragStartDockRect.x() },
                { QStringLiteral("y"), d->dragStartDockRect.y() },
                { QStringLiteral("width"), nw },
                { QStringLiteral("height"), nh },
            };
            runDockOp(QStringLiteral("float"), QString::fromUtf8(QJsonDocument(args).toJson(QJsonDocument::Compact)));
            return true;
        } else if (event->type() == QEvent::MouseButtonRelease && d->resizingDockId == did) {
            d->resizingDockId.clear();
            return true;
        }
        return false;
    }

    // 页签按钮：按住拖动等于拖这个页签的面板，没拖动才是一次点击；双击与标题栏相同
    if (d->dockTabButtonIds.contains(watched)) {
        auto *btn = static_cast<QPushButton *>(watched);
        const QString tabId = d->dockTabButtonIds.value(watched);
        switch (event->type()) {
        case QEvent::MouseButtonPress: {
            auto *mouse = static_cast<QMouseEvent *>(event);
            if (mouse->button() != Qt::LeftButton || !d->docks.contains(tabId))
                return false;
            const QString ownerId = d->dockHeaderIds.value(btn->parentWidget());
            const QString visibleId = d->docks.contains(ownerId) ? d->docks.value(ownerId).activeIdInHeader : tabId;
            d->beginDockDrag(tabId, visibleId, mouse->globalPosition().toPoint());
            btn->setDown(true);
            return true;
        }
        case QEvent::MouseButtonDblClick: {
            auto *mouse = static_cast<QMouseEvent *>(event);
            if (mouse->button() != Qt::LeftButton)
                return false;
            const QString ownerId = d->dockHeaderIds.value(btn->parentWidget());
            d->toggleDockFloating(d->docks.contains(ownerId) ? d->docks.value(ownerId).activeIdInHeader : tabId);
            return true;
        }
        case QEvent::MouseMove:
            d->updateDockDrag(static_cast<QMouseEvent *>(event));
            return true;
        case QEvent::MouseButtonRelease: {
            auto *mouse = static_cast<QMouseEvent *>(event);
            if (mouse->button() != Qt::LeftButton)
                return false;
            const bool wasPressed = !d->draggingDockId.isEmpty();
            btn->setDown(false);
            if (!d->finishDockDrag(mouse) && wasPressed)
                btn->click();
            return true;
        }
        default:
            return false;
        }
    }

    // 停靠面板标题栏拖拽与双击切换浮出/还原。
    // 鼠标事件一律在这里吃掉：放给 QDockWidget 会走它的原生拖拽，面板变成浮窗、页签组散架，和逻辑层的排列脱节
    if (d->dockHeaderIds.contains(watched)) {
        const QString hdrOwnerId = d->dockHeaderIds.value(watched);
        if (!d->docks.contains(hdrOwnerId))
            return false;
        const DockEntry &ownerEntry = d->docks.value(hdrOwnerId);
        const QString activeId = ownerEntry.activeIdInHeader.isEmpty() ? hdrOwnerId : ownerEntry.activeIdInHeader;
        switch (event->type()) {
        case QEvent::MouseButtonDblClick: {
            auto *mouse = static_cast<QMouseEvent *>(event);
            if (mouse->button() == Qt::LeftButton)
                d->toggleDockFloating(activeId);
            return true;
        }
        case QEvent::MouseButtonPress: {
            auto *mouse = static_cast<QMouseEvent *>(event);
            if (mouse->button() == Qt::LeftButton && d->docks.contains(activeId))
                d->beginDockDrag(activeId, activeId, mouse->globalPosition().toPoint());
            return true;
        }
        case QEvent::MouseMove:
            d->updateDockDrag(static_cast<QMouseEvent *>(event));
            return true;
        case QEvent::MouseButtonRelease:
            d->finishDockDrag(static_cast<QMouseEvent *>(event));
            return true;
        default:
            return false;
        }
    }

    if (d->floatBoxHeaderIds.contains(watched)) {
        const QString fbId = d->floatBoxHeaderIds.value(watched);
        if (event->type() == QEvent::MouseButtonPress) {
            auto *mouse = static_cast<QMouseEvent *>(event);
            if (mouse->button() == Qt::LeftButton) {
                for (const FloatBoxEntry &fb : d->floatBoxes) {
                    if (fb.id == fbId && fb.isFloating) {
                        d->draggingFloatBoxId = fbId;
                        d->dragStartGlobal = mouse->globalPosition().toPoint();
                        d->dragStartBoxPos = fb.frame->pos();
                        break;
                    }
                }
            }
        } else if (event->type() == QEvent::MouseMove && d->draggingFloatBoxId == fbId) {
            auto *mouse = static_cast<QMouseEvent *>(event);
            const QPoint delta = mouse->globalPosition().toPoint() - d->dragStartGlobal;
            const int nx = qMax(0, d->dragStartBoxPos.x() + delta.x());
            const int ny = qMax(0, d->dragStartBoxPos.y() + delta.y());
            QJSValue moveObj = d->engine.newObject();
            moveObj.setProperty(QStringLiteral("x"), nx);
            moveObj.setProperty(QStringLiteral("y"), ny);
            d->dispatch(fbId, QStringLiteral("move"), moveObj);
        } else if (event->type() == QEvent::MouseButtonRelease && d->draggingFloatBoxId == fbId) {
            d->draggingFloatBoxId.clear();
        }
        return false;
    }

    if (event->type() == QEvent::Drop) {
        if (auto *vp = qobject_cast<QWidget *>(watched)) {
            auto *dropEv = static_cast<QDropEvent *>(event);
            const QMimeData *mime = dropEv->mimeData();
            QTreeWidget *tree = qobject_cast<QTreeWidget *>(vp);
            if (!tree)
                tree = qobject_cast<QTreeWidget *>(vp->parentWidget());
            if (tree) {
                const int idx = d->byWidget.value(tree, -1);
                if (idx > 0) {
                    const int fromRow = (mime && mime->property("vfDragFromRow").isValid())
                        ? mime->property("vfDragFromRow").toInt()
                        : (tree->currentItem() ? tree->currentItem()->data(0, Qt::UserRole).toInt() : -1);
                    QTreeWidgetItem *targetItem = tree->itemAt(dropEv->position().toPoint());
                    const int toRow = (mime && mime->property("vfDragToRow").isValid())
                        ? mime->property("vfDragToRow").toInt()
                        : (targetItem
                               ? targetItem->data(0, Qt::UserRole).toInt()
                               : qMax(0, tree->topLevelItemCount() - 1));
                    if (fromRow >= 0 && toRow >= 0) {
                        dropEv->acceptProposedAction();
                        if (fromRow != toRow)
                            reorderControl(d->controls.at(idx).id, fromRow, toRow);
                    }
                    return true;
                }
            }
            QListWidget *list = qobject_cast<QListWidget *>(vp);
            if (!list)
                list = qobject_cast<QListWidget *>(vp->parentWidget());
            if (list) {
                const int idx = d->byWidget.value(list, -1);
                if (idx > 0) {
                    const int fromRow = (mime && mime->property("vfDragFromRow").isValid())
                        ? mime->property("vfDragFromRow").toInt()
                        : list->currentRow();
                    const QModelIndex targetIdx = list->indexAt(dropEv->position().toPoint());
                    const int toRow = (mime && mime->property("vfDragToRow").isValid())
                        ? mime->property("vfDragToRow").toInt()
                        : (targetIdx.isValid()
                               ? targetIdx.row()
                               : qMax(0, list->count() - 1));
                    if (fromRow >= 0 && toRow >= 0) {
                        dropEv->acceptProposedAction();
                        if (fromRow != toRow)
                            reorderControl(d->controls.at(idx).id, fromRow, toRow);
                    }
                    return true;
                }
            }
        }
    }

    const int index = d->byWidget.value(watched, -1);
    if (index < 0)
        return false;
    const QString id = d->controls.at(index).id;

    // 若某个可见的 QDockWidget 被外部直接调用 hide() 或 close()，同步更新关闭态与激活页签
    if ((event->type() == QEvent::HideToParent || event->type() == QEvent::Close)
        && !d->applyingLayout && d->started && d->docks.contains(id)) {
        DockEntry &de = d->docks[id];
        if (!de.isClosed && de.isActiveInGroup) {
            de.isClosed = true;
            const QJsonObject args{ { QStringLiteral("dock"), id } };
            runDockOp(QStringLiteral("close"), QString::fromUtf8(QJsonDocument(args).toJson(QJsonDocument::Compact)));
            return false;
        }
    }

    switch (event->type()) {
    case QEvent::Resize:
        if (watched == &d->window) {
            d->syncGraphics();
            d->syncStatusBar();
            if (!d->docks.isEmpty() || !d->floatBoxes.isEmpty()) {
                const QJSValue v = d->call("views");
                d->applyDockLayout(v);
                d->applyFloatBoxes(v);
            }
        }
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
        if (d->pressed == index) {
            d->pressed = -1;
            d->doubleClick = false;
        }
        if (index > 0)
            d->dispatch(id, QStringLiteral("mouseleave"));
        break;
    case QEvent::MouseButtonPress:
    case QEvent::MouseButtonDblClick: {
        auto *mouse = static_cast<QMouseEvent *>(event);
        int hitIndex = (mouse->button() == Qt::LeftButton) ? d->controlAt(mouse->globalPosition().toPoint()) : -1;
        if (hitIndex < 0 && mouse->button() == Qt::LeftButton && d->controls.at(index).widget->findChildren<QWidget *>().isEmpty() && !dynamic_cast<VfGraphicWidget *>(d->controls.at(index).widget))
            hitIndex = index;
        // 没被里面的控件处理的事件会再传给外层，外层在这里认出“不是点在我自己身上”，不重复处理
        if (hitIndex < 0 || (hitIndex != index && !dynamic_cast<VfGraphicWidget *>(watched)))
            break;
        if (d->pressed == hitIndex && event->type() == QEvent::MouseButtonPress)
            break;
        d->pressed = hitIndex;
        d->doubleClick = event->type() == QEvent::MouseButtonDblClick;
        if (hitIndex > 0)
            d->dispatch(d->controls.at(hitIndex).id, QStringLiteral("mousedown"));
        break;
    }
    case QEvent::MouseButtonRelease: {
        auto *mouse = static_cast<QMouseEvent *>(event);
        if (mouse->button() != Qt::LeftButton || d->pressed < 0 || (d->pressed != index && !dynamic_cast<VfGraphicWidget *>(watched)))
            break;
        const int pressedIndex = d->pressed;
        const QString pressedId = d->controls.at(pressedIndex).id;
        const bool isGraphicWatched = dynamic_cast<VfGraphicWidget *>(watched) != nullptr;
        const bool insideWidget = isGraphicWatched || d->controls.at(index).widget->rect().contains(mouse->position().toPoint());
        int hitTarget = insideWidget ? d->controlAt(mouse->globalPosition().toPoint()) : -1;
        if (hitTarget < 0 && insideWidget && !isGraphicWatched && d->controls.at(index).widget->findChildren<QWidget *>().isEmpty() && !dynamic_cast<VfGraphicWidget *>(d->controls.at(index).widget))
            hitTarget = index;
        const bool wasDoubleClick = d->doubleClick;
        d->pressed = -1;
        d->doubleClick = false;
        if (hitTarget > 0)
            d->dispatch(d->controls.at(hitTarget).id, QStringLiteral("mouseup"));
        else if (!isGraphicWatched && pressedIndex > 0)
            d->dispatch(pressedId, QStringLiteral("mouseup"));
        // 在同一个控件上按下又松开，才算一次点击
        if (hitTarget == pressedIndex) {
            if (pressedIndex > 0)
                d->dispatch(pressedId, QStringLiteral("click"));
            d->dispatch(QString(), QStringLiteral("window.click"));
            if (wasDoubleClick && pressedIndex > 0)
                d->dispatch(pressedId, QStringLiteral("dblclick"));
            if (pressedIndex > 0) {
                if (QMenu *pop = d->popupMenus.value(d->controls.at(pressedIndex).widget, nullptr)) {
                    QWidget *w = d->controls.at(pressedIndex).widget;
                    pop->popup(w->mapToGlobal(QPoint(0, w->height())));
                }
            }
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
    control.stateImageWidget = dynamic_cast<StateImageWidget *>(widget);
    control.paintEffectWidget = dynamic_cast<PaintEffectWidget *>(widget);
    control.props = std::move(props);
    control.effect = effect;
    control.designRect = widget->geometry();
    control.designMinSize = widget->minimumSize();
    control.designMaxSize = widget->maximumSize();
    // 对象名就是设计项目里的控件 ID，测试和调试都靠它找控件
    widget->setObjectName(id);
    widget->installEventFilter(q);
    controls.append(control);
    byWidget.insert(widget, int(controls.size()) - 1);

    if (auto *btn = qobject_cast<QPushButton *>(widget)) {
        QObject::connect(btn, &QPushButton::toggled, q, [btn] {
            applyButtonVisualStyle(btn);
        });
    } else if (auto *list = qobject_cast<QListWidget *>(widget)) {
        list->setAcceptDrops(true);
        if (list->viewport()) {
            list->viewport()->setAcceptDrops(true);
            list->viewport()->installEventFilter(q);
        }
        QObject::connect(list->model(), &QAbstractItemModel::rowsMoved, q,
                         [this, id](const QModelIndex &, int start, int, const QModelIndex &, int row) {
                             const int to = row > start ? row - 1 : row;
                             QJSValue payload = engine.newObject();
                             payload.setProperty(QStringLiteral("from"), start);
                             payload.setProperty(QStringLiteral("to"), to);
                             dispatch(id, QStringLiteral("reorder"), payload);
                         });
    } else if (auto *tree = qobject_cast<QTreeWidget *>(widget)) {
        tree->setHeaderHidden(true);
        tree->setIndentation(14);
        tree->setAcceptDrops(true);
        if (tree->viewport()) {
            tree->viewport()->setAcceptDrops(true);
            tree->viewport()->installEventFilter(q);
        }
        QObject::connect(tree, &QTreeWidget::currentItemChanged, q,
                         [this, id, tree](QTreeWidgetItem *current, QTreeWidgetItem *) {
                             if (!current)
                                 return;
                             const int row = current->data(0, Qt::UserRole).toInt();
                             if (tree->property("currentRow").toInt() != row)
                                 tree->setProperty("currentRow", row);
                             dispatch(id, QStringLiteral("change"), row);
                             dispatch(id, QStringLiteral("select"), row);
                         });
        QObject::connect(tree, &QTreeWidget::itemChanged, q,
                         [this, id](QTreeWidgetItem *item, int column) {
                             if (!item || column != 0 || !(item->flags() & Qt::ItemIsUserCheckable))
                                 return;
                             const int row = item->data(0, Qt::UserRole).toInt();
                             const bool checked = (item->checkState(0) == Qt::Checked);
                             const bool prev = item->data(0, Qt::UserRole + 2).toBool();
                             if (checked != prev)
                                 q->toggleTreeCheck(id, row, checked);
                         });
        QObject::connect(tree, &QTreeWidget::itemClicked, q,
                         [this, id, tree](QTreeWidgetItem *item, int) {
                             if (!item || !item->data(0, Qt::UserRole + 3).toBool())
                                 return;
                             const QPoint vpPos = tree->viewport()->mapFromGlobal(QCursor::pos());
                             const int depth = item->data(0, Qt::UserRole + 5).toInt();
                             if (vpPos.x() >= 0 && vpPos.x() <= 42 + depth * 14) {
                                 const int row = item->data(0, Qt::UserRole).toInt();
                                 const bool collapsed = item->data(0, Qt::UserRole + 4).toBool();
                                 q->toggleTreeCollapse(id, row, !collapsed);
                             }
                         });
        QObject::connect(tree, &QTreeWidget::itemDoubleClicked, q,
                         [this, id](QTreeWidgetItem *item, int) {
                             if (!item || !item->data(0, Qt::UserRole + 3).toBool())
                                 return;
                             const int row = item->data(0, Qt::UserRole).toInt();
                             const bool collapsed = item->data(0, Qt::UserRole + 4).toBool();
                             q->toggleTreeCollapse(id, row, !collapsed);
                         });
    } else if (auto *tabBar = qobject_cast<QTabBar *>(widget)) {
        tabBar->setExpanding(false);
        tabBar->setDrawBase(false);
    }

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

void Ui::Private::registerDock(
    const QString &id,
    QDockWidget *dock,
    QWidget *header,
    QWidget *body,
    const QString &defaultArea,
    int headerHeight,
    int designWidth,
    int designHeight)
{
    DockEntry entry;
    entry.id = id;
    entry.dock = dock;
    entry.header = header;
    entry.body = body;
    entry.defaultArea = defaultArea;
    entry.lastArea = defaultArea;
    entry.activeIdInHeader = id;
    entry.tabGroupAnchorId = id;
    entry.headerHeight = headerHeight;
    entry.designWidth = designWidth;
    entry.designHeight = designHeight;

    dock->setFeatures(QDockWidget::DockWidgetClosable | QDockWidget::DockWidgetMovable | QDockWidget::DockWidgetFloatable);
    dock->setAllowedAreas(Qt::AllDockWidgetAreas);
    header->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    header->setMinimumSize(1, headerHeight);
    header->setFixedHeight(headerHeight);
    body->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    body->setMinimumSize(1, 1);

    auto *hLay = new QHBoxLayout(header);
    hLay->setSizeConstraint(QLayout::SetNoConstraint);
    hLay->setContentsMargins(6, 0, 4, 0);
    hLay->setSpacing(4);
    hLay->addStrut(headerHeight);
    header->setObjectName(QStringLiteral("vf_dock_hdr_") + id);
    header->setCursor(Qt::OpenHandCursor);
    header->installEventFilter(q);
    dockHeaderIds.insert(header, id);

    auto *resizer = new QWidget(dock);
    resizer->setObjectName(QStringLiteral("vf_dock_resizer_") + id);
    resizer->setFixedSize(12, 12);
    resizer->setCursor(Qt::SizeFDiagCursor);
    resizer->setVisible(false);
    resizer->installEventFilter(q);
    entry.resizer = resizer;
    dockResizerIds.insert(resizer, id);

    docks.insert(id, entry);

    // 连接 QDockWidget 原生信号并异步同步回 JS 运行态（避免在 QDockWidget 信号栈帧内重入修改布局）
    QObject::connect(dock, &QDockWidget::topLevelChanged, q, [this, alive = alive, id](bool topLevel) {
        if (applyingLayout || !docks.contains(id))
            return;
        QTimer::singleShot(0, q, [this, alive, id, topLevel] {
            if (!*alive || applyingLayout || !docks.contains(id))
                return;
            DockEntry &de = docks[id];
            if (topLevel) {
                const QPoint relPos = window.mapFromGlobal(de.dock->mapToGlobal(QPoint(0, 0)));
                const QJsonObject args{
                    { QStringLiteral("dock"), id },
                    { QStringLiteral("x"), qMax(0, relPos.x()) },
                    { QStringLiteral("y"), qMax(0, relPos.y()) },
                    { QStringLiteral("width"), qMax(120, de.dock->width()) },
                    { QStringLiteral("height"), qMax(80, de.dock->height()) },
                };
                q->runDockOp(QStringLiteral("float"), QString::fromUtf8(QJsonDocument(args).toJson(QJsonDocument::Compact)));
            } else {
                const QString areaStr = areaKeyFor(window.dockWidgetArea(de.dock), de.lastArea.isEmpty() ? de.defaultArea : de.lastArea);
                const QJsonObject args{
                    { QStringLiteral("dock"), id },
                    { QStringLiteral("area"), areaStr },
                };
                q->runDockOp(QStringLiteral("restore"), QString::fromUtf8(QJsonDocument(args).toJson(QJsonDocument::Compact)));
            }
        });
    });

    QObject::connect(dock, &QDockWidget::dockLocationChanged, q, [this, alive = alive, id](Qt::DockWidgetArea area) {
        if (applyingLayout || !docks.contains(id))
            return;
        QTimer::singleShot(0, q, [this, alive, id, area] {
            if (!*alive || applyingLayout || !docks.contains(id))
                return;
            DockEntry &de = docks[id];
            if (de.dock->isFloating())
                return;
            const QString areaStr = areaKeyFor(area, de.lastArea.isEmpty() ? de.defaultArea : de.lastArea);
            de.lastArea = areaStr;
            const QList<QDockWidget *> peers = window.tabifiedDockWidgets(de.dock);
            for (QDockWidget *peerDock : peers) {
                for (auto it = docks.begin(); it != docks.end(); ++it) {
                    if (it->dock == peerDock && it.key() != id) {
                        const QJsonObject args{
                            { QStringLiteral("target"), it.key() },
                            { QStringLiteral("dock"), id },
                        };
                        q->runDockOp(QStringLiteral("tabify"), QString::fromUtf8(QJsonDocument(args).toJson(QJsonDocument::Compact)));
                        return;
                    }
                }
            }
            const QJsonObject args{
                { QStringLiteral("dock"), id },
                { QStringLiteral("area"), areaStr },
            };
            q->runDockOp(QStringLiteral("move"), QString::fromUtf8(QJsonDocument(args).toJson(QJsonDocument::Compact)));
        });
    });

    QObject::connect(dock, &QDockWidget::visibilityChanged, q, [this, alive = alive, id](bool visible) {
        if (applyingLayout || !started || !docks.contains(id))
            return;
        QTimer::singleShot(0, q, [this, alive, id, visible] {
            if (!*alive || applyingLayout || !started || !docks.contains(id))
                return;
            DockEntry &de = docks[id];
            if (visible && inactiveTabDocks.contains(id)) {
                const QJsonObject args{ { QStringLiteral("dock"), id } };
                q->runDockOp(QStringLiteral("activateTab"), QString::fromUtf8(QJsonDocument(args).toJson(QJsonDocument::Compact)));
            } else if (!visible && !de.isClosed && de.isActiveInGroup && de.dock->isHidden()) {
                // 看不见不等于关闭：主窗口最小化时信号也是 false，但 isHidden() 只有面板真被隐藏时才成立
                const QList<QDockWidget *> peers = window.tabifiedDockWidgets(de.dock);
                bool peerVisible = false;
                for (QDockWidget *p : peers) {
                    if (!p->isHidden()) {
                        peerVisible = true;
                        break;
                    }
                }
                if (!peerVisible && window.isVisible()) {
                    de.isClosed = true;
                    const QJsonObject args{ { QStringLiteral("dock"), id } };
                    q->runDockOp(QStringLiteral("close"), QString::fromUtf8(QJsonDocument(args).toJson(QJsonDocument::Compact)));
                }
            }
        });
    });
}

void Ui::Private::beginDockDrag(const QString &dockId, const QString &visibleDockId, const QPoint &globalPos)
{
    // 拖的可能是没激活的页签，它的 QDockWidget 被盖在下面，组的矩形要从正在显示的面板取
    const DockEntry &visibleEntry = docks.value(docks.contains(visibleDockId) ? visibleDockId : dockId);
    draggingDockId = dockId;
    dockDragMoved = false;
    dragStartGlobal = globalPos;
    dragStartDockRect = QRect(window.mapFromGlobal(visibleEntry.dock->mapToGlobal(QPoint(0, 0))), visibleEntry.dock->size());
}

void Ui::Private::updateDockDrag(const QMouseEvent *mouse)
{
    if (draggingDockId.isEmpty())
        return;
    const QPoint delta = mouse->globalPosition().toPoint() - dragStartGlobal;
    if (!dockDragMoved && (delta.manhattanLength() > 5 || mouse->modifiers().testFlag(Qt::ShiftModifier)))
        dockDragMoved = true;
    if (dockDragMoved && docks.contains(draggingDockId)) {
        const DockEntry &de = docks.value(draggingDockId);
        if (de.dock->isFloating()) {
            const int nx = qMax(0, dragStartDockRect.x() + delta.x());
            const int ny = qMax(0, dragStartDockRect.y() + delta.y());
            de.dock->move(window.mapToGlobal(QPoint(nx, ny)));
        }
    }
}

bool Ui::Private::finishDockDrag(const QMouseEvent *mouse)
{
    if (draggingDockId.isEmpty())
        return false;
    const QString draggedId = draggingDockId;
    const bool moved = dockDragMoved;
    draggingDockId.clear();
    dockDragMoved = false;
    if (moved)
        handleDockDropAt(draggedId, mouse->globalPosition().toPoint(), mouse->modifiers());
    return moved;
}

void Ui::Private::toggleDockFloating(const QString &dockId)
{
    if (!docks.contains(dockId))
        return;
    const QJsonObject args{ { QStringLiteral("dock"), dockId } };
    q->runDockOp(docks.value(dockId).dock->isFloating() ? QStringLiteral("restore") : QStringLiteral("float"),
                 QString::fromUtf8(QJsonDocument(args).toJson(QJsonDocument::Compact)));
}

// 松手的落点决定做什么。判定顺序、热区比例和预览（dock.ts 的 computeDropAction）相同：
// 先看窗口四边吸附带，再看落在哪个停靠面板上，其余位置变成浮窗
DockDropAction Ui::Private::dockDropActionAt(const QString &dockId, const QPoint &globalPos, Qt::KeyboardModifiers mods)
{
    DockDropAction action;
    const DockEntry &dragged = docks.value(dockId);
    const QPoint relPos = window.mapFromGlobal(globalPos);
    const int W = window.width();
    const int H = window.height();

    // 按住 Shift 拖拽或拖出窗口外时直接浮出到目标坐标
    if (!mods.testFlag(Qt::ShiftModifier) && window.rect().contains(relPos)) {
        const int edgeMargin = 28;
        const QString edgeArea = relPos.x() <= edgeMargin ? QStringLiteral("left")
            : relPos.x() >= W - edgeMargin ? QStringLiteral("right")
            : relPos.y() <= edgeMargin + 28 ? QStringLiteral("top")
            : relPos.y() >= H - edgeMargin - 28 ? QStringLiteral("bottom")
            : QString();
        if (!edgeArea.isEmpty()) {
            action.op = QStringLiteral("move");
            action.args = QJsonObject{ { QStringLiteral("dock"), dockId }, { QStringLiteral("area"), edgeArea } };
            return action;
        }

        const QJsonObject areasObj = QJsonDocument::fromJson(call("dockLayout").toString().toUtf8()).object().value(QStringLiteral("areas")).toObject();
        for (auto it = docks.begin(); it != docks.end(); ++it) {
            if (it->isClosed || !it->isActiveInGroup || it->dock->isFloating() || it->dock->isHidden())
                continue;
            const QRect targetRect(window.mapFromGlobal(it->dock->mapToGlobal(QPoint(0, 0))), it->dock->size());
            if (!targetRect.contains(relPos))
                continue;

            QString targetId = it.key();
            if (targetId == dockId) {
                // 拖叠页签组的激活页签落在自身上：取同组另一页签作目标，单独的面板落在自身上不算命中
                QString peerTabId;
                int bestOrder = INT_MAX;
                for (auto pit = docks.begin(); pit != docks.end(); ++pit) {
                    if (pit.key() != dockId
                        && !pit->tabGroupAnchorId.isEmpty()
                        && pit->tabGroupAnchorId == it->tabGroupAnchorId
                        && pit->tabOrder < bestOrder) {
                        bestOrder = pit->tabOrder;
                        peerTabId = pit.key();
                    }
                }
                if (peerTabId.isEmpty())
                    continue;
                targetId = peerTabId;
            }

            const bool sameTabGroup = !dragged.dock->isFloating() && dragged.tabGroupAnchorId == it->tabGroupAnchorId;
            const bool inHeaderBand = relPos.y() <= targetRect.y() + it->headerHeight + 8;
            const double rx = double(relPos.x() - targetRect.x()) / double(qMax(1, targetRect.width()));
            const double ry = double(relPos.y() - targetRect.y()) / double(qMax(1, targetRect.height()));
            const QString areaOrient = areasObj.value(it->lastArea).toObject()
                                           .value(QStringLiteral("splitOrientation")).toString(defaultSplitOrientFor(it->lastArea));
            const bool primaryVertical = areaOrient == QLatin1String("vertical");
            const double yBand = primaryVertical ? 0.25 : 0.22;
            const double xBand = primaryVertical ? 0.22 : 0.25;
            QString position;
            QString orientation;
            const auto tryVertical = [&] {
                if (ry < yBand)
                    position = QStringLiteral("before");
                else if (ry > 1.0 - yBand)
                    position = QStringLiteral("after");
                if (!position.isEmpty())
                    orientation = QStringLiteral("vertical");
            };
            const auto tryHorizontal = [&] {
                if (rx < xBand)
                    position = QStringLiteral("before");
                else if (rx > 1.0 - xBand)
                    position = QStringLiteral("after");
                if (!position.isEmpty())
                    orientation = QStringLiteral("horizontal");
            };
            // 在同一个页签组的标题栏内微拖时保持叠页签，不误拆成分栏
            if (!(sameTabGroup && inHeaderBand)) {
                if (primaryVertical) {
                    tryVertical();
                    if (position.isEmpty())
                        tryHorizontal();
                } else {
                    tryHorizontal();
                    if (position.isEmpty())
                        tryVertical();
                }
            }
            action.args = QJsonObject{ { QStringLiteral("target"), targetId }, { QStringLiteral("dock"), dockId } };
            if (position.isEmpty()) {
                action.op = QStringLiteral("tabify");
            } else {
                action.op = QStringLiteral("split");
                action.args.insert(QStringLiteral("position"), position);
                action.args.insert(QStringLiteral("orientation"), orientation);
            }
            return action;
        }
    }

    // 其余位置：切换/更新为浮动面板。
    // 已经是浮窗的保持原尺寸；从停靠区拖出来的和预览一样限制在 180～320 × 120～440
    const QPoint delta = globalPos - dragStartGlobal;
    const bool alreadyFloating = dragged.dock->isFloating();
    action.op = QStringLiteral("float");
    action.args = QJsonObject{
        { QStringLiteral("dock"), dockId },
        { QStringLiteral("x"), qMax(0, dragStartDockRect.x() + delta.x()) },
        { QStringLiteral("y"), qMax(0, dragStartDockRect.y() + delta.y()) },
        { QStringLiteral("width"), alreadyFloating ? qMax(80, dragStartDockRect.width()) : qBound(180, dragStartDockRect.width(), 320) },
        { QStringLiteral("height"), alreadyFloating ? qMax(60, dragStartDockRect.height()) : qBound(120, dragStartDockRect.height(), 440) },
    };
    return action;
}

void Ui::Private::handleDockDropAt(const QString &dockId, const QPoint &globalPos, Qt::KeyboardModifiers mods)
{
    if (!docks.contains(dockId))
        return;
    const DockDropAction action = dockDropActionAt(dockId, globalPos, mods);
    q->runDockOp(action.op, QString::fromUtf8(QJsonDocument(action.args).toJson(QJsonDocument::Compact)));
}

void Ui::Private::registerFloatBox(const QString &id, QFrame *frame, QWidget *header, QWidget *body, int headerHeight, int designWidth, int designHeight)
{
    FloatBoxEntry fb;
    fb.id = id;
    fb.frame = frame;
    fb.header = header;
    fb.body = body;
    fb.origParent = frame->parentWidget();
    fb.origGeometry = frame->geometry();
    fb.origMinSize = frame->minimumSize();
    fb.origMaxSize = frame->maximumSize();
    fb.origSizePolicy = frame->sizePolicy();
    fb.headerHeight = headerHeight;
    fb.designWidth = designWidth;
    fb.designHeight = designHeight;

    if (fb.origParent && fb.origParent->layout()) {
        QLayout *lay = fb.origParent->layout();
        if (auto *box = qobject_cast<QBoxLayout *>(lay)) {
            fb.origBoxLayout = box;
            fb.origIndex = box->indexOf(frame);
            if (fb.origIndex >= 0)
                fb.origStretch = box->stretch(fb.origIndex);
        } else if (auto *grid = qobject_cast<QGridLayout *>(lay)) {
            fb.origGridLayout = grid;
            fb.origIndex = grid->indexOf(frame);
            if (fb.origIndex >= 0)
                grid->getItemPosition(fb.origIndex, &fb.origGridRow, &fb.origGridCol, &fb.origGridRowSpan, &fb.origGridColSpan);
        } else if (auto *form = qobject_cast<QFormLayout *>(lay)) {
            fb.origFormLayout = form;
            form->getWidgetPosition(frame, &fb.origFormRow, &fb.origFormRole);
        } else if (auto *stack = qobject_cast<QStackedLayout *>(lay)) {
            fb.origStackedLayout = stack;
            fb.origIndex = stack->indexOf(frame);
        }
    }

    auto *hLay = new QHBoxLayout(header);
    hLay->setContentsMargins(8, 0, 6, 0);
    hLay->setSpacing(6);
    fb.titleLabel = new QLabel(id, header);
    fb.titleLabel->setAttribute(Qt::WA_TransparentForMouseEvents);
    fb.toggleBtn = new QPushButton(QStringLiteral("浮出"), header);
    fb.toggleBtn->setObjectName(QStringLiteral("vf_floatbox_toggle_") + id);
    fb.toggleBtn->setFixedHeight(qMax(16, headerHeight - 6));
    hLay->addWidget(fb.titleLabel, 1);
    hLay->addWidget(fb.toggleBtn, 0);

    QObject::connect(fb.toggleBtn, &QPushButton::clicked, q, [this, id] {
        dispatch(id, QStringLiteral("toggle"));
        const QJSValue v = call("views").property(id).property(QStringLiteral("props")).property(QStringLiteral("floating"));
        dispatch(id, QStringLiteral("change"), v);
    });

    header->setObjectName(QStringLiteral("vf_floatbox_hdr_") + id);
    header->installEventFilter(q);
    floatBoxHeaderIds.insert(header, id);
    floatBoxes.append(fb);
}

void Ui::Private::applyDockLayout(const QJSValue &views)
{
    if (docks.isEmpty())
        return;

    // 结构变化时面板先离开布局再加回来，其间显示、隐藏控件会触发 Enter 等事件，事件处理又走到这里。
    // 这时重入会拿不在布局里的面板去 resizeDocks，所以先记下，等这一遍结束后按最新状态补一次
    if (dockPassRunning) {
        // 补跑的这一遍读的已经是最新状态，其间的请求是布局自己引起的窗口变化，再排队会转不停
        if (!dockPassCatchingUp)
            dockPassPending = true;
        return;
    }
    dockPassRunning = true;

    const bool prevApplying = applyingLayout;
    applyingLayout = true;

    const QString dockJson = call("dockLayout").toString();
    const QJsonObject layoutObj = QJsonDocument::fromJson(dockJson.toUtf8()).object();
    const QJsonObject areasObj = layoutObj.value(QStringLiteral("areas")).toObject();
    const QJsonArray floatingArr = layoutObj.value(QStringLiteral("floating")).toArray();
    const QJSValue boxesObj = call("computeLayout", { window.width(), window.height() });
    dockPassBoxes = boxesObj;

    // 排列、窗口尺寸、各面板几何和标题都没变时，这一遍不用再动 QDockWidget，
    // 否则每次状态变化都要重排一次。面板里的内容可能变了，它们的布局还是要刷新
    QStringList passParts{ dockJson, QString::number(window.width()), QString::number(window.height()), QString::number(window.isVisible()) };
    for (auto it = docks.cbegin(); it != docks.cend(); ++it) {
        const QJSValue box = boxesObj.property(it.key());
        const QJSValue view = views.property(it.key());
        passParts << QString::number(box.property(QStringLiteral("x")).toInt())
                  << QString::number(box.property(QStringLiteral("y")).toInt())
                  << QString::number(box.property(QStringLiteral("width")).toInt())
                  << QString::number(box.property(QStringLiteral("height")).toInt())
                  << QString::number(view.property(QStringLiteral("visible")).toBool())
                  << view.property(QStringLiteral("props")).property(QStringLiteral("title")).toString();
    }
    const QString passKey = passParts.join(QChar(0x1f));
    if (passKey == lastDockPassKey) {
        for (auto it = docks.begin(); it != docks.end(); ++it) {
            if (!it->dock->isHidden() && it->body->layout())
                it->body->layout()->activate();
        }
        finishDockPass(prevApplying);
        return;
    }
    lastDockPassKey = passKey;

    QStringList structParts;
    for (const QString &areaKey : { QStringLiteral("top"), QStringLiteral("bottom"), QStringLiteral("left"), QStringLiteral("right") }) {
        const QJsonObject areaSpec = areasObj.value(areaKey).toObject();
        const QString orient = areaSpec.value(QStringLiteral("splitOrientation")).toString(defaultSplitOrientFor(areaKey));
        const QJsonArray groups = areaSpec.value(QStringLiteral("groups")).toArray();
        QStringList gParts;
        for (int gi = 0; gi < groups.size(); ++gi) {
            const QJsonArray tabsArr = groups.at(gi).toObject().value(QStringLiteral("tabs")).toArray();
            QStringList tParts;
            for (int ti = 0; ti < tabsArr.size(); ++ti)
                tParts.append(tabsArr.at(ti).toString());
            gParts.append(tParts.join(QLatin1Char(',')));
        }
        structParts.append(areaKey + QLatin1Char(':') + orient + QLatin1Char('[') + gParts.join(QLatin1Char('|')) + QLatin1Char(']'));
    }
    QStringList fParts;
    QSet<QString> wantFloatingIds;
    for (int fi = 0; fi < floatingArr.size(); ++fi) {
        const QString did = floatingArr.at(fi).toObject().value(QStringLiteral("dockId")).toString();
        fParts.append(did);
        wantFloatingIds.insert(did);
    }
    structParts.append(QStringLiteral("float:") + fParts.join(QLatin1Char(',')));
    const QString structureKey = structParts.join(QLatin1Char(';'));
    const bool structureChanged = (structureKey != lastDockStructureKey);
    lastDockStructureKey = structureKey;

    for (auto it = docks.begin(); it != docks.end(); ++it) {
        if (it->body && it->body->layout())
            it->body->layout()->setSizeConstraint(QLayout::SetNoConstraint);
        if (it->dock && it->dock->widget() && it->dock->widget()->layout())
            it->dock->widget()->layout()->setSizeConstraint(QLayout::SetNoConstraint);
        it->isClosed = !views.property(it.key()).property(QStringLiteral("visible")).toBool();
        it->isActiveInGroup = false;
        if (structureChanged && !wantFloatingIds.contains(it.key())) {
            if (it->dock->isFloating())
                it->dock->setFloating(false);
            window.removeDockWidget(it->dock);
        }
    }
    inactiveTabDocks.clear();

    auto populateHeader = [this, &views](DockEntry &entry, const QStringList &visibleTabs, const QString &activeId, bool isFloating) {
        entry.activeIdInHeader = activeId;
        // 内容没变就不重建：布局每次刷新都会走到这里，重建会把正按着的页签按钮删掉
        QStringList signatureParts{ activeId, isFloating ? QStringLiteral("float") : QStringLiteral("dock") };
        QStringList tabTitles;
        for (const QString &tid : visibleTabs) {
            QString title = views.property(tid).property(QStringLiteral("props")).property(QStringLiteral("title")).toString();
            if (title.isEmpty())
                title = tid;
            tabTitles.append(title);
            signatureParts << tid << title;
        }
        const QString signature = signatureParts.join(QChar(0x1f));
        if (signature == entry.headerSignature)
            return;
        entry.headerSignature = signature;
        if (QLayout *lay = entry.header->layout()) {
            while (QLayoutItem *item = lay->takeAt(0)) {
                if (QWidget *w = item->widget()) {
                    dockTabButtonIds.remove(w);
                    w->hide();
                    w->setParent(nullptr);
                    w->deleteLater();
                }
                delete item;
            }
            auto *hLay = static_cast<QHBoxLayout *>(lay);
            hLay->addStrut(entry.headerHeight);
            for (int ti = 0; ti < visibleTabs.size(); ++ti) {
                const QString &tid = visibleTabs.at(ti);
                auto *tabBtn = new QPushButton(tabTitles.at(ti), entry.header);
                tabBtn->setObjectName(QStringLiteral("vf_dock_tab_") + tid);
                tabBtn->setFlat(true);
                tabBtn->setMinimumWidth(0);
                const QString tabId = tid;
                QObject::connect(tabBtn, &QPushButton::clicked, q, [this, tabId] {
                    const QString json = QString::fromUtf8(QJsonDocument(QJsonObject{ { QStringLiteral("dock"), tabId } }).toJson(QJsonDocument::Compact));
                    q->runDockOp(QStringLiteral("activateTab"), json);
                });
                tabBtn->installEventFilter(q);
                dockTabButtonIds.insert(tabBtn, tid);
                hLay->addWidget(tabBtn, 0);
                tabBtn->show();
            }
            hLay->addStretch(1);
            if (isFloating) {
                auto *restoreBtn = new QPushButton(QStringLiteral("还原"), entry.header);
                restoreBtn->setObjectName(QStringLiteral("vf_dock_restore_") + activeId);
                restoreBtn->setMinimumWidth(0);
                restoreBtn->setFixedHeight(qMax(16, entry.headerHeight - 6));
                QObject::connect(restoreBtn, &QPushButton::clicked, q, [this, activeId] {
                    const QString json = QString::fromUtf8(QJsonDocument(QJsonObject{ { QStringLiteral("dock"), activeId } }).toJson(QJsonDocument::Compact));
                    q->runDockOp(QStringLiteral("restore"), json);
                });
                hLay->addWidget(restoreBtn, 0);
                restoreBtn->show();
            } else {
                auto *floatBtn = new QPushButton(QStringLiteral("浮出"), entry.header);
                floatBtn->setObjectName(QStringLiteral("vf_dock_float_") + activeId);
                floatBtn->setMinimumWidth(0);
                floatBtn->setFixedHeight(qMax(16, entry.headerHeight - 6));
                QObject::connect(floatBtn, &QPushButton::clicked, q, [this, activeId] {
                    const QString json = QString::fromUtf8(QJsonDocument(QJsonObject{ { QStringLiteral("dock"), activeId } }).toJson(QJsonDocument::Compact));
                    q->runDockOp(QStringLiteral("float"), json);
                });
                hLay->addWidget(floatBtn, 0);
                floatBtn->show();
            }
            auto *closeBtn = new QPushButton(QStringLiteral("×"), entry.header);
            closeBtn->setObjectName(QStringLiteral("vf_dock_close_") + activeId);
            closeBtn->setFixedSize(qMax(16, entry.headerHeight - 6), qMax(16, entry.headerHeight - 6));
            QObject::connect(closeBtn, &QPushButton::clicked, q, [this, activeId] {
                const QString json = QString::fromUtf8(QJsonDocument(QJsonObject{ { QStringLiteral("dock"), activeId } }).toJson(QJsonDocument::Compact));
                q->runDockOp(QStringLiteral("close"), json);
            });
            hLay->addWidget(closeBtn, 0);
            closeBtn->show();
        }
    };

    struct AreaResizePlan
    {
        QString areaKey;
        Qt::Orientation thicknessOrient = Qt::Horizontal;
        Qt::Orientation splitOrient = Qt::Vertical;
        QList<QDockWidget *> anchors;
        QList<int> thicknesses;
        QList<int> splitSizes;
        QList<QDockWidget *> allDocks;
        QList<int> allThicknesses;
    };
    QList<AreaResizePlan> resizePlans;
    QList<QDockWidget *> activeDocksToRaise;

    for (const QString &areaKey : { QStringLiteral("top"), QStringLiteral("bottom"), QStringLiteral("left"), QStringLiteral("right") }) {
        const QJsonObject areaSpec = areasObj.value(areaKey).toObject();
        const QString splitOrientStr = areaSpec.value(QStringLiteral("splitOrientation")).toString(defaultSplitOrientFor(areaKey));
        const Qt::Orientation qtSplitOrient = (splitOrientStr == QLatin1String("horizontal")) ? Qt::Horizontal : Qt::Vertical;
        const Qt::Orientation qtThicknessOrient = (areaKey == QLatin1String("left") || areaKey == QLatin1String("right"))
            ? Qt::Horizontal
            : Qt::Vertical;
        const QJsonArray groups = areaSpec.value(QStringLiteral("groups")).toArray();

        QDockWidget *prevAnchor = nullptr;
        AreaResizePlan plan;
        plan.areaKey = areaKey;
        plan.thicknessOrient = qtThicknessOrient;
        plan.splitOrient = qtSplitOrient;

        for (int gi = 0; gi < groups.size(); ++gi) {
            const QJsonObject gObj = groups.at(gi).toObject();
            const QJsonArray tabsArr = gObj.value(QStringLiteral("tabs")).toArray();
            QStringList allTabs;
            QStringList visibleTabs;
            for (int ti = 0; ti < tabsArr.size(); ++ti) {
                const QString tid = tabsArr.at(ti).toString();
                if (!docks.contains(tid))
                    continue;
                allTabs.append(tid);
                if (!docks[tid].isClosed)
                    visibleTabs.append(tid);
            }
            if (allTabs.isEmpty())
                continue;

            const QString rawActive = gObj.value(QStringLiteral("active")).toString();
            const QString activeId = visibleTabs.contains(rawActive)
                ? rawActive
                : (!visibleTabs.isEmpty() ? visibleTabs.first() : (allTabs.contains(rawActive) ? rawActive : allTabs.first()));
            const QString anchorId = allTabs.first();

            int targetW = docks[activeId].designWidth;
            int targetH = docks[activeId].designHeight;
            if (!visibleTabs.isEmpty() && docks.contains(activeId)) {
                const QJSValue boxVal = boxesObj.property(activeId);
                targetW = qMax(40, boxVal.property(QStringLiteral("width")).toInt());
                targetH = qMax(30, boxVal.property(QStringLiteral("height")).toInt());
            } else {
                const int areaThick = areaSpec.value(QStringLiteral("size")).toInt(docks[activeId].designWidth);
                const int fallbackThick = (qtThicknessOrient == qtSplitOrient && groups.size() >= 2)
                    ? gObj.value(QStringLiteral("size")).toInt(areaThick / groups.size())
                    : areaThick;
                targetW = qMax(40, fallbackThick);
                targetH = qMax(30, gObj.value(QStringLiteral("size")).toInt(docks[activeId].designHeight));
            }
            const bool isInSplitArea = (groups.size() >= 2);
            // 并排的组之间各有 1 像素分隔线，尺寸下限留出这点余量；留多了 QMainWindow 会把差额全压给叠页签的组
            const int splitSlack = int(groups.size()) - 1;

            for (int ti = 0; ti < allTabs.size(); ++ti) {
                const QString &tid = allTabs.at(ti);
                DockEntry &de = docks[tid];
                de.lastArea = areaKey;
                de.groupOrder = gi;
                de.tabOrder = ti;
                de.tabGroupAnchorId = anchorId;
                de.isActiveInGroup = (tid == activeId);
                de.resizer->setVisible(false);
                if (de.dock->isFloating())
                    de.dock->setFloating(false);
                if (isInSplitArea) {
                    const int minW = (qtThicknessOrient == Qt::Horizontal)
                        ? targetW
                        : qMax(40, targetW - splitSlack);
                    const int maxW = targetW;
                    const int minH = (qtThicknessOrient == Qt::Vertical && qtSplitOrient == Qt::Vertical)
                        ? targetH
                        : qMax(30, targetH - splitSlack);
                    const int maxH = targetH;
                    if (tid == activeId) {
                        de.dock->setMinimumSize(minW, minH);
                        de.dock->setMaximumSize(maxW, maxH);
                    } else {
                        de.dock->setMinimumSize((qtThicknessOrient == Qt::Horizontal) ? targetW : 40, 30);
                        de.dock->setMaximumSize(maxW, maxH);
                    }
                } else if (qtThicknessOrient == Qt::Horizontal) {
                    de.dock->setMinimumSize(targetW, 30);
                    de.dock->setMaximumSize(targetW, QWIDGETSIZE_MAX);
                } else {
                    de.dock->setMinimumSize(40, targetH);
                    de.dock->setMaximumSize(QWIDGETSIZE_MAX, targetH);
                }
            }

            for (const QString &tid : allTabs) {
                DockEntry &de = docks[tid];
                if (de.isClosed) {
                    de.header->setVisible(false);
                    de.body->setVisible(false);
                } else if (tid == activeId) {
                    de.header->setVisible(true);
                    de.body->setVisible(true);
                    populateHeader(de, visibleTabs, activeId, false);
                } else {
                    de.header->setVisible(false);
                    de.body->setVisible(false);
                    inactiveTabDocks.insert(tid);
                }
            }

            QDockWidget *groupFirstDock = docks[anchorId].dock;
            if (structureChanged) {
                if (!prevAnchor) {
                    window.addDockWidget(qtAreaFor(areaKey), groupFirstDock);
                } else {
                    window.splitDockWidget(prevAnchor, groupFirstDock, qtSplitOrient);
                }
                if (groupFirstDock->isFloating())
                    groupFirstDock->setFloating(false);
                prevAnchor = groupFirstDock;
            }

            for (const QString &tid : allTabs) {
                DockEntry &de = docks[tid];
                de.dock->setVisible(!de.isClosed);
            }

            if (docks.contains(activeId))
                activeDocksToRaise.append(docks[activeId].dock);

            if (!visibleTabs.isEmpty() && docks.contains(activeId)) {
                QDockWidget *activeDock = docks[activeId].dock;
                const QJSValue boxVal = boxesObj.property(activeId);
                const int bw = qMax(40, boxVal.property(QStringLiteral("width")).toInt());
                const int bh = qMax(30, boxVal.property(QStringLiteral("height")).toInt());
                const int thickness = (qtThicknessOrient == Qt::Horizontal) ? bw : bh;
                const int splitSpan = (qtSplitOrient == Qt::Horizontal) ? bw : bh;
                plan.anchors.append(activeDock);
                plan.thicknesses.append(thickness);
                plan.splitSizes.append(splitSpan);
                for (const QString &tid : allTabs) {
                    plan.allDocks.append(docks[tid].dock);
                    plan.allThicknesses.append(thickness);
                }
            } else {
                const int areaThick = areaSpec.value(QStringLiteral("size")).toInt(
                    (qtThicknessOrient == Qt::Horizontal) ? docks[activeId].designWidth : docks[activeId].designHeight);
                const int fallbackSplit = gObj.value(QStringLiteral("size")).toInt(
                    (qtSplitOrient == Qt::Horizontal) ? docks[activeId].designWidth : docks[activeId].designHeight);
                const int thickVal = qMax(40, (qtThicknessOrient == qtSplitOrient && groups.size() >= 2) ? fallbackSplit : areaThick);
                plan.anchors.append(groupFirstDock);
                plan.thicknesses.append(thickVal);
                plan.splitSizes.append(qMax(30, fallbackSplit));
                for (const QString &tid : allTabs) {
                    plan.allDocks.append(docks[tid].dock);
                    plan.allThicknesses.append(thickVal);
                }
            }
        }

        // 第二遍：在所有分栏锚点已通过 addDockWidget / splitDockWidget 建立完成后，再对多页签组执行 tabifyDockWidget，
        // 避免先 tabify 导致后续 splitDockWidget 把新组误塞入同一个 Tabbed 容器。
        if (structureChanged) {
            for (int gi = 0; gi < groups.size(); ++gi) {
                const QJsonArray tabsArr = groups.at(gi).toObject().value(QStringLiteral("tabs")).toArray();
                QStringList allTabs;
                for (int ti = 0; ti < tabsArr.size(); ++ti) {
                    const QString tid = tabsArr.at(ti).toString();
                    if (docks.contains(tid))
                        allTabs.append(tid);
                }
                if (allTabs.size() < 2)
                    continue;
                QDockWidget *groupFirstDock = docks[allTabs.first()].dock;
                for (int ti = 1; ti < allTabs.size(); ++ti) {
                    const QString &tid = allTabs.at(ti);
                    window.tabifyDockWidget(groupFirstDock, docks[tid].dock);
                    if (docks[tid].dock->isFloating())
                        docks[tid].dock->setFloating(false);
                    docks[tid].dock->setVisible(!docks[tid].isClosed);
                }
            }
        }

        if (!plan.anchors.isEmpty())
            resizePlans.append(plan);
    }

    // 先激活布局并处理挂起的 LayoutRequest，使 QTabBar 与重新显示的标题栏/内容区尺寸生效，再调用 raise() 与 resizeDocks
    if (window.layout())
        window.layout()->activate();
    QApplication::sendPostedEvents(nullptr, QEvent::LayoutRequest);
    for (QTabBar *tb : window.findChildren<QTabBar *>(QString(), Qt::FindDirectChildrenOnly)) {
        tb->setMinimumSize(0, 0);
        tb->setFixedSize(0, 0);
    }
    for (QDockWidget *activeDock : activeDocksToRaise)
        activeDock->raise();
    if (window.layout())
        window.layout()->activate();
    QApplication::sendPostedEvents(nullptr, QEvent::LayoutRequest);
    for (const AreaResizePlan &plan : resizePlans) {
        window.resizeDocks(plan.allDocks, plan.allThicknesses, plan.thicknessOrient);
        window.resizeDocks(plan.anchors, plan.thicknesses, plan.thicknessOrient);
        if (plan.anchors.size() >= 2)
            window.resizeDocks(plan.anchors, plan.splitSizes, plan.splitOrient);
    }
    if (window.layout())
        window.layout()->activate();

    // 处理浮动面板：调用 setFloating(true) 并按相对于主窗口的坐标定位
    for (int fi = 0; fi < floatingArr.size(); ++fi) {
        const QJsonObject fObj = floatingArr.at(fi).toObject();
        const QString did = fObj.value(QStringLiteral("dockId")).toString();
        if (!docks.contains(did))
            continue;
        DockEntry &fEntry = docks[did];
        const QString lastArea = fObj.value(QStringLiteral("lastArea")).toString(fEntry.defaultArea);
        const int fx = fObj.value(QStringLiteral("x")).toInt();
        const int fy = fObj.value(QStringLiteral("y")).toInt();
        const int fw = qMax(80, fObj.value(QStringLiteral("width")).toInt());
        const int fh = qMax(60, fObj.value(QStringLiteral("height")).toInt());

        fEntry.lastArea = lastArea;
        fEntry.floatOrder = fi;
        fEntry.tabGroupAnchorId = did;
        fEntry.isActiveInGroup = true;

        if (!fEntry.dock->isFloating() || window.dockWidgetArea(fEntry.dock) != qtAreaFor(lastArea)) {
            window.addDockWidget(qtAreaFor(lastArea), fEntry.dock);
            fEntry.dock->setFloating(true);
        }
        fEntry.dock->setMinimumSize(fw, fh);
        fEntry.dock->setMaximumSize(fw, fh);
        const QPoint globalPos = window.mapToGlobal(QPoint(fx, fy));
        fEntry.dock->setGeometry(globalPos.x(), globalPos.y(), fw, fh);

        const bool vis = !fEntry.isClosed;
        fEntry.header->setVisible(vis);
        fEntry.body->setVisible(vis);
        fEntry.resizer->setVisible(vis);
        fEntry.dock->setVisible(vis);
        if (vis) {
            populateHeader(fEntry, QStringList{ did }, did, true);
            fEntry.header->setGeometry(0, 0, fw, fEntry.headerHeight);
            fEntry.body->setGeometry(0, fEntry.headerHeight, fw, qMax(0, fh - fEntry.headerHeight));
            fEntry.resizer->setGeometry(fw - 12, fh - 12, 12, 12);
            fEntry.resizer->raise();
            if (fEntry.body->layout())
                fEntry.body->layout()->activate();
            fEntry.dock->raise();
        }
    }

    QApplication::sendPostedEvents(nullptr, QEvent::LayoutRequest);
    for (const AreaResizePlan &plan : resizePlans) {
        window.resizeDocks(plan.allDocks, plan.allThicknesses, plan.thicknessOrient);
        window.resizeDocks(plan.anchors, plan.thicknesses, plan.thicknessOrient);
        if (plan.anchors.size() >= 2)
            window.resizeDocks(plan.anchors, plan.splitSizes, plan.splitOrient);
    }
    if (window.layout())
        window.layout()->activate();

    // 激活所有可见停靠面板的内部布局
    for (auto it = docks.begin(); it != docks.end(); ++it) {
        if (it->dock->isHidden() || it->dock->isFloating())
            continue;
        const int w = it->dock->width();
        const int h = it->dock->height();
        it->header->setGeometry(0, 0, w, it->headerHeight);
        it->body->setGeometry(0, it->headerHeight, w, qMax(0, h - it->headerHeight));
        if (it->body->layout())
            it->body->layout()->activate();
    }
    if (QWidget *cw = window.centralWidget()) {
        if (cw->layout())
            cw->layout()->activate();
    }

    if (draggingSplitterIdx < 0) {
        // 分隔条要删掉重建，只在面板的位置或显隐变了才做
        QStringList splitterParts;
        for (auto it = docks.cbegin(); it != docks.cend(); ++it) {
            const QRect r = it->dock->geometry();
            splitterParts << QStringLiteral("%1,%2,%3,%4,%5,%6,%7").arg(r.x()).arg(r.y()).arg(r.width()).arg(r.height())
                                 .arg(it->dock->isHidden()).arg(it->dock->isFloating()).arg(it->isActiveInGroup);
        }
        const QString splitterKey = splitterParts.join(QLatin1Char(';'));
        if (splitterKey != lastSplitterKey) {
            lastSplitterKey = splitterKey;
            rebuildDockSplitters();
        }
    }
    finishDockPass(prevApplying);
}

void Ui::Private::finishDockPass(bool prevApplying)
{
    applyingLayout = prevApplying;
    dockPassRunning = false;

    if (dockPassPending) {
        dockPassPending = false;
        dockPassCatchingUp = true;
        const QJSValue latestViews = call("views");
        applyDockLayout(latestViews);
        applyFloatBoxes(latestViews);
        dockPassCatchingUp = false;
    }
}

void Ui::Private::rebuildDockSplitters()
{
    for (const DockSplitterEntry &sp : dockSplitters) {
        if (sp.widget) {
            sp.widget->removeEventFilter(q);
            sp.widget->hide();
            sp.widget->setParent(nullptr);
            sp.widget->deleteLater();
        }
    }
    dockSplitters.clear();

    const QList<QPair<QString, Qt::DockWidgetArea>> areaDefs = {
        { QStringLiteral("top"), Qt::TopDockWidgetArea },
        { QStringLiteral("bottom"), Qt::BottomDockWidgetArea },
        { QStringLiteral("left"), Qt::LeftDockWidgetArea },
        { QStringLiteral("right"), Qt::RightDockWidgetArea },
    };

    for (const auto &areaDef : areaDefs) {
        const QString &areaKey = areaDef.first;
        const Qt::DockWidgetArea qtArea = areaDef.second;
        QList<QDockWidget *> visibleGroupDocks;
        for (auto it = docks.begin(); it != docks.end(); ++it) {
            if (!it->dock || it->dock->isFloating() || it->dock->isHidden() || !it->isActiveInGroup)
                continue;
            if (window.dockWidgetArea(it->dock) == qtArea)
                visibleGroupDocks.append(it->dock);
        }
        if (visibleGroupDocks.isEmpty())
            continue;

        QRect areaRect = visibleGroupDocks.first()->geometry();
        for (int i = 1; i < visibleGroupDocks.size(); ++i)
            areaRect = areaRect.united(visibleGroupDocks.at(i)->geometry());

        // 沿厚度方向并排时，厚度是各组之和，不含组之间的分隔线，和 dockDump 的算法相同
        const bool horizontalThickness = (areaKey == QLatin1String("left") || areaKey == QLatin1String("right"));
        int areaThickness = horizontalThickness ? areaRect.width() : areaRect.height();
        if (visibleGroupDocks.size() >= 2) {
            const int dx = qAbs(visibleGroupDocks.at(1)->x() - visibleGroupDocks.at(0)->x());
            const int dy = qAbs(visibleGroupDocks.at(1)->y() - visibleGroupDocks.at(0)->y());
            if (horizontalThickness ? dx > dy : dy > dx) {
                areaThickness = 0;
                for (QDockWidget *gd : visibleGroupDocks)
                    areaThickness += horizontalThickness ? gd->width() : gd->height();
            }
        }

        auto *areaBar = new QWidget(&window);
        areaBar->setObjectName(QStringLiteral("vf_qt_splitter_area_") + areaKey);
        DockSplitterEntry areaEntry;
        areaEntry.kind = QStringLiteral("area");
        areaEntry.area = areaKey;
        areaEntry.widget = areaBar;
        if (areaKey == QLatin1String("left")) {
            areaBar->setGeometry(areaRect.right() - 1, areaRect.top(), 4, areaRect.height());
            areaBar->setCursor(Qt::SplitHCursor);
            areaEntry.orientation = Qt::Horizontal;
            areaEntry.initialSize = areaThickness;
        } else if (areaKey == QLatin1String("right")) {
            areaBar->setGeometry(areaRect.left() - 2, areaRect.top(), 4, areaRect.height());
            areaBar->setCursor(Qt::SplitHCursor);
            areaEntry.orientation = Qt::Horizontal;
            areaEntry.initialSize = areaThickness;
        } else if (areaKey == QLatin1String("top")) {
            areaBar->setGeometry(areaRect.left(), areaRect.bottom() - 1, areaRect.width(), 4);
            areaBar->setCursor(Qt::SplitVCursor);
            areaEntry.orientation = Qt::Vertical;
            areaEntry.initialSize = areaThickness;
        } else {
            areaBar->setGeometry(areaRect.left(), areaRect.top() - 2, areaRect.width(), 4);
            areaBar->setCursor(Qt::SplitVCursor);
            areaEntry.orientation = Qt::Vertical;
            areaEntry.initialSize = areaThickness;
        }
        areaBar->setVisible(true);
        areaBar->raise();
        areaBar->installEventFilter(q);
        dockSplitters.append(areaEntry);

        if (visibleGroupDocks.size() >= 2) {
            const int dx = qAbs(visibleGroupDocks.at(1)->x() - visibleGroupDocks.at(0)->x());
            const int dy = qAbs(visibleGroupDocks.at(1)->y() - visibleGroupDocks.at(0)->y());
            const bool horiz = dx > dy;
            std::sort(visibleGroupDocks.begin(), visibleGroupDocks.end(), [horiz](QDockWidget *a, QDockWidget *b) {
                return horiz ? (a->x() < b->x()) : (a->y() < b->y());
            });
            for (int gi = 0; gi < visibleGroupDocks.size() - 1; ++gi) {
                QDockWidget *cur = visibleGroupDocks.at(gi);
                auto *splitBar = new QWidget(&window);
                DockSplitterEntry splitEntry;
                splitEntry.kind = QStringLiteral("split");
                splitEntry.area = areaKey;
                // 逻辑层的序号把全部关闭的组也算在内
                int realGroupIndex = gi;
                for (auto it = docks.cbegin(); it != docks.cend(); ++it) {
                    if (it->dock == cur)
                        realGroupIndex = it->groupOrder;
                }
                splitEntry.groupIndex = realGroupIndex;
                splitBar->setObjectName(QStringLiteral("vf_qt_splitter_split_%1_%2").arg(areaKey).arg(realGroupIndex));
                splitEntry.widget = splitBar;
                if (horiz) {
                    splitBar->setGeometry(cur->x() + cur->width() - 2, cur->y(), 4, cur->height());
                    splitBar->setCursor(Qt::SplitHCursor);
                    splitEntry.orientation = Qt::Horizontal;
                    splitEntry.initialSize = cur->width();
                } else {
                    splitBar->setGeometry(cur->x(), cur->y() + cur->height() - 2, cur->width(), 4);
                    splitBar->setCursor(Qt::SplitVCursor);
                    splitEntry.orientation = Qt::Vertical;
                    splitEntry.initialSize = cur->height();
                }
                splitBar->setVisible(true);
                splitBar->raise();
                splitBar->installEventFilter(q);
                dockSplitters.append(splitEntry);
            }
        }
    }
}

void Ui::Private::applyFloatBoxes(const QJSValue &views, const QJSValue *knownBoxes)
{
    if (floatBoxes.isEmpty())
        return;
    const QJSValue boxesObj = knownBoxes ? *knownBoxes : call("computeLayout", { window.width(), window.height() });
    for (FloatBoxEntry &fb : floatBoxes) {
        const QJSValue view = views.property(fb.id);
        const QJSValue boxVal = boxesObj.property(fb.id);
        const bool vis = boxVal.isObject()
            ? boxVal.property(QStringLiteral("visible")).toBool()
            : view.property(QStringLiteral("visible")).toBool();
        const QJSValue props = view.property(QStringLiteral("props"));
        const QString title = props.property(QStringLiteral("title")).toString();
        const bool wantFloat = props.property(QStringLiteral("floating")).toBool();
        fb.titleLabel->setText(title.isEmpty() ? fb.id : title);
        fb.toggleBtn->setText(wantFloat ? QStringLiteral("还原") : QStringLiteral("浮出"));

        if (wantFloat) {
            const int fx = boxVal.property(QStringLiteral("absX")).toInt();
            const int fy = boxVal.property(QStringLiteral("absY")).toInt();
            const int fw = qMax(80, boxVal.property(QStringLiteral("width")).toInt());
            const int fh = qMax(fb.headerHeight + 20, boxVal.property(QStringLiteral("height")).toInt());
            if (!fb.isFloating) {
                if (fb.origBoxLayout)
                    fb.origBoxLayout->removeWidget(fb.frame);
                else if (fb.origGridLayout)
                    fb.origGridLayout->removeWidget(fb.frame);
                else if (fb.origFormLayout)
                    fb.origFormLayout->takeRow(fb.frame);
                else if (fb.origStackedLayout)
                    fb.origStackedLayout->removeWidget(fb.frame);
                fb.frame->setParent(&window);
                fb.isFloating = true;
                if (fb.origParent && fb.origParent->layout())
                    fb.origParent->layout()->activate();
            }
            fb.frame->setMinimumSize(fw, fh);
            fb.frame->setMaximumSize(fw, fh);
            fb.frame->setGeometry(fx, fy, fw, fh);
            fb.frame->setVisible(vis);
            if (fb.frame->layout())
                fb.frame->layout()->activate();
            if (fb.body->layout())
                fb.body->layout()->activate();
            if (vis)
                fb.frame->raise();
        } else {
            if (fb.isFloating) {
                fb.frame->setParent(fb.origParent);
                fb.frame->setMinimumSize(fb.origMinSize);
                fb.frame->setMaximumSize(fb.origMaxSize);
                fb.frame->setSizePolicy(fb.origSizePolicy);
                if (fb.origBoxLayout) {
                    const int insIdx = qBound(0, fb.origIndex, fb.origBoxLayout->count());
                    fb.origBoxLayout->insertWidget(insIdx, fb.frame, fb.origStretch);
                    fb.origBoxLayout->activate();
                } else if (fb.origGridLayout) {
                    fb.origGridLayout->addWidget(fb.frame, fb.origGridRow, fb.origGridCol, fb.origGridRowSpan, fb.origGridColSpan);
                    fb.origGridLayout->activate();
                } else if (fb.origFormLayout) {
                    if (fb.origFormRow >= 0)
                        fb.origFormLayout->setWidget(fb.origFormRow, fb.origFormRole, fb.frame);
                    else
                        fb.origFormLayout->addRow(fb.frame);
                    fb.origFormLayout->activate();
                } else if (fb.origStackedLayout) {
                    const int insIdx = qBound(0, fb.origIndex, fb.origStackedLayout->count());
                    fb.origStackedLayout->insertWidget(insIdx, fb.frame);
                    fb.origStackedLayout->activate();
                } else {
                    fb.frame->setGeometry(fb.origGeometry);
                }
                fb.isFloating = false;
                fb.frame->setVisible(vis);
                if (fb.frame->layout())
                    fb.frame->layout()->activate();
                if (fb.body->layout())
                    fb.body->layout()->activate();
            }
        }
    }
    QApplication::sendPostedEvents(nullptr, QEvent::LayoutRequest);
}

void Ui::Private::addPopupMenu(QWidget *widget, QMenu *menu)
{
    popupMenus.insert(widget, menu);
}

void Ui::Private::rebuildDataForm(const QString &id, QFrame *frame, const QJSValue &props)
{
    if (!frame)
        return;
    auto *grid = qobject_cast<QGridLayout *>(frame->layout());
    if (!grid) {
        grid = new QGridLayout(frame);
        grid->setContentsMargins(2, 2, 2, 2);
        grid->setSizeConstraint(QLayout::SetNoConstraint);
    }
    while (QLayoutItem *item = grid->takeAt(0)) {
        if (QWidget *w = item->widget())
            w->deleteLater();
        delete item;
    }

    const QVariantMap schema = props.property(QStringLiteral("schema")).toVariant().toMap();
    const QVariantList ctrls = schema.value(QStringLiteral("controls")).toList();
    grid->setHorizontalSpacing(schema.value(QStringLiteral("column_spacing"), 6).toInt());
    grid->setVerticalSpacing(qMin(2, schema.value(QStringLiteral("row_spacing"), 2).toInt()));

    if (ctrls.isEmpty()) {
        const QString emptyText = props.property(QStringLiteral("emptyText")).toString();
        auto *lbl = new QLabel(emptyText.isEmpty() ? QStringLiteral("当前工具无可调节参数") : emptyText, frame);
        grid->addWidget(lbl, 0, 0);
        return;
    }

    int autoRow = 0;
    for (const QVariant &cv : ctrls) {
        const QVariantMap cm = cv.toMap();
        const QString name = cm.value(QStringLiteral("name")).toString();
        const QString type = cm.value(QStringLiteral("type"), QStringLiteral("slider")).toString();
        const QString title = cm.value(QStringLiteral("title"), name).toString();
        const QString hook = cm.value(QStringLiteral("hook")).toString();
        const int row = cm.contains(QStringLiteral("row")) ? cm.value(QStringLiteral("row")).toInt() : autoRow++;
        const int startCol = cm.value(QStringLiteral("start_column"), cm.value(QStringLiteral("column"), 0)).toInt();
        const int endCol = cm.value(QStringLiteral("end_column"), startCol).toInt();
        const int colSpan = qMax(1, endCol - startCol + 1);
        const QVariant defVal = cm.value(QStringLiteral("value"));

        auto *cell = new QWidget(frame);
        cell->setProperty("vfCtrlSpec", cm);
        cell->setProperty("vfFieldName", name);
        auto *cellLay = new QHBoxLayout(cell);
        cellLay->setContentsMargins(0, 0, 0, 0);
        cellLay->setSpacing(6);

        if (type == QLatin1String("slider")) {
            auto *lbl = new QLabel(title, cell);
            auto *slider = new QSlider(Qt::Horizontal, cell);
            slider->setProperty("vfInputRole", QStringLiteral("slider"));
            slider->setRange(cm.value(QStringLiteral("min"), 0).toInt(), cm.value(QStringLiteral("max"), 100).toInt());
            slider->setValue(defVal.toInt());
            auto *valLbl = new QLabel(QString::number(slider->value()), cell);
            valLbl->setProperty("vfInputRole", QStringLiteral("sliderVal"));
            valLbl->setStyleSheet(QStringLiteral("QLabel { color: #60a5fa; font-weight: 600; }"));
            cellLay->addWidget(lbl);
            cellLay->addWidget(slider, 1);
            cellLay->addWidget(valLbl);
            QObject::connect(slider, &QSlider::valueChanged, q, [this, id, name, hook, type, valLbl](int v) {
                valLbl->setText(QString::number(v));
                QJSValue payload = engine.newObject();
                payload.setProperty(QStringLiteral("name"), name);
                payload.setProperty(QStringLiteral("value"), v);
                payload.setProperty(QStringLiteral("hook"), hook);
                payload.setProperty(QStringLiteral("type"), type);
                dispatch(id, QStringLiteral("change"), payload);
            });
        } else if (type == QLatin1String("list") || type == QLatin1String("select")) {
            auto *lbl = new QLabel(title, cell);
            auto *combo = new QComboBox(cell);
            combo->setProperty("vfInputRole", QStringLiteral("combo"));
            const QVariant rawOpts = cm.value(QStringLiteral("options"));
            if (rawOpts.typeId() == QMetaType::QVariantList) {
                for (const QVariant &o : rawOpts.toList()) {
                    if (o.typeId() == QMetaType::QVariantMap) {
                        const QVariantMap om = o.toMap();
                        const QString optVal = om.value(QStringLiteral("value"),
                                                        om.value(QStringLiteral("title"), om.value(QStringLiteral("label")))).toString();
                        const QString optTitle = om.value(QStringLiteral("title"),
                                                          om.value(QStringLiteral("label"), optVal)).toString();
                        combo->addItem(optTitle, optVal);
                    } else {
                        combo->addItem(o.toString(), o.toString());
                    }
                }
            } else {
                for (const QString &part : rawOpts.toString().split(QLatin1Char(','), Qt::SkipEmptyParts)) {
                    const QString t = part.trimmed();
                    combo->addItem(t, t);
                }
            }
            cellLay->addWidget(lbl);
            cellLay->addWidget(combo, 1);
            QObject::connect(combo, &QComboBox::currentIndexChanged, q, [this, id, name, hook, type, combo](int idx) {
                if (idx < 0)
                    return;
                const QString v = combo->itemData(idx).isValid() ? combo->itemData(idx).toString() : combo->itemText(idx);
                QJSValue payload = engine.newObject();
                payload.setProperty(QStringLiteral("name"), name);
                payload.setProperty(QStringLiteral("value"), v);
                payload.setProperty(QStringLiteral("hook"), hook);
                payload.setProperty(QStringLiteral("type"), type);
                dispatch(id, QStringLiteral("change"), payload);
            });
        } else if (type == QLatin1String("check") || type == QLatin1String("checkbox")) {
            auto *cb = new QCheckBox(title, cell);
            cb->setProperty("vfInputRole", QStringLiteral("check"));
            const bool usesOnOff = (defVal.typeId() == QMetaType::QString &&
                                    (defVal.toString().compare(QLatin1String("on"), Qt::CaseInsensitive) == 0 ||
                                     defVal.toString().compare(QLatin1String("off"), Qt::CaseInsensitive) == 0));
            cb->setChecked(isCheckValueOn(defVal));
            cellLay->addWidget(cb);
            QObject::connect(cb, &QCheckBox::toggled, q, [this, id, name, hook, type, usesOnOff](bool v) {
                QJSValue payload = engine.newObject();
                payload.setProperty(QStringLiteral("name"), name);
                if (usesOnOff)
                    payload.setProperty(QStringLiteral("value"), v ? QStringLiteral("on") : QStringLiteral("off"));
                else
                    payload.setProperty(QStringLiteral("value"), v);
                payload.setProperty(QStringLiteral("hook"), hook);
                payload.setProperty(QStringLiteral("type"), type);
                dispatch(id, QStringLiteral("change"), payload);
            });
        } else if (type == QLatin1String("palette") || type == QLatin1String("color")) {
            auto *lbl = new QLabel(title, cell);
            cellLay->addWidget(lbl);
            QStringList swatches;
            if (cm.contains(QStringLiteral("swatches"))) {
                for (const QVariant &sv : cm.value(QStringLiteral("swatches")).toList())
                    swatches.append(sv.toString());
            }
            if (swatches.isEmpty())
                swatches << QStringLiteral("black") << QStringLiteral("blue") << QStringLiteral("green") << QStringLiteral("#dc2626");
            for (const QString &sc : swatches) {
                auto *swBtn = new QPushButton(cell);
                swBtn->setFixedSize(20, 20);
                swBtn->setProperty("vfInputRole", QStringLiteral("swatch"));
                swBtn->setProperty("vfSwatchColor", sc);
                swBtn->setToolTip(sc);
                cellLay->addWidget(swBtn);
                QObject::connect(swBtn, &QPushButton::clicked, q, [this, id, name, hook, type, sc] {
                    QJSValue payload = engine.newObject();
                    payload.setProperty(QStringLiteral("name"), name);
                    payload.setProperty(QStringLiteral("value"), sc);
                    payload.setProperty(QStringLiteral("hook"), hook);
                    payload.setProperty(QStringLiteral("type"), type);
                    dispatch(id, QStringLiteral("change"), payload);
                });
            }
            cellLay->addStretch(1);
        } else if (type == QLatin1String("subwindow")) {
            auto *btn = new QPushButton(title + QStringLiteral(" (SubControlFrame)"), cell);
            btn->setProperty("vfInputRole", QStringLiteral("subwindow"));
            btn->setStyleSheet(QStringLiteral(
                "QPushButton { background-color: #172554; color: #93c5fd; border: 1px dashed #3b82f6; border-radius: 4px; padding: 3px 6px; }"
            ));
            cellLay->addWidget(btn);
            const QString emitVal = (!defVal.isNull() && !defVal.toString().isEmpty()) ? defVal.toString() : QStringLiteral("embedded");
            QObject::connect(btn, &QPushButton::clicked, q, [this, id, name, hook, type, emitVal] {
                QJSValue payload = engine.newObject();
                payload.setProperty(QStringLiteral("name"), name);
                payload.setProperty(QStringLiteral("value"), emitVal);
                payload.setProperty(QStringLiteral("hook"), hook);
                payload.setProperty(QStringLiteral("type"), type);
                dispatch(id, QStringLiteral("change"), payload);
            });
        } else {
            auto *btn = new QPushButton(title, cell);
            btn->setProperty("vfInputRole", QStringLiteral("button"));
            const QString btnVal = (!defVal.isNull() && defVal.isValid()) ? defVal.toString() : QString();
            btn->setProperty("vfBtnValue", btnVal);
            if (cm.value(QStringLiteral("state")).typeId() == QMetaType::QVariantMap) {
                const QString cName = cm.value(QStringLiteral("state")).toMap().value(QStringLiteral("color")).toString();
                if (!cName.isEmpty())
                    btn->setProperty("vfStateColor", cName);
            }
            cellLay->addWidget(btn);
            QObject::connect(btn, &QPushButton::clicked, q, [this, id, name, hook, type, btnVal] {
                QJSValue payload = engine.newObject();
                payload.setProperty(QStringLiteral("name"), name);
                if (!btnVal.isEmpty())
                    payload.setProperty(QStringLiteral("value"), btnVal);
                else
                    payload.setProperty(QStringLiteral("value"), true);
                payload.setProperty(QStringLiteral("hook"), hook);
                payload.setProperty(QStringLiteral("type"), type);
                dispatch(id, QStringLiteral("change"), payload);
            });
        }
        grid->addWidget(cell, row, startCol, 1, colSpan);
        autoRow = qMax(autoRow, row + 1);
    }
    grid->setRowStretch(autoRow + 4, 1);
    syncDataFormValues(frame, props);
}

void Ui::Private::syncDataFormValues(QFrame *frame, const QJSValue &props)
{
    if (!frame)
        return;
    const QVariantMap schema = props.property(QStringLiteral("schema")).toVariant().toMap();
    const QVariantMap extValues = props.property(QStringLiteral("values")).toVariant().toMap();
    const QVariantList ctrls = schema.value(QStringLiteral("controls")).toList();
    QVariantMap valMap;
    for (const QVariant &cv : ctrls) {
        const QVariantMap cm = cv.toMap();
        const QString name = cm.value(QStringLiteral("name")).toString();
        if (name.isEmpty())
            continue;
        if (extValues.contains(name))
            valMap.insert(name, extValues.value(name));
        else if (!valMap.contains(name))
            valMap.insert(name, cm.value(QStringLiteral("value")));
    }
    for (auto it = extValues.begin(); it != extValues.end(); ++it) {
        if (!valMap.contains(it.key()))
            valMap.insert(it.key(), it.value());
    }

    const QList<QWidget *> cells = frame->findChildren<QWidget *>(QString(), Qt::FindDirectChildrenOnly);
    for (QWidget *cell : cells) {
        const QVariant specVar = cell->property("vfCtrlSpec");
        if (!specVar.isValid() || specVar.typeId() != QMetaType::QVariantMap)
            continue;
        const QVariantMap cm = specVar.toMap();
        const QString name = cm.value(QStringLiteral("name")).toString();
        const QVariant stateVar = cm.value(QStringLiteral("state"));
        const QString stateStr = (stateVar.typeId() == QMetaType::QString) ? stateVar.toString() : QStringLiteral("normal");
        const bool visible = (stateStr != QLatin1String("hidden")) &&
                             evalVisibleWhenVariant(cm.value(QStringLiteral("visible_when")), valMap);
        cell->setVisible(visible);
        cell->setEnabled(stateStr != QLatin1String("disabled"));
        const QVariant curVal = valMap.value(name, cm.value(QStringLiteral("value")));

        const QList<QWidget *> inner = cell->findChildren<QWidget *>(QString(), Qt::FindDirectChildrenOnly);
        for (QWidget *w : inner) {
            const QString role = w->property("vfInputRole").toString();
            if (role == QLatin1String("slider")) {
                if (auto *slider = qobject_cast<QSlider *>(w)) {
                    const int v = curVal.toInt();
                    if (!slider->isSliderDown() && slider->value() != v) {
                        const QSignalBlocker b(slider);
                        slider->setValue(v);
                    }
                }
            } else if (role == QLatin1String("sliderVal")) {
                if (auto *lbl = qobject_cast<QLabel *>(w))
                    lbl->setText(QString::number(curVal.toInt()));
            } else if (role == QLatin1String("combo")) {
                if (auto *combo = qobject_cast<QComboBox *>(w)) {
                    const QString target = curVal.toString();
                    int idx = combo->findData(target);
                    if (idx < 0)
                        idx = combo->findText(target);
                    if (idx >= 0 && combo->currentIndex() != idx) {
                        const QSignalBlocker b(combo);
                        combo->setCurrentIndex(idx);
                    }
                }
            } else if (role == QLatin1String("check")) {
                if (auto *cb = qobject_cast<QCheckBox *>(w)) {
                    const bool checked = isCheckValueOn(curVal);
                    if (cb->isChecked() != checked) {
                        const QSignalBlocker b(cb);
                        cb->setChecked(checked);
                    }
                }
            } else if (role == QLatin1String("swatch")) {
                if (auto *swBtn = qobject_cast<QPushButton *>(w)) {
                    const QString sc = swBtn->property("vfSwatchColor").toString();
                    const QString hex = resolveColorHex(sc);
                    const bool active = (curVal.toString() == sc);
                    swBtn->setStyleSheet(QStringLiteral(
                        "QPushButton { background-color: %1; border: %2px solid %3; border-radius: 3px; }"
                    ).arg(hex, active ? QStringLiteral("2") : QStringLiteral("1"),
                          active ? QStringLiteral("#60a5fa") : QStringLiteral("#475569")));
                }
            } else if (role == QLatin1String("button")) {
                if (auto *btn = qobject_cast<QPushButton *>(w)) {
                    const QString btnVal = btn->property("vfBtnValue").toString();
                    const QString stateColor = btn->property("vfStateColor").toString();
                    const bool active = !btnVal.isEmpty() && curVal.toString() == btnVal;
                    const QString border = active
                        ? QStringLiteral("#60a5fa")
                        : (!stateColor.isEmpty() ? resolveColorHex(stateColor) : QStringLiteral("#3b4963"));
                    const QString bg = active ? QStringLiteral("#1d4ed8") : QStringLiteral("#263042");
                    btn->setStyleSheet(QStringLiteral(
                        "QPushButton { background-color: %1; color: #f8fafc; border: %2px solid %3; border-radius: 4px; padding: 2px 6px; }"
                    ).arg(bg, active ? QStringLiteral("2") : QStringLiteral("1"), border));
                }
            }
        }
    }
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
    for (auto it = docks.begin(); it != docks.end(); ++it) {
        QDockWidget *dw = it->dock;
        if (!dw || !dw->isFloating() || dw->isHidden())
            continue;
        const QPoint local = dw->mapFromGlobal(globalPos);
        if (!dw->rect().contains(local))
            continue;
        QWidget *widget = widgetAtWithHitTest(dw, local);
        if (!widget)
            widget = dw;
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

void Ui::Private::syncFlowDocks()
{
    if (!docks.isEmpty())
        return;
    const int winW = window.width();
    if (winW <= 0)
        return;
    for (int index = 1; index < controls.size(); ++index) {
        auto *dock = qobject_cast<QDockWidget *>(controls.at(index).widget);
        if (!dock || dock->isHidden())
            continue;
        QWidget *body = dock->widget();
        if (!body)
            continue;
        auto *flow = dynamic_cast<VfFlowLayout *>(body->layout());
        if (!flow || !flow->autoHeight())
            continue;
        const int hdrH = dock->titleBarWidget() ? dock->titleBarWidget()->height() : 0;
        const int rawH = flow->rawHeightForWidth(winW);
        const int dockTargetH = qBound(flow->minContainerH(), hdrH + rawH, flow->maxContainerH());
        const int bodyTargetH = qMax(0, dockTargetH - hdrH);
        if (body->minimumHeight() != bodyTargetH || body->maximumHeight() != bodyTargetH)
            body->setFixedHeight(bodyTargetH);
        if (dock->minimumHeight() != dockTargetH || dock->maximumHeight() != dockTargetH)
            dock->setFixedHeight(dockTargetH);
    }
}

void Ui::Private::syncWindowLayout(bool relayoutDocks)
{
    if (syncingLayout)
        return;
    syncingLayout = true;
    syncFlowDocks();
    if (relayoutDocks && !applyingLayout && (!docks.isEmpty() || !floatBoxes.isEmpty())) {
        const QJSValue views = call("views");
        if (views.isObject()) {
            applyDockLayout(views);
            applyFloatBoxes(views);
        }
    }
    if (window.layout())
        window.layout()->activate();
    syncStatusBar();
    syncGraphics();
    syncingLayout = false;
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
                } else if (link.second == "vfIcon") {
                    if (auto *btn = qobject_cast<QPushButton *>(control.widget)) {
                        if (btn->property("vfIcon") != wanted) {
                            btn->setIcon(makeVectorIcon(wanted.toString()));
                            btn->setIconSize(QSize(14, 14));
                        }
                    }
                } else if (link.second == "checked") {
                    if (auto *btn = qobject_cast<QPushButton *>(control.widget)) {
                        if (props.property(QStringLiteral("checkable")).toBool())
                            btn->setCheckable(true);
                    }
                } else if (link.second == "vfItems" || link.second == "vfMutedFrom" || link.second == "vfDraggable") {
                    if (auto *list = qobject_cast<QListWidget *>(control.widget)) {
                        if (list->property(link.second.constData()) != wanted) {
                            const bool checkable = props.property(QStringLiteral("checkable")).toBool();
                            const bool draggable = props.property(QStringLiteral("draggable")).toBool();
                            const QJSValue mfVal = props.property(QStringLiteral("mutedFrom"));
                            const int mutedFrom = mfVal.isNumber() ? mfVal.toInt() : -1;
                            list->setDragEnabled(draggable);
                            list->setAcceptDrops(draggable);
                            if (list->viewport())
                                list->viewport()->setAcceptDrops(draggable);
                            list->setDropIndicatorShown(draggable);
                            list->setDragDropMode(draggable ? QAbstractItemView::InternalMove : QAbstractItemView::NoDragDrop);
                            list->setDefaultDropAction(Qt::MoveAction);
                            const QVariantList items = props.property(QStringLiteral("items")).toVariant().toList();
                            while (list->count() < items.size())
                                list->addItem(new QListWidgetItem());
                            while (list->count() > items.size())
                                delete list->takeItem(list->count() - 1);
                            for (int i = 0; i < items.size(); ++i) {
                                const QVariant &it = items.at(i);
                                QString text;
                                if (it.typeId() == QMetaType::QVariantMap) {
                                    const QVariantMap map = it.toMap();
                                    QString name = map.value(QStringLiteral("name")).toString();
                                    if (name.isEmpty()) name = map.value(QStringLiteral("label")).toString();
                                    if (name.isEmpty()) name = map.value(QStringLiteral("title")).toString();
                                    if (name.isEmpty()) name = map.value(QStringLiteral("text")).toString();
                                    if (name.isEmpty()) name = map.value(QStringLiteral("id")).toString();
                                    const QString badge = map.value(QStringLiteral("badge"),
                                                                    map.value(QStringLiteral("time"),
                                                                              map.value(QStringLiteral("meta")))).toString();
                                    if (checkable) {
                                        const bool vis = map.value(QStringLiteral("visible"), true).toBool();
                                        text = (vis ? QStringLiteral("● ") : QStringLiteral("○ ")) + name;
                                    } else {
                                        text = name;
                                    }
                                    if (!badge.isEmpty())
                                        text += QStringLiteral("  [") + badge + QStringLiteral("]");
                                } else {
                                    text = it.toString();
                                }
                                QListWidgetItem *lwItem = list->item(i);
                                lwItem->setText(text);
                                if (mutedFrom >= 0 && i >= mutedFrom)
                                    lwItem->setForeground(QColor(100, 116, 139));
                                else
                                    lwItem->setData(Qt::ForegroundRole, QVariant());
                            }
                            const int curRow = props.property(QStringLiteral("value")).toInt();
                            if (curRow >= 0 && curRow < list->count() && list->currentRow() != curRow)
                                list->setCurrentRow(curRow);
                        }
                    } else if (auto *tree = qobject_cast<QTreeWidget *>(control.widget)) {
                        if (tree->property(link.second.constData()) != wanted) {
                            const bool checkable = props.property(QStringLiteral("checkable")).toBool();
                            const bool draggable = props.property(QStringLiteral("draggable")).toBool();
                            tree->setDragEnabled(draggable);
                            tree->setAcceptDrops(draggable);
                            if (tree->viewport())
                                tree->viewport()->setAcceptDrops(draggable);
                            tree->setDropIndicatorShown(draggable);
                            tree->setDragDropMode(draggable ? QAbstractItemView::InternalMove : QAbstractItemView::NoDragDrop);
                            tree->setDefaultDropAction(Qt::MoveAction);
                            const QList<FlatTreeRow> rows = buildFlatTreeRows(props.property(QStringLiteral("items")).toVariant().toList());
                            const int curRow = props.property(QStringLiteral("value")).toInt();
                            while (tree->topLevelItemCount() < rows.size())
                                new QTreeWidgetItem(tree);
                            while (tree->topLevelItemCount() > rows.size())
                                delete tree->takeTopLevelItem(tree->topLevelItemCount() - 1);
                            for (int i = 0; i < rows.size(); ++i) {
                                const FlatTreeRow &r = rows.at(i);
                                QString prefix = QString(r.depth * 2, QLatin1Char(' '));
                                if (r.isGroup)
                                    prefix += r.collapsed ? QStringLiteral("▸ 📁 ") : QStringLiteral("▾ 📂 ");
                                QString label = prefix + r.name;
                                if (r.locked)
                                    label += QStringLiteral(" 🔒");
                                if (!r.kind.isEmpty() && !r.isGroup)
                                    label += QStringLiteral("  [") + r.kind + QStringLiteral("]");
                                QTreeWidgetItem *twItem = tree->topLevelItem(i);
                                twItem->setText(0, label);
                                twItem->setData(0, Qt::UserRole, r.index);
                                twItem->setData(0, Qt::UserRole + 1, r.id);
                                twItem->setData(0, Qt::UserRole + 2, r.checked);
                                twItem->setData(0, Qt::UserRole + 3, r.isGroup);
                                twItem->setData(0, Qt::UserRole + 4, r.collapsed);
                                twItem->setData(0, Qt::UserRole + 5, r.depth);
                                if (checkable) {
                                    twItem->setFlags(twItem->flags() | Qt::ItemIsUserCheckable);
                                    const Qt::CheckState targetState = r.checked ? Qt::Checked : Qt::Unchecked;
                                    if (twItem->checkState(0) != targetState)
                                        twItem->setCheckState(0, targetState);
                                } else {
                                    twItem->setFlags(twItem->flags() & ~Qt::ItemIsUserCheckable);
                                }
                                twItem->setHidden(r.hiddenByAncestor);
                                if (r.index == curRow && !r.hiddenByAncestor && tree->currentItem() != twItem)
                                    tree->setCurrentItem(twItem);
                            }
                        }
                    }
                } else if (link.second == "currentRow") {
                    if (auto *list = qobject_cast<QListWidget *>(control.widget)) {
                        const int row = wanted.toInt();
                        if (row >= -1 && row < list->count() && list->currentRow() != row)
                            list->setCurrentRow(row);
                    } else if (auto *tree = qobject_cast<QTreeWidget *>(control.widget)) {
                        const int row = wanted.toInt();
                        if (row < 0) {
                            if (tree->currentItem() != nullptr)
                                tree->setCurrentItem(nullptr);
                        } else {
                            for (int i = 0; i < tree->topLevelItemCount(); ++i) {
                                QTreeWidgetItem *it = tree->topLevelItem(i);
                                if (it->data(0, Qt::UserRole).toInt() == row) {
                                    if (tree->currentItem() != it)
                                        tree->setCurrentItem(it);
                                    break;
                                }
                            }
                        }
                    }
                } else if (link.second == "vfTabs") {
                    if (auto *tabBar = qobject_cast<QTabBar *>(control.widget)) {
                        if (tabBar->property("vfTabs") != wanted) {
                            while (tabBar->count() > 0)
                                tabBar->removeTab(0);
                            if (wanted.typeId() == QMetaType::QVariantList) {
                                for (const QVariant &it : wanted.toList())
                                    tabBar->addTab(it.toString());
                            } else {
                                for (const QString &part : wanted.toString().split(QLatin1Char(','), Qt::SkipEmptyParts))
                                    tabBar->addTab(part.trimmed());
                            }
                            const int curIdx = props.property(QStringLiteral("value")).toInt();
                            if (curIdx >= 0 && curIdx < tabBar->count())
                                tabBar->setCurrentIndex(curIdx);
                        }
                    }
                } else if (link.second == "currentIndex") {
                    if (auto *tabBar = qobject_cast<QTabBar *>(control.widget)) {
                        const int idx = wanted.toInt();
                        if (idx >= 0 && idx < tabBar->count() && tabBar->currentIndex() != idx)
                            tabBar->setCurrentIndex(idx);
                    }
                } else if (link.second == "vfOrientation") {
                    if (auto *slider = qobject_cast<QAbstractSlider *>(control.widget)) {
                        slider->setOrientation(wanted.toString() == QLatin1String("vertical") ? Qt::Vertical : Qt::Horizontal);
                    } else if (auto *frame = qobject_cast<QFrame *>(control.widget)) {
                        frame->setFrameShape(wanted.toString() == QLatin1String("vertical") ? QFrame::VLine : QFrame::HLine);
                    }
                } else if (link.second == "vfButtons" || link.second == "vfOkText" || link.second == "vfCancelText") {
                    if (auto *bb = qobject_cast<QDialogButtonBox *>(control.widget)) {
                        if (bb->property(link.second.constData()) != wanted) {
                            const QString rawBtns = props.property(QStringLiteral("buttons")).toString();
                            const QStringList parts = (rawBtns.isEmpty() ? QStringLiteral("ok,cancel") : rawBtns)
                                                          .split(QLatin1Char(','), Qt::SkipEmptyParts);
                            QDialogButtonBox::StandardButtons flags = QDialogButtonBox::NoButton;
                            for (const QString &p : parts) {
                                const QString k = p.trimmed().toLower();
                                if (k == QLatin1String("ok")) flags |= QDialogButtonBox::Ok;
                                else if (k == QLatin1String("cancel")) flags |= QDialogButtonBox::Cancel;
                                else if (k == QLatin1String("apply")) flags |= QDialogButtonBox::Apply;
                                else if (k == QLatin1String("close")) flags |= QDialogButtonBox::Close;
                            }
                            bb->setStandardButtons(flags);
                            if (QPushButton *okBtn = bb->button(QDialogButtonBox::Ok)) {
                                const QString okT = props.property(QStringLiteral("okText")).toString();
                                okBtn->setText(okT.isEmpty() ? QStringLiteral("确定") : okT);
                                okBtn->setProperty("vfVariant", QStringLiteral("primary"));
                                applyButtonVisualStyle(okBtn);
                            }
                            if (QPushButton *cancelBtn = bb->button(QDialogButtonBox::Cancel)) {
                                const QString cancelT = props.property(QStringLiteral("cancelText")).toString();
                                cancelBtn->setText(cancelT.isEmpty() ? QStringLiteral("取消") : cancelT);
                                applyButtonVisualStyle(cancelBtn);
                            }
                        }
                    }
                } else if (link.second == "vfSchema" || link.second == "vfEmptyText") {
                    if (auto *frame = qobject_cast<QFrame *>(control.widget);
                        frame && !qobject_cast<QAbstractScrollArea *>(control.widget)) {
                        if (frame->property(link.second.constData()) != wanted)
                            rebuildDataForm(control.id, frame, props);
                    }
                } else if (link.second == "vfValues") {
                    if (auto *frame = qobject_cast<QFrame *>(control.widget);
                        frame && !qobject_cast<QAbstractScrollArea *>(control.widget)) {
                        if (frame->property("vfValues") != wanted)
                            syncDataFormValues(frame, props);
                    }
                } else if (link.second == "plainText") {
                    if (auto *edit = qobject_cast<QPlainTextEdit *>(control.widget)) {
                        if (edit->toPlainText() != wanted.toString())
                            edit->setPlainText(wanted.toString());
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
            if (auto *btn = qobject_cast<QPushButton *>(control.widget)) {
                applyButtonVisualStyle(btn);
            } else if (auto *lbl = qobject_cast<QLabel *>(control.widget)) {
                applyLabelVisualStyle(lbl);
            }
            if (control.stateImageWidget) {
                const QVariantMap propsMap = props.toVariant().toMap();
                const QString visualState = view.property(QStringLiteral("visualState")).toString();
                const QString stateImage = view.property(QStringLiteral("stateImage")).toString();
                control.stateImageWidget->applyViewState(propsMap, visualState, stateImage, started);
            }
            if (control.paintEffectWidget) {
                control.paintEffectWidget->applyProps(props.toVariant().toMap());
            }
        }
        setShown(index, view.property(QStringLiteral("visible")).toBool());
        if (control.widget->layout()) {
            control.widget->layout()->invalidate();
            control.widget->layout()->activate();
        }
    }
    // 窗口尺寸变化由 Resize 事件走完整流程；这里状态变了但窗口没变，刚算过一遍，后面不用再算
    applyDockLayout(views);
    applyFloatBoxes(views, (!docks.isEmpty() && !dockPassRunning) ? &dockPassBoxes : nullptr);
    const bool playing = call("getState", { QStringLiteral("timeline.playing") }).toBool() ||
                         call("getState", { QStringLiteral("project.playing") }).toBool();
    if (playing && !manualClock && !clockTimer.isActive())
        clockTimer.start(100);
    else if ((!playing || manualClock) && clockTimer.isActive())
        clockTimer.stop();
    QApplication::sendPostedEvents(nullptr, QEvent::LayoutRequest);
    syncWindowLayout(false);
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
    if (widget->parentWidget() && widget->parentWidget()->layout())
        widget->parentWidget()->layout()->activate();
    control.designRect = widget->geometry();
    control.designMinSize = widget->minimumSize();
    control.designMaxSize = widget->maximumSize();
    widget->setMinimumHeight(0);
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
    control.widget->setMinimumSize(control.designMinSize);
    control.widget->setMaximumSize(control.designMaxSize);
    control.widget->setGeometry(control.designRect);
    control.widget->setGraphicsEffect(nullptr);
    if (control.widget->parentWidget() && control.widget->parentWidget()->layout())
        control.widget->parentWidget()->layout()->activate();
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

// 控件自绘效果：有人提供了实现，就调用它的 paint 并返回 true；没有就返回 false，由调用方显示占位框。
bool Ui::Private::paintCustomEffect(int effect, QPainter *painter, const QRect &rect, const QVariantMap &props)
{
    Q_UNUSED(effect);
    Q_UNUSED(painter);
    Q_UNUSED(rect);
    Q_UNUSED(props);
    return false;
}

// 业务接口的实现
// （这个设计项目没有业务管的状态，也没有外部容器）

} // namespace vf
