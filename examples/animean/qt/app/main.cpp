// 程序入口：把五层装到一起。
//
// 参数：
//   --no-business    不接业务。界面照样能用，“业务管”的状态由设计项目里写的模拟步骤处理。
//   --no-effects     不提供效果。界面照样能用，只是没有过渡动画。
//   --steps "a;b;c"  按步骤自动操作一遍，把每一步的输出和业务模型最后的样子打印出来，然后退出。
//                    步骤的写法见 ui/ui_binding/UiDriver.h。
#include "CanvasWidget.h"
#include "Connect.h"
#include "EffectsSetup.h"
#include "LayerModel.h"
#include "Ui.h"
#include "UiDriver.h"

#include <QApplication>
#include <QTextStream>

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

    ui.show();

    const int at = args.indexOf(QStringLiteral("--steps"));
    if (at >= 0 && at + 1 < args.size()) {
        QTextStream out(stdout);
        out.setEncoding(QStringConverter::Utf8);
        out << "mode business=" << (withBusiness ? "on" : "off") << " effects=" << (withEffects ? "on" : "off") << "\n";
        const QStringList lines = vf::runSteps(ui, args.at(at + 1).split(QLatin1Char(';'), Qt::SkipEmptyParts));
        for (const QString &line : lines)
            out << line << "\n";
        const bool hosted = ui.window()->findChild<QWidget *>(QStringLiteral("businessCanvas")) != nullptr;
        out << "model visible=" << (model.visible() ? "true" : "false") << " changeCount=" << model.changeCount()
            << " canvasInExternalContainer=" << (hosted ? "yes" : "no") << "\n";
        return 0;
    }
    return app.exec();
}
