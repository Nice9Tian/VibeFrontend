// 界面效果层：ColorPickerDraw 效果的 Qt 实现。
#pragma once

#include "UiEffects.h"

// 照着设计项目的 effects/ColorPickerDraw/index.js 翻译：
// 在控件上用 QPainter + QLinearGradient 绘制 HSV 饱和度-明度渐变方块、右侧色相条、十字准星与底部颜色预览条。
//
// 基类名里的哈希是翻译时这个效果的哈希。设计项目里改了这个效果，接口里的哈希就变了，这里会编译失败。
class ColorPickerDrawPainter : public vf::ColorPickerDrawEffect<0x42ac9aaf>
{
public:
    void paint(QPainter *painter, const QRect &rect, const QVariantMap &props) override;
};
