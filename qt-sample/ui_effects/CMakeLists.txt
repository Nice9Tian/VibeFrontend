# 界面效果层：“需要翻译”的效果在 Qt 里的实现。由 Agent 翻译。
# 能包含的只有界面接口层和 Qt。它看不到业务层和界面绑定层的任何头文件。
vf_add_layer(vf_ui_effects EffectsSetup.h EffectsSetup.cpp PanelExpandEffect.h PanelExpandEffect.cpp)
target_link_libraries(vf_ui_effects PUBLIC vf_ui_interface Qt6::Widgets)
