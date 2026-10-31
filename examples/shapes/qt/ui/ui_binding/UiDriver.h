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
//   input:控件ID:值          直接输入完整文本或数字（TextInput / TextArea / SpinBox / Slider / ScrollBar）
//   select:控件ID:值或下标   在下拉框、列表、页签栏或树中选择某一项（ComboBox / List / TabBar / Tree）
//   toggle:控件ID            切换复选框、可勾选按钮或浮动嵌入框（CheckBox / Button / FloatBox）
//   check:控件ID:行号:布尔   切换树控件某行的显隐勾选（Tree toggleCheck）
//   collapse:控件ID:行号:布尔 切换树控件某分组行的折叠状态（Tree toggleCollapse）
//   drag:控件ID:from:to      拖动列表或树控件中的某行重排（List / Tree reorder，等价于 reorder:）
//   form:控件ID:字段名:值    修改动态表单中的某个字段值（DataForm change）
//   accept:控件ID            触发对话框按钮盒的确定（DialogButtonBox accept）
//   reject:控件ID            触发对话框按钮盒的取消或关闭对话框（DialogButtonBox reject / QDialog::reject）
//   close:窗口ID             模拟用户按 Esc 或点标题栏关闭按钮关闭对话框（QDialog::reject）
//   dock:动作:参数...        执行停靠面板操作（tabify / tab / float / restore / move / split / resize / resizeSplit / close / open）
//                            拖动类操作发真实鼠标事件：按住面板的页签按钮，拖到松手会触发该操作的点；
//                            这样的点不存在时（手势本身做不到）才直接调用逻辑层的操作
//   clock:毫秒               把预览时钟推进或调整到指定毫秒数（触发 clock.tick）
//   request:事件名[:JSON]    触发业务发给界面的请求事件
//   mock:动作名:模式[:毫秒]  切换动作模拟方式（real / success / error）及可选延迟毫秒数
//   resize:宽x高             调整主窗口尺寸
//   window:minimize|restore  最小化或恢复主窗口
//   layout                   输出 "layout " 加上各可见控件当前相对于所属窗口的位置和大小
//   wait:毫秒                等一会儿（让过渡放完）
//   size:控件ID              输出 "size 控件ID 宽x高"，是控件此刻实际的大小（过渡放到一半时能看出来）
//   shot:文件路径            把窗口此刻的样子存成图片（.png）
//   state                    输出 "state " 加上逻辑算出的状态和各控件应有的样子
//   check                    对照各控件实际的样子：一致输出 "check ok"，否则逐条输出 "check MISMATCH ..."
//
// 按步骤运行时本机鼠标不起作用，悬停和点击都由步骤发出，结果不取决于光标停在哪里；
// 设了环境变量 VF_STEPS_OS_MOUSE 时放行
QStringList runSteps(Ui &ui, const QStringList &steps);

} // namespace vf
