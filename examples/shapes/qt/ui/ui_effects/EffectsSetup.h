// 界面效果层对外只有这一个函数：把本层实现的效果全部交给界面接口层。
// 这个函数的名字和参数不要改，程序入口靠它拿到效果。
#pragma once

#include "UiEffects.h"

void registerEffects(vf::UiEffects &effects);
