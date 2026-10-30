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
#include <QFormLayout>
#include <QFrame>
#include <QGridLayout>
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
#include <QStackedLayout>
#include <QStatusBar>
#include <QTabBar>
#include <QTimer>
#include <QVBoxLayout>
#include <QVariant>
#include <algorithm>
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
    QWidget *resizer = nullptr;
    QString defaultArea;
    QString lastArea;
    QString activeIdInHeader;
    QString tabGroupAnchorId;
    int headerHeight = 26;
    int designWidth = 240;
    int designHeight = 180;
    int groupOrder = 0;
    int tabOrder = 0;
    int floatOrder = 0;
    bool isClosed = false;
    bool isActiveInGroup = true;
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
    QHash<QObject *, QString> dockHeaderIds;
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
    void registerDock(const QString &id, QDockWidget *dock, QWidget *header, QWidget *body, const QString &defaultArea, int headerHeight, int designWidth = 240, int designHeight = 180);
    void registerFloatBox(const QString &id, QFrame *frame, QWidget *header, QWidget *body, int headerHeight, int designWidth, int designHeight);
    void applyDockLayout(const QJSValue &views);
    void rebuildDockSplitters();
    void applyFloatBoxes(const QJSValue &views);
    void handleDockDropAt(const QString &dockId, const QPoint &globalPos, Qt::KeyboardModifiers mods);
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
    d->syncStatusBar();
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
        bool isVis = !control.widget->isHidden();
        if (d->docks.contains(control.id))
            isVis = !d->docks.value(control.id).isClosed;
        one.insert(QStringLiteral("visible"), isVis);
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

            // 实测当前组内的激活页签：优先取未隐藏且内容区可见、在主窗口子控件栈最上层的 QDockWidget；
            // 若原激活面板被直接 hide()，则自动回退到组内仍未隐藏（!dock->isHidden()）的其余页签。
            const QObjectList &winChildren = d->window.children();
            QString activeId;
            QDockWidget *repDock = nullptr;
            int bestZ = -2;
            for (const QString &tid : component) {
                const DockEntry &te = d->docks.value(tid);
                if (!te.dock->isHidden() && !te.body->isHidden()) {
                    const int z = int(winChildren.indexOf(te.dock));
                    if (z >= bestZ) {
                        bestZ = z;
                        activeId = tid;
                        repDock = te.dock;
                    }
                }
            }
            if (activeId.isEmpty()) {
                for (const QString &tid : component) {
                    const DockEntry &te = d->docks.value(tid);
                    if (!te.dock->isHidden()) {
                        activeId = tid;
                        repDock = te.dock;
                        break;
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

        // 若有多个并排组，从各组代表 QDockWidget 的实际坐标判定拆分方向与先后顺序
        QString splitOrient = defaultSplitOrientFor(areaKey);
        if (groups.size() >= 2) {
            QDockWidget *d0 = groups.at(0).repDock;
            QDockWidget *d1 = groups.at(1).repDock;
            if (d0 && d1 && !d0->isHidden() && !d1->isHidden()) {
                const int dx = qAbs(d1->x() - d0->x());
                const int dy = qAbs(d1->y() - d0->y());
                if (dx > dy)
                    splitOrient = QStringLiteral("horizontal");
                else if (dy > dx)
                    splitOrient = QStringLiteral("vertical");
            }
            std::sort(groups.begin(), groups.end(), [&splitOrient](const MeasuredGroup &a, const MeasuredGroup &b) {
                if (a.repDock && b.repDock && !a.repDock->isHidden() && !b.repDock->isHidden()) {
                    if (splitOrient == QLatin1String("horizontal")) {
                        if (a.repDock->x() != b.repDock->x())
                            return a.repDock->x() < b.repDock->x();
                    } else {
                        if (a.repDock->y() != b.repDock->y())
                            return a.repDock->y() < b.repDock->y();
                    }
                }
                return a.groupOrder < b.groupOrder;
            });
            areaObj.insert(QStringLiteral("splitOrientation"), splitOrient);
        }

        // 从代表 QDockWidget 的实测几何量读取区域厚度 size
        QDockWidget *firstOpenDock = nullptr;
        for (const MeasuredGroup &mg : groups) {
            if (mg.repDock && !mg.repDock->isHidden()) {
                firstOpenDock = mg.repDock;
                break;
            }
        }
        if (!firstOpenDock)
            firstOpenDock = groups.first().repDock;

        if (firstOpenDock) {
            const int areaThickness = (areaKey == QLatin1String("left") || areaKey == QLatin1String("right"))
                ? firstOpenDock->width()
                : firstOpenDock->height();
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

    // 停靠面板标题栏拖拽与双击切换浮出/还原
    if (d->dockHeaderIds.contains(watched)) {
        const QString hdrOwnerId = d->dockHeaderIds.value(watched);
        if (!d->docks.contains(hdrOwnerId))
            return false;
        const DockEntry &ownerEntry = d->docks.value(hdrOwnerId);
        const QString activeId = ownerEntry.activeIdInHeader.isEmpty() ? hdrOwnerId : ownerEntry.activeIdInHeader;
        if (event->type() == QEvent::MouseButtonDblClick) {
            auto *mouse = static_cast<QMouseEvent *>(event);
            if (mouse->button() == Qt::LeftButton && d->docks.contains(activeId)) {
                QDockWidget *dw = d->docks.value(activeId).dock;
                const QJsonObject args{ { QStringLiteral("dock"), activeId } };
                runDockOp(dw->isFloating() ? QStringLiteral("restore") : QStringLiteral("float"),
                          QString::fromUtf8(QJsonDocument(args).toJson(QJsonDocument::Compact)));
                return true;
            }
        } else if (event->type() == QEvent::MouseButtonPress) {
            auto *mouse = static_cast<QMouseEvent *>(event);
            if (mouse->button() == Qt::LeftButton && d->docks.contains(activeId)) {
                QWidget *child = ownerEntry.header->childAt(mouse->position().toPoint());
                if (qobject_cast<QPushButton *>(child))
                    return false;
                const DockEntry &activeEntry = d->docks.value(activeId);
                d->draggingDockId = activeId;
                d->dockDragMoved = false;
                d->dragStartGlobal = mouse->globalPosition().toPoint();
                const QPoint relPos = d->window.mapFromGlobal(activeEntry.dock->mapToGlobal(QPoint(0, 0)));
                d->dragStartDockRect = QRect(relPos, activeEntry.dock->size());
                return true;
            }
        } else if (event->type() == QEvent::MouseMove && !d->draggingDockId.isEmpty()) {
            auto *mouse = static_cast<QMouseEvent *>(event);
            const QPoint delta = mouse->globalPosition().toPoint() - d->dragStartGlobal;
            if (!d->dockDragMoved && (delta.manhattanLength() > 5 || mouse->modifiers().testFlag(Qt::ShiftModifier)))
                d->dockDragMoved = true;
            if (d->dockDragMoved && d->docks.contains(d->draggingDockId)) {
                const DockEntry &de = d->docks.value(d->draggingDockId);
                if (de.dock->isFloating()) {
                    const int nx = qMax(0, d->dragStartDockRect.x() + delta.x());
                    const int ny = qMax(0, d->dragStartDockRect.y() + delta.y());
                    de.dock->move(d->window.mapToGlobal(QPoint(nx, ny)));
                }
            }
            return true;
        } else if (event->type() == QEvent::MouseButtonRelease && !d->draggingDockId.isEmpty()) {
            auto *mouse = static_cast<QMouseEvent *>(event);
            const QString draggedId = d->draggingDockId;
            const bool moved = d->dockDragMoved;
            d->draggingDockId.clear();
            d->dockDragMoved = false;
            if (moved) {
                d->handleDockDropAt(draggedId, mouse->globalPosition().toPoint(), mouse->modifiers());
                return true;
            }
        }
        return false;
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
    body->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    body->setMinimumSize(1, 1);

    auto *hLay = new QHBoxLayout(header);
    hLay->setSizeConstraint(QLayout::SetNoConstraint);
    hLay->setContentsMargins(6, 0, 4, 0);
    hLay->setSpacing(4);
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
            } else if (!visible && !de.isClosed && de.isActiveInGroup) {
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

void Ui::Private::handleDockDropAt(const QString &dockId, const QPoint &globalPos, Qt::KeyboardModifiers mods)
{
    if (!docks.contains(dockId))
        return;
    const QPoint relPos = window.mapFromGlobal(globalPos);
    const QPoint delta = globalPos - dragStartGlobal;

    // 按住 Shift 拖拽或拖出窗口外时直接浮出到目标坐标
    const bool forceFloat = mods.testFlag(Qt::ShiftModifier) || !window.rect().contains(relPos);
    if (!forceFloat) {
        // 1. 命中其他可见停靠面板：根据落点位置执行 tabify 或 split
        for (auto it = docks.begin(); it != docks.end(); ++it) {
            if (it.key() == dockId || it->isClosed || it->dock->isFloating() || it->dock->isHidden())
                continue;
            QDockWidget *targetDock = it->dock;
            const QRect targetRect(window.mapFromGlobal(targetDock->mapToGlobal(QPoint(0, 0))), targetDock->size());
            if (!targetRect.contains(relPos))
                continue;
            const int localX = relPos.x() - targetRect.x();
            const int localY = relPos.y() - targetRect.y();
            if (localY <= it->headerHeight) {
                const QJsonObject args{
                    { QStringLiteral("target"), it.key() },
                    { QStringLiteral("dock"), dockId },
                };
                q->runDockOp(QStringLiteral("tabify"), QString::fromUtf8(QJsonDocument(args).toJson(QJsonDocument::Compact)));
                return;
            }
            const int bodyY = localY - it->headerHeight;
            const int bodyH = qMax(1, targetRect.height() - it->headerHeight);
            const double rx = double(localX) / double(qMax(1, targetRect.width()));
            const double ry = double(bodyY) / double(bodyH);

            if (ry < 0.28) {
                const QJsonObject args{
                    { QStringLiteral("target"), it.key() },
                    { QStringLiteral("dock"), dockId },
                    { QStringLiteral("position"), QStringLiteral("before") },
                    { QStringLiteral("orientation"), QStringLiteral("vertical") },
                };
                q->runDockOp(QStringLiteral("split"), QString::fromUtf8(QJsonDocument(args).toJson(QJsonDocument::Compact)));
                return;
            }
            if (ry > 0.72) {
                const QJsonObject args{
                    { QStringLiteral("target"), it.key() },
                    { QStringLiteral("dock"), dockId },
                    { QStringLiteral("position"), QStringLiteral("after") },
                    { QStringLiteral("orientation"), QStringLiteral("vertical") },
                };
                q->runDockOp(QStringLiteral("split"), QString::fromUtf8(QJsonDocument(args).toJson(QJsonDocument::Compact)));
                return;
            }
            if (rx < 0.22) {
                const QJsonObject args{
                    { QStringLiteral("target"), it.key() },
                    { QStringLiteral("dock"), dockId },
                    { QStringLiteral("position"), QStringLiteral("before") },
                    { QStringLiteral("orientation"), QStringLiteral("horizontal") },
                };
                q->runDockOp(QStringLiteral("split"), QString::fromUtf8(QJsonDocument(args).toJson(QJsonDocument::Compact)));
                return;
            }
            if (rx > 0.78) {
                const QJsonObject args{
                    { QStringLiteral("target"), it.key() },
                    { QStringLiteral("dock"), dockId },
                    { QStringLiteral("position"), QStringLiteral("after") },
                    { QStringLiteral("orientation"), QStringLiteral("horizontal") },
                };
                q->runDockOp(QStringLiteral("split"), QString::fromUtf8(QJsonDocument(args).toJson(QJsonDocument::Compact)));
                return;
            }
            const QJsonObject args{
                { QStringLiteral("target"), it.key() },
                { QStringLiteral("dock"), dockId },
            };
            q->runDockOp(QStringLiteral("tabify"), QString::fromUtf8(QJsonDocument(args).toJson(QJsonDocument::Compact)));
            return;
        }

        // 2. 命中主窗口四边吸附带（36px）
        const int menuH = window.menuBar() ? window.menuBar()->height() : 0;
        const int statusH = statusBar ? statusBar->height() : 0;
        const int edgeBand = 36;
        if (relPos.y() >= menuH && relPos.y() <= menuH + edgeBand) {
            const QJsonObject args{ { QStringLiteral("dock"), dockId }, { QStringLiteral("area"), QStringLiteral("top") } };
            q->runDockOp(QStringLiteral("move"), QString::fromUtf8(QJsonDocument(args).toJson(QJsonDocument::Compact)));
            return;
        }
        if (relPos.y() >= window.height() - statusH - edgeBand && relPos.y() <= window.height() - statusH) {
            const QJsonObject args{ { QStringLiteral("dock"), dockId }, { QStringLiteral("area"), QStringLiteral("bottom") } };
            q->runDockOp(QStringLiteral("move"), QString::fromUtf8(QJsonDocument(args).toJson(QJsonDocument::Compact)));
            return;
        }
        if (relPos.x() >= 0 && relPos.x() <= edgeBand) {
            const QJsonObject args{ { QStringLiteral("dock"), dockId }, { QStringLiteral("area"), QStringLiteral("left") } };
            q->runDockOp(QStringLiteral("move"), QString::fromUtf8(QJsonDocument(args).toJson(QJsonDocument::Compact)));
            return;
        }
        if (relPos.x() >= window.width() - edgeBand && relPos.x() <= window.width()) {
            const QJsonObject args{ { QStringLiteral("dock"), dockId }, { QStringLiteral("area"), QStringLiteral("right") } };
            q->runDockOp(QStringLiteral("move"), QString::fromUtf8(QJsonDocument(args).toJson(QJsonDocument::Compact)));
            return;
        }
    }

    // 3. 其余位置：切换/更新为浮动面板
    const int nx = qMax(0, dragStartDockRect.x() + delta.x());
    const int ny = qMax(0, dragStartDockRect.y() + delta.y());
    const int nw = qMax(120, dragStartDockRect.width());
    const int nh = qMax(80, dragStartDockRect.height());
    const QJsonObject args{
        { QStringLiteral("dock"), dockId },
        { QStringLiteral("x"), nx },
        { QStringLiteral("y"), ny },
        { QStringLiteral("width"), nw },
        { QStringLiteral("height"), nh },
    };
    q->runDockOp(QStringLiteral("float"), QString::fromUtf8(QJsonDocument(args).toJson(QJsonDocument::Compact)));
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

    const bool prevApplying = applyingLayout;
    applyingLayout = true;

    const QString dockJson = call("dockLayout").toString();
    const QJsonObject layoutObj = QJsonDocument::fromJson(dockJson.toUtf8()).object();
    const QJsonObject areasObj = layoutObj.value(QStringLiteral("areas")).toObject();
    const QJsonArray floatingArr = layoutObj.value(QStringLiteral("floating")).toArray();
    const QJSValue boxesObj = call("computeLayout", { window.width(), window.height() });

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
        if (QLayout *lay = entry.header->layout()) {
            while (QLayoutItem *item = lay->takeAt(0)) {
                if (QWidget *w = item->widget()) {
                    w->hide();
                    w->setParent(nullptr);
                    w->deleteLater();
                }
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
                tabBtn->setMinimumWidth(0);
                const QString tabId = tid;
                QObject::connect(tabBtn, &QPushButton::clicked, q, [this, tabId] {
                    const QString json = QString::fromUtf8(QJsonDocument(QJsonObject{ { QStringLiteral("dock"), tabId } }).toJson(QJsonDocument::Compact));
                    q->runDockOp(QStringLiteral("activateTab"), json);
                });
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
            if (!visibleTabs.isEmpty() && docks.contains(activeId)) {
                const QJSValue boxVal = boxesObj.property(activeId);
                targetW = qMax(40, boxVal.property(QStringLiteral("width")).toInt());
            } else {
                const int fallbackThick = areaSpec.value(QStringLiteral("size")).toInt(docks[activeId].designWidth);
                targetW = qMax(40, fallbackThick);
            }

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
                if (qtThicknessOrient == Qt::Horizontal) {
                    de.dock->setMinimumSize(targetW, 30);
                    de.dock->setMaximumSize(targetW, QWIDGETSIZE_MAX);
                } else {
                    de.dock->setMinimumSize(40, 30);
                    de.dock->setMaximumSize(QWIDGETSIZE_MAX, QWIDGETSIZE_MAX);
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

                for (const QString &tid : allTabs) {
                    if (tid == anchorId)
                        continue;
                    window.tabifyDockWidget(groupFirstDock, docks[tid].dock);
                    if (docks[tid].dock->isFloating())
                        docks[tid].dock->setFloating(false);
                }
            }

            for (const QString &tid : allTabs) {
                DockEntry &de = docks[tid];
                if (de.isClosed) {
                    de.dock->setVisible(false);
                } else if (tid == activeId) {
                    de.header->setVisible(true);
                    de.body->setVisible(true);
                    de.dock->setVisible(true);
                    populateHeader(de, visibleTabs, activeId, false);
                } else {
                    de.header->setVisible(false);
                    de.body->setVisible(false);
                    de.dock->setVisible(true);
                    inactiveTabDocks.insert(tid);
                }
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
                const int fallbackThick = areaSpec.value(QStringLiteral("size")).toInt(
                    (qtThicknessOrient == Qt::Horizontal) ? docks[activeId].designWidth : docks[activeId].designHeight);
                const int fallbackSplit = gObj.value(QStringLiteral("size")).toInt(
                    (qtSplitOrient == Qt::Horizontal) ? docks[activeId].designWidth : docks[activeId].designHeight);
                const int thickVal = qMax(40, fallbackThick);
                plan.anchors.append(groupFirstDock);
                plan.thicknesses.append(thickVal);
                plan.splitSizes.append(qMax(30, fallbackSplit));
                for (const QString &tid : allTabs) {
                    plan.allDocks.append(docks[tid].dock);
                    plan.allThicknesses.append(thickVal);
                }
            }
        }

        if (!plan.anchors.isEmpty())
            resizePlans.append(plan);
    }

    // 先激活布局使 QTabBar 生成，再调用 raise() 切换各叠页签组的激活页签，随后调用 resizeDocks 设置各区厚度与组间分栏比例
    if (window.layout())
        window.layout()->activate();
    for (QTabBar *tb : window.findChildren<QTabBar *>(QString(), Qt::FindDirectChildrenOnly)) {
        tb->setMinimumSize(0, 0);
        tb->setFixedSize(0, 0);
    }
    for (QDockWidget *activeDock : activeDocksToRaise)
        activeDock->raise();
    if (window.layout())
        window.layout()->activate();
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

    if (window.layout())
        window.layout()->activate();
    QApplication::sendPostedEvents(nullptr, QEvent::LayoutRequest);

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

    if (draggingSplitterIdx < 0)
        rebuildDockSplitters();
    applyingLayout = prevApplying;
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
            if (!it->dock || it->dock->isFloating() || it->dock->isHidden())
                continue;
            if (window.dockWidgetArea(it->dock) == qtArea)
                visibleGroupDocks.append(it->dock);
        }
        if (visibleGroupDocks.isEmpty())
            continue;

        QRect areaRect = visibleGroupDocks.first()->geometry();
        for (int i = 1; i < visibleGroupDocks.size(); ++i)
            areaRect = areaRect.united(visibleGroupDocks.at(i)->geometry());

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
            areaEntry.initialSize = visibleGroupDocks.first()->width();
        } else if (areaKey == QLatin1String("right")) {
            areaBar->setGeometry(areaRect.left() - 2, areaRect.top(), 4, areaRect.height());
            areaBar->setCursor(Qt::SplitHCursor);
            areaEntry.orientation = Qt::Horizontal;
            areaEntry.initialSize = visibleGroupDocks.first()->width();
        } else if (areaKey == QLatin1String("top")) {
            areaBar->setGeometry(areaRect.left(), areaRect.bottom() - 1, areaRect.width(), 4);
            areaBar->setCursor(Qt::SplitVCursor);
            areaEntry.orientation = Qt::Vertical;
            areaEntry.initialSize = visibleGroupDocks.first()->height();
        } else {
            areaBar->setGeometry(areaRect.left(), areaRect.top() - 2, areaRect.width(), 4);
            areaBar->setCursor(Qt::SplitVCursor);
            areaEntry.orientation = Qt::Vertical;
            areaEntry.initialSize = visibleGroupDocks.first()->height();
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
                splitBar->setObjectName(QStringLiteral("vf_qt_splitter_split_%1_%2").arg(areaKey).arg(gi));
                DockSplitterEntry splitEntry;
                splitEntry.kind = QStringLiteral("split");
                splitEntry.area = areaKey;
                splitEntry.groupIndex = gi;
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

void Ui::Private::applyFloatBoxes(const QJSValue &views)
{
    if (floatBoxes.isEmpty())
        return;
    const QJSValue boxesObj = call("computeLayout", { window.width(), window.height() });
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
    for (auto it = docks.begin(); it != docks.end(); ++it) {
        QDockWidget *dw = it->dock;
        if (!dw || !dw->isFloating() || dw->isHidden())
            continue;
        const QPoint local = dw->mapFromGlobal(globalPos);
        if (!dw->rect().contains(local))
            continue;
        QWidget *widget = dw->childAt(local);
        if (!widget)
            widget = dw;
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
