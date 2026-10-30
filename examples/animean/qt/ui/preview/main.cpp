// 由 VibeFrontend 导出，不要手改：下次导出会整个覆盖。
//
// 预览程序：只有界面，不接业务。
//
// 参数：
//   --no-effects     不提供效果。界面照样能用，只是没有过渡动画。
//   --steps "a;b;c"  按步骤自动操作一遍，把每一步的输出打印出来，然后退出。步骤的写法见 UiDriver.h。
#include "EffectsSetup.h"
#include "Ui.h"
#include "UiDriver.h"

#include <QApplication>
#include <QTextStream>

int main(int argc, char *argv[])
{
    QApplication app(argc, argv);
    const QStringList args = app.arguments();

    vf::Ui ui;
    if (!args.contains(QStringLiteral("--no-effects")))
        registerEffects(ui.effects());
    ui.show();

    const int at = args.indexOf(QStringLiteral("--steps"));
    if (at >= 0 && at + 1 < args.size()) {
        QTextStream out(stdout);
        out.setEncoding(QStringConverter::Utf8);
        const QStringList lines = vf::runSteps(ui, args.at(at + 1).split(QLatin1Char(';'), Qt::SkipEmptyParts));
        for (const QString &line : lines)
            out << line << "\n";
        return 0;
    }
    return app.exec();
}
