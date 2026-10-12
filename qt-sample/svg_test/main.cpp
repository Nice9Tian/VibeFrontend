// 把一个文件夹里的每个 SVG 用 Qt 渲染成 PNG：vf_svg_test <svg 文件夹> <输出文件夹>
#include <QDir>
#include <QGuiApplication>
#include <QImage>
#include <QPainter>
#include <QSvgRenderer>
#include <QTextStream>

int main(int argc, char *argv[])
{
    QGuiApplication app(argc, argv);
    QTextStream out(stdout);
    if (argc < 3) {
        out << "usage: vf_svg_test <svg dir> <output dir>\n";
        return 2;
    }
    const QDir input(QString::fromLocal8Bit(argv[1]));
    const QDir output(QString::fromLocal8Bit(argv[2]));
    output.mkpath(QStringLiteral("."));

    const qreal scale = 2.0; // 按两倍尺寸渲染，顺便看放大后是否清晰
    const QStringList names = input.entryList({ QStringLiteral("*.svg") }, QDir::Files, QDir::Name);
    for (const QString &name : names) {
        QSvgRenderer renderer(input.filePath(name));
        if (!renderer.isValid()) {
            out << name << ": INVALID\n";
            continue;
        }
        const QSize size = renderer.defaultSize() * scale;
        QImage image(size, QImage::Format_ARGB32_Premultiplied);
        image.fill(Qt::white);
        QPainter painter(&image);
        painter.setRenderHint(QPainter::Antialiasing);
        renderer.render(&painter);
        painter.end();
        QString target = name;
        target.replace(QStringLiteral(".svg"), QStringLiteral(".png"));
        const bool saved = image.save(output.filePath(target));
        out << name << ": " << (saved ? "ok " : "SAVE FAILED ") << size.width() << "x" << size.height() << "\n";
    }
    return 0;
}
