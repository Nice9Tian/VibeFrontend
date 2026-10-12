// 程序入口：把五层装到一起。
//
// 参数：
//   --no-business  不接业务。界面照样能用，“业务管”的状态由模拟步骤处理。
//   --no-effects   不提供效果。界面照样能用，只是没有过渡动画。
//   --selftest     自动点一遍按钮，把结果打印出来，然后退出。
#include "Connect.h"
#include "EffectsSetup.h"
#include "CanvasWidget.h"
#include "LayerModel.h"
#include "Ui.h"

#include <QAbstractButton>
#include <QApplication>
#include <QEventLoop>
#include <QLabel>
#include <QTextStream>
#include <QTimer>

namespace {

void waitMs(int ms)
{
    QEventLoop loop;
    QTimer::singleShot(ms, &loop, &QEventLoop::quit);
    loop.exec();
}

int runSelfTest(vf::Ui &ui, LayerModel &model, bool withBusiness, bool withEffects)
{
    QTextStream out(stdout);
    out.setEncoding(QStringConverter::Utf8);
    auto *window = ui.window();
    auto *toggle = window->findChild<QAbstractButton *>(QStringLiteral("toggleButton"));
    auto *expand = window->findChild<QAbstractButton *>(QStringLiteral("expandButton"));
    auto *eye = window->findChild<QLabel *>(QStringLiteral("eyeLabel"));
    auto *panel = window->findChild<QWidget *>(QStringLiteral("detailPanel"));
    auto *host = window->findChild<QWidget *>(QStringLiteral("canvasHost"));
    if (!toggle || !expand || !eye || !panel || !host) {
        out << "FAIL: missing controls\n";
        return 1;
    }

    ui.show();
    waitMs(100);
    out << "mode: business=" << (withBusiness ? "on" : "off") << " effects=" << (withEffects ? "on" : "off") << "\n";
    out << "canvas in external container: " << (host->findChild<QWidget *>(QStringLiteral("businessCanvas")) ? "yes" : "no") << "\n";
    out << "initial:       state=" << ui.stateDump() << " label=" << eye->text() << "\n";

    toggle->click();
    waitMs(50);
    out << "toggle click:  state=" << ui.stateDump() << " label=" << eye->text()
        << " model.visible=" << (model.visible() ? "true" : "false")
        << " model.changeCount=" << model.changeCount() << "\n";

    expand->click();
    waitMs(60);
    const int midHeight = panel->height();
    waitMs(400);
    out << "expand click:  state=" << ui.stateDump() << " button=" << expand->text()
        << " panel.visible=" << (panel->isVisible() ? "true" : "false")
        << " heightDuringTransition=" << midHeight << " finalHeight=" << panel->height() << "\n";

    expand->click();
    waitMs(400);
    out << "collapse click: state=" << ui.stateDump() << " panel.visible=" << (panel->isVisible() ? "true" : "false") << "\n";
    out.flush();
    return 0;
}

} // namespace

int main(int argc, char *argv[])
{
    QApplication app(argc, argv);
    const QStringList args = app.arguments();
    const bool withBusiness = !args.contains(QStringLiteral("--no-business"));
    const bool withEffects = !args.contains(QStringLiteral("--no-effects"));

    vf::Ui ui;
    if (withEffects)
        registerEffects(ui.effects());

    LayerModel model;
    if (withBusiness)
        connectBusiness(ui, model, new CanvasWidget(&model));

    if (args.contains(QStringLiteral("--selftest")))
        return runSelfTest(ui, model, withBusiness, withEffects);

    ui.show();
    return app.exec();
}
