// 界面接口层。由 VibeFrontend 导出，不要手改：下次导出会整个覆盖。
//
// 设计项目里标为“需要翻译”的效果，每个在这里有一个要实现的抽象类。
// 类名里带着哈希，哈希由这个效果在工具里的实现算出来：
//
//     class MyEffect : public vf::SomeEffect<0x1a2b3c4d> { ... };
//
// 工具里这个效果改了，重新导出后这里的哈希就变了。照着旧哈希写的实现，
// 它的基类不再是有效的类，编译失败，必须重新翻译。
#pragma once

#include <memory>

class QAbstractAnimation;
class QWidget;

namespace vf {

// 界面绑定层通过它拿到各个效果的实现。某个效果没有人提供时返回空，界面就直接切到结束状态。
class UiEffects
{
};

} // namespace vf
