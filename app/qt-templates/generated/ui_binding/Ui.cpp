// 界面绑定层。由 VibeFrontend 导出，不要手改：下次导出会整个覆盖。
//
// 这个文件分两部分：
//   文件末尾“生成的部分”随设计项目变化：控件树、位置、排版、事件的连接、业务接口的实现、效果的调用；
//   其余是固定的：把逻辑脚本放进 Qt 自带的 JS 引擎运行，把鼠标事件交给它，再把算出的结果写到控件上。
#include "Ui.h"

#include <QAbstractAnimation>
#include <QAction>
#include <QApplication>
#include <QBoxLayout>
#include <QComboBox>
#include <QDialog>
#include <QDockWidget>
#include <QEvent>
#include <QFile>
#include <QFrame>
#include <QHBoxLayout>
#include <QHash>
#include <QJSEngine>
#include <QJSValue>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonValue>
#include <QLabel>
#include <QListWidget>
#include <QMainWindow>
#include <QMap>
#include <QMenu>
#include <QMenuBar>
#include <QMetaMethod>
#include <QMouseEvent>
#include <QPointer>
#include <QPushButton>
#include <QSet>
#include <QSignalBlocker>
#include <QSizePolicy>
#include <QStatusBar>
#include <QTimer>
#include <QVBoxLayout>
#include <QVariant>
//@VF:includes@

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

struct DockEntry
{
    QString id;
    QDockWidget *dock = nullptr;
    QWidget *header = nullptr;
    QWidget *body = nullptr;
    QString defaultArea;
    int headerHeight = 26;
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
    QBoxLayout *origLayout = nullptr;
    int origIndex = -1;
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
    QMap<QString, DockEntry> docks;
    QSet<QString> inactiveTabDocks;
    QList<FloatBoxEntry> floatBoxes;
    QHash<QObject *, QString> floatBoxHeaderIds;
    QString draggingFloatBoxId;
    QPoint dragStartGlobal;
    QPoint dragStartBoxPos;
    QStatusBar *statusBar = nullptr;
    QWidget *statusBarControl = nullptr;
    QHash<QObject *, int> byWidget;
    int pressed = -1;                 // 鼠标左键是在哪个控件上按下的
    bool doubleClick = false;
    bool started = false;             // app.start 触发之前，显示和隐藏不播放效果
    bool applyingLayout = false;
    // 界面销毁后，还没放完的效果再回调时靠它知道不能再碰界面
    std::shared_ptr<bool> alive = std::make_shared<bool>(true);

    QJSValue call(const char *function, const QJSValueList &args = {});
    int add(const QString &id, QWidget *widget, QList<QPair<QString, QByteArray>> props = {}, int effect = -1);
    int addExternal(const QString &id, QFrame *frame, const QString &text);
    void addMenuAction(const QString &id, QAction *action);
    void registerDock(const QString &id, QDockWidget *dock, QWidget *header, QWidget *body, const QString &defaultArea, int headerHeight);
    void registerFloatBox(const QString &id, QFrame *frame, QWidget *header, QWidget *body, int headerHeight, int designWidth, int designHeight);
    void applyDockLayout(const QJSValue &views);
    void applyFloatBoxes(const QJSValue &views);
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
        if (d->inactiveTabDocks.contains(control.id))
            continue;
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

QString Ui::dockDump() const
{
    const QString rawJson = d->call("dockLayout").toString();
    QJsonObject rootObj = QJsonDocument::fromJson(rawJson.toUtf8()).object();
    QJsonObject areasObj = rootObj.value(QStringLiteral("areas")).toObject();
    for (const QString &areaKey : { QStringLiteral("top"), QStringLiteral("bottom"), QStringLiteral("left"), QStringLiteral("right") }) {
        QJsonObject areaSpec = areasObj.value(areaKey).toObject();
        QJsonArray groups = areaSpec.value(QStringLiteral("groups")).toArray();
        for (int gi = 0; gi < groups.size(); ++gi) {
            QJsonObject gObj = groups.at(gi).toObject();
            const QJsonArray tabs = gObj.value(QStringLiteral("tabs")).toArray();
            QString actualActive;
            for (const QJsonValue &tv : tabs) {
                const QString tid = tv.toString();
                if (!d->docks.contains(tid))
                    continue;
                const DockEntry &entry = d->docks.value(tid);
                if (!entry.dock->isHidden() && !entry.body->isHidden() && !entry.dock->property("vfFloating").toBool()) {
                    actualActive = tid;
                    const Qt::DockWidgetArea actualArea = d->window.dockWidgetArea(entry.dock);
                    if (actualArea != qtAreaFor(areaKey))
                        gObj.insert(QStringLiteral("areaMismatch"), int(actualArea));
                }
            }
            if (!actualActive.isEmpty() && gObj.value(QStringLiteral("active")).toString() != actualActive) {
                const QString wantedActive = gObj.value(QStringLiteral("active")).toString();
                if (d->docks.contains(wantedActive) && !d->docks.value(wantedActive).dock->isHidden())
                    gObj.insert(QStringLiteral("active"), actualActive);
            }
            groups[gi] = gObj;
        }
        areaSpec.insert(QStringLiteral("groups"), groups);
        areasObj.insert(areaKey, areaSpec);
    }
    rootObj.insert(QStringLiteral("areas"), areasObj);

    QJsonArray floatingArr = rootObj.value(QStringLiteral("floating")).toArray();
    for (int fi = 0; fi < floatingArr.size(); ++fi) {
        QJsonObject fObj = floatingArr.at(fi).toObject();
        const QString did = fObj.value(QStringLiteral("dockId")).toString();
        if (d->docks.contains(did)) {
            const DockEntry &entry = d->docks.value(did);
            if (!entry.dock->property("vfFloating").toBool()) {
                fObj.insert(QStringLiteral("floatingMismatch"), true);
            } else if (!entry.dock->isHidden()) {
                fObj.insert(QStringLiteral("x"), entry.dock->x());
                fObj.insert(QStringLiteral("y"), entry.dock->y());
                fObj.insert(QStringLiteral("width"), entry.dock->width());
                fObj.insert(QStringLiteral("height"), entry.dock->height());
            }
        }
        floatingArr[fi] = fObj;
    }
    rootObj.insert(QStringLiteral("floating"), floatingArr);
    return QString::fromUtf8(QJsonDocument(rootObj).toJson(QJsonDocument::Compact));
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

    if (watched == &d->window && event->type() == QEvent::Resize && d->started && !d->applyingLayout) {
        d->applyingLayout = true;
        const QJSValue views = d->call("views");
        d->applyDockLayout(views);
        d->applyFloatBoxes(views);
        d->syncStatusBar();
        d->applyingLayout = false;
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

    const int index = d->byWidget.value(watched, -1);
    if (index < 0)
        return false;
    const QString id = d->controls.at(index).id;

    switch (event->type()) {
    case QEvent::Resize:
        if (watched == &d->window) {
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

void Ui::Private::registerDock(const QString &id, QDockWidget *dock, QWidget *header, QWidget *body, const QString &defaultArea, int headerHeight)
{
    DockEntry entry;
    entry.id = id;
    entry.dock = dock;
    entry.header = header;
    entry.body = body;
    entry.defaultArea = defaultArea;
    entry.headerHeight = headerHeight;
    auto *hLay = new QHBoxLayout(header);
    hLay->setContentsMargins(6, 0, 4, 0);
    hLay->setSpacing(4);
    dock->setProperty("vfArea", defaultArea);
    dock->setProperty("vfFloating", false);
    docks.insert(id, entry);
}

void Ui::Private::registerFloatBox(const QString &id, QFrame *frame, QWidget *header, QWidget *body, int headerHeight, int designWidth, int designHeight)
{
    FloatBoxEntry fb;
    fb.id = id;
    fb.frame = frame;
    fb.header = header;
    fb.body = body;
    fb.origParent = frame->parentWidget();
    fb.origLayout = fb.origParent ? qobject_cast<QBoxLayout *>(fb.origParent->layout()) : nullptr;
    fb.origIndex = fb.origLayout ? fb.origLayout->indexOf(frame) : -1;
    fb.headerHeight = headerHeight;
    fb.designWidth = designWidth;
    fb.designHeight = designHeight;
    fb.origSizePolicy = frame->sizePolicy();

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

    const QString dockJson = call("dockLayout").toString();
    const QJsonObject layoutObj = QJsonDocument::fromJson(dockJson.toUtf8()).object();
    const QJsonObject areasObj = layoutObj.value(QStringLiteral("areas")).toObject();
    const QJSValue boxesObj = call("computeLayout", { window.width(), window.height() });

    for (auto it = docks.begin(); it != docks.end(); ++it)
        window.removeDockWidget(it->dock);
    inactiveTabDocks.clear();

    auto populateHeader = [this, &views](DockEntry &entry, const QStringList &visibleTabs, const QString &activeId, bool isFloating) {
        if (QLayout *lay = entry.header->layout()) {
            while (QLayoutItem *item = lay->takeAt(0)) {
                if (QWidget *w = item->widget())
                    delete w;
                delete item;
            }
            auto *hLay = static_cast<QHBoxLayout *>(lay);
            for (const QString &tid : visibleTabs) {
                QString title = views.property(tid).property(QStringLiteral("props")).property(QStringLiteral("title")).toString();
                if (title.isEmpty())
                    title = tid;
                auto *tabBtn = new QPushButton(title, entry.header);
                tabBtn->setObjectName(QStringLiteral("vf_dock_tab_") + tid);
                tabBtn->setFlat(true);
                const QString tabId = tid;
                QObject::connect(tabBtn, &QPushButton::clicked, q, [this, tabId] {
                    const QString json = QString::fromUtf8(QJsonDocument(QJsonObject{ { QStringLiteral("dock"), tabId } }).toJson(QJsonDocument::Compact));
                    q->runDockOp(QStringLiteral("activateTab"), json);
                });
                hLay->addWidget(tabBtn, 0);
            }
            hLay->addStretch(1);
            if (isFloating) {
                auto *restoreBtn = new QPushButton(QStringLiteral("还原"), entry.header);
                restoreBtn->setObjectName(QStringLiteral("vf_dock_restore_") + activeId);
                restoreBtn->setFixedHeight(qMax(16, entry.headerHeight - 6));
                QObject::connect(restoreBtn, &QPushButton::clicked, q, [this, activeId] {
                    const QString json = QString::fromUtf8(QJsonDocument(QJsonObject{ { QStringLiteral("dock"), activeId } }).toJson(QJsonDocument::Compact));
                    q->runDockOp(QStringLiteral("restore"), json);
                });
                hLay->addWidget(restoreBtn, 0);
            }
            auto *closeBtn = new QPushButton(QStringLiteral("×"), entry.header);
            closeBtn->setObjectName(QStringLiteral("vf_dock_close_") + activeId);
            closeBtn->setFixedSize(qMax(16, entry.headerHeight - 6), qMax(16, entry.headerHeight - 6));
            QObject::connect(closeBtn, &QPushButton::clicked, q, [this, activeId] {
                const QString json = QString::fromUtf8(QJsonDocument(QJsonObject{ { QStringLiteral("dock"), activeId } }).toJson(QJsonDocument::Compact));
                q->runDockOp(QStringLiteral("close"), json);
            });
            hLay->addWidget(closeBtn, 0);
        }
    };

    struct ActiveDockedGeom
    {
        DockEntry *entry = nullptr;
        int x = 0;
        int y = 0;
        int w = 0;
        int h = 0;
    };
    QList<ActiveDockedGeom> activeGeoms;

    for (const QString &areaKey : { QStringLiteral("top"), QStringLiteral("bottom"), QStringLiteral("left"), QStringLiteral("right") }) {
        const QJsonObject areaSpec = areasObj.value(areaKey).toObject();
        const QString splitOrient = areaSpec.value(QStringLiteral("splitOrientation")).toString();
        const QJsonArray groups = areaSpec.value(QStringLiteral("groups")).toArray();
        QDockWidget *prevAnchor = nullptr;

        for (const QJsonValue &gVal : groups) {
            const QJsonObject gObj = gVal.toObject();
            const QJsonArray tabsArr = gObj.value(QStringLiteral("tabs")).toArray();
            QStringList allTabs;
            QStringList visibleTabs;
            for (const QJsonValue &tv : tabsArr) {
                const QString tid = tv.toString();
                if (!docks.contains(tid))
                    continue;
                allTabs.append(tid);
                if (views.property(tid).property(QStringLiteral("visible")).toBool())
                    visibleTabs.append(tid);
            }
            if (visibleTabs.isEmpty()) {
                for (const QString &tid : allTabs) {
                    DockEntry &de = docks[tid];
                    de.dock->setProperty("vfFloating", false);
                    de.dock->setProperty("vfArea", areaKey);
                    de.dock->setVisible(false);
                }
                continue;
            }
            const QString rawActive = gObj.value(QStringLiteral("active")).toString();
            const QString activeId = visibleTabs.contains(rawActive) ? rawActive : visibleTabs.first();
            const QJSValue boxVal = boxesObj.property(activeId);
            const int bx = boxVal.property(QStringLiteral("x")).toInt();
            const int by = boxVal.property(QStringLiteral("y")).toInt();
            const int bw = qMax(40, boxVal.property(QStringLiteral("width")).toInt());
            const int bh = qMax(30, boxVal.property(QStringLiteral("height")).toInt());

            DockEntry &activeEntry = docks[activeId];
            activeEntry.dock->setProperty("vfFloating", false);
            activeEntry.dock->setProperty("vfArea", areaKey);
            activeEntry.dock->setMinimumSize(0, 0);
            activeEntry.dock->setMaximumSize(QWIDGETSIZE_MAX, QWIDGETSIZE_MAX);
            if (areaKey == QLatin1String("left") || areaKey == QLatin1String("right")) {
                activeEntry.dock->setFixedWidth(bw);
            } else {
                activeEntry.dock->setFixedHeight(bh);
            }
            activeEntry.header->setVisible(true);
            activeEntry.body->setVisible(true);
            populateHeader(activeEntry, visibleTabs, activeId, false);
            if (!prevAnchor) {
                window.addDockWidget(qtAreaFor(areaKey), activeEntry.dock);
            } else {
                const Qt::Orientation qtOrient = (splitOrient == QLatin1String("horizontal")) ? Qt::Horizontal : Qt::Vertical;
                window.splitDockWidget(prevAnchor, activeEntry.dock, qtOrient);
            }
            activeEntry.dock->setVisible(true);
            prevAnchor = activeEntry.dock;
            activeGeoms.append({ &activeEntry, bx, by, bw, bh });

            for (const QString &tid : allTabs) {
                if (tid == activeId)
                    continue;
                DockEntry &tabEntry = docks[tid];
                tabEntry.dock->setProperty("vfFloating", false);
                tabEntry.dock->setProperty("vfArea", areaKey);
                if (visibleTabs.contains(tid)) {
                    tabEntry.dock->setParent(&window);
                    tabEntry.dock->setMinimumSize(0, 0);
                    tabEntry.dock->setMaximumSize(QWIDGETSIZE_MAX, QWIDGETSIZE_MAX);
                    tabEntry.dock->setGeometry(bx, by, bw, bh);
                    tabEntry.header->setVisible(false);
                    tabEntry.body->setVisible(false);
                    tabEntry.dock->setVisible(true);
                    tabEntry.dock->lower();
                    inactiveTabDocks.insert(tid);
                } else {
                    tabEntry.dock->setVisible(false);
                }
            }
        }
    }

    const QJsonArray floatingArr = layoutObj.value(QStringLiteral("floating")).toArray();
    for (const QJsonValue &fVal : floatingArr) {
        const QJsonObject fObj = fVal.toObject();
        const QString did = fObj.value(QStringLiteral("dockId")).toString();
        if (!docks.contains(did))
            continue;
        DockEntry &fEntry = docks[did];
        const bool vis = views.property(did).property(QStringLiteral("visible")).toBool();
        const int fx = fObj.value(QStringLiteral("x")).toInt();
        const int fy = fObj.value(QStringLiteral("y")).toInt();
        const int fw = qMax(80, fObj.value(QStringLiteral("width")).toInt());
        const int fh = qMax(60, fObj.value(QStringLiteral("height")).toInt());
        fEntry.dock->setParent(&window);
        fEntry.dock->setProperty("vfFloating", true);
        fEntry.dock->setProperty("vfLastArea", fObj.value(QStringLiteral("lastArea")).toString());
        fEntry.dock->setMinimumSize(0, 0);
        fEntry.dock->setMaximumSize(QWIDGETSIZE_MAX, QWIDGETSIZE_MAX);
        fEntry.dock->setGeometry(fx, fy, fw, fh);
        fEntry.header->setVisible(vis);
        fEntry.body->setVisible(vis);
        fEntry.dock->setVisible(vis);
        if (vis) {
            populateHeader(fEntry, QStringList{ did }, did, true);
            fEntry.header->setGeometry(0, 0, fw, fEntry.headerHeight);
            fEntry.body->setGeometry(0, fEntry.headerHeight, fw, qMax(0, fh - fEntry.headerHeight));
            if (fEntry.body->layout())
                fEntry.body->layout()->activate();
            fEntry.dock->raise();
        }
    }

    if (window.layout())
        window.layout()->activate();
    QApplication::sendPostedEvents(nullptr, QEvent::LayoutRequest);

    for (const ActiveDockedGeom &ag : activeGeoms) {
        ag.entry->dock->setGeometry(ag.x, ag.y, ag.w, ag.h);
        ag.entry->header->setGeometry(0, 0, ag.w, ag.entry->headerHeight);
        ag.entry->body->setGeometry(0, ag.entry->headerHeight, ag.w, qMax(0, ag.h - ag.entry->headerHeight));
        if (ag.entry->body->layout())
            ag.entry->body->layout()->activate();
    }

    if (QWidget *cw = window.centralWidget()) {
        const QString cid = cw->objectName();
        if (!cid.isEmpty()) {
            const QJSValue cBox = boxesObj.property(cid);
            if (cBox.isObject()) {
                cw->setGeometry(
                    cBox.property(QStringLiteral("x")).toInt(),
                    cBox.property(QStringLiteral("y")).toInt(),
                    cBox.property(QStringLiteral("width")).toInt(),
                    cBox.property(QStringLiteral("height")).toInt());
                if (cw->layout())
                    cw->layout()->activate();
            }
        }
    }

    for (const QJsonValue &fVal : floatingArr) {
        const QString did = fVal.toObject().value(QStringLiteral("dockId")).toString();
        if (docks.contains(did) && !docks[did].dock->isHidden())
            docks[did].dock->raise();
    }
}

void Ui::Private::applyFloatBoxes(const QJSValue &views)
{
    if (floatBoxes.isEmpty())
        return;
    const QJSValue boxesObj = call("computeLayout", { window.width(), window.height() });
    for (FloatBoxEntry &fb : floatBoxes) {
        const QJSValue view = views.property(fb.id);
        const bool vis = view.property(QStringLiteral("visible")).toBool();
        const QJSValue props = view.property(QStringLiteral("props"));
        const QString title = props.property(QStringLiteral("title")).toString();
        const bool wantFloat = props.property(QStringLiteral("floating")).toBool();
        fb.titleLabel->setText(title.isEmpty() ? fb.id : title);
        fb.toggleBtn->setText(wantFloat ? QStringLiteral("还原") : QStringLiteral("浮出"));

        if (wantFloat) {
            const QJSValue boxVal = boxesObj.property(fb.id);
            const int fx = boxVal.property(QStringLiteral("absX")).toInt();
            const int fy = boxVal.property(QStringLiteral("absY")).toInt();
            const int fw = qMax(80, boxVal.property(QStringLiteral("width")).toInt());
            const int fh = qMax(fb.headerHeight + 20, boxVal.property(QStringLiteral("height")).toInt());
            if (!fb.isFloating) {
                if (fb.origLayout)
                    fb.origLayout->removeWidget(fb.frame);
                fb.frame->setParent(&window);
                fb.isFloating = true;
                if (fb.origLayout)
                    fb.origLayout->activate();
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
                fb.frame->setMinimumWidth(0);
                fb.frame->setMaximumWidth(QWIDGETSIZE_MAX);
                fb.frame->setFixedHeight(fb.designHeight);
                fb.frame->setSizePolicy(fb.origSizePolicy);
                if (fb.origLayout) {
                    const int insIdx = qBound(0, fb.origIndex, fb.origLayout->count());
                    fb.origLayout->insertWidget(insIdx, fb.frame);
                    fb.origLayout->activate();
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
    applyDockLayout(views);
    applyFloatBoxes(views);
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

//@VF:generated@

} // namespace vf
