// 界面绑定层。由 VibeFrontend 导出，不要手改：下次导出会整个覆盖。
#include "UiDriver.h"

#include "Ui.h"

#include <QAction>
#include <QApplication>
#include <QCheckBox>
#include <QComboBox>
#include <QDialog>
#include <QDialogButtonBox>
#include <QDockWidget>
#include <QDropEvent>
#include <QEnterEvent>
#include <QEventLoop>
#include <QFrame>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QKeyEvent>
#include <QLineEdit>
#include <QListWidget>
#include <QMainWindow>
#include <QMimeData>
#include <QMouseEvent>
#include <QPlainTextEdit>
#include <QPushButton>
#include <QScopeGuard>
#include <QScrollBar>
#include <QSlider>
#include <QSpinBox>
#include <QTabBar>
#include <QTextCursor>
#include <QTimer>
#include <QTreeWidget>
#include <QWidget>

#include <algorithm>

namespace vf {

namespace {

// 按步骤运行时挡掉本机鼠标，结果不取决于光标碰巧停在哪里。
// Qt 在控件显示、隐藏时还会按光标位置合成 Enter / Leave，这些不是自发事件，所以进出事件除了驱动自己发的都挡。
// 设了环境变量 VF_STEPS_OS_MOUSE 时放行，用来在跑步骤时手工或用系统鼠标操作
class OsPointerBlocker : public QObject
{
public:
    using QObject::QObject;
    bool driverSending = false;

protected:
    bool eventFilter(QObject *watched, QEvent *event) override
    {
        switch (event->type()) {
        case QEvent::Enter:
        case QEvent::Leave:
            return !driverSending;
        case QEvent::MouseButtonPress:
        case QEvent::MouseButtonRelease:
        case QEvent::MouseButtonDblClick:
        case QEvent::MouseMove:
        case QEvent::Wheel:
            return event->spontaneous() && watched->isWindowType();
        default:
            return false;
        }
    }
};

OsPointerBlocker *osPointerBlocker = nullptr;

void sendPointerCrossing(QWidget *widget, QEvent *event)
{
    if (osPointerBlocker)
        osPointerBlocker->driverSending = true;
    QApplication::sendEvent(widget, event);
    if (osPointerBlocker)
        osPointerBlocker->driverSending = false;
}

void waitMs(int ms)
{
    QEventLoop loop;
    QTimer::singleShot(ms, &loop, &QEventLoop::quit);
    loop.exec();
}

// 发出的是真的鼠标事件，走和用户操作相同的路径
void sendMouse(QWidget *widget, QEvent::Type type, Qt::MouseButtons buttons)
{
    const QPointF local = widget->rect().center();
    QMouseEvent event(type, local, widget->mapToGlobal(local), Qt::LeftButton, buttons, Qt::NoModifier);
    QApplication::sendEvent(widget, &event);
}

// 和真实鼠标一样：按下落在哪个最里层的控件上，直到松开的所有事件都发给它
// viaMidpoint 为 false 时一步拖到终点：分隔条每移动一次都按比例重算并取整，分两步会和一步到位差 1 像素
void sendMouseDrag(QWidget *pressed, const QPoint &pressLocal, const QPoint &endGlobal, Qt::KeyboardModifiers mods = Qt::NoModifier, bool viaMidpoint = true)
{
    QWidget *child = pressed->childAt(pressLocal);
    QWidget *widget = child ? child : pressed;
    const QPoint startLocal = widget->mapFrom(pressed, pressLocal);
    const QPoint startGlobal = widget->mapToGlobal(startLocal);
    const QPoint midGlobal((startGlobal.x() + endGlobal.x()) / 2, (startGlobal.y() + endGlobal.y()) / 2);
    QMouseEvent press(QEvent::MouseButtonPress, QPointF(startLocal), QPointF(startGlobal), Qt::LeftButton, Qt::LeftButton, mods);
    QApplication::sendEvent(widget, &press);
    if (viaMidpoint) {
        QMouseEvent move1(QEvent::MouseMove, QPointF(widget->mapFromGlobal(midGlobal)), QPointF(midGlobal), Qt::NoButton, Qt::LeftButton, mods);
        QApplication::sendEvent(widget, &move1);
    }
    QMouseEvent move2(QEvent::MouseMove, QPointF(widget->mapFromGlobal(endGlobal)), QPointF(endGlobal), Qt::NoButton, Qt::LeftButton, mods);
    QApplication::sendEvent(widget, &move2);
    QMouseEvent release(QEvent::MouseButtonRelease, QPointF(widget->mapFromGlobal(endGlobal)), QPointF(endGlobal), Qt::LeftButton, Qt::NoButton, mods);
    QApplication::sendEvent(widget, &release);
    QApplication::processEvents();
}

void click(QWidget *widget)
{
    auto *cb = qobject_cast<QCheckBox *>(widget);
    const bool cbBefore = cb ? cb->isChecked() : false;
    sendMouse(widget, QEvent::MouseButtonPress, Qt::LeftButton);
    sendMouse(widget, QEvent::MouseButtonRelease, Qt::NoButton);
    if (cb && cb->isEnabled() && !cb->isHidden() && cb->isChecked() == cbBefore)
        cb->toggle();
}

template <typename T>
T *findVisibleWidget(QWidget *root, const QString &objectName)
{
    const QList<T *> list = root->findChildren<T *>(objectName);
    for (T *w : list) {
        if (w && !w->isHidden() && w->isVisible())
            return w;
    }
    return nullptr;
}

// 拖一个面板时按住的地方：它的页签按钮（没激活的页签也能直接拖）
QPushButton *dockDragHandle(Ui &ui, const QString &dockId)
{
    return findVisibleWidget<QPushButton>(ui.window(), QStringLiteral("vf_dock_tab_") + dockId);
}

// 叠页签时只有激活的面板在窗口里，其余的被 QMainWindow 移到窗口外面，所以按位置认
QDockWidget *shownDockOfGroup(Ui &ui, QDockWidget *dock)
{
    auto *mw = qobject_cast<QMainWindow *>(ui.window());
    if (!mw)
        return dock;
    QList<QDockWidget *> group = mw->tabifiedDockWidgets(dock);
    group.prepend(dock);
    for (QDockWidget *member : group) {
        if (member && !member->isHidden() && mw->rect().intersects(member->geometry()))
            return member;
    }
    return dock;
}

// 在面板上找一个松手会触发 wanted 的点，离 preferred 最近的优先。
// 找不到说明这个操作拖不出来（比如面板太薄，都落在窗口边缘的吸附带里），和预览里的手势一样做不到
bool findDropPoint(Ui &ui, const QString &dockId, QDockWidget *target, const QString &wanted, const QPoint &preferred, QPoint *outGlobal)
{
    // 判定一个点要过一次逻辑层，所以由近及远试，命中就停
    QList<QPoint> points;
    for (int y = 1; y < target->height(); y += 5) {
        for (int x = 1; x < target->width(); x += 5)
            points.append(QPoint(x, y));
    }
    std::sort(points.begin(), points.end(), [&preferred](const QPoint &a, const QPoint &b) {
        return (a - preferred).manhattanLength() < (b - preferred).manhattanLength();
    });
    for (const QPoint &p : points) {
        const QPoint global = target->mapToGlobal(p);
        if (ui.dockDropAt(dockId, global) == wanted) {
            *outGlobal = global;
            return true;
        }
    }
    return false;
}

// 标题栏上没有按钮的一点；按钮把标题栏占满时返回 false
bool headerBlankPoint(QWidget *header, QPoint *out)
{
    for (int x = header->width() / 2; x > 0; x -= 4) {
        const QPoint p(x, header->height() / 2);
        if (!header->childAt(p)) {
            *out = p;
            return true;
        }
    }
    return false;
}

QString toText(const QJsonValue &value)
{
    return QString::fromUtf8(QJsonDocument(QJsonObject{ { QStringLiteral("v"), value } }).toJson(QJsonDocument::Compact));
}

bool dockLayoutsMatch(const QJsonObject &wanted, const QJsonObject &actual, int tolerancePx = 3)
{
    const QJsonObject wAreas = wanted.value(QStringLiteral("areas")).toObject();
    const QJsonObject aAreas = actual.value(QStringLiteral("areas")).toObject();
    for (const QString &areaKey : { QStringLiteral("top"), QStringLiteral("bottom"), QStringLiteral("left"), QStringLiteral("right") }) {
        const QJsonObject wArea = wAreas.value(areaKey).toObject();
        const QJsonObject aArea = aAreas.value(areaKey).toObject();
        const QJsonArray wGroups = wArea.value(QStringLiteral("groups")).toArray();
        const QJsonArray aGroups = aArea.value(QStringLiteral("groups")).toArray();
        if (wGroups.size() != aGroups.size())
            return false;
        if (!wGroups.isEmpty()) {
            if (wArea.contains(QStringLiteral("size"))
                && qAbs(wArea.value(QStringLiteral("size")).toInt() - aArea.value(QStringLiteral("size")).toInt()) > tolerancePx)
                return false;
            // 并排方向只能从两个以上看得见的组的位置量出来
            int shownGroups = 0;
            for (const QJsonValue &wg : wGroups) {
                if (wg.toObject().contains(QStringLiteral("size")))
                    ++shownGroups;
            }
            if (shownGroups >= 2
                && wArea.value(QStringLiteral("splitOrientation")).toString() != aArea.value(QStringLiteral("splitOrientation")).toString())
                return false;
            for (int gi = 0; gi < wGroups.size(); ++gi) {
                const QJsonObject wg = wGroups.at(gi).toObject();
                const QJsonObject ag = aGroups.at(gi).toObject();
                if (wg.value(QStringLiteral("tabs")).toArray() != ag.value(QStringLiteral("tabs")).toArray())
                    return false;
                if (wg.value(QStringLiteral("active")).toString() != ag.value(QStringLiteral("active")).toString())
                    return false;
                if (wg.contains(QStringLiteral("size"))
                    && qAbs(wg.value(QStringLiteral("size")).toInt() - ag.value(QStringLiteral("size")).toInt()) > tolerancePx)
                    return false;
            }
        }
    }

    const QJsonArray wFloat = wanted.value(QStringLiteral("floating")).toArray();
    const QJsonArray aFloat = actual.value(QStringLiteral("floating")).toArray();
    if (wFloat.size() != aFloat.size())
        return false;
    for (int fi = 0; fi < wFloat.size(); ++fi) {
        const QJsonObject wf = wFloat.at(fi).toObject();
        const QJsonObject af = aFloat.at(fi).toObject();
        if (wf.value(QStringLiteral("dockId")).toString() != af.value(QStringLiteral("dockId")).toString())
            return false;
        if (wf.value(QStringLiteral("lastArea")).toString() != af.value(QStringLiteral("lastArea")).toString())
            return false;
        if (qAbs(wf.value(QStringLiteral("x")).toInt() - af.value(QStringLiteral("x")).toInt()) > tolerancePx)
            return false;
        if (qAbs(wf.value(QStringLiteral("y")).toInt() - af.value(QStringLiteral("y")).toInt()) > tolerancePx)
            return false;
        if (qAbs(wf.value(QStringLiteral("width")).toInt() - af.value(QStringLiteral("width")).toInt()) > tolerancePx)
            return false;
        if (qAbs(wf.value(QStringLiteral("height")).toInt() - af.value(QStringLiteral("height")).toInt()) > tolerancePx)
            return false;
    }
    return true;
}

// 逻辑认为各控件应有的样子，和各控件实际的样子，逐项对照
QStringList compare(Ui &ui)
{
    const QJsonObject stateRoot = QJsonDocument::fromJson(ui.stateDump().toUtf8()).object();
    const QJsonObject views = stateRoot.value(QStringLiteral("views")).toObject();
    const QJsonObject widgets = QJsonDocument::fromJson(ui.widgetDump().toUtf8()).object();
    QStringList lines;
    for (auto it = widgets.begin(); it != widgets.end(); ++it) {
        const QJsonObject wanted = views.value(it.key()).toObject();
        const QJsonObject actual = it.value().toObject();
        for (const QString &key : { QStringLiteral("visible"), QStringLiteral("enabled"), QStringLiteral("stateImage"), QStringLiteral("visualState") }) {
            if ((wanted.contains(key) || actual.contains(key)) && wanted.value(key) != actual.value(key)) {
                lines.append(QStringLiteral("check MISMATCH %1.%2 wanted=%3 actual=%4")
                                 .arg(it.key(), key, toText(wanted.value(key)), toText(actual.value(key))));
            }
        }
        const QJsonObject wantedProps = wanted.value(QStringLiteral("props")).toObject();
        const QJsonObject actualProps = actual.value(QStringLiteral("props")).toObject();
        for (auto prop = actualProps.begin(); prop != actualProps.end(); ++prop) {
            if (wantedProps.contains(prop.key()) && wantedProps.value(prop.key()) != prop.value()) {
                lines.append(QStringLiteral("check MISMATCH %1.props.%2 wanted=%3 actual=%4")
                                 .arg(it.key(), prop.key(), toText(wantedProps.value(prop.key())), toText(prop.value())));
            }
        }
    }
    if (stateRoot.contains(QStringLiteral("docks"))) {
        const QJsonObject wantedDocks = QJsonDocument::fromJson(ui.wantedDockDump().toUtf8()).object();
        const QJsonObject actualDocks = QJsonDocument::fromJson(ui.dockDump().toUtf8()).object();
        if (!dockLayoutsMatch(wantedDocks, actualDocks)) {
            lines.append(QStringLiteral("check MISMATCH docks wanted=%1 actual=%2")
                             .arg(toText(wantedDocks), toText(actualDocks)));
        }
    }
    if (lines.isEmpty())
        lines.append(QStringLiteral("check ok"));
    return lines;
}

} // namespace

QStringList runSteps(Ui &ui, const QStringList &steps)
{
    QStringList output;
    OsPointerBlocker blocker;
    if (!qEnvironmentVariableIsSet("VF_STEPS_OS_MOUSE")) {
        osPointerBlocker = &blocker;
        qApp->installEventFilter(&blocker);
    }
    const auto clearBlocker = qScopeGuard([] { osPointerBlocker = nullptr; });

    // 不变量：除了明确改窗口的步骤，主窗口尺寸不变。布局代码把窗口撑大时在这里报错
    QSize expectedWindowSize = ui.window()->size();
    QString previousStep;
    const auto checkWindowSize = [&] {
        const QString previousVerb = previousStep.section(QLatin1Char(':'), 0, 0);
        const QSize actual = ui.window()->size();
        if (previousVerb == QLatin1String("resize") || previousVerb == QLatin1String("window")) {
            expectedWindowSize = actual;
        } else if (actual != expectedWindowSize) {
            output.append(QStringLiteral("check MISMATCH windowSize step=%1 wanted=%2x%3 actual=%4x%5")
                              .arg(previousStep).arg(expectedWindowSize.width()).arg(expectedWindowSize.height())
                              .arg(actual.width()).arg(actual.height()));
            expectedWindowSize = actual;
        }
    };
    const auto finalWindowCheck = qScopeGuard(checkWindowSize);
    QApplication::processEvents();
    for (const QString &raw : steps) {
        const QString step = raw.trimmed();
        if (step.isEmpty())
            continue;
        checkWindowSize();
        previousStep = step;
        const QString verb = step.section(QLatin1Char(':'), 0, 0);
        const QString id = step.section(QLatin1Char(':'), 1, 1);

        if (verb == QLatin1String("state")) {
            output.append(QStringLiteral("state ") + ui.stateDump());
            continue;
        }
        if (verb == QLatin1String("docks")) {
            QApplication::processEvents();
            output.append(QStringLiteral("docks ") + ui.dockDump());
            continue;
        }
        if (verb == QLatin1String("layout")) {
            output.append(QStringLiteral("layout ") + ui.layoutDump());
            continue;
        }
        if (verb == QLatin1String("check") && id.isEmpty()) {
            output += compare(ui);
            continue;
        }
        if (verb == QLatin1String("check")) {
            const int row = step.section(QLatin1Char(':'), 2, 2).toInt();
            const QString rawBool = step.section(QLatin1Char(':'), 3, 3);
            const bool checked = (rawBool == QLatin1String("1") || rawBool == QLatin1String("true") || rawBool == QLatin1String("on"));
            bool handledViaWidget = false;
            if (auto *tree = ui.window()->findChild<QTreeWidget *>(id)) {
                for (int i = 0; i < tree->topLevelItemCount(); ++i) {
                    QTreeWidgetItem *it = tree->topLevelItem(i);
                    if (it->data(0, Qt::UserRole).toInt() == row && (it->flags() & Qt::ItemIsUserCheckable)) {
                        const Qt::CheckState targetState = checked ? Qt::Checked : Qt::Unchecked;
                        if (it->checkState(0) != targetState) {
                            it->setCheckState(0, targetState);
                            handledViaWidget = true;
                        }
                        break;
                    }
                }
            }
            if (!handledViaWidget)
                ui.toggleTreeCheck(id, row, checked);
            QApplication::processEvents();
            continue;
        }
        if (verb == QLatin1String("collapse")) {
            const int row = step.section(QLatin1Char(':'), 2, 2).toInt();
            const QString rawBool = step.section(QLatin1Char(':'), 3, 3);
            const bool collapsed = (rawBool == QLatin1String("1") || rawBool == QLatin1String("true"));
            bool handledViaWidget = false;
            if (auto *tree = ui.window()->findChild<QTreeWidget *>(id)) {
                for (int i = 0; i < tree->topLevelItemCount(); ++i) {
                    QTreeWidgetItem *it = tree->topLevelItem(i);
                    if (it->data(0, Qt::UserRole).toInt() == row && it->data(0, Qt::UserRole + 3).toBool()) {
                        if (it->data(0, Qt::UserRole + 4).toBool() != collapsed) {
                            emit tree->itemDoubleClicked(it, 0);
                            handledViaWidget = true;
                        }
                        break;
                    }
                }
            }
            if (!handledViaWidget)
                ui.toggleTreeCollapse(id, row, collapsed);
            QApplication::processEvents();
            continue;
        }
        if (verb == QLatin1String("drag") || verb == QLatin1String("reorder")) {
            const int from = step.section(QLatin1Char(':'), 2, 2).toInt();
            const int to = step.section(QLatin1Char(':'), 3, 3).toInt();
            bool handledViaDrop = false;
            if (auto *tree = ui.window()->findChild<QTreeWidget *>(id)) {
                QTreeWidgetItem *fromItem = nullptr;
                QTreeWidgetItem *toItem = nullptr;
                for (int i = 0; i < tree->topLevelItemCount(); ++i) {
                    QTreeWidgetItem *it = tree->topLevelItem(i);
                    const int r = it->data(0, Qt::UserRole).toInt();
                    if (r == from) fromItem = it;
                    if (r == to) toItem = it;
                }
                if (fromItem && toItem && tree->viewport()) {
                    QMimeData mime;
                    mime.setProperty("vfDragFromRow", from);
                    mime.setProperty("vfDragToRow", to);
                    const QPointF dropPos = tree->visualItemRect(toItem).center();
                    QDropEvent dropEv(dropPos, Qt::MoveAction, &mime, Qt::LeftButton, Qt::NoModifier);
                    QApplication::sendEvent(tree->viewport(), &dropEv);
                    if (!dropEv.isAccepted())
                        static_cast<QObject &>(ui).eventFilter(tree->viewport(), &dropEv);
                    handledViaDrop = dropEv.isAccepted();
                }
            } else if (auto *list = ui.window()->findChild<QListWidget *>(id)) {
                if (from >= 0 && from < list->count() && to >= 0 && to < list->count() && list->viewport()) {
                    QMimeData mime;
                    mime.setProperty("vfDragFromRow", from);
                    mime.setProperty("vfDragToRow", to);
                    const QPointF dropPos = list->visualItemRect(list->item(to)).center();
                    QDropEvent dropEv(dropPos, Qt::MoveAction, &mime, Qt::LeftButton, Qt::NoModifier);
                    QApplication::sendEvent(list->viewport(), &dropEv);
                    if (!dropEv.isAccepted())
                        static_cast<QObject &>(ui).eventFilter(list->viewport(), &dropEv);
                    handledViaDrop = dropEv.isAccepted();
                }
            }
            if (!handledViaDrop)
                ui.reorderControl(id, from, to);
            QApplication::processEvents();
            continue;
        }
        if (verb == QLatin1String("form")) {
            const QString fieldName = step.section(QLatin1Char(':'), 2, 2);
            const QString rawVal = step.section(QLatin1Char(':'), 3);
            bool handledViaWidget = false;
            if (auto *frame = ui.window()->findChild<QFrame *>(id)) {
                const QList<QWidget *> cells = frame->findChildren<QWidget *>(QString(), Qt::FindDirectChildrenOnly);
                for (QWidget *cell : cells) {
                    if (cell->property("vfFieldName").toString() != fieldName || cell->isHidden())
                        continue;
                    const QList<QWidget *> inner = cell->findChildren<QWidget *>(QString(), Qt::FindDirectChildrenOnly);
                    for (QWidget *w : inner) {
                        const QString role = w->property("vfInputRole").toString();
                        if (role == QLatin1String("slider")) {
                            if (auto *slider = qobject_cast<QSlider *>(w)) {
                                const int targetV = qBound(slider->minimum(), rawVal.toInt(), slider->maximum());
                                if (slider->value() != targetV) {
                                    slider->setValue(targetV);
                                    handledViaWidget = true;
                                }
                            }
                        } else if (role == QLatin1String("combo")) {
                            if (auto *combo = qobject_cast<QComboBox *>(w)) {
                                int idx = combo->findData(rawVal);
                                if (idx < 0)
                                    idx = combo->findText(rawVal);
                                if (idx >= 0 && combo->currentIndex() != idx) {
                                    combo->setCurrentIndex(idx);
                                    handledViaWidget = true;
                                }
                            }
                        } else if (role == QLatin1String("check")) {
                            if (auto *cb = qobject_cast<QCheckBox *>(w)) {
                                const QString s = rawVal.trimmed().toLower();
                                const bool targetB = (s == QLatin1String("on") || s == QLatin1String("true") || s == QLatin1String("1"));
                                if (cb->isChecked() != targetB) {
                                    cb->setChecked(targetB);
                                    handledViaWidget = true;
                                }
                            }
                        } else if (role == QLatin1String("swatch")) {
                            if (auto *swBtn = qobject_cast<QPushButton *>(w)) {
                                if (swBtn->property("vfSwatchColor").toString() == rawVal) {
                                    swBtn->click();
                                    handledViaWidget = true;
                                    break;
                                }
                            }
                        } else if (role == QLatin1String("button") || role == QLatin1String("subwindow")) {
                            if (auto *btn = qobject_cast<QPushButton *>(w)) {
                                const QString btnVal = btn->property("vfBtnValue").toString();
                                if (btnVal.isEmpty() || btnVal == rawVal || rawVal == QLatin1String("true") || rawVal == QLatin1String("1")) {
                                    btn->click();
                                    handledViaWidget = true;
                                    break;
                                }
                            }
                        }
                    }
                    if (handledViaWidget)
                        break;
                }
            }
            if (!handledViaWidget)
                ui.setDataFormField(id, fieldName, rawVal);
            QApplication::processEvents();
            continue;
        }
        if (verb == QLatin1String("clock")) {
            ui.setClock(id.toInt());
            QApplication::processEvents();
            continue;
        }
        if (verb == QLatin1String("wait")) {
            waitMs(id.toInt());
            continue;
        }
        if (verb == QLatin1String("resize")) {
            const int w = id.section(QLatin1Char('x'), 0, 0).toInt();
            const int h = id.section(QLatin1Char('x'), 1, 1).toInt();
            if (w > 0 && h > 0)
                ui.window()->resize(w, h);
            continue;
        }
        if (verb == QLatin1String("break")) {
            // 故意弄坏控件状态，用来证明 check 查得出来
            if (id == QLatin1String("hide"))
                ui.hideDockBehindLogic(step.section(QLatin1Char(':'), 2, 2));
            continue;
        }
        if (verb == QLatin1String("window")) {
            if (id == QLatin1String("minimize"))
                ui.window()->showMinimized();
            else if (id == QLatin1String("restore"))
                ui.window()->showNormal();
            QApplication::processEvents();
            continue;
        }
        if (verb == QLatin1String("request")) {
            const QString jsonArgs = step.section(QLatin1Char(':'), 2);
            ui.triggerRequest(id, jsonArgs);
            QApplication::processEvents();
            continue;
        }
        if (verb == QLatin1String("mock")) {
            const QString mode = step.section(QLatin1Char(':'), 2, 2);
            const int delayMs = step.section(QLatin1Char(':'), 3, 3).toInt();
            ui.setActionSimulation(id, mode, delayMs);
            QApplication::processEvents();
            continue;
        }
        if (verb == QLatin1String("shot")) {
            // 路径里可能有冒号，所以取第一个冒号之后的全部
            const QString file = step.section(QLatin1Char(':'), 1);
            const bool saved = ui.window()->grab().save(file);
            output.append(QStringLiteral("shot %1 %2").arg(saved ? QStringLiteral("saved") : QStringLiteral("FAILED"), file));
            continue;
        }
        if (verb == QLatin1String("dock")) {
            const QString op = id;
            const QString arg1 = step.section(QLatin1Char(':'), 2, 2);
            const QString arg2 = step.section(QLatin1Char(':'), 3, 3);
            const QString arg3 = step.section(QLatin1Char(':'), 4, 4);
            const QString arg4 = step.section(QLatin1Char(':'), 5, 5);
            QJsonObject args;
            if (op == QLatin1String("tabify")) {
                QPushButton *handle = dockDragHandle(ui, arg2);
                auto *targetDock = ui.window()->findChild<QDockWidget *>(arg1);
                if (handle && arg1 != arg2 && targetDock && !targetDock->isHidden() && !targetDock->isFloating()) {
                    QDockWidget *visualTarget = shownDockOfGroup(ui, targetDock);
                    QPoint endGlobal;
                    if (findDropPoint(ui, arg2, visualTarget, QStringLiteral("tabify"), visualTarget->rect().center(), &endGlobal)) {
                        sendMouseDrag(handle, handle->rect().center(), endGlobal);
                        continue;
                    }
                }
                args.insert(QStringLiteral("target"), arg1);
                args.insert(QStringLiteral("dock"), arg2);
            } else if (op == QLatin1String("tab") || op == QLatin1String("activateTab")) {
                if (auto *tabBtn = findVisibleWidget<QPushButton>(ui.window(), QStringLiteral("vf_dock_tab_") + arg1)) {
                    click(tabBtn);
                    QApplication::processEvents();
                    continue;
                }
                args.insert(QStringLiteral("dock"), arg1);
            } else if (op == QLatin1String("float")) {
                if (arg2.isEmpty()) {
                    if (!findVisibleWidget<QPushButton>(ui.window(), QStringLiteral("vf_dock_float_") + arg1)) {
                        if (auto *tabBtn = findVisibleWidget<QPushButton>(ui.window(), QStringLiteral("vf_dock_tab_") + arg1)) {
                            click(tabBtn);
                            QApplication::processEvents();
                        }
                    }
                    if (auto *floatBtn = findVisibleWidget<QPushButton>(ui.window(), QStringLiteral("vf_dock_float_") + arg1)) {
                        click(floatBtn);
                        QApplication::processEvents();
                        continue;
                    }
                } else {
                    const QStringList parts = arg2.split(QLatin1Char(','));
                    auto *dw = ui.window()->findChild<QDockWidget *>(arg1);
                    if (dw && !dw->isHidden() && parts.size() >= 2) {
                        if (!findVisibleWidget<QWidget>(ui.window(), QStringLiteral("vf_dock_hdr_") + arg1)) {
                            if (auto *tabBtn = findVisibleWidget<QPushButton>(ui.window(), QStringLiteral("vf_dock_tab_") + arg1)) {
                                click(tabBtn);
                                QApplication::processEvents();
                            }
                        }
                        if (!dw->isFloating()) {
                            if (auto *floatBtn = findVisibleWidget<QPushButton>(ui.window(), QStringLiteral("vf_dock_float_") + arg1)) {
                                click(floatBtn);
                                QApplication::processEvents();
                            }
                        }
                        auto *hdr = findVisibleWidget<QWidget>(ui.window(), QStringLiteral("vf_dock_hdr_") + arg1);
                        if (hdr) {
                            const int tx = parts.at(0).toInt();
                            const int ty = parts.at(1).toInt();
                            const QPoint curRel = ui.window()->mapFromGlobal(dw->mapToGlobal(QPoint(0, 0)));
                            const QPoint delta(tx - curRel.x(), ty - curRel.y());
                            if (delta != QPoint(0, 0)) {
                                QPoint pressAt;
                                QWidget *pressOn = hdr;
                                if (!headerBlankPoint(hdr, &pressAt)) {
                                    pressOn = dockDragHandle(ui, arg1);
                                    pressAt = pressOn ? pressOn->rect().center() : QPoint();
                                }
                                if (pressOn) {
                                    const QPoint startGlobal = pressOn->mapToGlobal(pressAt);
                                    sendMouseDrag(pressOn, pressAt, startGlobal + delta, Qt::ShiftModifier);
                                }
                            }
                        }
                        if (parts.size() >= 4) {
                            const int tw = parts.at(2).toInt();
                            const int th = parts.at(3).toInt();
                            if (auto *resizer = findVisibleWidget<QWidget>(ui.window(), QStringLiteral("vf_dock_resizer_") + arg1)) {
                                const QPoint rDelta(tw - dw->width(), th - dw->height());
                                if (rDelta != QPoint(0, 0)) {
                                    const QPoint rStartGlobal = resizer->mapToGlobal(resizer->rect().center());
                                    sendMouseDrag(resizer, resizer->rect().center(), rStartGlobal + rDelta);
                                }
                            }
                        }
                        if (dw->isFloating())
                            continue;
                    }
                }
                args.insert(QStringLiteral("dock"), arg1);
                if (!arg2.isEmpty()) {
                    const QStringList parts = arg2.split(QLatin1Char(','));
                    if (parts.size() >= 2) {
                        args.insert(QStringLiteral("x"), parts.at(0).toInt());
                        args.insert(QStringLiteral("y"), parts.at(1).toInt());
                    }
                    if (parts.size() >= 4) {
                        args.insert(QStringLiteral("width"), parts.at(2).toInt());
                        args.insert(QStringLiteral("height"), parts.at(3).toInt());
                    }
                }
            } else if (op == QLatin1String("restore")) {
                if (arg2.isEmpty()) {
                    if (auto *resBtn = findVisibleWidget<QPushButton>(ui.window(), QStringLiteral("vf_dock_restore_") + arg1)) {
                        click(resBtn);
                        QApplication::processEvents();
                        continue;
                    }
                }
                args.insert(QStringLiteral("dock"), arg1);
                if (!arg2.isEmpty())
                    args.insert(QStringLiteral("area"), arg2);
            } else if (op == QLatin1String("move")) {
                if (arg3.isEmpty()) {
                    if (QPushButton *handle = dockDragHandle(ui, arg1)) {
                        const int w = ui.window()->width();
                        const int h = ui.window()->height();
                        QPoint edgeLocal(w / 2, h / 2);
                        if (arg2 == QLatin1String("left"))
                            edgeLocal = QPoint(8, h / 2);
                        else if (arg2 == QLatin1String("right"))
                            edgeLocal = QPoint(w - 8, h / 2);
                        else if (arg2 == QLatin1String("top"))
                            edgeLocal = QPoint(w / 2, 40);
                        else if (arg2 == QLatin1String("bottom"))
                            edgeLocal = QPoint(w / 2, h - 36);
                        sendMouseDrag(handle, handle->rect().center(), ui.window()->mapToGlobal(edgeLocal));
                        continue;
                    }
                }
                args.insert(QStringLiteral("dock"), arg1);
                args.insert(QStringLiteral("area"), arg2);
                if (!arg3.isEmpty())
                    args.insert(QStringLiteral("index"), arg3.toInt());
            } else if (op == QLatin1String("split")) {
                QPushButton *handle = dockDragHandle(ui, arg2);
                auto *targetDock = ui.window()->findChild<QDockWidget *>(arg1);
                if (handle && arg1 != arg2 && targetDock && !targetDock->isHidden() && !targetDock->isFloating()) {
                    QDockWidget *visualTarget = shownDockOfGroup(ui, targetDock);
                    const QString pos = arg3.isEmpty() ? QStringLiteral("after") : arg3;
                    QString orient = arg4;
                    if (orient.isEmpty()) {
                        // 不写方向时沿用该停靠区现有的并排方向，和逻辑层相同
                        auto *mw = qobject_cast<QMainWindow *>(ui.window());
                        const Qt::DockWidgetArea a = mw ? mw->dockWidgetArea(visualTarget) : Qt::LeftDockWidgetArea;
                        const bool side = (a == Qt::LeftDockWidgetArea || a == Qt::RightDockWidgetArea);
                        const QString areaKey = a == Qt::LeftDockWidgetArea ? QStringLiteral("left")
                            : a == Qt::RightDockWidgetArea ? QStringLiteral("right")
                            : a == Qt::TopDockWidgetArea ? QStringLiteral("top") : QStringLiteral("bottom");
                        const QJsonObject curDocks = QJsonDocument::fromJson(ui.dockDump().toUtf8()).object();
                        orient = curDocks.value(QStringLiteral("areas")).toObject().value(areaKey).toObject()
                                     .value(QStringLiteral("splitOrientation")).toString(side ? QStringLiteral("vertical") : QStringLiteral("horizontal"));
                    }
                    QPoint preferred = visualTarget->rect().center();
                    if (orient == QLatin1String("vertical"))
                        preferred.setY(int(visualTarget->height() * (pos == QLatin1String("before") ? 0.12 : 0.88)));
                    else
                        preferred.setX(int(visualTarget->width() * (pos == QLatin1String("before") ? 0.10 : 0.90)));
                    QPoint endGlobal;
                    if (findDropPoint(ui, arg2, visualTarget, QStringLiteral("split:%1:%2").arg(pos, orient), preferred, &endGlobal)) {
                        sendMouseDrag(handle, handle->rect().center(), endGlobal);
                        continue;
                    }
                }
                args.insert(QStringLiteral("target"), arg1);
                args.insert(QStringLiteral("dock"), arg2);
                if (!arg3.isEmpty())
                    args.insert(QStringLiteral("position"), arg3);
                if (!arg4.isEmpty())
                    args.insert(QStringLiteral("orientation"), arg4);
            } else if (op == QLatin1String("resize") || op == QLatin1String("resizeArea")) {
                const int targetSize = arg2.toInt();
                auto *sp = findVisibleWidget<QWidget>(ui.window(), QStringLiteral("vf_qt_splitter_area_") + arg1);
                if (sp && targetSize > 0) {
                    const QJsonObject curDocks = QJsonDocument::fromJson(ui.dockDump().toUtf8()).object();
                    const int curSize = curDocks.value(QStringLiteral("areas")).toObject().value(arg1).toObject().value(QStringLiteral("size")).toInt();
                    if (curSize > 0) {
                        QPoint delta(0, 0);
                        if (arg1 == QLatin1String("left"))
                            delta.setX(targetSize - curSize);
                        else if (arg1 == QLatin1String("right"))
                            delta.setX(-(targetSize - curSize));
                        else if (arg1 == QLatin1String("top"))
                            delta.setY(targetSize - curSize);
                        else if (arg1 == QLatin1String("bottom"))
                            delta.setY(-(targetSize - curSize));
                        const QPoint startGlobal = sp->mapToGlobal(sp->rect().center());
                        sendMouseDrag(sp, sp->rect().center(), startGlobal + delta, Qt::NoModifier, false);
                        continue;
                    }
                }
                args.insert(QStringLiteral("area"), arg1);
                args.insert(QStringLiteral("size"), targetSize);
            } else if (op == QLatin1String("resizeSplit")) {
                const int gi = arg2.toInt();
                const int targetSize = arg3.toInt();
                auto *sp = findVisibleWidget<QWidget>(ui.window(), QStringLiteral("vf_qt_splitter_split_%1_%2").arg(arg1).arg(gi));
                if (sp && targetSize > 0) {
                    const QJsonObject curDocks = QJsonDocument::fromJson(ui.dockDump().toUtf8()).object();
                    const QJsonObject areaObj = curDocks.value(QStringLiteral("areas")).toObject().value(arg1).toObject();
                    const QJsonArray groups = areaObj.value(QStringLiteral("groups")).toArray();
                    if (gi >= 0 && gi < groups.size()) {
                        const int curSize = groups.at(gi).toObject().value(QStringLiteral("size")).toInt();
                        const bool horiz = areaObj.value(QStringLiteral("splitOrientation")).toString() == QLatin1String("horizontal");
                        const QPoint delta = horiz ? QPoint(targetSize - curSize, 0) : QPoint(0, targetSize - curSize);
                        const QPoint startGlobal = sp->mapToGlobal(sp->rect().center());
                        sendMouseDrag(sp, sp->rect().center(), startGlobal + delta, Qt::NoModifier, false);
                        continue;
                    }
                }
                args.insert(QStringLiteral("area"), arg1);
                args.insert(QStringLiteral("groupIndex"), gi);
                args.insert(QStringLiteral("size"), targetSize);
            } else if (op == QLatin1String("close")) {
                if (auto *closeBtn = findVisibleWidget<QPushButton>(ui.window(), QStringLiteral("vf_dock_close_") + arg1)) {
                    click(closeBtn);
                    QApplication::processEvents();
                    continue;
                }
                args.insert(QStringLiteral("dock"), arg1);
            } else if (op == QLatin1String("open") || op == QLatin1String("toggle")) {
                args.insert(QStringLiteral("dock"), arg1);
            }
            const QString jsonArgs = QString::fromUtf8(QJsonDocument(args).toJson(QJsonDocument::Compact));
            ui.runDockOp(op, jsonArgs);
            QApplication::processEvents();
            continue;
        }
        if (verb == QLatin1String("floatbox")) {
            const QString op = id;
            const QString fbId = step.section(QLatin1Char(':'), 2, 2);
            const QString coordStr = step.section(QLatin1Char(':'), 3, 3);
            if (op == QLatin1String("move")) {
                QWidget *fbWidget = ui.window()->findChild<QWidget *>(fbId);
                QWidget *hdrWidget = ui.window()->findChild<QWidget *>(QStringLiteral("vf_floatbox_hdr_") + fbId);
                const QStringList parts = coordStr.split(QLatin1Char(','));
                if (fbWidget && hdrWidget && parts.size() >= 2) {
                    const int targetX = parts.at(0).toInt();
                    const int targetY = parts.at(1).toInt();
                    const QPoint startGlobal = hdrWidget->mapToGlobal(hdrWidget->rect().center());
                    const QPoint delta(targetX - fbWidget->x(), targetY - fbWidget->y());
                    const QPoint endGlobal = startGlobal + delta;
                    sendMouseDrag(hdrWidget, hdrWidget->rect().center(), endGlobal);
                    continue;
                }
            }
        }

        QWidget *widget = ui.window()->findChild<QWidget *>(id);
        if (!widget) {
            if (QAction *action = ui.window()->findChild<QAction *>(id)) {
                if (verb == QLatin1String("click")) {
                    action->trigger();
                    QApplication::processEvents();
                    continue;
                }
            }
            output.append(QStringLiteral("error 找不到控件 %1（步骤 %2）").arg(id, step));
            continue;
        }
        if (verb == QLatin1String("accept")) {
            if (auto *dbb = qobject_cast<QDialogButtonBox *>(widget))
                emit dbb->accepted();
            else if (auto *dlg = qobject_cast<QDialog *>(widget))
                dlg->accept();
            QApplication::processEvents();
            continue;
        }
        if (verb == QLatin1String("close") || verb == QLatin1String("reject")) {
            if (auto *dbb = qobject_cast<QDialogButtonBox *>(widget))
                emit dbb->rejected();
            else if (auto *dlg = qobject_cast<QDialog *>(widget))
                dlg->reject();
            else
                widget->close();
            QApplication::processEvents();
            continue;
        }
        if (verb == QLatin1String("size")) {
            output.append(QStringLiteral("size %1 %2x%3").arg(id).arg(widget->width()).arg(widget->height()));
            continue;
        }
        if (verb == QLatin1String("click")) {
            click(widget);
        } else if (verb == QLatin1String("press")) {
            sendMouse(widget, QEvent::MouseButtonPress, Qt::LeftButton);
        } else if (verb == QLatin1String("release")) {
            sendMouse(widget, QEvent::MouseButtonRelease, Qt::NoButton);
        } else if (verb == QLatin1String("dblclick")) {
            click(widget);
            sendMouse(widget, QEvent::MouseButtonDblClick, Qt::LeftButton);
            sendMouse(widget, QEvent::MouseButtonRelease, Qt::NoButton);
        } else if (verb == QLatin1String("enter")) {
            const QPointF local = widget->rect().center();
            QEnterEvent event(local, widget->mapTo(widget->window(), local), widget->mapToGlobal(local));
            sendPointerCrossing(widget, &event);
        } else if (verb == QLatin1String("leave")) {
            QEvent event(QEvent::Leave);
            sendPointerCrossing(widget, &event);
        } else if (verb == QLatin1String("type")) {
            const QString text = step.section(QLatin1Char(':'), 2);
            widget->setFocus();
            if (auto *area = qobject_cast<QPlainTextEdit *>(widget))
                area->moveCursor(QTextCursor::End);
            for (const QChar ch : text) {
                QKeyEvent press(QEvent::KeyPress, 0, Qt::NoModifier, QString(ch));
                QApplication::sendEvent(widget, &press);
                QKeyEvent release(QEvent::KeyRelease, 0, Qt::NoModifier, QString(ch));
                QApplication::sendEvent(widget, &release);
            }
        } else if (verb == QLatin1String("input") || verb == QLatin1String("spin")) {
            const QString rawVal = step.section(QLatin1Char(':'), 2);
            if (auto *spin = qobject_cast<QSpinBox *>(widget)) {
                spin->setValue(rawVal.toInt());
            } else if (auto *slider = qobject_cast<QSlider *>(widget)) {
                slider->setValue(rawVal.toInt());
            } else if (auto *bar = qobject_cast<QScrollBar *>(widget)) {
                bar->setValue(rawVal.toInt());
            } else if (auto *area = qobject_cast<QPlainTextEdit *>(widget)) {
                if (area->toPlainText() != rawVal)
                    area->setPlainText(rawVal);
            } else if (auto *edit = qobject_cast<QLineEdit *>(widget)) {
                edit->setText(rawVal);
                emit edit->textEdited(rawVal);
            } else if (rawVal == QLatin1String("pressed")) {
                sendMouse(widget, QEvent::MouseButtonPress, Qt::LeftButton);
            } else if (rawVal == QLatin1String("released")) {
                const QPointF outside(-10.0, -10.0);
                QMouseEvent event(QEvent::MouseButtonRelease, outside, widget->mapToGlobal(outside), Qt::LeftButton, Qt::NoButton, Qt::NoModifier);
                QApplication::sendEvent(widget, &event);
            }
        } else if (verb == QLatin1String("select")) {
            const QString rawVal = step.section(QLatin1Char(':'), 2);
            if (auto *combo = qobject_cast<QComboBox *>(widget)) {
                int idx = combo->findText(rawVal);
                if (idx < 0) {
                    bool ok = false;
                    const int n = rawVal.toInt(&ok);
                    if (ok && n >= 0 && n < combo->count())
                        idx = n;
                }
                if (idx >= 0)
                    combo->setCurrentIndex(idx);
            } else if (auto *list = qobject_cast<QListWidget *>(widget)) {
                bool ok = false;
                const int row = rawVal.toInt(&ok);
                if (ok && row >= 0 && row < list->count())
                    list->setCurrentRow(row);
            } else if (auto *tabs = qobject_cast<QTabBar *>(widget)) {
                int idx = -1;
                for (int i = 0; i < tabs->count(); ++i) {
                    if (tabs->tabText(i) == rawVal) {
                        idx = i;
                        break;
                    }
                }
                if (idx < 0) {
                    bool ok = false;
                    const int n = rawVal.toInt(&ok);
                    if (ok && n >= 0 && n < tabs->count())
                        idx = n;
                }
                if (idx >= 0)
                    tabs->setCurrentIndex(idx);
            } else if (auto *tree = qobject_cast<QTreeWidget *>(widget)) {
                bool ok = false;
                const int row = rawVal.toInt(&ok);
                if (ok) {
                    for (int i = 0; i < tree->topLevelItemCount(); ++i) {
                        QTreeWidgetItem *it = tree->topLevelItem(i);
                        if (it->data(0, Qt::UserRole).toInt() == row && !it->isHidden()) {
                            tree->setCurrentItem(it);
                            break;
                        }
                    }
                }
            }
        } else if (verb == QLatin1String("toggle")) {
            if (auto *cb = qobject_cast<QCheckBox *>(widget)) {
                cb->toggle();
            } else if (auto *btn = qobject_cast<QPushButton *>(widget)) {
                if (btn->isCheckable())
                    btn->toggle();
            } else if (auto *fbToggle = widget->findChild<QPushButton *>(QStringLiteral("vf_floatbox_toggle_") + id)) {
                click(fbToggle);
            }
        } else {
            output.append(QStringLiteral("error 不认识的步骤 %1").arg(step));
        }
        QApplication::processEvents();
    }
    return output;
}

} // namespace vf
