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
#include <QMap>
#include <QMargins>
#include <QMenu>
#include <QMenuBar>
#include <QMetaMethod>
#include <QMouseEvent>
#include <QPainter>
#include <QPen>
#include <QPointer>
#include <QSignalBlocker>
#include <QStatusBar>
#include <QSvgRenderer>
#include <QTimer>
#include <QVBoxLayout>
#include <QVariant>
#include <QVariantAnimation>
#include <functional>
//@VF:includes@

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
        int hit = d->controlAt(mouse->globalPosition().toPoint());
        if (hit < 0 && d->controls.at(index).widget->findChildren<QWidget *>().isEmpty())
            hit = index;
        // 没被里面的控件处理的事件会再传给外层，外层在这里认出“不是点在我自己身上”，不重复处理
        if (mouse->button() != Qt::LeftButton || hit != index)
            break;
        d->pressed = index;
        d->doubleClick = event->type() == QEvent::MouseButtonDblClick;
        if (index > 0)
            d->dispatch(id, QStringLiteral("mousedown"));
        break;
    }
    case QEvent::MouseButtonRelease: {
        auto *mouse = static_cast<QMouseEvent *>(event);
        if (mouse->button() != Qt::LeftButton || d->pressed != index)
            break;
        const bool insideWidget = d->controls.at(index).widget->rect().contains(mouse->position().toPoint());
        int target = insideWidget ? d->controlAt(mouse->globalPosition().toPoint()) : -1;
        if (target < 0 && insideWidget && d->controls.at(index).widget->findChildren<QWidget *>().isEmpty())
            target = index;
        const bool doubleClick = d->doubleClick;
        d->pressed = -1;
        d->doubleClick = false;
        if (target > 0)
            d->dispatch(d->controls.at(target).id, QStringLiteral("mouseup"));
        else if (index > 0)
            d->dispatch(id, QStringLiteral("mouseup"));
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
        QWidget *widget = dlg->childAt(local);
        if (!widget)
            widget = dlg;
        while (widget) {
            const int index = byWidget.value(widget, -1);
            if (index >= 0)
                return index;
            widget = widget->parentWidget();
        }
    }
    QWidget *widget = window.childAt(window.mapFromGlobal(globalPos));
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
    }
    QApplication::sendPostedEvents(nullptr, QEvent::LayoutRequest);
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

//@VF:generated@

} // namespace vf
