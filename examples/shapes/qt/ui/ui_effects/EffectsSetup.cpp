// 界面效果层的入口：把本层实现的效果交给界面接口层。
// 每翻译好一个效果，在 registerEffects 里加一行。还没有翻译的不用管，界面会直接切到结束状态。
//
// 导出时这个项目里需要翻译的效果（最新的名单和哈希见上一层的 INTERFACE.md）：
//   （没有）
#include "EffectsSetup.h"

void registerEffects(vf::UiEffects &effects)
{
    (void)effects;
}
