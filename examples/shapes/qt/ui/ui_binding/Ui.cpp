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
