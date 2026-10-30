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
#include <QCheckBox>
#include <QComboBox>
#include <QCursor>
#include <QDialog>
#include <QDialogButtonBox>
#include <QDockWidget>
#include <QDropEvent>
#include <QEvent>
#include <QFile>
#include <QFrame>
#include <QGridLayout>
#include <QHBoxLayout>
#include <QHash>
#include <QHeaderView>
#include <QIcon>
#include <QJSEngine>
#include <QJSValue>
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
#include <QSignalBlocker>
#include <QSizePolicy>
#include <QSlider>
#include <QSpinBox>
#include <QStatusBar>
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

    QSize sizeHint() const override { return minimumSize(); }
    QSize minimumSize() const override
    {
        const int w = parentWidget() && parentWidget()->width() > 0 ? parentWidget()->width() : 400;
        return QSize(m_padLeft + m_padRight, heightForWidth(w));
    }

    void setGeometry(const QRect &rect) override
    {
        QLayout::setGeometry(rect);
        const int rawH = doLayout(rect, true);
        if (m_autoHeight) {
            if (QWidget *pw = parentWidget()) {
                if (auto *dock = qobject_cast<QDockWidget *>(pw->parentWidget())) {
                    const int hdrH = dock->titleBarWidget() ? dock->titleBarWidget()->height() : 0;
                    const int dockTargetH = qBound(m_minContainerH, hdrH + rawH, m_maxContainerH);
                    const int bodyTargetH = qMax(0, dockTargetH - hdrH);
                    if (pw->height() != bodyTargetH)
                        pw->setFixedHeight(bodyTargetH);
                    if (dock->height() != dockTargetH) {
                        dock->setFixedHeight(dockTargetH);
                        if (dock->parentWidget() && dock->parentWidget()->layout())
                            dock->parentWidget()->layout()->activate();
                    }
                } else {
                    const int targetH = qBound(m_minContainerH, rawH, m_maxContainerH);
                    if (pw->height() != targetH) {
                        pw->setFixedHeight(targetH);
                        if (pw->parentWidget() && pw->parentWidget()->layout())
                            pw->parentWidget()->layout()->activate();
                    }
                }
            }
        }
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
    QHash<QWidget *, QMenu *> popupMenus;
    QStatusBar *statusBar = nullptr;
    QWidget *statusBarControl = nullptr;
    QHash<QObject *, int> byWidget;
    int pressed = -1;                 // 鼠标左键是在哪个控件上按下的
    bool doubleClick = false;
    bool started = false;             // app.start 触发之前，显示和隐藏不播放效果
    bool manualClock = false;         // 显式调用 setClock 时停止自动定时器避免竞态
    // 界面销毁后，还没放完的效果再回调时靠它知道不能再碰界面
    std::shared_ptr<bool> alive = std::make_shared<bool>(true);

    QJSValue call(const char *function, const QJSValueList &args = {});
    int add(const QString &id, QWidget *widget, QList<QPair<QString, QByteArray>> props = {}, int effect = -1);
    int addExternal(const QString &id, QFrame *frame, const QString &text);
    void addMenuAction(const QString &id, QAction *action);
    void addPopupMenu(QWidget *widget, QMenu *menu);
    void rebuildDataForm(const QString &id, QFrame *frame, const QJSValue &props);
    void syncDataFormValues(QFrame *frame, const QJSValue &props);
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
    d->applyView();
}

Ui::~Ui()
{
    *d->alive = false;
    d->clockTimer.stop();
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
    if (watched == d->statusBar) {
        if (event->type() == QEvent::Resize || event->type() == QEvent::Show || event->type() == QEvent::LayoutRequest)
            d->syncStatusBar();
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
    const bool playing = call("getState", { QStringLiteral("timeline.playing") }).toBool() ||
                         call("getState", { QStringLiteral("project.playing") }).toBool();
    if (playing && !manualClock && !clockTimer.isActive())
        clockTimer.start(100);
    else if ((!playing || manualClock) && clockTimer.isActive())
        clockTimer.stop();
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

// 控件树、分区、停靠面板和排版。每个控件的对象名就是它在设计项目里的 ID。
void Ui::Private::build()
{
    QApplication::setStyle(QStringLiteral("Fusion"));
    window.setWindowTitle(QStringLiteral("AnimeAn 动画工作台"));
    window.resize(1280, 800);
    window.setAnimated(false);
    window.setStyleSheet(QStringLiteral("QMainWindow::separator { width: 0px; height: 0px; border: none; }"));
    window.setCorner(Qt::TopLeftCorner, Qt::TopDockWidgetArea);
    window.setCorner(Qt::TopRightCorner, Qt::TopDockWidgetArea);
    window.setCorner(Qt::BottomLeftCorner, Qt::BottomDockWidgetArea);
    window.setCorner(Qt::BottomRightCorner, Qt::BottomDockWidgetArea);
    add(QStringLiteral("window"), &window);

    // 菜单栏
    auto *menuBar = window.menuBar();
    menuBar->setNativeMenuBar(false);
    menuBar->setFixedHeight(28);
    auto *menu_fileMenu = menuBar->addMenu(QStringLiteral("文件"));
    auto *act_menuNewProject = menu_fileMenu->addAction(QStringLiteral("新建项目..."));
    act_menuNewProject->setShortcut(QKeySequence(QStringLiteral("Ctrl+N")));
    addMenuAction(QStringLiteral("menuNewProject"), act_menuNewProject);
    auto *act_menuOpenProject = menu_fileMenu->addAction(QStringLiteral("打开项目..."));
    act_menuOpenProject->setShortcut(QKeySequence(QStringLiteral("Ctrl+O")));
    addMenuAction(QStringLiteral("menuOpenProject"), act_menuOpenProject);
    auto *act_menuSaveProject = menu_fileMenu->addAction(QStringLiteral("保存项目"));
    act_menuSaveProject->setShortcut(QKeySequence(QStringLiteral("Ctrl+S")));
    addMenuAction(QStringLiteral("menuSaveProject"), act_menuSaveProject);
    auto *act_menuSaveAsProject = menu_fileMenu->addAction(QStringLiteral("另存为..."));
    act_menuSaveAsProject->setShortcut(QKeySequence(QStringLiteral("Ctrl+Shift+S")));
    addMenuAction(QStringLiteral("menuSaveAsProject"), act_menuSaveAsProject);
    auto *sub_menuTextureSub = menu_fileMenu->addMenu(QStringLiteral("纹理文件 (Texture)"));
    addMenuAction(QStringLiteral("menuTextureSub"), sub_menuTextureSub->menuAction());
    auto *act_menuOpenTexture = sub_menuTextureSub->addAction(QStringLiteral("打开纹理视图 (.textureview)..."));
    addMenuAction(QStringLiteral("menuOpenTexture"), act_menuOpenTexture);
    auto *act_menuSaveTexture = sub_menuTextureSub->addAction(QStringLiteral("保存纹理视图 (.textureview)"));
    addMenuAction(QStringLiteral("menuSaveTexture"), act_menuSaveTexture);
    auto *sub_menuExportSub = menu_fileMenu->addMenu(QStringLiteral("导入与导出"));
    addMenuAction(QStringLiteral("menuExportSub"), sub_menuExportSub->menuAction());
    auto *act_menuImportImage = sub_menuExportSub->addAction(QStringLiteral("导入图像素材..."));
    act_menuImportImage->setShortcut(QKeySequence(QStringLiteral("Ctrl+I")));
    addMenuAction(QStringLiteral("menuImportImage"), act_menuImportImage);
    auto *act_menuExportClip = sub_menuExportSub->addAction(QStringLiteral("导出视频片段..."));
    act_menuExportClip->setShortcut(QKeySequence(QStringLiteral("Ctrl+E")));
    addMenuAction(QStringLiteral("menuExportClip"), act_menuExportClip);
    auto *menu_viewMenu = menuBar->addMenu(QStringLiteral("视图"));
    auto *act_menuToggleTools = menu_viewMenu->addAction(QStringLiteral("工具栏"));
    act_menuToggleTools->setCheckable(true);
    act_menuToggleTools->setChecked(true);
    addMenuAction(QStringLiteral("menuToggleTools"), act_menuToggleTools);
    auto *act_menuToggleLayers = menu_viewMenu->addAction(QStringLiteral("图层与素材面板"));
    act_menuToggleLayers->setCheckable(true);
    act_menuToggleLayers->setChecked(true);
    addMenuAction(QStringLiteral("menuToggleLayers"), act_menuToggleLayers);
    auto *act_menuToggleInspector = menu_viewMenu->addAction(QStringLiteral("选项与检查器面板"));
    act_menuToggleInspector->setCheckable(true);
    act_menuToggleInspector->setChecked(true);
    addMenuAction(QStringLiteral("menuToggleInspector"), act_menuToggleInspector);
    auto *act_menuToggleTimeline = menu_viewMenu->addAction(QStringLiteral("时间轴面板"));
    act_menuToggleTimeline->setCheckable(true);
    act_menuToggleTimeline->setChecked(true);
    addMenuAction(QStringLiteral("menuToggleTimeline"), act_menuToggleTimeline);
    auto *act_menuOnionSkinToggle = menu_viewMenu->addAction(QStringLiteral("洋葱皮透视"));
    act_menuOnionSkinToggle->setCheckable(true);
    act_menuOnionSkinToggle->setChecked(false);
    act_menuOnionSkinToggle->setShortcut(QKeySequence(QStringLiteral("O")));
    addMenuAction(QStringLiteral("menuOnionSkinToggle"), act_menuOnionSkinToggle);
    auto *act_menuToggleTextureFloat = menu_viewMenu->addAction(QStringLiteral("浮动纹理子视图 (FloatBox)"));
    act_menuToggleTextureFloat->setShortcut(QKeySequence(QStringLiteral("Ctrl+T")));
    addMenuAction(QStringLiteral("menuToggleTextureFloat"), act_menuToggleTextureFloat);
    auto *act_menuEmbedTexture = menu_viewMenu->addAction(QStringLiteral("嵌入纹理至工具面板"));
    addMenuAction(QStringLiteral("menuEmbedTexture"), act_menuEmbedTexture);
    auto *act_menuResetLayout = menu_viewMenu->addAction(QStringLiteral("重置工作区布局"));
    addMenuAction(QStringLiteral("menuResetLayout"), act_menuResetLayout);
    auto *menu_editMenu = menuBar->addMenu(QStringLiteral("编辑"));
    auto *act_menuUndo = menu_editMenu->addAction(QStringLiteral("撤销"));
    act_menuUndo->setShortcut(QKeySequence(QStringLiteral("Ctrl+Z")));
    addMenuAction(QStringLiteral("menuUndo"), act_menuUndo);
    auto *act_menuRedo = menu_editMenu->addAction(QStringLiteral("重做"));
    act_menuRedo->setShortcut(QKeySequence(QStringLiteral("Ctrl+Y")));
    addMenuAction(QStringLiteral("menuRedo"), act_menuRedo);
    auto *act_menuClearFrame = menu_editMenu->addAction(QStringLiteral("清空当前帧"));
    act_menuClearFrame->setShortcut(QKeySequence(QStringLiteral("Del")));
    addMenuAction(QStringLiteral("menuClearFrame"), act_menuClearFrame);
    auto *menu_autoMappingMenu = menuBar->addMenu(QStringLiteral("自动映射"));
    auto *act_menuAutoColorize = menu_autoMappingMenu->addAction(QStringLiteral("一键自动上色"));
    act_menuAutoColorize->setShortcut(QKeySequence(QStringLiteral("Alt+C")));
    addMenuAction(QStringLiteral("menuAutoColorize"), act_menuAutoColorize);
    auto *act_menuAutoInbetween = menu_autoMappingMenu->addAction(QStringLiteral("生成中间帧补间"));
    act_menuAutoInbetween->setShortcut(QKeySequence(QStringLiteral("Alt+I")));
    addMenuAction(QStringLiteral("menuAutoInbetween"), act_menuAutoInbetween);
    auto *act_menuTextureSync = menu_autoMappingMenu->addAction(QStringLiteral("同步纹理映射"));
    addMenuAction(QStringLiteral("menuTextureSync"), act_menuTextureSync);
    auto *menu_drawMenu = menuBar->addMenu(QStringLiteral("绘图设置"));
    auto *act_menuDrawSettings = menu_drawMenu->addAction(QStringLiteral("画笔与压感设置..."));
    act_menuDrawSettings->setShortcut(QKeySequence(QStringLiteral("F5")));
    addMenuAction(QStringLiteral("menuDrawSettings"), act_menuDrawSettings);
    auto *sub_menuStabilizerSub = menu_drawMenu->addMenu(QStringLiteral("抖动修正等级"));
    addMenuAction(QStringLiteral("menuStabilizerSub"), sub_menuStabilizerSub->menuAction());
    auto *act_menuStabOff = sub_menuStabilizerSub->addAction(QStringLiteral("关闭修正 (S0)"));
    act_menuStabOff->setCheckable(true);
    act_menuStabOff->setChecked(false);
    auto *grp_stabilizerGroup = new QActionGroup(&window);
    grp_stabilizerGroup->setExclusive(true);
    grp_stabilizerGroup->addAction(act_menuStabOff);
    addMenuAction(QStringLiteral("menuStabOff"), act_menuStabOff);
    auto *act_menuStabMed = sub_menuStabilizerSub->addAction(QStringLiteral("标准修正 (S5)"));
    act_menuStabMed->setCheckable(true);
    act_menuStabMed->setChecked(true);
    grp_stabilizerGroup->addAction(act_menuStabMed);
    addMenuAction(QStringLiteral("menuStabMed"), act_menuStabMed);
    auto *act_menuStabHigh = sub_menuStabilizerSub->addAction(QStringLiteral("强力平滑 (S12)"));
    act_menuStabHigh->setCheckable(true);
    act_menuStabHigh->setChecked(false);
    grp_stabilizerGroup->addAction(act_menuStabHigh);
    addMenuAction(QStringLiteral("menuStabHigh"), act_menuStabHigh);
    auto *menu_themeMenu = menuBar->addMenu(QStringLiteral("主题"));
    auto *act_menuThemeDark = menu_themeMenu->addAction(QStringLiteral("深色创作主题"));
    act_menuThemeDark->setCheckable(true);
    act_menuThemeDark->setChecked(true);
    auto *grp_themeGroup = new QActionGroup(&window);
    grp_themeGroup->setExclusive(true);
    grp_themeGroup->addAction(act_menuThemeDark);
    addMenuAction(QStringLiteral("menuThemeDark"), act_menuThemeDark);
    auto *act_menuThemeGraphite = menu_themeMenu->addAction(QStringLiteral("石墨灰护眼主题"));
    act_menuThemeGraphite->setCheckable(true);
    act_menuThemeGraphite->setChecked(false);
    grp_themeGroup->addAction(act_menuThemeGraphite);
    addMenuAction(QStringLiteral("menuThemeGraphite"), act_menuThemeGraphite);
    auto *act_menuThemeLight = menu_themeMenu->addAction(QStringLiteral("明亮浅色主题"));
    act_menuThemeLight->setCheckable(true);
    act_menuThemeLight->setChecked(false);
    grp_themeGroup->addAction(act_menuThemeLight);
    addMenuAction(QStringLiteral("menuThemeLight"), act_menuThemeLight);

    // toolsDock：停靠面板（top）
    auto *w_toolsDock = new QDockWidget(QStringLiteral("工具栏"), &window);
    w_toolsDock->setFeatures(QDockWidget::NoDockWidgetFeatures);
    w_toolsDock->setStyleSheet(QStringLiteral("QDockWidget { border: none; }"));
    auto *hdr_w_toolsDock = new QLabel(QStringLiteral("工具栏"), w_toolsDock);
    hdr_w_toolsDock->setFixedHeight(26);
    w_toolsDock->setTitleBarWidget(hdr_w_toolsDock);
    auto *body_w_toolsDock = new QWidget(w_toolsDock);
    w_toolsDock->setWidget(body_w_toolsDock);
    w_toolsDock->setFixedHeight(62);
    window.addDockWidget(Qt::TopDockWidgetArea, w_toolsDock);
    add(QStringLiteral("toolsDock"), w_toolsDock, { { QStringLiteral("title"), "windowTitle" } });

    // newProjectBtn：Button
    auto *w_newProjectBtn = new QPushButton(body_w_toolsDock);
    add(QStringLiteral("newProjectBtn"), w_newProjectBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_newProjectBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("newProjectBtn"), QStringLiteral("toggle"), value);
    });

    // toolArrowBtn：Button
    auto *w_toolArrowBtn = new QPushButton(body_w_toolsDock);
    add(QStringLiteral("toolArrowBtn"), w_toolArrowBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_toolArrowBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("toolArrowBtn"), QStringLiteral("toggle"), value);
    });

    // toolBrushBtn：Button
    auto *w_toolBrushBtn = new QPushButton(body_w_toolsDock);
    add(QStringLiteral("toolBrushBtn"), w_toolBrushBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_toolBrushBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("toolBrushBtn"), QStringLiteral("toggle"), value);
    });

    // toolEraserBtn：Button
    auto *w_toolEraserBtn = new QPushButton(body_w_toolsDock);
    add(QStringLiteral("toolEraserBtn"), w_toolEraserBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_toolEraserBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("toolEraserBtn"), QStringLiteral("toggle"), value);
    });

    // toolFillBtn：Button
    auto *w_toolFillBtn = new QPushButton(body_w_toolsDock);
    add(QStringLiteral("toolFillBtn"), w_toolFillBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_toolFillBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("toolFillBtn"), QStringLiteral("toggle"), value);
    });

    // toolShapeBtn：Button
    auto *w_toolShapeBtn = new QPushButton(body_w_toolsDock);
    add(QStringLiteral("toolShapeBtn"), w_toolShapeBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_toolShapeBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("toolShapeBtn"), QStringLiteral("toggle"), value);
    });

    // toolSelectBtn：Button
    auto *w_toolSelectBtn = new QPushButton(body_w_toolsDock);
    add(QStringLiteral("toolSelectBtn"), w_toolSelectBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_toolSelectBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("toolSelectBtn"), QStringLiteral("toggle"), value);
    });

    // toolMoveBtn：Button
    auto *w_toolMoveBtn = new QPushButton(body_w_toolsDock);
    add(QStringLiteral("toolMoveBtn"), w_toolMoveBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_toolMoveBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("toolMoveBtn"), QStringLiteral("toggle"), value);
    });

    // toolEyedropperBtn：Button
    auto *w_toolEyedropperBtn = new QPushButton(body_w_toolsDock);
    add(QStringLiteral("toolEyedropperBtn"), w_toolEyedropperBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_toolEyedropperBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("toolEyedropperBtn"), QStringLiteral("toggle"), value);
    });

    // toolHLineBtn：Button
    auto *w_toolHLineBtn = new QPushButton(body_w_toolsDock);
    add(QStringLiteral("toolHLineBtn"), w_toolHLineBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_toolHLineBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("toolHLineBtn"), QStringLiteral("toggle"), value);
    });

    // toolVLineBtn：Button
    auto *w_toolVLineBtn = new QPushButton(body_w_toolsDock);
    add(QStringLiteral("toolVLineBtn"), w_toolVLineBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_toolVLineBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("toolVLineBtn"), QStringLiteral("toggle"), value);
    });

    // toolMapAreaBtn：Button
    auto *w_toolMapAreaBtn = new QPushButton(body_w_toolsDock);
    add(QStringLiteral("toolMapAreaBtn"), w_toolMapAreaBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_toolMapAreaBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("toolMapAreaBtn"), QStringLiteral("toggle"), value);
    });

    // toolAddLineBtn：Button
    auto *w_toolAddLineBtn = new QPushButton(body_w_toolsDock);
    add(QStringLiteral("toolAddLineBtn"), w_toolAddLineBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_toolAddLineBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("toolAddLineBtn"), QStringLiteral("toggle"), value);
    });

    // toolAutoMapBtn：Button
    auto *w_toolAutoMapBtn = new QPushButton(body_w_toolsDock);
    add(QStringLiteral("toolAutoMapBtn"), w_toolAutoMapBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_toolAutoMapBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("toolAutoMapBtn"), QStringLiteral("toggle"), value);
    });

    // toolLockPolicyBtn：Button
    auto *w_toolLockPolicyBtn = new QPushButton(body_w_toolsDock);
    add(QStringLiteral("toolLockPolicyBtn"), w_toolLockPolicyBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_toolLockPolicyBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("toolLockPolicyBtn"), QStringLiteral("toggle"), value);
    });

    // toolMoreMenuBtn：Button
    auto *w_toolMoreMenuBtn = new QPushButton(body_w_toolsDock);
    add(QStringLiteral("toolMoreMenuBtn"), w_toolMoreMenuBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    auto *pop_w_toolMoreMenuBtn = new QMenu(w_toolMoreMenuBtn);
    auto *act_popupResetTool = pop_w_toolMoreMenuBtn->addAction(QStringLiteral("重置当前工具参数"));
    addMenuAction(QStringLiteral("popupResetTool"), act_popupResetTool);
    auto *act_popupOpenDrawSettings = pop_w_toolMoreMenuBtn->addAction(QStringLiteral("打开压感设置..."));
    addMenuAction(QStringLiteral("popupOpenDrawSettings"), act_popupOpenDrawSettings);
    addPopupMenu(w_toolMoreMenuBtn, pop_w_toolMoreMenuBtn);
    QObject::connect(w_toolMoreMenuBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("toolMoreMenuBtn"), QStringLiteral("toggle"), value);
    });

    // forcePadBox：Button
    auto *w_forcePadBox = new QPushButton(body_w_toolsDock);
    add(QStringLiteral("forcePadBox"), w_forcePadBox, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_forcePadBox, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("forcePadBox"), QStringLiteral("toggle"), value);
    });

    // layersDock：停靠面板（left）
    auto *w_layersDock = new QDockWidget(QStringLiteral("图层与素材"), &window);
    w_layersDock->setFeatures(QDockWidget::NoDockWidgetFeatures);
    w_layersDock->setStyleSheet(QStringLiteral("QDockWidget { border: none; }"));
    auto *hdr_w_layersDock = new QLabel(QStringLiteral("图层与素材"), w_layersDock);
    hdr_w_layersDock->setFixedHeight(26);
    w_layersDock->setTitleBarWidget(hdr_w_layersDock);
    auto *body_w_layersDock = new QWidget(w_layersDock);
    w_layersDock->setWidget(body_w_layersDock);
    w_layersDock->setFixedWidth(236);
    window.addDockWidget(Qt::LeftDockWidgetArea, w_layersDock);
    add(QStringLiteral("layersDock"), w_layersDock, { { QStringLiteral("title"), "windowTitle" } });

    // layerViewTabBar：TabBar
    auto *w_layerViewTabBar = new QTabBar(body_w_layersDock);
    add(QStringLiteral("layerViewTabBar"), w_layerViewTabBar, { { QStringLiteral("tabs"), "vfTabs" }, { QStringLiteral("value"), "currentIndex" } });
    QObject::connect(w_layerViewTabBar, &QTabBar::currentChanged, q, [this](double value) {
        dispatch(QStringLiteral("layerViewTabBar"), QStringLiteral("change"), value);
    });

    // layerToolbar：容器
    auto *w_layerToolbar = new QFrame(body_w_layersDock);
    w_layerToolbar->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("layerToolbar"), w_layerToolbar);

    // addLayerBtn：Button
    auto *w_addLayerBtn = new QPushButton(w_layerToolbar);
    add(QStringLiteral("addLayerBtn"), w_addLayerBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_addLayerBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("addLayerBtn"), QStringLiteral("toggle"), value);
    });

    // addGroupBtn：Button
    auto *w_addGroupBtn = new QPushButton(w_layerToolbar);
    add(QStringLiteral("addGroupBtn"), w_addGroupBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_addGroupBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("addGroupBtn"), QStringLiteral("toggle"), value);
    });

    // removeLayerBtn：Button
    auto *w_removeLayerBtn = new QPushButton(w_layerToolbar);
    add(QStringLiteral("removeLayerBtn"), w_removeLayerBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_removeLayerBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("removeLayerBtn"), QStringLiteral("toggle"), value);
    });

    // moveLayerUpBtn：Button
    auto *w_moveLayerUpBtn = new QPushButton(w_layerToolbar);
    add(QStringLiteral("moveLayerUpBtn"), w_moveLayerUpBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_moveLayerUpBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("moveLayerUpBtn"), QStringLiteral("toggle"), value);
    });

    // moveLayerDownBtn：Button
    auto *w_moveLayerDownBtn = new QPushButton(w_layerToolbar);
    add(QStringLiteral("moveLayerDownBtn"), w_moveLayerDownBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_moveLayerDownBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("moveLayerDownBtn"), QStringLiteral("toggle"), value);
    });

    // unselectLayerBtn：Button
    auto *w_unselectLayerBtn = new QPushButton(w_layerToolbar);
    add(QStringLiteral("unselectLayerBtn"), w_unselectLayerBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_unselectLayerBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("unselectLayerBtn"), QStringLiteral("toggle"), value);
    });

    // layerList：Tree
    auto *w_layerList = new QTreeWidget(body_w_layersDock);
    add(QStringLiteral("layerList"), w_layerList, { { QStringLiteral("items"), "vfItems" }, { QStringLiteral("value"), "currentRow" }, { QStringLiteral("checkable"), "vfCheckable" }, { QStringLiteral("draggable"), "vfDraggable" }, { QStringLiteral("emptyText"), "vfEmptyText" } });
    auto *ctx_w_layerList = new QMenu(w_layerList);
    auto *act_ctxDuplicateLayer = ctx_w_layerList->addAction(QStringLiteral("复制选中图层"));
    addMenuAction(QStringLiteral("ctxDuplicateLayer"), act_ctxDuplicateLayer);
    auto *act_ctxToggleLockLayer = ctx_w_layerList->addAction(QStringLiteral("切换图层锁定"));
    addMenuAction(QStringLiteral("ctxToggleLockLayer"), act_ctxToggleLockLayer);
    auto *act_ctxDeleteLayer = ctx_w_layerList->addAction(QStringLiteral("删除选中图层"));
    addMenuAction(QStringLiteral("ctxDeleteLayer"), act_ctxDeleteLayer);
    auto *act_ctxDissolveGroup = ctx_w_layerList->addAction(QStringLiteral("解组保留图层"));
    addMenuAction(QStringLiteral("ctxDissolveGroup"), act_ctxDissolveGroup);
    auto *act_ctxDeleteGroup = ctx_w_layerList->addAction(QStringLiteral("删组及成员图层"));
    addMenuAction(QStringLiteral("ctxDeleteGroup"), act_ctxDeleteGroup);
    w_layerList->setContextMenuPolicy(Qt::CustomContextMenu);
    QObject::connect(w_layerList, &QWidget::customContextMenuRequested, q, [w_layerList, ctx_w_layerList](const QPoint &pos) {
        ctx_w_layerList->popup(w_layerList->mapToGlobal(pos));
    });

    // layerVisibilityBar：容器
    auto *w_layerVisibilityBar = new QFrame(body_w_layersDock);
    w_layerVisibilityBar->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("layerVisibilityBar"), w_layerVisibilityBar);

    // layerVisibleLabel：Label
    auto *w_layerVisibleLabel = new QLabel(w_layerVisibilityBar);
    w_layerVisibleLabel->setProperty("wordWrap", true);
    add(QStringLiteral("layerVisibleLabel"), w_layerVisibleLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // toggleVisibleBtn：Button
    auto *w_toggleVisibleBtn = new QPushButton(w_layerVisibilityBar);
    add(QStringLiteral("toggleVisibleBtn"), w_toggleVisibleBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_toggleVisibleBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("toggleVisibleBtn"), QStringLiteral("toggle"), value);
    });

    // assetsPanelSep：Separator
    auto *w_assetsPanelSep = new QFrame(body_w_layersDock);
    w_assetsPanelSep->setProperty("frameShape", 4);
    w_assetsPanelSep->setProperty("frameShadow", 48);
    add(QStringLiteral("assetsPanelSep"), w_assetsPanelSep, { { QStringLiteral("orientation"), "vfOrientation" } });

    // assetsHeaderBar：容器
    auto *w_assetsHeaderBar = new QFrame(body_w_layersDock);
    w_assetsHeaderBar->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("assetsHeaderBar"), w_assetsHeaderBar);

    // assetsTitleLabel：Label
    auto *w_assetsTitleLabel = new QLabel(w_assetsHeaderBar);
    w_assetsTitleLabel->setProperty("wordWrap", true);
    add(QStringLiteral("assetsTitleLabel"), w_assetsTitleLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // addAssetBtn：Button
    auto *w_addAssetBtn = new QPushButton(w_assetsHeaderBar);
    add(QStringLiteral("addAssetBtn"), w_addAssetBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_addAssetBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("addAssetBtn"), QStringLiteral("toggle"), value);
    });

    // assetToLayerBtn：Button
    auto *w_assetToLayerBtn = new QPushButton(w_assetsHeaderBar);
    add(QStringLiteral("assetToLayerBtn"), w_assetToLayerBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_assetToLayerBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("assetToLayerBtn"), QStringLiteral("toggle"), value);
    });

    // removeAssetBtn：Button
    auto *w_removeAssetBtn = new QPushButton(w_assetsHeaderBar);
    add(QStringLiteral("removeAssetBtn"), w_removeAssetBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_removeAssetBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("removeAssetBtn"), QStringLiteral("toggle"), value);
    });

    // unselectAssetBtn：Button
    auto *w_unselectAssetBtn = new QPushButton(w_assetsHeaderBar);
    add(QStringLiteral("unselectAssetBtn"), w_unselectAssetBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_unselectAssetBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("unselectAssetBtn"), QStringLiteral("toggle"), value);
    });

    // assetList：List
    auto *w_assetList = new QListWidget(body_w_layersDock);
    add(QStringLiteral("assetList"), w_assetList, { { QStringLiteral("items"), "vfItems" }, { QStringLiteral("value"), "currentRow" }, { QStringLiteral("emptyText"), "vfEmptyText" }, { QStringLiteral("draggable"), "vfDraggable" }, { QStringLiteral("mutedFrom"), "vfMutedFrom" } });
    QObject::connect(w_assetList, &QListWidget::currentRowChanged, q, [this](double value) {
        dispatch(QStringLiteral("assetList"), QStringLiteral("change"), value);
    });
    QObject::connect(w_assetList, &QListWidget::currentRowChanged, q, [this](double value) {
        dispatch(QStringLiteral("assetList"), QStringLiteral("select"), value);
    });

    // assetNoteInput：TextArea
    auto *w_assetNoteInput = new QPlainTextEdit(body_w_layersDock);
    add(QStringLiteral("assetNoteInput"), w_assetNoteInput, { { QStringLiteral("placeholder"), "placeholderText" }, { QStringLiteral("value"), "plainText" }, { QStringLiteral("readOnly"), "readOnly" } });
    QObject::connect(w_assetNoteInput, &QPlainTextEdit::textChanged, q, [this, w_assetNoteInput] {
        dispatch(QStringLiteral("assetNoteInput"), QStringLiteral("change"), w_assetNoteInput->toPlainText());
    });

    // centralArea：容器
    auto *w_centralArea = new QFrame(&window);
    window.setCentralWidget(w_centralArea);
    w_centralArea->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("centralArea"), w_centralArea);

    // canvasHeader：容器
    auto *w_canvasHeader = new QFrame(w_centralArea);
    w_canvasHeader->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("canvasHeader"), w_canvasHeader);

    // workspaceTabBar：TabBar
    auto *w_workspaceTabBar = new QTabBar(w_canvasHeader);
    add(QStringLiteral("workspaceTabBar"), w_workspaceTabBar, { { QStringLiteral("tabs"), "vfTabs" }, { QStringLiteral("value"), "currentIndex" } });
    QObject::connect(w_workspaceTabBar, &QTabBar::currentChanged, q, [this](double value) {
        dispatch(QStringLiteral("workspaceTabBar"), QStringLiteral("change"), value);
    });

    // canvasTitleLabel：Label
    auto *w_canvasTitleLabel = new QLabel(w_canvasHeader);
    w_canvasTitleLabel->setProperty("wordWrap", true);
    add(QStringLiteral("canvasTitleLabel"), w_canvasTitleLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // zoomSlider：Slider
    auto *w_zoomSlider = new QSlider(w_canvasHeader);
    add(QStringLiteral("zoomSlider"), w_zoomSlider, { { QStringLiteral("min"), "minimum" }, { QStringLiteral("max"), "maximum" }, { QStringLiteral("step"), "singleStep" }, { QStringLiteral("orientation"), "vfOrientation" }, { QStringLiteral("value"), "value" } });
    QObject::connect(w_zoomSlider, &QSlider::valueChanged, q, [this](double value) {
        dispatch(QStringLiteral("zoomSlider"), QStringLiteral("change"), value);
    });

    // activeToolLabel：Label
    auto *w_activeToolLabel = new QLabel(w_canvasHeader);
    w_activeToolLabel->setProperty("wordWrap", true);
    add(QStringLiteral("activeToolLabel"), w_activeToolLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // textureSubBar：容器
    auto *w_textureSubBar = new QFrame(w_centralArea);
    w_textureSubBar->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("textureSubBar"), w_textureSubBar);

    // textureHostLabel：Label
    auto *w_textureHostLabel = new QLabel(w_textureSubBar);
    w_textureHostLabel->setProperty("wordWrap", true);
    add(QStringLiteral("textureHostLabel"), w_textureHostLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // followTimelineCheck：CheckBox
    auto *w_followTimelineCheck = new QCheckBox(w_textureSubBar);
    add(QStringLiteral("followTimelineCheck"), w_followTimelineCheck, { { QStringLiteral("text"), "text" }, { QStringLiteral("value"), "checked" } });
    QObject::connect(w_followTimelineCheck, &QCheckBox::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("followTimelineCheck"), QStringLiteral("change"), value);
    });

    // followTextureCheck：CheckBox
    auto *w_followTextureCheck = new QCheckBox(w_textureSubBar);
    add(QStringLiteral("followTextureCheck"), w_followTextureCheck, { { QStringLiteral("text"), "text" }, { QStringLiteral("value"), "checked" } });
    QObject::connect(w_followTextureCheck, &QCheckBox::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("followTextureCheck"), QStringLiteral("change"), value);
    });

    // floatTextureBtn：Button
    auto *w_floatTextureBtn = new QPushButton(w_textureSubBar);
    add(QStringLiteral("floatTextureBtn"), w_floatTextureBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_floatTextureBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("floatTextureBtn"), QStringLiteral("toggle"), value);
    });

    // canvasHost：外部容器
    auto *w_canvasHost = new QFrame(w_centralArea);
    addExternal(QStringLiteral("canvasHost"), w_canvasHost, QStringLiteral("外部容器 canvasHost\n（业务还没有放入控件）"));
    w_canvasHost->setFrameShape(QFrame::NoFrame);
    auto *ctx_w_canvasHost = new QMenu(w_canvasHost);
    auto *act_ctxResetZoom = ctx_w_canvasHost->addAction(QStringLiteral("重置画布缩放 (100%)"));
    addMenuAction(QStringLiteral("ctxResetZoom"), act_ctxResetZoom);
    auto *act_ctxClearCanvas = ctx_w_canvasHost->addAction(QStringLiteral("清空当前帧画布"));
    addMenuAction(QStringLiteral("ctxClearCanvas"), act_ctxClearCanvas);
    w_canvasHost->setContextMenuPolicy(Qt::CustomContextMenu);
    QObject::connect(w_canvasHost, &QWidget::customContextMenuRequested, q, [w_canvasHost, ctx_w_canvasHost](const QPoint &pos) {
        ctx_w_canvasHost->popup(w_canvasHost->mapToGlobal(pos));
    });

    // inspectorDock：停靠面板（right）
    auto *w_inspectorDock = new QDockWidget(QStringLiteral("工具选项与检查器"), &window);
    w_inspectorDock->setFeatures(QDockWidget::NoDockWidgetFeatures);
    w_inspectorDock->setStyleSheet(QStringLiteral("QDockWidget { border: none; }"));
    auto *hdr_w_inspectorDock = new QLabel(QStringLiteral("工具选项与检查器"), w_inspectorDock);
    hdr_w_inspectorDock->setFixedHeight(26);
    w_inspectorDock->setTitleBarWidget(hdr_w_inspectorDock);
    auto *body_w_inspectorDock = new QWidget(w_inspectorDock);
    w_inspectorDock->setWidget(body_w_inspectorDock);
    w_inspectorDock->setFixedWidth(264);
    window.addDockWidget(Qt::RightDockWidgetArea, w_inspectorDock);
    add(QStringLiteral("inspectorDock"), w_inspectorDock, { { QStringLiteral("title"), "windowTitle" } });

    // toolOptHeader：Label
    auto *w_toolOptHeader = new QLabel(body_w_inspectorDock);
    w_toolOptHeader->setProperty("wordWrap", true);
    add(QStringLiteral("toolOptHeader"), w_toolOptHeader, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // toolOptionsForm：DataForm
    auto *w_toolOptionsForm = new QFrame(body_w_inspectorDock);
    add(QStringLiteral("toolOptionsForm"), w_toolOptionsForm, { { QStringLiteral("schema"), "vfSchema" }, { QStringLiteral("values"), "vfValues" }, { QStringLiteral("emptyText"), "vfEmptyText" } });

    // inspectorSep1：Separator
    auto *w_inspectorSep1 = new QFrame(body_w_inspectorDock);
    w_inspectorSep1->setProperty("frameShape", 4);
    w_inspectorSep1->setProperty("frameShadow", 48);
    add(QStringLiteral("inspectorSep1"), w_inspectorSep1, { { QStringLiteral("orientation"), "vfOrientation" } });

    // inspectorTabs：容器
    auto *w_inspectorTabs = new QFrame(body_w_inspectorDock);
    w_inspectorTabs->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("inspectorTabs"), w_inspectorTabs);

    // tabPropsBtn：Button
    auto *w_tabPropsBtn = new QPushButton(w_inspectorTabs);
    add(QStringLiteral("tabPropsBtn"), w_tabPropsBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_tabPropsBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("tabPropsBtn"), QStringLiteral("toggle"), value);
    });

    // tabHistoryBtn：Button
    auto *w_tabHistoryBtn = new QPushButton(w_inspectorTabs);
    add(QStringLiteral("tabHistoryBtn"), w_tabHistoryBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_tabHistoryBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("tabHistoryBtn"), QStringLiteral("toggle"), value);
    });

    // tabExportBtn：Button
    auto *w_tabExportBtn = new QPushButton(w_inspectorTabs);
    add(QStringLiteral("tabExportBtn"), w_tabExportBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_tabExportBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("tabExportBtn"), QStringLiteral("toggle"), value);
    });

    // inspectorStack：容器
    auto *w_inspectorStack = new QFrame(body_w_inspectorDock);
    w_inspectorStack->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("inspectorStack"), w_inspectorStack);

    // layerPropsPage：容器
    auto *w_layerPropsPage = new QFrame(w_inspectorStack);
    w_layerPropsPage->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("layerPropsPage"), w_layerPropsPage);

    // blendLabel：Label
    auto *w_blendLabel = new QLabel(w_layerPropsPage);
    w_blendLabel->setProperty("wordWrap", true);
    add(QStringLiteral("blendLabel"), w_blendLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // blendCombo：ComboBox
    auto *w_blendCombo = new QComboBox(w_layerPropsPage);
    add(QStringLiteral("blendCombo"), w_blendCombo, { { QStringLiteral("options"), "vfOptions" }, { QStringLiteral("value"), "currentText" } });
    QObject::connect(w_blendCombo, &QComboBox::currentTextChanged, q, [this](const QString &value) {
        dispatch(QStringLiteral("blendCombo"), QStringLiteral("change"), value);
    });

    // opacityLabel：Label
    auto *w_opacityLabel = new QLabel(w_layerPropsPage);
    w_opacityLabel->setProperty("wordWrap", true);
    add(QStringLiteral("opacityLabel"), w_opacityLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // opacitySpin：SpinBox
    auto *w_opacitySpin = new QSpinBox(w_layerPropsPage);
    add(QStringLiteral("opacitySpin"), w_opacitySpin, { { QStringLiteral("min"), "minimum" }, { QStringLiteral("max"), "maximum" }, { QStringLiteral("step"), "singleStep" }, { QStringLiteral("suffix"), "suffix" }, { QStringLiteral("value"), "value" } });
    QObject::connect(w_opacitySpin, &QSpinBox::valueChanged, q, [this](double value) {
        dispatch(QStringLiteral("opacitySpin"), QStringLiteral("change"), value);
    });

    // lockLabel：Label
    auto *w_lockLabel = new QLabel(w_layerPropsPage);
    w_lockLabel->setProperty("wordWrap", true);
    add(QStringLiteral("lockLabel"), w_lockLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // lockLayerCheck：CheckBox
    auto *w_lockLayerCheck = new QCheckBox(w_layerPropsPage);
    add(QStringLiteral("lockLayerCheck"), w_lockLayerCheck, { { QStringLiteral("text"), "text" }, { QStringLiteral("value"), "checked" } });
    QObject::connect(w_lockLayerCheck, &QCheckBox::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("lockLayerCheck"), QStringLiteral("change"), value);
    });

    // exportPage：容器
    auto *w_exportPage = new QFrame(w_inspectorStack);
    w_exportPage->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("exportPage"), w_exportPage);

    // exportHintLabel：Label
    auto *w_exportHintLabel = new QLabel(w_exportPage);
    w_exportHintLabel->setProperty("wordWrap", true);
    add(QStringLiteral("exportHintLabel"), w_exportHintLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // exportBtn：Button
    auto *w_exportBtn = new QPushButton(w_exportPage);
    add(QStringLiteral("exportBtn"), w_exportBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_exportBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("exportBtn"), QStringLiteral("toggle"), value);
    });

    // exportResultLabel：Label
    auto *w_exportResultLabel = new QLabel(w_exportPage);
    w_exportResultLabel->setProperty("wordWrap", true);
    add(QStringLiteral("exportResultLabel"), w_exportResultLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // historyPage：容器
    auto *w_historyPage = new QFrame(w_inspectorStack);
    w_historyPage->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("historyPage"), w_historyPage);

    // historyToolbar：容器
    auto *w_historyToolbar = new QFrame(w_historyPage);
    w_historyToolbar->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("historyToolbar"), w_historyToolbar);

    // undoBtn：Button
    auto *w_undoBtn = new QPushButton(w_historyToolbar);
    add(QStringLiteral("undoBtn"), w_undoBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_undoBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("undoBtn"), QStringLiteral("toggle"), value);
    });

    // redoBtn：Button
    auto *w_redoBtn = new QPushButton(w_historyToolbar);
    add(QStringLiteral("redoBtn"), w_redoBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_redoBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("redoBtn"), QStringLiteral("toggle"), value);
    });

    // clearHistoryBtn：Button
    auto *w_clearHistoryBtn = new QPushButton(w_historyToolbar);
    add(QStringLiteral("clearHistoryBtn"), w_clearHistoryBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_clearHistoryBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("clearHistoryBtn"), QStringLiteral("toggle"), value);
    });

    // historyList：List
    auto *w_historyList = new QListWidget(w_historyPage);
    add(QStringLiteral("historyList"), w_historyList, { { QStringLiteral("items"), "vfItems" }, { QStringLiteral("value"), "currentRow" }, { QStringLiteral("emptyText"), "vfEmptyText" }, { QStringLiteral("draggable"), "vfDraggable" }, { QStringLiteral("mutedFrom"), "vfMutedFrom" } });
    QObject::connect(w_historyList, &QListWidget::currentRowChanged, q, [this](double value) {
        dispatch(QStringLiteral("historyList"), QStringLiteral("change"), value);
    });
    QObject::connect(w_historyList, &QListWidget::currentRowChanged, q, [this](double value) {
        dispatch(QStringLiteral("historyList"), QStringLiteral("select"), value);
    });

    // colorPanelToggleBtn：StateButton
    auto *w_colorPanelToggleBtn = new StateImageWidget(body_w_inspectorDock);
    w_colorPanelToggleBtn->configure(
        QStringLiteral(":/vf/logic/components/StateButton/"),
        { { QStringLiteral("normal"), QStringLiteral("normal.svg") }, { QStringLiteral("hover"), QStringLiteral("hover.svg") }, { QStringLiteral("pressed"), QStringLiteral("pressed.svg") }, { QStringLiteral("selected"), QStringLiteral("selected.svg") }, { QStringLiteral("disabled"), QStringLiteral("disabled.svg") } },
        QMargins(8, 8, 8, 8),
        120
    );
    add(QStringLiteral("colorPanelToggleBtn"), w_colorPanelToggleBtn, { { QStringLiteral("selected"), "selected" }, { QStringLiteral("text"), "text" } });

    // colorPanel：容器
    auto *w_colorPanel = new QFrame(body_w_inspectorDock);
    w_colorPanel->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("colorPanel"), w_colorPanel, {}, 1 /* 效果 PanelExpand */);

    // colorPickerCanvas：ColorPicker
    auto *w_colorPickerCanvas = new PaintEffectWidget(w_colorPanel);
    w_colorPickerCanvas->configure(QStringLiteral("ColorPickerDraw"), [this](QPainter *painter, const QRect &rect, const QVariantMap &props) {
        return paintCustomEffect(0, painter, rect, props);
    });
    add(QStringLiteral("colorPickerCanvas"), w_colorPickerCanvas, { { QStringLiteral("brightness"), "brightness" }, { QStringLiteral("hexColor"), "hexColor" }, { QStringLiteral("hue"), "hue" }, { QStringLiteral("saturation"), "saturation" } });

    // colorHexLabel：Label
    auto *w_colorHexLabel = new QLabel(w_colorPanel);
    w_colorHexLabel->setProperty("wordWrap", true);
    add(QStringLiteral("colorHexLabel"), w_colorHexLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // timelineDock：停靠面板（bottom）
    auto *w_timelineDock = new QDockWidget(QStringLiteral("时间轴"), &window);
    w_timelineDock->setFeatures(QDockWidget::NoDockWidgetFeatures);
    w_timelineDock->setStyleSheet(QStringLiteral("QDockWidget { border: none; }"));
    auto *hdr_w_timelineDock = new QLabel(QStringLiteral("时间轴"), w_timelineDock);
    hdr_w_timelineDock->setFixedHeight(26);
    w_timelineDock->setTitleBarWidget(hdr_w_timelineDock);
    auto *body_w_timelineDock = new QWidget(w_timelineDock);
    w_timelineDock->setWidget(body_w_timelineDock);
    w_timelineDock->setFixedHeight(132);
    window.addDockWidget(Qt::BottomDockWidgetArea, w_timelineDock);
    add(QStringLiteral("timelineDock"), w_timelineDock, { { QStringLiteral("title"), "windowTitle" } });

    // timelineTransportFlow：容器
    auto *w_timelineTransportFlow = new QFrame(body_w_timelineDock);
    w_timelineTransportFlow->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("timelineTransportFlow"), w_timelineTransportFlow);

    // playToggleBtn：Button
    auto *w_playToggleBtn = new QPushButton(w_timelineTransportFlow);
    add(QStringLiteral("playToggleBtn"), w_playToggleBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_playToggleBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("playToggleBtn"), QStringLiteral("toggle"), value);
    });

    // prevFrameBtn：Button
    auto *w_prevFrameBtn = new QPushButton(w_timelineTransportFlow);
    add(QStringLiteral("prevFrameBtn"), w_prevFrameBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_prevFrameBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("prevFrameBtn"), QStringLiteral("toggle"), value);
    });

    // nextFrameBtn：Button
    auto *w_nextFrameBtn = new QPushButton(w_timelineTransportFlow);
    add(QStringLiteral("nextFrameBtn"), w_nextFrameBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_nextFrameBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("nextFrameBtn"), QStringLiteral("toggle"), value);
    });

    // addFrameBtn：Button
    auto *w_addFrameBtn = new QPushButton(w_timelineTransportFlow);
    add(QStringLiteral("addFrameBtn"), w_addFrameBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_addFrameBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("addFrameBtn"), QStringLiteral("toggle"), value);
    });

    // addHoldFrameBtn：Button
    auto *w_addHoldFrameBtn = new QPushButton(w_timelineTransportFlow);
    add(QStringLiteral("addHoldFrameBtn"), w_addHoldFrameBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_addHoldFrameBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("addHoldFrameBtn"), QStringLiteral("toggle"), value);
    });

    // duplicateFrameBtn：Button
    auto *w_duplicateFrameBtn = new QPushButton(w_timelineTransportFlow);
    add(QStringLiteral("duplicateFrameBtn"), w_duplicateFrameBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_duplicateFrameBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("duplicateFrameBtn"), QStringLiteral("toggle"), value);
    });

    // moveFrameBackBtn：Button
    auto *w_moveFrameBackBtn = new QPushButton(w_timelineTransportFlow);
    add(QStringLiteral("moveFrameBackBtn"), w_moveFrameBackBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_moveFrameBackBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("moveFrameBackBtn"), QStringLiteral("toggle"), value);
    });

    // removeFrameBtn：Button
    auto *w_removeFrameBtn = new QPushButton(w_timelineTransportFlow);
    add(QStringLiteral("removeFrameBtn"), w_removeFrameBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_removeFrameBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("removeFrameBtn"), QStringLiteral("toggle"), value);
    });

    // loopToggleBtn：Button
    auto *w_loopToggleBtn = new QPushButton(w_timelineTransportFlow);
    add(QStringLiteral("loopToggleBtn"), w_loopToggleBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_loopToggleBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("loopToggleBtn"), QStringLiteral("toggle"), value);
    });

    // onionToggleBtn：Button
    auto *w_onionToggleBtn = new QPushButton(w_timelineTransportFlow);
    add(QStringLiteral("onionToggleBtn"), w_onionToggleBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_onionToggleBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("onionToggleBtn"), QStringLiteral("toggle"), value);
    });

    // onionLinesCheck：CheckBox
    auto *w_onionLinesCheck = new QCheckBox(w_timelineTransportFlow);
    add(QStringLiteral("onionLinesCheck"), w_onionLinesCheck, { { QStringLiteral("text"), "text" }, { QStringLiteral("value"), "checked" } });
    QObject::connect(w_onionLinesCheck, &QCheckBox::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("onionLinesCheck"), QStringLiteral("change"), value);
    });

    // onionFillsCheck：CheckBox
    auto *w_onionFillsCheck = new QCheckBox(w_timelineTransportFlow);
    add(QStringLiteral("onionFillsCheck"), w_onionFillsCheck, { { QStringLiteral("text"), "text" }, { QStringLiteral("value"), "checked" } });
    QObject::connect(w_onionFillsCheck, &QCheckBox::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("onionFillsCheck"), QStringLiteral("change"), value);
    });

    // onionAmCheck：CheckBox
    auto *w_onionAmCheck = new QCheckBox(w_timelineTransportFlow);
    add(QStringLiteral("onionAmCheck"), w_onionAmCheck, { { QStringLiteral("text"), "text" }, { QStringLiteral("value"), "checked" } });
    QObject::connect(w_onionAmCheck, &QCheckBox::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("onionAmCheck"), QStringLiteral("change"), value);
    });

    // onionGuideCheck：CheckBox
    auto *w_onionGuideCheck = new QCheckBox(w_timelineTransportFlow);
    add(QStringLiteral("onionGuideCheck"), w_onionGuideCheck, { { QStringLiteral("text"), "text" }, { QStringLiteral("value"), "checked" } });
    QObject::connect(w_onionGuideCheck, &QCheckBox::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("onionGuideCheck"), QStringLiteral("change"), value);
    });

    // fpsSelectCombo：ComboBox
    auto *w_fpsSelectCombo = new QComboBox(w_timelineTransportFlow);
    add(QStringLiteral("fpsSelectCombo"), w_fpsSelectCombo, { { QStringLiteral("options"), "vfOptions" }, { QStringLiteral("value"), "currentText" } });
    QObject::connect(w_fpsSelectCombo, &QComboBox::currentTextChanged, q, [this](const QString &value) {
        dispatch(QStringLiteral("fpsSelectCombo"), QStringLiteral("change"), value);
    });

    // frameSlider：Slider
    auto *w_frameSlider = new QSlider(w_timelineTransportFlow);
    add(QStringLiteral("frameSlider"), w_frameSlider, { { QStringLiteral("min"), "minimum" }, { QStringLiteral("max"), "maximum" }, { QStringLiteral("step"), "singleStep" }, { QStringLiteral("orientation"), "vfOrientation" }, { QStringLiteral("value"), "value" } });
    QObject::connect(w_frameSlider, &QSlider::valueChanged, q, [this](double value) {
        dispatch(QStringLiteral("frameSlider"), QStringLiteral("change"), value);
    });

    // frameInfoLabel：Label
    auto *w_frameInfoLabel = new QLabel(w_timelineTransportFlow);
    w_frameInfoLabel->setProperty("wordWrap", true);
    add(QStringLiteral("frameInfoLabel"), w_frameInfoLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // timelineTrackRow：容器
    auto *w_timelineTrackRow = new QFrame(body_w_timelineDock);
    w_timelineTrackRow->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("timelineTrackRow"), w_timelineTrackRow);

    // timelineTrackLabel：Label
    auto *w_timelineTrackLabel = new QLabel(w_timelineTrackRow);
    w_timelineTrackLabel->setProperty("wordWrap", true);
    add(QStringLiteral("timelineTrackLabel"), w_timelineTrackLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // timelineScrollBar：ScrollBar
    auto *w_timelineScrollBar = new QScrollBar(w_timelineTrackRow);
    add(QStringLiteral("timelineScrollBar"), w_timelineScrollBar, { { QStringLiteral("min"), "minimum" }, { QStringLiteral("max"), "maximum" }, { QStringLiteral("step"), "singleStep" }, { QStringLiteral("pageStep"), "pageStep" }, { QStringLiteral("orientation"), "vfOrientation" }, { QStringLiteral("value"), "value" } });
    QObject::connect(w_timelineScrollBar, &QScrollBar::valueChanged, q, [this](double value) {
        dispatch(QStringLiteral("timelineScrollBar"), QStringLiteral("change"), value);
    });

    // timelineOffsetLabel：Label
    auto *w_timelineOffsetLabel = new QLabel(w_timelineTrackRow);
    w_timelineOffsetLabel->setProperty("wordWrap", true);
    add(QStringLiteral("timelineOffsetLabel"), w_timelineOffsetLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // statusBar：容器
    auto *w_statusBar = new QFrame(&window);
    auto *qtStatusBar = new QStatusBar(&window);
    qtStatusBar->setSizeGripEnabled(false);
    qtStatusBar->setContentsMargins(0, 0, 0, 0);
    qtStatusBar->setFixedHeight(28);
    w_statusBar->setParent(qtStatusBar);
    w_statusBar->setGeometry(0, 0, 1280, 28);
    qtStatusBar->installEventFilter(q);
    statusBar = qtStatusBar;
    statusBarControl = w_statusBar;
    window.setStatusBar(qtStatusBar);
    w_statusBar->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("statusBar"), w_statusBar);

    // statusTextLabel：Label
    auto *w_statusTextLabel = new QLabel(w_statusBar);
    w_statusTextLabel->setProperty("wordWrap", true);
    add(QStringLiteral("statusTextLabel"), w_statusTextLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // projectSummaryLabel：Label
    auto *w_projectSummaryLabel = new QLabel(w_statusBar);
    w_projectSummaryLabel->setProperty("wordWrap", true);
    add(QStringLiteral("projectSummaryLabel"), w_projectSummaryLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // statusClockLabel：Label
    auto *w_statusClockLabel = new QLabel(w_statusBar);
    w_statusClockLabel->setProperty("wordWrap", true);
    add(QStringLiteral("statusClockLabel"), w_statusClockLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // statusLayerCountLabel：Label
    auto *w_statusLayerCountLabel = new QLabel(w_statusBar);
    w_statusLayerCountLabel->setProperty("wordWrap", true);
    add(QStringLiteral("statusLayerCountLabel"), w_statusLayerCountLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // newProjectDialog：对话框
    auto *w_newProjectDialog = new QDialog(&window);
    w_newProjectDialog->setWindowTitle(QStringLiteral("新建动画项目"));
    w_newProjectDialog->setFixedSize(420, 320);
    w_newProjectDialog->setModal(true);
    dialogs.append(w_newProjectDialog);
    add(QStringLiteral("newProjectDialog"), w_newProjectDialog);
    QObject::connect(w_newProjectDialog, &QDialog::finished, q, [this] {
        onDialogFinished(QStringLiteral("newProjectDialog"));
    });

    // newProjectForm：容器
    auto *w_newProjectForm = new QFrame(w_newProjectDialog);
    w_newProjectForm->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("newProjectForm"), w_newProjectForm);

    // nameFormLabel：Label
    auto *w_nameFormLabel = new QLabel(w_newProjectForm);
    w_nameFormLabel->setProperty("wordWrap", true);
    add(QStringLiteral("nameFormLabel"), w_nameFormLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // projectNameInput：TextInput
    auto *w_projectNameInput = new QLineEdit(w_newProjectForm);
    add(QStringLiteral("projectNameInput"), w_projectNameInput, { { QStringLiteral("placeholder"), "placeholderText" }, { QStringLiteral("value"), "text" } });
    QObject::connect(w_projectNameInput, &QLineEdit::textEdited, q, [this](const QString &value) {
        dispatch(QStringLiteral("projectNameInput"), QStringLiteral("change"), value);
    });

    // presetFormLabel：Label
    auto *w_presetFormLabel = new QLabel(w_newProjectForm);
    w_presetFormLabel->setProperty("wordWrap", true);
    add(QStringLiteral("presetFormLabel"), w_presetFormLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // presetCombo：ComboBox
    auto *w_presetCombo = new QComboBox(w_newProjectForm);
    add(QStringLiteral("presetCombo"), w_presetCombo, { { QStringLiteral("options"), "vfOptions" }, { QStringLiteral("value"), "currentText" } });
    QObject::connect(w_presetCombo, &QComboBox::currentTextChanged, q, [this](const QString &value) {
        dispatch(QStringLiteral("presetCombo"), QStringLiteral("change"), value);
    });

    // widthFormLabel：Label
    auto *w_widthFormLabel = new QLabel(w_newProjectForm);
    w_widthFormLabel->setProperty("wordWrap", true);
    add(QStringLiteral("widthFormLabel"), w_widthFormLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // widthSpin：SpinBox
    auto *w_widthSpin = new QSpinBox(w_newProjectForm);
    add(QStringLiteral("widthSpin"), w_widthSpin, { { QStringLiteral("min"), "minimum" }, { QStringLiteral("max"), "maximum" }, { QStringLiteral("step"), "singleStep" }, { QStringLiteral("suffix"), "suffix" }, { QStringLiteral("value"), "value" } });
    QObject::connect(w_widthSpin, &QSpinBox::valueChanged, q, [this](double value) {
        dispatch(QStringLiteral("widthSpin"), QStringLiteral("change"), value);
    });

    // heightFormLabel：Label
    auto *w_heightFormLabel = new QLabel(w_newProjectForm);
    w_heightFormLabel->setProperty("wordWrap", true);
    add(QStringLiteral("heightFormLabel"), w_heightFormLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // heightSpin：SpinBox
    auto *w_heightSpin = new QSpinBox(w_newProjectForm);
    add(QStringLiteral("heightSpin"), w_heightSpin, { { QStringLiteral("min"), "minimum" }, { QStringLiteral("max"), "maximum" }, { QStringLiteral("step"), "singleStep" }, { QStringLiteral("suffix"), "suffix" }, { QStringLiteral("value"), "value" } });
    QObject::connect(w_heightSpin, &QSpinBox::valueChanged, q, [this](double value) {
        dispatch(QStringLiteral("heightSpin"), QStringLiteral("change"), value);
    });

    // transparentFormLabel：Label
    auto *w_transparentFormLabel = new QLabel(w_newProjectForm);
    w_transparentFormLabel->setProperty("wordWrap", true);
    add(QStringLiteral("transparentFormLabel"), w_transparentFormLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // transparentCheck：CheckBox
    auto *w_transparentCheck = new QCheckBox(w_newProjectForm);
    add(QStringLiteral("transparentCheck"), w_transparentCheck, { { QStringLiteral("text"), "text" }, { QStringLiteral("value"), "checked" } });
    QObject::connect(w_transparentCheck, &QCheckBox::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("transparentCheck"), QStringLiteral("change"), value);
    });

    // dialogSep：Separator
    auto *w_dialogSep = new QFrame(w_newProjectDialog);
    w_dialogSep->setProperty("frameShape", 4);
    w_dialogSep->setProperty("frameShadow", 48);
    add(QStringLiteral("dialogSep"), w_dialogSep, { { QStringLiteral("orientation"), "vfOrientation" } });

    // dialogFooter：容器
    auto *w_dialogFooter = new QFrame(w_newProjectDialog);
    w_dialogFooter->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("dialogFooter"), w_dialogFooter);

    // dialogSpacerLabel：Label
    auto *w_dialogSpacerLabel = new QLabel(w_dialogFooter);
    w_dialogSpacerLabel->setProperty("wordWrap", true);
    add(QStringLiteral("dialogSpacerLabel"), w_dialogSpacerLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // cancelNewProjectBtn：Button
    auto *w_cancelNewProjectBtn = new QPushButton(w_dialogFooter);
    add(QStringLiteral("cancelNewProjectBtn"), w_cancelNewProjectBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_cancelNewProjectBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("cancelNewProjectBtn"), QStringLiteral("toggle"), value);
    });

    // confirmNewProjectBtn：Button
    auto *w_confirmNewProjectBtn = new QPushButton(w_dialogFooter);
    add(QStringLiteral("confirmNewProjectBtn"), w_confirmNewProjectBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_confirmNewProjectBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("confirmNewProjectBtn"), QStringLiteral("toggle"), value);
    });

    // drawSettingsDialog：对话框
    auto *w_drawSettingsDialog = new QDialog(&window);
    w_drawSettingsDialog->setWindowTitle(QStringLiteral("画笔与压感设置"));
    w_drawSettingsDialog->setFixedSize(400, 260);
    w_drawSettingsDialog->setModal(true);
    dialogs.append(w_drawSettingsDialog);
    add(QStringLiteral("drawSettingsDialog"), w_drawSettingsDialog);
    QObject::connect(w_drawSettingsDialog, &QDialog::finished, q, [this] {
        onDialogFinished(QStringLiteral("drawSettingsDialog"));
    });

    // drawSettingsForm：容器
    auto *w_drawSettingsForm = new QFrame(w_drawSettingsDialog);
    w_drawSettingsForm->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("drawSettingsForm"), w_drawSettingsForm);

    // pressureCurveLabel：Label
    auto *w_pressureCurveLabel = new QLabel(w_drawSettingsForm);
    w_pressureCurveLabel->setProperty("wordWrap", true);
    add(QStringLiteral("pressureCurveLabel"), w_pressureCurveLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // pressureCurveCombo：ComboBox
    auto *w_pressureCurveCombo = new QComboBox(w_drawSettingsForm);
    add(QStringLiteral("pressureCurveCombo"), w_pressureCurveCombo, { { QStringLiteral("options"), "vfOptions" }, { QStringLiteral("value"), "currentText" } });
    QObject::connect(w_pressureCurveCombo, &QComboBox::currentTextChanged, q, [this](const QString &value) {
        dispatch(QStringLiteral("pressureCurveCombo"), QStringLiteral("change"), value);
    });

    // minRadiusLabel：Label
    auto *w_minRadiusLabel = new QLabel(w_drawSettingsForm);
    w_minRadiusLabel->setProperty("wordWrap", true);
    add(QStringLiteral("minRadiusLabel"), w_minRadiusLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // minRadiusSpin：SpinBox
    auto *w_minRadiusSpin = new QSpinBox(w_drawSettingsForm);
    add(QStringLiteral("minRadiusSpin"), w_minRadiusSpin, { { QStringLiteral("min"), "minimum" }, { QStringLiteral("max"), "maximum" }, { QStringLiteral("step"), "singleStep" }, { QStringLiteral("suffix"), "suffix" }, { QStringLiteral("value"), "value" } });
    QObject::connect(w_minRadiusSpin, &QSpinBox::valueChanged, q, [this](double value) {
        dispatch(QStringLiteral("minRadiusSpin"), QStringLiteral("change"), value);
    });

    // tiltSensLabel：Label
    auto *w_tiltSensLabel = new QLabel(w_drawSettingsForm);
    w_tiltSensLabel->setProperty("wordWrap", true);
    add(QStringLiteral("tiltSensLabel"), w_tiltSensLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // tiltSensitivitySlider：Slider
    auto *w_tiltSensitivitySlider = new QSlider(w_drawSettingsForm);
    add(QStringLiteral("tiltSensitivitySlider"), w_tiltSensitivitySlider, { { QStringLiteral("min"), "minimum" }, { QStringLiteral("max"), "maximum" }, { QStringLiteral("step"), "singleStep" }, { QStringLiteral("orientation"), "vfOrientation" }, { QStringLiteral("value"), "value" } });
    QObject::connect(w_tiltSensitivitySlider, &QSlider::valueChanged, q, [this](double value) {
        dispatch(QStringLiteral("tiltSensitivitySlider"), QStringLiteral("change"), value);
    });

    // antiAliasLabel：Label
    auto *w_antiAliasLabel = new QLabel(w_drawSettingsForm);
    w_antiAliasLabel->setProperty("wordWrap", true);
    add(QStringLiteral("antiAliasLabel"), w_antiAliasLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // antiAliasCheck：CheckBox
    auto *w_antiAliasCheck = new QCheckBox(w_drawSettingsForm);
    add(QStringLiteral("antiAliasCheck"), w_antiAliasCheck, { { QStringLiteral("text"), "text" }, { QStringLiteral("value"), "checked" } });
    QObject::connect(w_antiAliasCheck, &QCheckBox::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("antiAliasCheck"), QStringLiteral("change"), value);
    });

    // drawDialogSep：Separator
    auto *w_drawDialogSep = new QFrame(w_drawSettingsDialog);
    w_drawDialogSep->setProperty("frameShape", 4);
    w_drawDialogSep->setProperty("frameShadow", 48);
    add(QStringLiteral("drawDialogSep"), w_drawDialogSep, { { QStringLiteral("orientation"), "vfOrientation" } });

    // drawSettingsButtonBox：DialogButtonBox
    auto *w_drawSettingsButtonBox = new QDialogButtonBox(w_drawSettingsDialog);
    add(QStringLiteral("drawSettingsButtonBox"), w_drawSettingsButtonBox, { { QStringLiteral("buttons"), "vfButtons" }, { QStringLiteral("okText"), "vfOkText" }, { QStringLiteral("cancelText"), "vfCancelText" } });
    QObject::connect(w_drawSettingsButtonBox, &QDialogButtonBox::accepted, q, [this]() {
        dispatch(QStringLiteral("drawSettingsButtonBox"), QStringLiteral("accept"));
    });
    QObject::connect(w_drawSettingsButtonBox, &QDialogButtonBox::rejected, q, [this]() {
        dispatch(QStringLiteral("drawSettingsButtonBox"), QStringLiteral("reject"));
    });

    // textureFloatDialog：对话框
    auto *w_textureFloatDialog = new QDialog(&window);
    w_textureFloatDialog->setWindowTitle(QStringLiteral("纹理子视图 (Texture FloatBox)"));
    w_textureFloatDialog->setFixedSize(360, 220);
    w_textureFloatDialog->setModal(false);
    dialogs.append(w_textureFloatDialog);
    add(QStringLiteral("textureFloatDialog"), w_textureFloatDialog);
    QObject::connect(w_textureFloatDialog, &QDialog::finished, q, [this] {
        onDialogFinished(QStringLiteral("textureFloatDialog"));
    });

    // textureFloatInfoLabel：Label
    auto *w_textureFloatInfoLabel = new QLabel(w_textureFloatDialog);
    w_textureFloatInfoLabel->setProperty("wordWrap", true);
    add(QStringLiteral("textureFloatInfoLabel"), w_textureFloatInfoLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // textureFloatActionsRow：容器
    auto *w_textureFloatActionsRow = new QFrame(w_textureFloatDialog);
    w_textureFloatActionsRow->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("textureFloatActionsRow"), w_textureFloatActionsRow);

    // dockTextureToTabBtn：Button
    auto *w_dockTextureToTabBtn = new QPushButton(w_textureFloatActionsRow);
    add(QStringLiteral("dockTextureToTabBtn"), w_dockTextureToTabBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_dockTextureToTabBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("dockTextureToTabBtn"), QStringLiteral("toggle"), value);
    });

    // embedTextureBtn：Button
    auto *w_embedTextureBtn = new QPushButton(w_textureFloatActionsRow);
    add(QStringLiteral("embedTextureBtn"), w_embedTextureBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_embedTextureBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("embedTextureBtn"), QStringLiteral("toggle"), value);
    });

    // closeTextureFloatBtn：Button
    auto *w_closeTextureFloatBtn = new QPushButton(w_textureFloatDialog);
    add(QStringLiteral("closeTextureFloatBtn"), w_closeTextureFloatBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_closeTextureFloatBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("closeTextureFloatBtn"), QStringLiteral("toggle"), value);
    });

    // toolsDock 的排版（flow）
    auto *lay_body_w_toolsDock = new VfFlowLayout(body_w_toolsDock, 12, 4, 12, 4, 4, 4, 62, 1000000, true);
    lay_body_w_toolsDock->addFlowWidget(w_newProjectBtn, 76, 28, 0, 1000000, 0);
    lay_body_w_toolsDock->addFlowWidget(w_toolArrowBtn, 58, 28, 0, 1000000, 0);
    lay_body_w_toolsDock->addFlowWidget(w_toolBrushBtn, 58, 28, 0, 1000000, 0);
    lay_body_w_toolsDock->addFlowWidget(w_toolEraserBtn, 58, 28, 0, 1000000, 0);
    lay_body_w_toolsDock->addFlowWidget(w_toolFillBtn, 58, 28, 0, 1000000, 0);
    lay_body_w_toolsDock->addFlowWidget(w_toolShapeBtn, 58, 28, 0, 1000000, 0);
    lay_body_w_toolsDock->addFlowWidget(w_toolSelectBtn, 58, 28, 0, 1000000, 0);
    lay_body_w_toolsDock->addFlowWidget(w_toolMoveBtn, 58, 28, 0, 1000000, 0);
    lay_body_w_toolsDock->addFlowWidget(w_toolEyedropperBtn, 58, 28, 0, 1000000, 0);
    lay_body_w_toolsDock->addFlowWidget(w_toolHLineBtn, 62, 28, 0, 1000000, 0);
    lay_body_w_toolsDock->addFlowWidget(w_toolVLineBtn, 62, 28, 0, 1000000, 0);
    lay_body_w_toolsDock->addFlowWidget(w_toolMapAreaBtn, 66, 28, 0, 1000000, 0);
    lay_body_w_toolsDock->addFlowWidget(w_toolAddLineBtn, 66, 28, 0, 1000000, 0);
    lay_body_w_toolsDock->addFlowWidget(w_toolAutoMapBtn, 76, 28, 0, 1000000, 0);
    lay_body_w_toolsDock->addFlowWidget(w_toolLockPolicyBtn, 76, 28, 0, 1000000, 0);
    lay_body_w_toolsDock->addFlowWidget(w_toolMoreMenuBtn, 72, 28, 0, 1000000, 0);
    lay_body_w_toolsDock->addFlowWidget(w_forcePadBox, 108, 28, 0, 1000000, 0);

    // layersDock 的排版（vbox）
    auto *lay_body_w_layersDock = new QVBoxLayout(body_w_layersDock);
    lay_body_w_layersDock->setContentsMargins(6, 6, 6, 6);
    lay_body_w_layersDock->setSpacing(4);
    w_layerViewTabBar->setFixedHeight(24);
    w_layerViewTabBar->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_body_w_layersDock->addWidget(w_layerViewTabBar, 0);
    w_layerToolbar->setFixedHeight(24);
    w_layerToolbar->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_body_w_layersDock->addWidget(w_layerToolbar, 0);
    w_layerList->setMinimumHeight(48);
    w_layerList->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_body_w_layersDock->addWidget(w_layerList, 1);
    w_layerVisibilityBar->setFixedHeight(22);
    w_layerVisibilityBar->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_body_w_layersDock->addWidget(w_layerVisibilityBar, 0);
    w_assetsPanelSep->setFixedHeight(4);
    w_assetsPanelSep->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_body_w_layersDock->addWidget(w_assetsPanelSep, 0);
    w_assetsHeaderBar->setFixedHeight(22);
    w_assetsHeaderBar->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_body_w_layersDock->addWidget(w_assetsHeaderBar, 0);
    w_assetList->setFixedHeight(72);
    w_assetList->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_body_w_layersDock->addWidget(w_assetList, 0);
    w_assetNoteInput->setFixedHeight(36);
    w_assetNoteInput->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_body_w_layersDock->addWidget(w_assetNoteInput, 0);

    // layerToolbar 的排版（hbox）
    auto *lay_w_layerToolbar = new QHBoxLayout(w_layerToolbar);
    lay_w_layerToolbar->setContentsMargins(0, 0, 0, 0);
    lay_w_layerToolbar->setSpacing(3);
    w_addLayerBtn->setMinimumHeight(0);
    w_addLayerBtn->setFixedWidth(35);
    w_addLayerBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_layerToolbar->addWidget(w_addLayerBtn, 0);
    w_addGroupBtn->setMinimumHeight(0);
    w_addGroupBtn->setFixedWidth(35);
    w_addGroupBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_layerToolbar->addWidget(w_addGroupBtn, 0);
    w_removeLayerBtn->setMinimumHeight(0);
    w_removeLayerBtn->setFixedWidth(35);
    w_removeLayerBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_layerToolbar->addWidget(w_removeLayerBtn, 0);
    w_moveLayerUpBtn->setMinimumHeight(0);
    w_moveLayerUpBtn->setFixedWidth(35);
    w_moveLayerUpBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_layerToolbar->addWidget(w_moveLayerUpBtn, 0);
    w_moveLayerDownBtn->setMinimumHeight(0);
    w_moveLayerDownBtn->setFixedWidth(35);
    w_moveLayerDownBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_layerToolbar->addWidget(w_moveLayerDownBtn, 0);
    w_unselectLayerBtn->setMinimumHeight(0);
    w_unselectLayerBtn->setFixedWidth(34);
    w_unselectLayerBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_layerToolbar->addWidget(w_unselectLayerBtn, 0);
    lay_w_layerToolbar->addStretch(1);

    // layerVisibilityBar 的排版（hbox）
    auto *lay_w_layerVisibilityBar = new QHBoxLayout(w_layerVisibilityBar);
    lay_w_layerVisibilityBar->setContentsMargins(0, 0, 0, 0);
    lay_w_layerVisibilityBar->setSpacing(4);
    w_layerVisibleLabel->setMinimumHeight(0);
    w_layerVisibleLabel->setMinimumWidth(0);
    w_layerVisibleLabel->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_layerVisibilityBar->addWidget(w_layerVisibleLabel, 1);
    w_toggleVisibleBtn->setMinimumHeight(0);
    w_toggleVisibleBtn->setFixedWidth(90);
    w_toggleVisibleBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_layerVisibilityBar->addWidget(w_toggleVisibleBtn, 0);

    // assetsHeaderBar 的排版（hbox）
    auto *lay_w_assetsHeaderBar = new QHBoxLayout(w_assetsHeaderBar);
    lay_w_assetsHeaderBar->setContentsMargins(0, 0, 0, 0);
    lay_w_assetsHeaderBar->setSpacing(3);
    w_assetsTitleLabel->setMinimumHeight(0);
    w_assetsTitleLabel->setMinimumWidth(0);
    w_assetsTitleLabel->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_assetsHeaderBar->addWidget(w_assetsTitleLabel, 1);
    w_addAssetBtn->setMinimumHeight(0);
    w_addAssetBtn->setFixedWidth(40);
    w_addAssetBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_assetsHeaderBar->addWidget(w_addAssetBtn, 0);
    w_assetToLayerBtn->setMinimumHeight(0);
    w_assetToLayerBtn->setFixedWidth(44);
    w_assetToLayerBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_assetsHeaderBar->addWidget(w_assetToLayerBtn, 0);
    w_removeAssetBtn->setMinimumHeight(0);
    w_removeAssetBtn->setFixedWidth(40);
    w_removeAssetBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_assetsHeaderBar->addWidget(w_removeAssetBtn, 0);
    w_unselectAssetBtn->setMinimumHeight(0);
    w_unselectAssetBtn->setFixedWidth(32);
    w_unselectAssetBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_assetsHeaderBar->addWidget(w_unselectAssetBtn, 0);

    // centralArea 的排版（vbox）
    auto *lay_w_centralArea = new QVBoxLayout(w_centralArea);
    lay_w_centralArea->setContentsMargins(6, 6, 6, 6);
    lay_w_centralArea->setSpacing(4);
    w_canvasHeader->setFixedHeight(28);
    w_canvasHeader->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_centralArea->addWidget(w_canvasHeader, 0);
    w_textureSubBar->setFixedHeight(24);
    w_textureSubBar->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_centralArea->addWidget(w_textureSubBar, 0);
    w_canvasHost->setMinimumHeight(80);
    w_canvasHost->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_centralArea->addWidget(w_canvasHost, 1);

    // canvasHeader 的排版（hbox）
    auto *lay_w_canvasHeader = new QHBoxLayout(w_canvasHeader);
    lay_w_canvasHeader->setContentsMargins(0, 0, 0, 0);
    lay_w_canvasHeader->setSpacing(4);
    w_workspaceTabBar->setMinimumHeight(0);
    w_workspaceTabBar->setFixedWidth(124);
    w_workspaceTabBar->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_canvasHeader->addWidget(w_workspaceTabBar, 0);
    w_canvasTitleLabel->setMinimumHeight(0);
    w_canvasTitleLabel->setMinimumWidth(24);
    w_canvasTitleLabel->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_canvasHeader->addWidget(w_canvasTitleLabel, 1);
    w_zoomSlider->setMinimumHeight(0);
    w_zoomSlider->setFixedWidth(52);
    w_zoomSlider->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_canvasHeader->addWidget(w_zoomSlider, 0);
    w_activeToolLabel->setMinimumHeight(0);
    w_activeToolLabel->setFixedWidth(72);
    w_activeToolLabel->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_canvasHeader->addWidget(w_activeToolLabel, 0);

    // textureSubBar 的排版（hbox）
    auto *lay_w_textureSubBar = new QHBoxLayout(w_textureSubBar);
    lay_w_textureSubBar->setContentsMargins(0, 0, 0, 0);
    lay_w_textureSubBar->setSpacing(4);
    w_textureHostLabel->setMinimumHeight(0);
    w_textureHostLabel->setMinimumWidth(40);
    w_textureHostLabel->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_textureSubBar->addWidget(w_textureHostLabel, 1);
    w_followTimelineCheck->setMinimumHeight(0);
    w_followTimelineCheck->setFixedWidth(68);
    w_followTimelineCheck->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_textureSubBar->addWidget(w_followTimelineCheck, 0);
    w_followTextureCheck->setMinimumHeight(0);
    w_followTextureCheck->setFixedWidth(68);
    w_followTextureCheck->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_textureSubBar->addWidget(w_followTextureCheck, 0);
    w_floatTextureBtn->setMinimumHeight(0);
    w_floatTextureBtn->setFixedWidth(64);
    w_floatTextureBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_textureSubBar->addWidget(w_floatTextureBtn, 0);

    // inspectorDock 的排版（vbox）
    auto *lay_body_w_inspectorDock = new QVBoxLayout(body_w_inspectorDock);
    lay_body_w_inspectorDock->setContentsMargins(4, 4, 4, 4);
    lay_body_w_inspectorDock->setSpacing(2);
    w_toolOptHeader->setFixedHeight(16);
    w_toolOptHeader->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_body_w_inspectorDock->addWidget(w_toolOptHeader, 0);
    w_toolOptionsForm->setFixedHeight(82);
    w_toolOptionsForm->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_body_w_inspectorDock->addWidget(w_toolOptionsForm, 0);
    w_inspectorSep1->setFixedHeight(2);
    w_inspectorSep1->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_body_w_inspectorDock->addWidget(w_inspectorSep1, 0);
    w_inspectorTabs->setFixedHeight(22);
    w_inspectorTabs->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_body_w_inspectorDock->addWidget(w_inspectorTabs, 0);
    w_inspectorStack->setMinimumHeight(86);
    w_inspectorStack->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_body_w_inspectorDock->addWidget(w_inspectorStack, 2);
    w_colorPanelToggleBtn->setFixedHeight(22);
    w_colorPanelToggleBtn->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_body_w_inspectorDock->addWidget(w_colorPanelToggleBtn, 0);
    w_colorPanel->setMinimumHeight(42);
    w_colorPanel->setMaximumHeight(96);
    w_colorPanel->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_body_w_inspectorDock->addWidget(w_colorPanel, 1);

    // inspectorTabs 的排版（grid）
    auto *lay_w_inspectorTabs = new QGridLayout(w_inspectorTabs);
    lay_w_inspectorTabs->setContentsMargins(0, 0, 0, 0);
    lay_w_inspectorTabs->setHorizontalSpacing(4);
    lay_w_inspectorTabs->setVerticalSpacing(4);
    lay_w_inspectorTabs->setColumnStretch(0, 1);
    lay_w_inspectorTabs->setColumnStretch(1, 1);
    lay_w_inspectorTabs->setColumnStretch(2, 1);
    lay_w_inspectorTabs->setRowStretch(0, 0);
    lay_w_inspectorTabs->setRowMinimumHeight(0, 22);
    lay_w_inspectorTabs->setRowStretch(1, 1);
    w_tabPropsBtn->setFixedHeight(22);
    w_tabPropsBtn->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_inspectorTabs->addWidget(w_tabPropsBtn, 0, 0, 1, 1);
    w_tabHistoryBtn->setFixedHeight(22);
    w_tabHistoryBtn->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_inspectorTabs->addWidget(w_tabHistoryBtn, 0, 1, 1, 1);
    w_tabExportBtn->setFixedHeight(22);
    w_tabExportBtn->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_inspectorTabs->addWidget(w_tabExportBtn, 0, 2, 1, 1);

    // inspectorStack 的排版（stack）
    auto *lay_w_inspectorStack = new QVBoxLayout(w_inspectorStack);
    lay_w_inspectorStack->setContentsMargins(0, 0, 0, 0);
    lay_w_inspectorStack->setSpacing(0);
    w_layerPropsPage->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_inspectorStack->addWidget(w_layerPropsPage, 1);
    w_exportPage->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_inspectorStack->addWidget(w_exportPage, 1);
    w_historyPage->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_inspectorStack->addWidget(w_historyPage, 1);

    // layerPropsPage 的排版（form）
    auto *lay_w_layerPropsPage = new QGridLayout(w_layerPropsPage);
    lay_w_layerPropsPage->setContentsMargins(0, 0, 0, 0);
    lay_w_layerPropsPage->setHorizontalSpacing(1);
    lay_w_layerPropsPage->setVerticalSpacing(1);
    lay_w_layerPropsPage->setColumnMinimumWidth(0, 68);
    lay_w_layerPropsPage->setColumnStretch(0, 0);
    lay_w_layerPropsPage->setColumnStretch(1, 1);
    w_blendLabel->setFixedSize(68, 28);
    lay_w_layerPropsPage->addWidget(w_blendLabel, 0, 0);
    w_blendCombo->setFixedHeight(28);
    w_blendCombo->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_layerPropsPage->addWidget(w_blendCombo, 0, 1);
    w_opacityLabel->setFixedSize(68, 28);
    lay_w_layerPropsPage->addWidget(w_opacityLabel, 1, 0);
    w_opacitySpin->setFixedHeight(28);
    w_opacitySpin->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_layerPropsPage->addWidget(w_opacitySpin, 1, 1);
    w_lockLabel->setFixedSize(68, 28);
    lay_w_layerPropsPage->addWidget(w_lockLabel, 2, 0);
    w_lockLayerCheck->setFixedHeight(28);
    w_lockLayerCheck->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_layerPropsPage->addWidget(w_lockLayerCheck, 2, 1);
    lay_w_layerPropsPage->setRowStretch(3, 1);

    // exportPage 的排版（vbox）
    auto *lay_w_exportPage = new QVBoxLayout(w_exportPage);
    lay_w_exportPage->setContentsMargins(0, 0, 0, 0);
    lay_w_exportPage->setSpacing(2);
    w_exportHintLabel->setFixedHeight(18);
    w_exportHintLabel->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_exportPage->addWidget(w_exportHintLabel, 0);
    w_exportBtn->setFixedHeight(22);
    w_exportBtn->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_exportPage->addWidget(w_exportBtn, 0);
    w_exportResultLabel->setFixedHeight(18);
    w_exportResultLabel->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_exportPage->addWidget(w_exportResultLabel, 0);
    lay_w_exportPage->addStretch(1);

    // historyPage 的排版（vbox）
    auto *lay_w_historyPage = new QVBoxLayout(w_historyPage);
    lay_w_historyPage->setContentsMargins(0, 0, 0, 0);
    lay_w_historyPage->setSpacing(2);
    w_historyToolbar->setFixedHeight(22);
    w_historyToolbar->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_historyPage->addWidget(w_historyToolbar, 0);
    w_historyList->setMinimumHeight(38);
    w_historyList->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_historyPage->addWidget(w_historyList, 1);

    // historyToolbar 的排版（hbox）
    auto *lay_w_historyToolbar = new QHBoxLayout(w_historyToolbar);
    lay_w_historyToolbar->setContentsMargins(0, 0, 0, 0);
    lay_w_historyToolbar->setSpacing(4);
    w_undoBtn->setMinimumHeight(0);
    w_undoBtn->setFixedWidth(82);
    w_undoBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_historyToolbar->addWidget(w_undoBtn, 0);
    w_redoBtn->setMinimumHeight(0);
    w_redoBtn->setFixedWidth(82);
    w_redoBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_historyToolbar->addWidget(w_redoBtn, 0);
    w_clearHistoryBtn->setMinimumHeight(0);
    w_clearHistoryBtn->setFixedWidth(84);
    w_clearHistoryBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_historyToolbar->addWidget(w_clearHistoryBtn, 0);
    lay_w_historyToolbar->addStretch(1);

    // colorPanel 的排版（vbox）
    auto *lay_w_colorPanel = new QVBoxLayout(w_colorPanel);
    lay_w_colorPanel->setContentsMargins(2, 2, 2, 2);
    lay_w_colorPanel->setSpacing(2);
    w_colorPickerCanvas->setMinimumHeight(24);
    w_colorPickerCanvas->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_colorPanel->addWidget(w_colorPickerCanvas, 1);
    w_colorHexLabel->setFixedHeight(12);
    w_colorHexLabel->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_colorPanel->addWidget(w_colorHexLabel, 0);

    // timelineDock 的排版（vbox）
    auto *lay_body_w_timelineDock = new QVBoxLayout(body_w_timelineDock);
    lay_body_w_timelineDock->setContentsMargins(12, 6, 12, 6);
    lay_body_w_timelineDock->setSpacing(6);
    w_timelineTransportFlow->setSizePolicy(QSizePolicy::Expanding, QSizePolicy::Preferred);
    lay_body_w_timelineDock->addWidget(w_timelineTransportFlow, 0);
    w_timelineTrackRow->setFixedHeight(26);
    w_timelineTrackRow->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_body_w_timelineDock->addWidget(w_timelineTrackRow, 0);
    lay_body_w_timelineDock->addStretch(1);

    // timelineTransportFlow 的排版（flow）
    auto *lay_w_timelineTransportFlow = new VfFlowLayout(w_timelineTransportFlow, 0, 0, 0, 0, 6, 4, 0, 1000000, true);
    lay_w_timelineTransportFlow->addFlowWidget(w_playToggleBtn, 68, 28, 0, 1000000, 0);
    lay_w_timelineTransportFlow->addFlowWidget(w_prevFrameBtn, 58, 28, 0, 1000000, 0);
    lay_w_timelineTransportFlow->addFlowWidget(w_nextFrameBtn, 58, 28, 0, 1000000, 0);
    lay_w_timelineTransportFlow->addFlowWidget(w_addFrameBtn, 68, 28, 0, 1000000, 0);
    lay_w_timelineTransportFlow->addFlowWidget(w_addHoldFrameBtn, 68, 28, 0, 1000000, 0);
    lay_w_timelineTransportFlow->addFlowWidget(w_duplicateFrameBtn, 60, 28, 0, 1000000, 0);
    lay_w_timelineTransportFlow->addFlowWidget(w_moveFrameBackBtn, 60, 28, 0, 1000000, 0);
    lay_w_timelineTransportFlow->addFlowWidget(w_removeFrameBtn, 62, 28, 0, 1000000, 0);
    lay_w_timelineTransportFlow->addFlowWidget(w_loopToggleBtn, 62, 28, 0, 1000000, 0);
    lay_w_timelineTransportFlow->addFlowWidget(w_onionToggleBtn, 62, 28, 0, 1000000, 0);
    lay_w_timelineTransportFlow->addFlowWidget(w_onionLinesCheck, 52, 28, 0, 1000000, 0);
    lay_w_timelineTransportFlow->addFlowWidget(w_onionFillsCheck, 52, 28, 0, 1000000, 0);
    lay_w_timelineTransportFlow->addFlowWidget(w_onionAmCheck, 52, 28, 0, 1000000, 0);
    lay_w_timelineTransportFlow->addFlowWidget(w_onionGuideCheck, 52, 28, 0, 1000000, 0);
    lay_w_timelineTransportFlow->addFlowWidget(w_fpsSelectCombo, 82, 28, 0, 1000000, 0);
    lay_w_timelineTransportFlow->addFlowWidget(w_frameSlider, 112, 28, 0, 1000000, 0);
    lay_w_timelineTransportFlow->addFlowWidget(w_frameInfoLabel, 116, 28, 0, 1000000, 0);

    // timelineTrackRow 的排版（hbox）
    auto *lay_w_timelineTrackRow = new QHBoxLayout(w_timelineTrackRow);
    lay_w_timelineTrackRow->setContentsMargins(0, 0, 0, 0);
    lay_w_timelineTrackRow->setSpacing(8);
    w_timelineTrackLabel->setMinimumHeight(0);
    w_timelineTrackLabel->setFixedWidth(110);
    w_timelineTrackLabel->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_timelineTrackRow->addWidget(w_timelineTrackLabel, 0);
    w_timelineScrollBar->setMinimumHeight(0);
    w_timelineScrollBar->setMinimumWidth(0);
    w_timelineScrollBar->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_timelineTrackRow->addWidget(w_timelineScrollBar, 1);
    w_timelineOffsetLabel->setMinimumHeight(0);
    w_timelineOffsetLabel->setFixedWidth(120);
    w_timelineOffsetLabel->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_timelineTrackRow->addWidget(w_timelineOffsetLabel, 0);

    // statusBar 的排版（hbox）
    auto *lay_w_statusBar = new QHBoxLayout(w_statusBar);
    lay_w_statusBar->setContentsMargins(12, 0, 12, 0);
    lay_w_statusBar->setSpacing(12);
    w_statusTextLabel->setMinimumHeight(0);
    w_statusTextLabel->setMinimumWidth(0);
    w_statusTextLabel->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_statusBar->addWidget(w_statusTextLabel, 1);
    w_projectSummaryLabel->setMinimumHeight(0);
    w_projectSummaryLabel->setFixedWidth(180);
    w_projectSummaryLabel->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_statusBar->addWidget(w_projectSummaryLabel, 0);
    w_statusClockLabel->setMinimumHeight(0);
    w_statusClockLabel->setFixedWidth(120);
    w_statusClockLabel->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_statusBar->addWidget(w_statusClockLabel, 0);
    w_statusLayerCountLabel->setMinimumHeight(0);
    w_statusLayerCountLabel->setFixedWidth(100);
    w_statusLayerCountLabel->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_statusBar->addWidget(w_statusLayerCountLabel, 0);

    // newProjectDialog 的排版（vbox）
    auto *lay_w_newProjectDialog = new QVBoxLayout(w_newProjectDialog);
    lay_w_newProjectDialog->setContentsMargins(16, 16, 16, 16);
    lay_w_newProjectDialog->setSpacing(12);
    w_newProjectForm->setMinimumHeight(0);
    w_newProjectForm->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_newProjectDialog->addWidget(w_newProjectForm, 1);
    w_dialogSep->setFixedHeight(6);
    w_dialogSep->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_newProjectDialog->addWidget(w_dialogSep, 0);
    w_dialogFooter->setFixedHeight(34);
    w_dialogFooter->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_newProjectDialog->addWidget(w_dialogFooter, 0);

    // newProjectForm 的排版（form）
    auto *lay_w_newProjectForm = new QGridLayout(w_newProjectForm);
    lay_w_newProjectForm->setContentsMargins(0, 0, 0, 0);
    lay_w_newProjectForm->setHorizontalSpacing(8);
    lay_w_newProjectForm->setVerticalSpacing(8);
    lay_w_newProjectForm->setColumnMinimumWidth(0, 88);
    lay_w_newProjectForm->setColumnStretch(0, 0);
    lay_w_newProjectForm->setColumnStretch(1, 1);
    w_nameFormLabel->setFixedSize(88, 30);
    lay_w_newProjectForm->addWidget(w_nameFormLabel, 0, 0);
    w_projectNameInput->setFixedHeight(30);
    w_projectNameInput->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_newProjectForm->addWidget(w_projectNameInput, 0, 1);
    w_presetFormLabel->setFixedSize(88, 30);
    lay_w_newProjectForm->addWidget(w_presetFormLabel, 1, 0);
    w_presetCombo->setFixedHeight(30);
    w_presetCombo->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_newProjectForm->addWidget(w_presetCombo, 1, 1);
    w_widthFormLabel->setFixedSize(88, 30);
    lay_w_newProjectForm->addWidget(w_widthFormLabel, 2, 0);
    w_widthSpin->setFixedHeight(30);
    w_widthSpin->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_newProjectForm->addWidget(w_widthSpin, 2, 1);
    w_heightFormLabel->setFixedSize(88, 30);
    lay_w_newProjectForm->addWidget(w_heightFormLabel, 3, 0);
    w_heightSpin->setFixedHeight(30);
    w_heightSpin->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_newProjectForm->addWidget(w_heightSpin, 3, 1);
    w_transparentFormLabel->setFixedSize(88, 30);
    lay_w_newProjectForm->addWidget(w_transparentFormLabel, 4, 0);
    w_transparentCheck->setFixedHeight(30);
    w_transparentCheck->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_newProjectForm->addWidget(w_transparentCheck, 4, 1);
    lay_w_newProjectForm->setRowStretch(5, 1);

    // dialogFooter 的排版（hbox）
    auto *lay_w_dialogFooter = new QHBoxLayout(w_dialogFooter);
    lay_w_dialogFooter->setContentsMargins(0, 0, 0, 0);
    lay_w_dialogFooter->setSpacing(8);
    w_dialogSpacerLabel->setMinimumHeight(0);
    w_dialogSpacerLabel->setMinimumWidth(0);
    w_dialogSpacerLabel->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_dialogFooter->addWidget(w_dialogSpacerLabel, 1);
    w_cancelNewProjectBtn->setMinimumHeight(0);
    w_cancelNewProjectBtn->setFixedWidth(92);
    w_cancelNewProjectBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_dialogFooter->addWidget(w_cancelNewProjectBtn, 0);
    w_confirmNewProjectBtn->setMinimumHeight(0);
    w_confirmNewProjectBtn->setFixedWidth(92);
    w_confirmNewProjectBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_dialogFooter->addWidget(w_confirmNewProjectBtn, 0);

    // drawSettingsDialog 的排版（vbox）
    auto *lay_w_drawSettingsDialog = new QVBoxLayout(w_drawSettingsDialog);
    lay_w_drawSettingsDialog->setContentsMargins(16, 16, 16, 16);
    lay_w_drawSettingsDialog->setSpacing(10);
    w_drawSettingsForm->setMinimumHeight(0);
    w_drawSettingsForm->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_drawSettingsDialog->addWidget(w_drawSettingsForm, 1);
    w_drawDialogSep->setFixedHeight(6);
    w_drawDialogSep->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_drawSettingsDialog->addWidget(w_drawDialogSep, 0);
    w_drawSettingsButtonBox->setFixedHeight(34);
    w_drawSettingsButtonBox->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_drawSettingsDialog->addWidget(w_drawSettingsButtonBox, 0);

    // drawSettingsForm 的排版（form）
    auto *lay_w_drawSettingsForm = new QGridLayout(w_drawSettingsForm);
    lay_w_drawSettingsForm->setContentsMargins(0, 0, 0, 0);
    lay_w_drawSettingsForm->setHorizontalSpacing(8);
    lay_w_drawSettingsForm->setVerticalSpacing(8);
    lay_w_drawSettingsForm->setColumnMinimumWidth(0, 88);
    lay_w_drawSettingsForm->setColumnStretch(0, 0);
    lay_w_drawSettingsForm->setColumnStretch(1, 1);
    w_pressureCurveLabel->setFixedSize(88, 30);
    lay_w_drawSettingsForm->addWidget(w_pressureCurveLabel, 0, 0);
    w_pressureCurveCombo->setFixedHeight(30);
    w_pressureCurveCombo->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_drawSettingsForm->addWidget(w_pressureCurveCombo, 0, 1);
    w_minRadiusLabel->setFixedSize(88, 30);
    lay_w_drawSettingsForm->addWidget(w_minRadiusLabel, 1, 0);
    w_minRadiusSpin->setFixedHeight(30);
    w_minRadiusSpin->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_drawSettingsForm->addWidget(w_minRadiusSpin, 1, 1);
    w_tiltSensLabel->setFixedSize(88, 30);
    lay_w_drawSettingsForm->addWidget(w_tiltSensLabel, 2, 0);
    w_tiltSensitivitySlider->setFixedHeight(30);
    w_tiltSensitivitySlider->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_drawSettingsForm->addWidget(w_tiltSensitivitySlider, 2, 1);
    w_antiAliasLabel->setFixedSize(88, 30);
    lay_w_drawSettingsForm->addWidget(w_antiAliasLabel, 3, 0);
    w_antiAliasCheck->setFixedHeight(30);
    w_antiAliasCheck->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_drawSettingsForm->addWidget(w_antiAliasCheck, 3, 1);
    lay_w_drawSettingsForm->setRowStretch(4, 1);

    // textureFloatDialog 的排版（vbox）
    auto *lay_w_textureFloatDialog = new QVBoxLayout(w_textureFloatDialog);
    lay_w_textureFloatDialog->setContentsMargins(14, 14, 14, 14);
    lay_w_textureFloatDialog->setSpacing(10);
    w_textureFloatInfoLabel->setMinimumHeight(0);
    w_textureFloatInfoLabel->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_textureFloatDialog->addWidget(w_textureFloatInfoLabel, 1);
    w_textureFloatActionsRow->setFixedHeight(32);
    w_textureFloatActionsRow->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_textureFloatDialog->addWidget(w_textureFloatActionsRow, 0);
    w_closeTextureFloatBtn->setFixedHeight(30);
    w_closeTextureFloatBtn->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_textureFloatDialog->addWidget(w_closeTextureFloatBtn, 0);

    // textureFloatActionsRow 的排版（hbox）
    auto *lay_w_textureFloatActionsRow = new QHBoxLayout(w_textureFloatActionsRow);
    lay_w_textureFloatActionsRow->setContentsMargins(0, 0, 0, 0);
    lay_w_textureFloatActionsRow->setSpacing(8);
    w_dockTextureToTabBtn->setMinimumHeight(0);
    w_dockTextureToTabBtn->setFixedWidth(162);
    w_dockTextureToTabBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_textureFloatActionsRow->addWidget(w_dockTextureToTabBtn, 0);
    w_embedTextureBtn->setMinimumHeight(0);
    w_embedTextureBtn->setFixedWidth(162);
    w_embedTextureBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_textureFloatActionsRow->addWidget(w_embedTextureBtn, 0);
    lay_w_textureFloatActionsRow->addStretch(1);
}

// 交给业务的事件：业务连接了对应的信号，就发信号并返回 true；没有连接，返回 false，由调用方执行模拟步骤。
bool Ui::Private::raiseBusinessEvent(const QString &name, const QJSValue &args)
{
    if (name == QLatin1String("layerToggleVisible")) {
        static const QMetaMethod signal = QMetaMethod::fromSignal(&BusinessInterface::layerToggleVisibleRequested);
        if (!q->isSignalConnected(signal))
            return false;
        emit q->layerToggleVisibleRequested();
        return true;
    }
    if (name == QLatin1String("exportClip")) {
        static const QMetaMethod signal = QMetaMethod::fromSignal(&BusinessInterface::actionExportClipRequested);
        if (!q->isSignalConnected(signal))
            return false;
        emit q->actionExportClipRequested(args.toVariant().toMap());
        return true;
    }
    return false;
}

// 显示隐藏的过渡：有人提供了实现，就让它创建动画并返回；没有就返回空，由调用方直接切到结束状态。
QAbstractAnimation *Ui::Private::createVisibility(int effect, QWidget *target, bool showing)
{
    switch (effect) {
    case 1: // PanelExpand
        if (auto *implementation = effects.panelExpand())
            return implementation->createTransition(target, showing);
        break;
    default:
        break;
    }
    return nullptr;
}

// 控件自绘效果：有人提供了实现，就调用它的 paint 并返回 true；没有就返回 false，由调用方显示占位框。
bool Ui::Private::paintCustomEffect(int effect, QPainter *painter, const QRect &rect, const QVariantMap &props)
{
    switch (effect) {
    case 0: // ColorPickerDraw
        if (auto *implementation = effects.colorPickerDraw()) {
            implementation->paint(painter, rect, props);
            return true;
        }
        break;
    default:
        break;
    }
    return false;
}

// 业务接口的实现
void Ui::setLayerVisible(bool value)
{
    d->setBusinessState(QStringLiteral("layer.visible"), value);
}

bool Ui::layerVisible() const
{
    return d->call("getState", { QStringLiteral("layer.visible") }).toBool();
}

void Ui::requestNotifyStatus(const QString &message)
{
    QJSValue args = d->engine.newObject();
    args.setProperty(QStringLiteral("message"), message);
    d->requestEvent(QStringLiteral("notifyStatus"), args);
}

void Ui::finishExportClipSuccess(const QVariantMap &result)
{
    d->drain(d->call("finishActionSuccess", { QStringLiteral("exportClip"), d->engine.toScriptValue(result) }));
}

void Ui::finishExportClipError(const QString &message)
{
    d->drain(d->call("finishActionError", { QStringLiteral("exportClip"), message }));
}

void Ui::setCanvasHostWidget(QWidget *widget)
{
    d->setExternal(QStringLiteral("canvasHost"), widget);
}

} // namespace vf
