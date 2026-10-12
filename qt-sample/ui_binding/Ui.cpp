// 界面绑定层。由工具生成，不要手改。
#include "Ui.h"

#include "LogicScript.h"

#include <QFrame>
#include <QHBoxLayout>
#include <QJSEngine>
#include <QLabel>
#include <QMainWindow>
#include <QMetaMethod>
#include <QPushButton>
#include <QStatusBar>
#include <QVBoxLayout>

namespace vf {

struct Ui::Private
{
    QMainWindow window;
    QJSEngine engine;
    UiEffects effects;

    // 控件。对象名就是设计项目里的控件 ID。
    QFrame *canvasHost = nullptr;      // 外部容器
    QVBoxLayout *canvasHostLayout = nullptr;
    QLabel *canvasPlaceholder = nullptr;
    QPushButton *toggleButton = nullptr;
    QLabel *eyeLabel = nullptr;
    QPushButton *expandButton = nullptr;
    QFrame *detailPanel = nullptr;

    bool detailPanelShown = false;

    QJSValue call(const char *function, const QJSValueList &args = {})
    {
        return engine.globalObject().property(QString::fromLatin1(function)).call(args);
    }
};

Ui::Ui()
    : d(new Private)
{
    // ---- 逻辑 ----
    const QJSValue loaded = d->engine.evaluate(QString::fromUtf8(kLogicScript), QStringLiteral("logic.js"));
    if (loaded.isError())
        qFatal("逻辑脚本加载失败：%s", qPrintable(loaded.toString()));

    // ---- 控件树、位置和排版 ----
    d->window.setObjectName(QStringLiteral("sampleWindow"));
    d->window.setWindowTitle(QStringLiteral("导出样板"));
    d->window.resize(520, 420);

    auto *central = new QWidget(&d->window);
    auto *root = new QVBoxLayout(central);
    root->setContentsMargins(12, 12, 12, 12);
    root->setSpacing(10);

    d->canvasHost = new QFrame(central);
    d->canvasHost->setObjectName(QStringLiteral("canvasHost"));
    d->canvasHost->setFrameShape(QFrame::StyledPanel);
    d->canvasHost->setMinimumSize(240, 160);
    d->canvasHostLayout = new QVBoxLayout(d->canvasHost);
    d->canvasHostLayout->setContentsMargins(0, 0, 0, 0);
    d->canvasPlaceholder = new QLabel(QStringLiteral("外部容器 canvasHost\n（业务还没有放入控件）"), d->canvasHost);
    d->canvasPlaceholder->setAlignment(Qt::AlignCenter);
    d->canvasHostLayout->addWidget(d->canvasPlaceholder);
    root->addWidget(d->canvasHost, 1);

    auto *row = new QHBoxLayout;
    row->setSpacing(10);
    d->toggleButton = new QPushButton(QStringLiteral("切换图层可见"), central);
    d->toggleButton->setObjectName(QStringLiteral("toggleButton"));
    d->eyeLabel = new QLabel(central);
    d->eyeLabel->setObjectName(QStringLiteral("eyeLabel"));
    d->expandButton = new QPushButton(central);
    d->expandButton->setObjectName(QStringLiteral("expandButton"));
    row->addWidget(d->toggleButton);
    row->addWidget(d->eyeLabel, 1);
    row->addWidget(d->expandButton);
    root->addLayout(row);

    d->detailPanel = new QFrame(central);
    d->detailPanel->setObjectName(QStringLiteral("detailPanel"));
    d->detailPanel->setFrameShape(QFrame::StyledPanel);
    auto *detailLayout = new QVBoxLayout(d->detailPanel);
    detailLayout->addWidget(new QLabel(
        QStringLiteral("详情面板。它的展开和收起是“界面自己管”的状态，\n过渡动画是一个“需要翻译”的效果。"), d->detailPanel));
    d->detailPanel->setVisible(false);
    root->addWidget(d->detailPanel);

    d->window.setCentralWidget(central);
    d->window.statusBar()->showMessage(QStringLiteral("就绪"));

    // ---- 事件 ----
    connect(d->toggleButton, &QPushButton::clicked, this,
            [this] { dispatch(QStringLiteral("toggleButton"), QStringLiteral("click")); });
    connect(d->expandButton, &QPushButton::clicked, this,
            [this] { dispatch(QStringLiteral("expandButton"), QStringLiteral("click")); });

    applyView();
}

Ui::~Ui() = default;

void Ui::show()
{
    d->window.show();
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

void Ui::dispatch(const QString &control, const QString &event)
{
    const QJSValue businessEvents = d->call("dispatch", { control, event });
    const int count = businessEvents.property(QStringLiteral("length")).toInt();
    for (int i = 0; i < count; ++i)
        raiseBusinessEvent(businessEvents.property(quint32(i)).toString());
    applyView();
}

// 交给业务的事件：业务接了，就发信号，由业务把结果写回来；没接，就执行模拟步骤。
void Ui::raiseBusinessEvent(const QString &name)
{
    if (name == QLatin1String("layerToggleVisible")) {
        static const QMetaMethod signal = QMetaMethod::fromSignal(&BusinessInterface::layerToggleVisibleRequested);
        if (isSignalConnected(signal)) {
            emit layerToggleVisibleRequested();
            return;
        }
    }
    d->call("simulate", { name });
}

// 把逻辑算出的属性写到控件上。
void Ui::applyView()
{
    const QJSValue view = d->call("view");
    d->eyeLabel->setText(view.property(QStringLiteral("eyeLabel.text")).toString());
    d->expandButton->setText(view.property(QStringLiteral("expandButton.text")).toString());

    const bool expanded = view.property(QStringLiteral("detailPanel.visible")).toBool();
    if (expanded != d->detailPanelShown) {
        d->detailPanelShown = expanded;
        // 有人提供了效果就交给它；没有就直接切到结束状态
        if (auto *effect = d->effects.panelExpand())
            effect->play(d->detailPanel, expanded);
        else
            d->detailPanel->setVisible(expanded);
    }
}

void Ui::setLayerVisible(bool visible)
{
    d->call("setState", { QStringLiteral("layer.visible"), visible });
    applyView();
}

bool Ui::layerVisible() const
{
    return d->call("getState", { QStringLiteral("layer.visible") }).toBool();
}

void Ui::showStatusMessage(const QString &text)
{
    d->window.statusBar()->showMessage(text);
}

void Ui::setCanvasWidget(QWidget *widget)
{
    d->canvasPlaceholder->setVisible(widget == nullptr);
    if (widget)
        d->canvasHostLayout->addWidget(widget);
}

} // namespace vf
