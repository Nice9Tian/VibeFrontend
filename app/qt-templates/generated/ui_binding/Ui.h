// 界面绑定层。由 VibeFrontend 导出，不要手改：下次导出会整个覆盖。
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
    explicit Ui(QObject *parent = nullptr);
    ~Ui() override;

    // 显示窗口。第一次显示时触发设计项目里的 app.start 事件。
    void show();
    // 触发 app.start。只有不调用 show()、把 window() 嵌到别处时才需要自己调用；多次调用只生效一次。
    void start();
    QWidget *window() const;

    // 界面接口层的入口：在这里提供“需要翻译”的效果的实现
    UiEffects &effects();

    // 逻辑算出的全部状态，以及每个控件应有的可见、可用和属性。一行 JSON，键已排序。
    QString stateDump() const;
    // 每个控件实际的可见、可用和属性。和 stateDump 里的 views 对照，就知道界面有没有照着逻辑摆好。
    QString widgetDump() const;

    // ---- BusinessInterface ----
//@VF:businessOverrides@

protected:
    bool eventFilter(QObject *watched, QEvent *event) override;

private:
    struct Private;
    std::unique_ptr<Private> d;
};

} // namespace vf
