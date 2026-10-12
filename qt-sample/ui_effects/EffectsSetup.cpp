#include "EffectsSetup.h"

#include "PanelExpandEffect.h"

void registerEffects(vf::UiEffects &effects)
{
    effects.setPanelExpand(std::make_unique<PanelExpandAnimation>());
}
