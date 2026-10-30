// 界面效果层：PanelExpand 效果的 Qt 实现。
#pragma once

#include "UiEffects.h"

// 照着设计项目的 effects/PanelExpand/index.js 翻译：
// 显示时高度从 0 变到原本的高度，同时从透明变到不透明；隐藏时反过来。
// 时长 180 毫秒，三次方缓出。过渡期间超出当前高度的内容被裁掉。
//
// 基类名里的哈希是翻译时这个效果的哈希。设计项目里改了这个效果，接口里的哈希就变了，这里会编译失败。
class PanelExpandAnimation : public vf::PanelExpandEffect<0x77a08c49>
{
public:
    QAbstractAnimation *createTransition(QWidget *target, bool showing) override;
};
