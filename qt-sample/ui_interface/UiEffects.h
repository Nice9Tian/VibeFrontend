// 界面接口层。由工具根据设计项目生成，不要手改。
//
// 设计项目里标为“需要翻译”的效果，每个在这里有一个要实现的抽象类。
// 类名里带着哈希，哈希由这个效果在工具里的实现算出来：
//
//     class MyEffect : public vf::PanelExpandEffect<0x3fa2c1> { ... };
//
// 工具里这个效果改了，重新导出后这里的哈希就变了。照着旧哈希写的实现，
// 它的基类不再是有效的类，编译失败，必须重新翻译。
#pragma once

#include <memory>

class QWidget;

namespace vf {

// ---------------------------------------------------------------------------
// 效果 PanelExpand：详情面板展开和收起时的过渡
// 工具里的实现：components/DetailPanel/expand.motion.js
// 当前哈希：3fa2c1
// ---------------------------------------------------------------------------

// 哈希不是当前值的，一律落到这里，编译时报错。
template <unsigned Hash>
class PanelExpandEffect
{
    static_assert(Hash == 0x3fa2c1,
                  "[VF-EFFECT-HASH] 效果 PanelExpand 在工具里的实现已经改变，现在的哈希是 3fa2c1。"
                  "这个实现是照着旧哈希写的，请对照工具里的新实现重新翻译，"
                  "再把基类改成 vf::PanelExpandEffect<0x3fa2c1>。");
};

// 哈希是当前值的，才是真正要实现的抽象类。
template <>
class PanelExpandEffect<0x3fa2c1>
{
public:
    virtual ~PanelExpandEffect() = default;

    // panel：要展开或收起的面板；expanding：true 为展开，false 为收起。
    // 调用时面板还处在过渡前的状态；实现要负责让它最终可见或隐藏。
    virtual void play(QWidget *panel, bool expanding) = 0;
};

// 绑定层通过它拿到各个效果的实现。某个效果没有人提供时返回空，绑定层就直接切到结束状态。
class UiEffects
{
public:
    void setPanelExpand(std::unique_ptr<PanelExpandEffect<0x3fa2c1>> effect) { m_panelExpand = std::move(effect); }
    PanelExpandEffect<0x3fa2c1> *panelExpand() const { return m_panelExpand.get(); }

private:
    std::unique_ptr<PanelExpandEffect<0x3fa2c1>> m_panelExpand;
};

} // namespace vf
