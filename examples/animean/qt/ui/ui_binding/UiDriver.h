// 界面绑定层。由 VibeFrontend 导出，不要手改：下次导出会整个覆盖。
#pragma once

#include <QStringList>

namespace vf {

class Ui;

// 按步骤自动操作界面，返回每一步的输出。用例比较用：
// 同样的步骤在工具那边跑一遍（npm run case），两边以 "state " 开头的行应该逐字相同。
//
// 步骤的写法：
//   click:控件ID             在控件中间按下再松开鼠标左键（也支持菜单项 ID）
//   dblclick:控件ID          双击
//   enter:控件ID             鼠标移入
//   leave:控件ID             鼠标移出
//   type:控件ID:文字         在控件里逐个字符输入
//   input:控件ID:值          直接输入完整文本或数字（TextInput / SpinBox）
//   select:控件ID:值或下标   在下拉框或列表中选择某一项（ComboBox / List）
//   toggle:控件ID            切换复选框或可勾选按钮（CheckBox / Button）
//   close:窗口ID             模拟用户按 Esc 或点标题栏关闭按钮关闭对话框（QDialog::reject）
//   request:事件名[:JSON]    触发业务发给界面的请求事件
//   mock:动作名:模式[:毫秒]  切换动作模拟方式（real / success / error）及可选延迟毫秒数
//   resize:宽x高             调整主窗口尺寸
//   layout                   输出 "layout " 加上各可见控件当前相对于所属窗口的位置和大小
//   wait:毫秒                等一会儿（让过渡放完）
//   size:控件ID              输出 "size 控件ID 宽x高"，是控件此刻实际的大小（过渡放到一半时能看出来）
//   shot:文件路径            把窗口此刻的样子存成图片（.png）
//   state                    输出 "state " 加上逻辑算出的状态和各控件应有的样子
//   check                    对照各控件实际的样子：一致输出 "check ok"，否则逐条输出 "check MISMATCH ..."
QStringList runSteps(Ui &ui, const QStringList &steps);

} // namespace vf
