// 界面绑定层。由 VibeFrontend 导出，不要手改：下次导出会整个覆盖。
#include "UiDriver.h"

#include "Ui.h"

#include <QAction>
#include <QApplication>
#include <QCheckBox>
#include <QComboBox>
#include <QDialog>
#include <QDialogButtonBox>
#include <QDropEvent>
#include <QEnterEvent>
#include <QEventLoop>
#include <QFrame>
#include <QJsonDocument>
#include <QJsonObject>
#include <QKeyEvent>
#include <QLineEdit>
#include <QListWidget>
#include <QMimeData>
#include <QMouseEvent>
#include <QPlainTextEdit>
#include <QPushButton>
#include <QScrollBar>
#include <QSlider>
#include <QSpinBox>
#include <QTabBar>
#include <QTextCursor>
#include <QTimer>
#include <QTreeWidget>
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

void click(QWidget *widget)
{
    auto *cb = qobject_cast<QCheckBox *>(widget);
    const bool cbBefore = cb ? cb->isChecked() : false;
    sendMouse(widget, QEvent::MouseButtonPress, Qt::LeftButton);
    sendMouse(widget, QEvent::MouseButtonRelease, Qt::NoButton);
    if (cb && cb->isEnabled() && !cb->isHidden() && cb->isChecked() == cbBefore)
        cb->toggle();
}

QString toText(const QJsonValue &value)
{
    return QString::fromUtf8(QJsonDocument(QJsonObject{ { QStringLiteral("v"), value } }).toJson(QJsonDocument::Compact));
}

// 逻辑认为各控件应有的样子，和各控件实际的样子，逐项对照
QStringList compare(Ui &ui)
{
    const QJsonObject views = QJsonDocument::fromJson(ui.stateDump().toUtf8()).object().value(QStringLiteral("views")).toObject();
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
    if (lines.isEmpty())
        lines.append(QStringLiteral("check ok"));
    return lines;
}

} // namespace

QStringList runSteps(Ui &ui, const QStringList &steps)
{
    QStringList output;
    QApplication::processEvents();
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
        if (verb == QLatin1String("layout")) {
            QApplication::processEvents();
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
            QApplication::sendEvent(widget, &event);
        } else if (verb == QLatin1String("leave")) {
            QEvent event(QEvent::Leave);
            QApplication::sendEvent(widget, &event);
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
        } else if (verb == QLatin1String("input")) {
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
            }
        } else {
            output.append(QStringLiteral("error 不认识的步骤 %1").arg(step));
        }
        // 让事件引出的后续处理跑完
        QApplication::processEvents();
    }
    return output;
}

} // namespace vf
