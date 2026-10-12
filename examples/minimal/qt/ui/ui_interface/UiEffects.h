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

#include <functional>
#include <memory>

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

    // target：要显示或隐藏的控件。showing：true 为显示，false 为隐藏。
    // 调用时控件是显示着的：显示时界面已经先把它显示出来；隐藏时界面等过渡放完才把它藏起来。
    // 过渡放完后必须调用一次 finished()，并且在那之前把控件的大小、位置和透明度恢复原样。
    // 上一次过渡还没放完又被调用时，先停掉上一次（那一次的 finished 可以不再调用）。
    virtual void play(QWidget *target, bool showing, std::function<void()> finished) = 0;
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
