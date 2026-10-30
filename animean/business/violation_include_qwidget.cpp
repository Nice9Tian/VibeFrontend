// 故意在业务层包含 QWidget 头文件：用于验证编译期分层检查确实能拦住界面层依赖。
#include <QWidget>

int violation_business_include_qwidget_dummy = 0;
