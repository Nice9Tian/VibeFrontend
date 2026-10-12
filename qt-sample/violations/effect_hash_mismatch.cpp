// 效果实现照着写的哈希是 0x000000，而接口里现在是 0x3fa2c1：
// 相当于工具里改了这个效果，而这里的翻译还是旧的。
#include "UiEffects.h"

class StalePanelExpand : public vf::PanelExpandEffect<0x000000>
{
public:
    void play(QWidget *, bool) {}
};
