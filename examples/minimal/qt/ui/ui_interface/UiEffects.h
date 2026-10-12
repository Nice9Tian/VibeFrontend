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

// ---------------------------------------------------------------------------
// 效果 PanelExpand（面板展开）：控件显示和隐藏时的过渡
// 工具里的实现：设计项目的 effects/PanelExpand/index.js
// 当前哈希：77a08c49
// ---------------------------------------------------------------------------

// 哈希不是当前值的，一律落到这里，编译时报错。
template <unsigned Hash>
class PanelExpandEffect
{
    static_assert(Hash == 0x77a08c49,
                  "[VF-EFFECT-HASH] 效果 PanelExpand 在工具里的实现已经改变，现在的哈希是 77a08c49。"
                  "这个实现是照着旧哈希写的，请对照工具里的新实现（effects/PanelExpand/index.js）重新翻译，"
                  "再把基类改成 vf::PanelExpandEffect<0x77a08c49>。");
};

// 哈希是当前值的，才是真正要实现的抽象类。
template <>
class PanelExpandEffect<0x77a08c49>
{
public:
    virtual ~PanelExpandEffect() = default;

    // 创建这次过渡的动画并返回它。target：要显示或隐藏的控件。showing：true 为显示，false 为隐藏。
    // 调用时控件是显示着的，位置和大小是画布上定下的样子。没有动画可做时返回空指针。
    //
    // 实现里只做两件事：把控件摆成动画开始时的样子，创建动画并设好起止值。不要自己启动动画。
    // 其余的事由界面绑定层负责，不用写，写漏了也不会出错：
    //   - 启动动画，监听它的结束；动画超时没有结束时也照样收尾；
    //   - 动画结束，或者被下一次过渡打断时，停掉并删除动画，把控件的位置和大小恢复成画布上的样子，
    //     清掉控件上的图形效果（QGraphicsEffect，例如为了淡入淡出加的透明度效果）；
    //   - 把控件定到最终的显示或隐藏状态。
    virtual QAbstractAnimation *createTransition(QWidget *target, bool showing) = 0;
};

// 界面绑定层通过它拿到各个效果的实现。某个效果没有人提供时返回空，界面就直接切到结束状态。
class UiEffects
{
public:
    void setPanelExpand(std::unique_ptr<PanelExpandEffect<0x77a08c49>> effect) { m_panelExpand = std::move(effect); }
    PanelExpandEffect<0x77a08c49> *panelExpand() const { return m_panelExpand.get(); }

private:
    std::unique_ptr<PanelExpandEffect<0x77a08c49>> m_panelExpand;
};

} // namespace vf
