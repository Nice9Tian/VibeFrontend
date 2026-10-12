// 界面绑定层。由 VibeFrontend 导出，不要手改：下次导出会整个覆盖。
#include "UiDriver.h"

#include "Ui.h"

#include <QApplication>
#include <QEnterEvent>
#include <QEventLoop>
#include <QJsonDocument>
#include <QJsonObject>
#include <QKeyEvent>
#include <QMouseEvent>
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
    sendMouse(widget, QEvent::MouseButtonPress, Qt::LeftButton);
    sendMouse(widget, QEvent::MouseButtonRelease, Qt::NoButton);
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
        for (const QString &key : { QStringLiteral("visible"), QStringLiteral("enabled") }) {
            if (wanted.value(key) != actual.value(key)) {
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
        const QString verb = step.section(QLatin1Char(':'), 0, 0);
        const QString id = step.section(QLatin1Char(':'), 1, 1);

        if (verb == QLatin1String("state")) {
            output.append(QStringLiteral("state ") + ui.stateDump());
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
        if (verb == QLatin1String("shot")) {
            // 路径里可能有冒号，所以取第一个冒号之后的全部
            const QString file = step.section(QLatin1Char(':'), 1);
            const bool saved = ui.window()->grab().save(file);
            output.append(QStringLiteral("shot %1 %2").arg(saved ? QStringLiteral("saved") : QStringLiteral("FAILED"), file));
            continue;
        }

        QWidget *widget = ui.window()->findChild<QWidget *>(id);
        if (!widget) {
            output.append(QStringLiteral("error 找不到控件 %1（步骤 %2）").arg(id, step));
            continue;
        }
        if (verb == QLatin1String("size")) {
            output.append(QStringLiteral("size %1 %2x%3").arg(id).arg(widget->width()).arg(widget->height()));
            continue;
        }
        if (verb == QLatin1String("click")) {
            click(widget);
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
        } else {
            output.append(QStringLiteral("error 不认识的步骤 %1").arg(step));
        }
        // 让事件引出的后续处理跑完
        QApplication::processEvents();
    }
    return output;
}

} // namespace vf
