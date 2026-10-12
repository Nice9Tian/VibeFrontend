// 界面绑定层。由 VibeFrontend 导出，不要手改：下次导出会整个覆盖。
#pragma once

#include <QStringList>

namespace vf {

class Ui;

// 按步骤自动操作界面，返回每一步的输出。用例比较用：
// 同样的步骤在工具那边跑一遍（npm run case），两边以 "state " 开头的行应该逐字相同。
//
// 步骤的写法：
//   click:控件ID      在控件中间按下再松开鼠标左键
//   dblclick:控件ID   双击
//   enter:控件ID      鼠标移入
//   leave:控件ID      鼠标移出
//   type:控件ID:文字  在控件里逐个字符输入
//   wait:毫秒         等一会儿（让过渡放完）
//   size:控件ID       输出 "size 控件ID 宽x高"，是控件此刻实际的大小（过渡放到一半时能看出来）
//   shot:文件路径     把窗口此刻的样子存成图片（.png）
//   state             输出 "state " 加上逻辑算出的状态和各控件应有的样子
//   check             对照各控件实际的样子：一致输出 "check ok"，否则逐条输出 "check MISMATCH ..."
QStringList runSteps(Ui &ui, const QStringList &steps);

} // namespace vf
