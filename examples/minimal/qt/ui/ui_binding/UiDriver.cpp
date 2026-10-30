// 界面绑定层。由 VibeFrontend 导出，不要手改：下次导出会整个覆盖。
#include "UiDriver.h"

#include "Ui.h"

#include <QAction>
#include <QApplication>
#include <QCheckBox>
#include <QComboBox>
#include <QDialog>
#include <QDockWidget>
#include <QEnterEvent>
#include <QEventLoop>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QKeyEvent>
#include <QLineEdit>
#include <QListWidget>
#include <QMainWindow>
#include <QMouseEvent>
#include <QPushButton>
#include <QSpinBox>
#include <QTimer>
#include <QWidget>

namespace vf {

namespace {

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

void sendMouseDrag(QWidget *widget, const QPoint &startLocal, const QPoint &endGlobal, Qt::KeyboardModifiers mods = Qt::NoModifier)
{
    const QPoint startGlobal = widget->mapToGlobal(startLocal);
    const QPoint midGlobal((startGlobal.x() + endGlobal.x()) / 2, (startGlobal.y() + endGlobal.y()) / 2);
    QMouseEvent press(QEvent::MouseButtonPress, QPointF(startLocal), QPointF(startGlobal), Qt::LeftButton, Qt::LeftButton, mods);
    QApplication::sendEvent(widget, &press);
    QMouseEvent move1(QEvent::MouseMove, QPointF(widget->mapFromGlobal(midGlobal)), QPointF(midGlobal), Qt::NoButton, Qt::LeftButton, mods);
    QApplication::sendEvent(widget, &move1);
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
            if (qAbs(wArea.value(QStringLiteral("size")).toInt() - aArea.value(QStringLiteral("size")).toInt()) > tolerancePx)
                return false;
            int wSum = 0;
            int aSum = 0;
            if (wGroups.size() >= 2) {
                if (wArea.value(QStringLiteral("splitOrientation")).toString() != aArea.value(QStringLiteral("splitOrientation")).toString())
                    return false;
                for (int gi = 0; gi < wGroups.size(); ++gi) {
                    wSum += wGroups.at(gi).toObject().value(QStringLiteral("size")).toInt();
                    aSum += aGroups.at(gi).toObject().value(QStringLiteral("size")).toInt();
                }
            }
            for (int gi = 0; gi < wGroups.size(); ++gi) {
                const QJsonObject wg = wGroups.at(gi).toObject();
                const QJsonObject ag = aGroups.at(gi).toObject();
                if (wg.value(QStringLiteral("tabs")).toArray() != ag.value(QStringLiteral("tabs")).toArray())
                    return false;
                if (wg.value(QStringLiteral("active")).toString() != ag.value(QStringLiteral("active")).toString())
                    return false;
                if (wGroups.size() >= 2) {
                    const int wgSize = wg.value(QStringLiteral("size")).toInt();
                    const int agSize = ag.value(QStringLiteral("size")).toInt();
                    const int expectedSize = (wSum > 0 && aSum > 0)
                        ? qRound(double(wgSize) * double(aSum) / double(wSum))
                        : wgSize;
                    if (qAbs(expectedSize - agSize) > tolerancePx)
                        return false;
                }
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
        const QJsonObject wantedDocks = stateRoot.value(QStringLiteral("docks")).toObject();
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
    waitMs(100);
    for (const QString &raw : steps) {
        const QString step = raw.trimmed();
        if (step.isEmpty())
            continue;
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
            QApplication::processEvents();
            output.append(QStringLiteral("layout ") + ui.layoutDump());
            continue;
        }
        if (verb == QLatin1String("check")) {
            output += compare(ui);
            continue;
        }
        if (verb == QLatin1String("wait")) {
            waitMs(id.toInt());
            continue;
        }
        if (verb == QLatin1String("resize")) {
            const int w = id.section(QLatin1Char('x'), 0, 0).toInt();
            const int h = id.section(QLatin1Char('x'), 1, 1).toInt();
            if (w > 0 && h > 0) {
                ui.window()->resize(w, h);
                QApplication::processEvents();
                waitMs(30);
                QApplication::processEvents();
            }
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
                auto *hdr = findVisibleWidget<QWidget>(ui.window(), QStringLiteral("vf_dock_hdr_") + arg2);
                if (!hdr) {
                    if (auto *tabBtn = findVisibleWidget<QPushButton>(ui.window(), QStringLiteral("vf_dock_tab_") + arg2)) {
                        click(tabBtn);
                        QApplication::processEvents();
                        hdr = findVisibleWidget<QWidget>(ui.window(), QStringLiteral("vf_dock_hdr_") + arg2);
                    }
                }
                auto *targetDock = ui.window()->findChild<QDockWidget *>(arg1);
                if (hdr && targetDock && !targetDock->isHidden()) {
                    QDockWidget *visualTarget = targetDock;
                    if (auto *mw = qobject_cast<QMainWindow *>(ui.window())) {
                        for (QDockWidget *p : mw->tabifiedDockWidgets(targetDock)) {
                            if (p && !p->isHidden() && p->height() > visualTarget->height())
                                visualTarget = p;
                        }
                    }
                    const QPoint endGlobal = visualTarget->mapToGlobal(QPoint(visualTarget->width() / 2, 12));
                    sendMouseDrag(hdr, hdr->rect().center(), endGlobal);
                    continue;
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
                                const QPoint startGlobal = hdr->mapToGlobal(hdr->rect().center());
                                sendMouseDrag(hdr, hdr->rect().center(), startGlobal + delta, Qt::ShiftModifier);
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
                    auto *hdr = findVisibleWidget<QWidget>(ui.window(), QStringLiteral("vf_dock_hdr_") + arg1);
                    if (!hdr) {
                        if (auto *tabBtn = findVisibleWidget<QPushButton>(ui.window(), QStringLiteral("vf_dock_tab_") + arg1)) {
                            click(tabBtn);
                            QApplication::processEvents();
                            hdr = findVisibleWidget<QWidget>(ui.window(), QStringLiteral("vf_dock_hdr_") + arg1);
                        }
                    }
                    if (hdr) {
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
                        bool covered = false;
                        const QList<QDockWidget *> allDocks = ui.window()->findChildren<QDockWidget *>();
                        for (QDockWidget *other : allDocks) {
                            if (!other || other->objectName() == arg1 || other->isHidden() || other->isFloating())
                                continue;
                            const QRect r(ui.window()->mapFromGlobal(other->mapToGlobal(QPoint(0, 0))), other->size());
                            if (r.contains(edgeLocal)) {
                                covered = true;
                                break;
                            }
                        }
                        if (!covered) {
                            sendMouseDrag(hdr, hdr->rect().center(), ui.window()->mapToGlobal(edgeLocal));
                            continue;
                        }
                    }
                }
                args.insert(QStringLiteral("dock"), arg1);
                args.insert(QStringLiteral("area"), arg2);
                if (!arg3.isEmpty())
                    args.insert(QStringLiteral("index"), arg3.toInt());
            } else if (op == QLatin1String("split")) {
                auto *hdr = findVisibleWidget<QWidget>(ui.window(), QStringLiteral("vf_dock_hdr_") + arg2);
                if (!hdr) {
                    if (auto *tabBtn = findVisibleWidget<QPushButton>(ui.window(), QStringLiteral("vf_dock_tab_") + arg2)) {
                        click(tabBtn);
                        QApplication::processEvents();
                        hdr = findVisibleWidget<QWidget>(ui.window(), QStringLiteral("vf_dock_hdr_") + arg2);
                    }
                }
                auto *targetDock = ui.window()->findChild<QDockWidget *>(arg1);
                if (hdr && targetDock && !targetDock->isHidden()) {
                    QDockWidget *visualTarget = targetDock;
                    if (auto *mw = qobject_cast<QMainWindow *>(ui.window())) {
                        for (QDockWidget *p : mw->tabifiedDockWidgets(targetDock)) {
                            if (p && !p->isHidden() && p->height() > visualTarget->height())
                                visualTarget = p;
                        }
                    }
                    const QString pos = arg3.isEmpty() ? QStringLiteral("after") : arg3;
                    QString orient = arg4;
                    if (orient.isEmpty()) {
                        auto *mw = qobject_cast<QMainWindow *>(ui.window());
                        const Qt::DockWidgetArea a = mw ? mw->dockWidgetArea(visualTarget) : Qt::LeftDockWidgetArea;
                        orient = (a == Qt::LeftDockWidgetArea || a == Qt::RightDockWidgetArea)
                            ? QStringLiteral("vertical")
                            : QStringLiteral("horizontal");
                    }
                    const int hdrH = 26;
                    const int bodyH = qMax(20, visualTarget->height() - hdrH);
                    QPoint targetLocal(visualTarget->width() / 2, hdrH + bodyH / 2);
                    if (orient == QLatin1String("vertical")) {
                        targetLocal.setY(hdrH + int(bodyH * (pos == QLatin1String("before") ? 0.12 : 0.88)));
                    } else {
                        targetLocal.setX(int(visualTarget->width() * (pos == QLatin1String("before") ? 0.10 : 0.90)));
                    }
                    sendMouseDrag(hdr, hdr->rect().center(), visualTarget->mapToGlobal(targetLocal));
                    continue;
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
                        sendMouseDrag(sp, sp->rect().center(), startGlobal + delta);
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
                        sendMouseDrag(sp, sp->rect().center(), startGlobal + delta);
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
        if (verb == QLatin1String("close") || verb == QLatin1String("reject")) {
            if (auto *dlg = qobject_cast<QDialog *>(widget))
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
            QApplication::sendEvent(widget, &event);
        } else if (verb == QLatin1String("leave")) {
            QEvent event(QEvent::Leave);
            QApplication::sendEvent(widget, &event);
        } else if (verb == QLatin1String("type")) {
            const QString text = step.section(QLatin1Char(':'), 2);
            widget->setFocus();
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
