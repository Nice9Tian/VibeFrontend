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
#include <QCheckBox>
#include <QGridLayout>
#include <QHBoxLayout>
#include <QLineEdit>
#include <QPushButton>
#include <QSizePolicy>
#include <QSpinBox>

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
        if (mouse->button() != Qt::LeftButton || d->controlAt(mouse->globalPosition().toPoint()) != index)
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
    addMenuAction(QStringLiteral("menuNewProject"), act_menuNewProject);
    auto *menu_viewMenu = menuBar->addMenu(QStringLiteral("视图"));
    auto *act_menuToggleTools = menu_viewMenu->addAction(QStringLiteral("工具栏"));
    act_menuToggleTools->setCheckable(true);
    act_menuToggleTools->setChecked(true);
    addMenuAction(QStringLiteral("menuToggleTools"), act_menuToggleTools);
    auto *act_menuToggleLayers = menu_viewMenu->addAction(QStringLiteral("图层面板"));
    act_menuToggleLayers->setCheckable(true);
    act_menuToggleLayers->setChecked(true);
    addMenuAction(QStringLiteral("menuToggleLayers"), act_menuToggleLayers);
    auto *act_menuToggleInspector = menu_viewMenu->addAction(QStringLiteral("检查器面板"));
    act_menuToggleInspector->setCheckable(true);
    act_menuToggleInspector->setChecked(true);
    addMenuAction(QStringLiteral("menuToggleInspector"), act_menuToggleInspector);
    auto *act_menuToggleTimeline = menu_viewMenu->addAction(QStringLiteral("时间轴面板"));
    act_menuToggleTimeline->setCheckable(true);
    act_menuToggleTimeline->setChecked(true);
    addMenuAction(QStringLiteral("menuToggleTimeline"), act_menuToggleTimeline);

    // toolsDock：停靠面板（top）
    auto *w_toolsDock = new QDockWidget(QStringLiteral("工具栏"), &window);
    w_toolsDock->setFeatures(QDockWidget::NoDockWidgetFeatures);
    w_toolsDock->setStyleSheet(QStringLiteral("QDockWidget { border: none; }"));
    auto *hdr_w_toolsDock = new QLabel(QStringLiteral("工具栏"), w_toolsDock);
    hdr_w_toolsDock->setFixedHeight(26);
    w_toolsDock->setTitleBarWidget(hdr_w_toolsDock);
    auto *body_w_toolsDock = new QWidget(w_toolsDock);
    w_toolsDock->setWidget(body_w_toolsDock);
    w_toolsDock->setFixedHeight(68);
    window.addDockWidget(Qt::TopDockWidgetArea, w_toolsDock);
    add(QStringLiteral("toolsDock"), w_toolsDock, { { QStringLiteral("title"), "windowTitle" } });

    // newProjectBtn：Button
    auto *w_newProjectBtn = new QPushButton(body_w_toolsDock);
    add(QStringLiteral("newProjectBtn"), w_newProjectBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_newProjectBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("newProjectBtn"), QStringLiteral("toggle"), value);
    });

    // toolbarSep1：Separator
    auto *w_toolbarSep1 = new QFrame(body_w_toolsDock);
    w_toolbarSep1->setProperty("frameShape", 4);
    w_toolbarSep1->setProperty("frameShadow", 48);
    add(QStringLiteral("toolbarSep1"), w_toolbarSep1, { { QStringLiteral("orientation"), "vfOrientation" } });

    // toolBrushBtn：Button
    auto *w_toolBrushBtn = new QPushButton(body_w_toolsDock);
    add(QStringLiteral("toolBrushBtn"), w_toolBrushBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_toolBrushBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("toolBrushBtn"), QStringLiteral("toggle"), value);
    });

    // toolEraserBtn：Button
    auto *w_toolEraserBtn = new QPushButton(body_w_toolsDock);
    add(QStringLiteral("toolEraserBtn"), w_toolEraserBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_toolEraserBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("toolEraserBtn"), QStringLiteral("toggle"), value);
    });

    // toolFillBtn：Button
    auto *w_toolFillBtn = new QPushButton(body_w_toolsDock);
    add(QStringLiteral("toolFillBtn"), w_toolFillBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_toolFillBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("toolFillBtn"), QStringLiteral("toggle"), value);
    });

    // toolbarSep2：Separator
    auto *w_toolbarSep2 = new QFrame(body_w_toolsDock);
    w_toolbarSep2->setProperty("frameShape", 4);
    w_toolbarSep2->setProperty("frameShadow", 48);
    add(QStringLiteral("toolbarSep2"), w_toolbarSep2, { { QStringLiteral("orientation"), "vfOrientation" } });

    // projectSummaryLabel：Label
    auto *w_projectSummaryLabel = new QLabel(body_w_toolsDock);
    w_projectSummaryLabel->setProperty("wordWrap", true);
    add(QStringLiteral("projectSummaryLabel"), w_projectSummaryLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // layersDock：停靠面板（left）
    auto *w_layersDock = new QDockWidget(QStringLiteral("图层"), &window);
    w_layersDock->setFeatures(QDockWidget::NoDockWidgetFeatures);
    w_layersDock->setStyleSheet(QStringLiteral("QDockWidget { border: none; }"));
    auto *hdr_w_layersDock = new QLabel(QStringLiteral("图层"), w_layersDock);
    hdr_w_layersDock->setFixedHeight(26);
    w_layersDock->setTitleBarWidget(hdr_w_layersDock);
    auto *body_w_layersDock = new QWidget(w_layersDock);
    w_layersDock->setWidget(body_w_layersDock);
    w_layersDock->setFixedWidth(240);
    window.addDockWidget(Qt::LeftDockWidgetArea, w_layersDock);
    add(QStringLiteral("layersDock"), w_layersDock, { { QStringLiteral("title"), "windowTitle" } });

    // layerToolbar：容器
    auto *w_layerToolbar = new QFrame(body_w_layersDock);
    w_layerToolbar->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("layerToolbar"), w_layerToolbar);

    // addLayerBtn：Button
    auto *w_addLayerBtn = new QPushButton(w_layerToolbar);
    add(QStringLiteral("addLayerBtn"), w_addLayerBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_addLayerBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("addLayerBtn"), QStringLiteral("toggle"), value);
    });

    // removeLayerBtn：Button
    auto *w_removeLayerBtn = new QPushButton(w_layerToolbar);
    add(QStringLiteral("removeLayerBtn"), w_removeLayerBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_removeLayerBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("removeLayerBtn"), QStringLiteral("toggle"), value);
    });

    // moveLayerUpBtn：Button
    auto *w_moveLayerUpBtn = new QPushButton(w_layerToolbar);
    add(QStringLiteral("moveLayerUpBtn"), w_moveLayerUpBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_moveLayerUpBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("moveLayerUpBtn"), QStringLiteral("toggle"), value);
    });

    // moveLayerDownBtn：Button
    auto *w_moveLayerDownBtn = new QPushButton(w_layerToolbar);
    add(QStringLiteral("moveLayerDownBtn"), w_moveLayerDownBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_moveLayerDownBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("moveLayerDownBtn"), QStringLiteral("toggle"), value);
    });

    // layerList：List
    auto *w_layerList = new QListWidget(body_w_layersDock);
    add(QStringLiteral("layerList"), w_layerList, { { QStringLiteral("items"), "vfItems" }, { QStringLiteral("value"), "currentRow" }, { QStringLiteral("emptyText"), "vfEmptyText" } });
    QObject::connect(w_layerList, &QListWidget::currentRowChanged, q, [this](double value) {
        dispatch(QStringLiteral("layerList"), QStringLiteral("change"), value);
    });
    QObject::connect(w_layerList, &QListWidget::currentRowChanged, q, [this](double value) {
        dispatch(QStringLiteral("layerList"), QStringLiteral("select"), value);
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
    add(QStringLiteral("toggleVisibleBtn"), w_toggleVisibleBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_toggleVisibleBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("toggleVisibleBtn"), QStringLiteral("toggle"), value);
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

    // canvasTitleLabel：Label
    auto *w_canvasTitleLabel = new QLabel(w_canvasHeader);
    w_canvasTitleLabel->setProperty("wordWrap", true);
    add(QStringLiteral("canvasTitleLabel"), w_canvasTitleLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // activeToolLabel：Label
    auto *w_activeToolLabel = new QLabel(w_canvasHeader);
    w_activeToolLabel->setProperty("wordWrap", true);
    add(QStringLiteral("activeToolLabel"), w_activeToolLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // canvasHost：外部容器
    auto *w_canvasHost = new QFrame(w_centralArea);
    addExternal(QStringLiteral("canvasHost"), w_canvasHost, QStringLiteral("外部容器 canvasHost\n（业务还没有放入控件）"));
    w_canvasHost->setFrameShape(QFrame::NoFrame);

    // inspectorDock：停靠面板（right）
    auto *w_inspectorDock = new QDockWidget(QStringLiteral("检查器"), &window);
    w_inspectorDock->setFeatures(QDockWidget::NoDockWidgetFeatures);
    w_inspectorDock->setStyleSheet(QStringLiteral("QDockWidget { border: none; }"));
    auto *hdr_w_inspectorDock = new QLabel(QStringLiteral("检查器"), w_inspectorDock);
    hdr_w_inspectorDock->setFixedHeight(26);
    w_inspectorDock->setTitleBarWidget(hdr_w_inspectorDock);
    auto *body_w_inspectorDock = new QWidget(w_inspectorDock);
    w_inspectorDock->setWidget(body_w_inspectorDock);
    w_inspectorDock->setFixedWidth(260);
    window.addDockWidget(Qt::RightDockWidgetArea, w_inspectorDock);
    add(QStringLiteral("inspectorDock"), w_inspectorDock, { { QStringLiteral("title"), "windowTitle" } });

    // inspectorTabs：容器
    auto *w_inspectorTabs = new QFrame(body_w_inspectorDock);
    w_inspectorTabs->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("inspectorTabs"), w_inspectorTabs);

    // tabPropsBtn：Button
    auto *w_tabPropsBtn = new QPushButton(w_inspectorTabs);
    add(QStringLiteral("tabPropsBtn"), w_tabPropsBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_tabPropsBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("tabPropsBtn"), QStringLiteral("toggle"), value);
    });

    // tabExportBtn：Button
    auto *w_tabExportBtn = new QPushButton(w_inspectorTabs);
    add(QStringLiteral("tabExportBtn"), w_tabExportBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
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
    add(QStringLiteral("exportBtn"), w_exportBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_exportBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("exportBtn"), QStringLiteral("toggle"), value);
    });

    // exportResultLabel：Label
    auto *w_exportResultLabel = new QLabel(w_exportPage);
    w_exportResultLabel->setProperty("wordWrap", true);
    add(QStringLiteral("exportResultLabel"), w_exportResultLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // timelineDock：停靠面板（bottom）
    auto *w_timelineDock = new QDockWidget(QStringLiteral("时间轴"), &window);
    w_timelineDock->setFeatures(QDockWidget::NoDockWidgetFeatures);
    w_timelineDock->setStyleSheet(QStringLiteral("QDockWidget { border: none; }"));
    auto *hdr_w_timelineDock = new QLabel(QStringLiteral("时间轴"), w_timelineDock);
    hdr_w_timelineDock->setFixedHeight(26);
    w_timelineDock->setTitleBarWidget(hdr_w_timelineDock);
    auto *body_w_timelineDock = new QWidget(w_timelineDock);
    w_timelineDock->setWidget(body_w_timelineDock);
    w_timelineDock->setFixedHeight(96);
    window.addDockWidget(Qt::BottomDockWidgetArea, w_timelineDock);
    add(QStringLiteral("timelineDock"), w_timelineDock, { { QStringLiteral("title"), "windowTitle" } });

    // prevFrameBtn：Button
    auto *w_prevFrameBtn = new QPushButton(body_w_timelineDock);
    add(QStringLiteral("prevFrameBtn"), w_prevFrameBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_prevFrameBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("prevFrameBtn"), QStringLiteral("toggle"), value);
    });

    // nextFrameBtn：Button
    auto *w_nextFrameBtn = new QPushButton(body_w_timelineDock);
    add(QStringLiteral("nextFrameBtn"), w_nextFrameBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_nextFrameBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("nextFrameBtn"), QStringLiteral("toggle"), value);
    });

    // frameInfoLabel：Label
    auto *w_frameInfoLabel = new QLabel(body_w_timelineDock);
    w_frameInfoLabel->setProperty("wordWrap", true);
    add(QStringLiteral("frameInfoLabel"), w_frameInfoLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

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
    add(QStringLiteral("cancelNewProjectBtn"), w_cancelNewProjectBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_cancelNewProjectBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("cancelNewProjectBtn"), QStringLiteral("toggle"), value);
    });

    // confirmNewProjectBtn：Button
    auto *w_confirmNewProjectBtn = new QPushButton(w_dialogFooter);
    add(QStringLiteral("confirmNewProjectBtn"), w_confirmNewProjectBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_confirmNewProjectBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("confirmNewProjectBtn"), QStringLiteral("toggle"), value);
    });

    // toolsDock 的排版（hbox）
    auto *lay_body_w_toolsDock = new QHBoxLayout(body_w_toolsDock);
    lay_body_w_toolsDock->setContentsMargins(12, 6, 12, 6);
    lay_body_w_toolsDock->setSpacing(8);
    w_newProjectBtn->setMinimumHeight(0);
    w_newProjectBtn->setFixedWidth(96);
    w_newProjectBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_body_w_toolsDock->addWidget(w_newProjectBtn, 0);
    w_toolbarSep1->setMinimumHeight(0);
    w_toolbarSep1->setFixedWidth(8);
    w_toolbarSep1->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_body_w_toolsDock->addWidget(w_toolbarSep1, 0);
    w_toolBrushBtn->setMinimumHeight(0);
    w_toolBrushBtn->setFixedWidth(72);
    w_toolBrushBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_body_w_toolsDock->addWidget(w_toolBrushBtn, 0);
    w_toolEraserBtn->setMinimumHeight(0);
    w_toolEraserBtn->setFixedWidth(72);
    w_toolEraserBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_body_w_toolsDock->addWidget(w_toolEraserBtn, 0);
    w_toolFillBtn->setMinimumHeight(0);
    w_toolFillBtn->setFixedWidth(72);
    w_toolFillBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_body_w_toolsDock->addWidget(w_toolFillBtn, 0);
    w_toolbarSep2->setMinimumHeight(0);
    w_toolbarSep2->setFixedWidth(8);
    w_toolbarSep2->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_body_w_toolsDock->addWidget(w_toolbarSep2, 0);
    w_projectSummaryLabel->setMinimumHeight(0);
    w_projectSummaryLabel->setMinimumWidth(0);
    w_projectSummaryLabel->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_body_w_toolsDock->addWidget(w_projectSummaryLabel, 1);

    // layersDock 的排版（vbox）
    auto *lay_body_w_layersDock = new QVBoxLayout(body_w_layersDock);
    lay_body_w_layersDock->setContentsMargins(10, 10, 10, 10);
    lay_body_w_layersDock->setSpacing(8);
    w_layerToolbar->setFixedHeight(30);
    w_layerToolbar->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_body_w_layersDock->addWidget(w_layerToolbar, 0);
    w_layerList->setMinimumHeight(0);
    w_layerList->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_body_w_layersDock->addWidget(w_layerList, 1);
    w_layerVisibilityBar->setFixedHeight(32);
    w_layerVisibilityBar->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_body_w_layersDock->addWidget(w_layerVisibilityBar, 0);

    // layerToolbar 的排版（hbox）
    auto *lay_w_layerToolbar = new QHBoxLayout(w_layerToolbar);
    lay_w_layerToolbar->setContentsMargins(0, 0, 0, 0);
    lay_w_layerToolbar->setSpacing(6);
    w_addLayerBtn->setMinimumHeight(0);
    w_addLayerBtn->setFixedWidth(50);
    w_addLayerBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_layerToolbar->addWidget(w_addLayerBtn, 0);
    w_removeLayerBtn->setMinimumHeight(0);
    w_removeLayerBtn->setFixedWidth(50);
    w_removeLayerBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_layerToolbar->addWidget(w_removeLayerBtn, 0);
    w_moveLayerUpBtn->setMinimumHeight(0);
    w_moveLayerUpBtn->setFixedWidth(50);
    w_moveLayerUpBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_layerToolbar->addWidget(w_moveLayerUpBtn, 0);
    w_moveLayerDownBtn->setMinimumHeight(0);
    w_moveLayerDownBtn->setFixedWidth(50);
    w_moveLayerDownBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_layerToolbar->addWidget(w_moveLayerDownBtn, 0);
    lay_w_layerToolbar->addStretch(1);

    // layerVisibilityBar 的排版（hbox）
    auto *lay_w_layerVisibilityBar = new QHBoxLayout(w_layerVisibilityBar);
    lay_w_layerVisibilityBar->setContentsMargins(0, 0, 0, 0);
    lay_w_layerVisibilityBar->setSpacing(8);
    w_layerVisibleLabel->setMinimumHeight(0);
    w_layerVisibleLabel->setMinimumWidth(0);
    w_layerVisibleLabel->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_layerVisibilityBar->addWidget(w_layerVisibleLabel, 1);
    w_toggleVisibleBtn->setMinimumHeight(0);
    w_toggleVisibleBtn->setFixedWidth(100);
    w_toggleVisibleBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_layerVisibilityBar->addWidget(w_toggleVisibleBtn, 0);

    // centralArea 的排版（vbox）
    auto *lay_w_centralArea = new QVBoxLayout(w_centralArea);
    lay_w_centralArea->setContentsMargins(10, 10, 10, 10);
    lay_w_centralArea->setSpacing(8);
    w_canvasHeader->setFixedHeight(32);
    w_canvasHeader->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_centralArea->addWidget(w_canvasHeader, 0);
    w_canvasHost->setMinimumHeight(0);
    w_canvasHost->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_centralArea->addWidget(w_canvasHost, 1);

    // canvasHeader 的排版（hbox）
    auto *lay_w_canvasHeader = new QHBoxLayout(w_canvasHeader);
    lay_w_canvasHeader->setContentsMargins(0, 0, 0, 0);
    lay_w_canvasHeader->setSpacing(8);
    w_canvasTitleLabel->setMinimumHeight(0);
    w_canvasTitleLabel->setMinimumWidth(0);
    w_canvasTitleLabel->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_canvasHeader->addWidget(w_canvasTitleLabel, 1);
    w_activeToolLabel->setMinimumHeight(0);
    w_activeToolLabel->setFixedWidth(140);
    w_activeToolLabel->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_canvasHeader->addWidget(w_activeToolLabel, 0);

    // inspectorDock 的排版（vbox）
    auto *lay_body_w_inspectorDock = new QVBoxLayout(body_w_inspectorDock);
    lay_body_w_inspectorDock->setContentsMargins(10, 10, 10, 10);
    lay_body_w_inspectorDock->setSpacing(8);
    w_inspectorTabs->setFixedHeight(32);
    w_inspectorTabs->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_body_w_inspectorDock->addWidget(w_inspectorTabs, 0);
    w_inspectorStack->setMinimumHeight(0);
    w_inspectorStack->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_body_w_inspectorDock->addWidget(w_inspectorStack, 1);

    // inspectorTabs 的排版（grid）
    auto *lay_w_inspectorTabs = new QGridLayout(w_inspectorTabs);
    lay_w_inspectorTabs->setContentsMargins(0, 0, 0, 0);
    lay_w_inspectorTabs->setHorizontalSpacing(6);
    lay_w_inspectorTabs->setVerticalSpacing(6);
    lay_w_inspectorTabs->setColumnStretch(0, 1);
    lay_w_inspectorTabs->setColumnStretch(1, 1);
    lay_w_inspectorTabs->setRowStretch(0, 0);
    lay_w_inspectorTabs->setRowMinimumHeight(0, 32);
    lay_w_inspectorTabs->setRowStretch(1, 1);
    w_tabPropsBtn->setFixedHeight(32);
    w_tabPropsBtn->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_inspectorTabs->addWidget(w_tabPropsBtn, 0, 0, 1, 1);
    w_tabExportBtn->setFixedHeight(32);
    w_tabExportBtn->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_inspectorTabs->addWidget(w_tabExportBtn, 0, 1, 1, 1);

    // inspectorStack 的排版（stack）
    auto *lay_w_inspectorStack = new QVBoxLayout(w_inspectorStack);
    lay_w_inspectorStack->setContentsMargins(0, 0, 0, 0);
    lay_w_inspectorStack->setSpacing(0);
    w_layerPropsPage->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_inspectorStack->addWidget(w_layerPropsPage, 1);
    w_exportPage->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_inspectorStack->addWidget(w_exportPage, 1);

    // layerPropsPage 的排版（form）
    auto *lay_w_layerPropsPage = new QGridLayout(w_layerPropsPage);
    lay_w_layerPropsPage->setContentsMargins(4, 4, 4, 4);
    lay_w_layerPropsPage->setHorizontalSpacing(8);
    lay_w_layerPropsPage->setVerticalSpacing(8);
    lay_w_layerPropsPage->setColumnMinimumWidth(0, 76);
    lay_w_layerPropsPage->setColumnStretch(0, 0);
    lay_w_layerPropsPage->setColumnStretch(1, 1);
    w_blendLabel->setFixedSize(76, 30);
    lay_w_layerPropsPage->addWidget(w_blendLabel, 0, 0);
    w_blendCombo->setFixedHeight(30);
    w_blendCombo->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_layerPropsPage->addWidget(w_blendCombo, 0, 1);
    w_opacityLabel->setFixedSize(76, 30);
    lay_w_layerPropsPage->addWidget(w_opacityLabel, 1, 0);
    w_opacitySpin->setFixedHeight(30);
    w_opacitySpin->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_layerPropsPage->addWidget(w_opacitySpin, 1, 1);
    w_lockLabel->setFixedSize(76, 30);
    lay_w_layerPropsPage->addWidget(w_lockLabel, 2, 0);
    w_lockLayerCheck->setFixedHeight(30);
    w_lockLayerCheck->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_layerPropsPage->addWidget(w_lockLayerCheck, 2, 1);
    lay_w_layerPropsPage->setRowStretch(3, 1);

    // exportPage 的排版（vbox）
    auto *lay_w_exportPage = new QVBoxLayout(w_exportPage);
    lay_w_exportPage->setContentsMargins(4, 4, 4, 4);
    lay_w_exportPage->setSpacing(8);
    w_exportHintLabel->setFixedHeight(28);
    w_exportHintLabel->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_exportPage->addWidget(w_exportHintLabel, 0);
    w_exportBtn->setFixedHeight(32);
    w_exportBtn->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_exportPage->addWidget(w_exportBtn, 0);
    w_exportResultLabel->setFixedHeight(28);
    w_exportResultLabel->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_exportPage->addWidget(w_exportResultLabel, 0);
    lay_w_exportPage->addStretch(1);

    // timelineDock 的排版（hbox）
    auto *lay_body_w_timelineDock = new QHBoxLayout(body_w_timelineDock);
    lay_body_w_timelineDock->setContentsMargins(12, 10, 12, 10);
    lay_body_w_timelineDock->setSpacing(10);
    w_prevFrameBtn->setMinimumHeight(0);
    w_prevFrameBtn->setFixedWidth(76);
    w_prevFrameBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_body_w_timelineDock->addWidget(w_prevFrameBtn, 0);
    w_nextFrameBtn->setMinimumHeight(0);
    w_nextFrameBtn->setFixedWidth(76);
    w_nextFrameBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_body_w_timelineDock->addWidget(w_nextFrameBtn, 0);
    w_frameInfoLabel->setMinimumHeight(0);
    w_frameInfoLabel->setMinimumWidth(0);
    w_frameInfoLabel->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_body_w_timelineDock->addWidget(w_frameInfoLabel, 1);

    // statusBar 的排版（hbox）
    auto *lay_w_statusBar = new QHBoxLayout(w_statusBar);
    lay_w_statusBar->setContentsMargins(12, 0, 12, 0);
    lay_w_statusBar->setSpacing(12);
    w_statusTextLabel->setMinimumHeight(0);
    w_statusTextLabel->setMinimumWidth(0);
    w_statusTextLabel->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_statusBar->addWidget(w_statusTextLabel, 1);
    w_statusLayerCountLabel->setMinimumHeight(0);
    w_statusLayerCountLabel->setFixedWidth(160);
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
    Q_UNUSED(effect);
    Q_UNUSED(target);
    Q_UNUSED(showing);
    return nullptr;
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
