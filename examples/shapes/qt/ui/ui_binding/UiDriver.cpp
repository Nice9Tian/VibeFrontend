// 界面绑定层。由 VibeFrontend 导出，不要手改：下次导出会整个覆盖。
#include "UiDriver.h"

#include "Ui.h"

#include <QAction>
#include <QApplication>
#include <QCheckBox>
#include <QComboBox>
#include <QDialog>
#include <QEnterEvent>
#include <QEventLoop>
#include <QJsonDocument>
#include <QJsonObject>
#include <QKeyEvent>
#include <QLineEdit>
#include <QListWidget>
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
        } else if (verb == QLatin1String("input")) {
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
