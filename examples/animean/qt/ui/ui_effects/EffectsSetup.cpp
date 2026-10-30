// 界面效果层的入口：把本层实现的效果交给界面接口层。
// 每翻译好一个效果，在 registerEffects 里加一行。还没有翻译的不用管，界面会直接切到结束状态或显示占位框。
#include "EffectsSetup.h"

#include "ColorPickerDrawEffect.h"
#include "PanelExpandEffect.h"

void registerEffects(vf::UiEffects &effects)
{
    effects.setColorPickerDraw(std::make_unique<ColorPickerDrawPainter>());
    effects.setPanelExpand(std::make_unique<PanelExpandAnimation>());
}
