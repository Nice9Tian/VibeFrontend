// 界面效果层：PanelExpand 效果的 Qt 实现。
#pragma once

#include "UiEffects.h"

// 工具里的原始实现是一段 Motion 动画：高度从 0 过渡到内容高度，同时淡入，时长 180 毫秒。
// 这里用 Qt 的属性动画重写。
//
// 基类名里的 0x3fa2c1 是翻译时工具里这个效果的哈希。
// 工具里改了效果，接口里的哈希就变了，这里会编译失败。
class PanelExpandAnimation : public vf::PanelExpandEffect<0x3fa2c1>
{
public:
    void play(QWidget *panel, bool expanding) override;
};
