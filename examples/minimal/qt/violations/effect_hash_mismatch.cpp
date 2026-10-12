// 效果实现照着写的哈希是 0x00000000，而接口里现在的是另一个值：
// 相当于设计项目里改了这个效果，而这里的翻译还是旧的。
#include "UiEffects.h"

class StalePanelExpand : public vf::PanelExpandEffect<0x00000000>
{
public:
    QAbstractAnimation *createTransition(QWidget *, bool) { return nullptr; }
};
