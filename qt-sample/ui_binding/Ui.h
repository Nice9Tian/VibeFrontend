// 界面绑定层。由工具生成，不要手改。
#pragma once

#include "BusinessInterface.h"
#include "UiEffects.h"

#include <memory>

class QWidget;

namespace vf {

// 整个界面。对业务，它就是 BusinessInterface；对效果，它提供 effects()。
class Ui : public BusinessInterface
{
    Q_OBJECT

public:
    Ui();
    ~Ui() override;

    void show();
    QWidget *window() const;

    // 界面接口层的入口：在这里提供“需要翻译”的效果的实现
    UiEffects &effects();

    // 当前状态，JSON 文本。用例比较时使用。
    QString stateDump() const;

    // BusinessInterface
    void setLayerVisible(bool visible) override;
    bool layerVisible() const override;
    void showStatusMessage(const QString &text) override;
    void setCanvasWidget(QWidget *widget) override;

private:
    void dispatch(const QString &control, const QString &event);
    void raiseBusinessEvent(const QString &name);
    void applyView();

    struct Private;
    std::unique_ptr<Private> d;
};

} // namespace vf
