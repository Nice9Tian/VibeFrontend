# 界面效果层：“需要翻译”的效果在 Qt 里的实现。由 Agent 写，导出时不会覆盖这个文件夹。
# 能包含的只有界面接口层和 Qt。它看不到业务层和界面绑定层的任何头文件。
# 这个文件夹里的 .h 和 .cpp 会自动加入构建，新增一个效果不用改这里。
file(GLOB vf_effect_sources CONFIGURE_DEPENDS RELATIVE "${CMAKE_CURRENT_SOURCE_DIR}" *.h *.cpp)
vf_add_layer(vf_ui_effects ${vf_effect_sources})
target_link_libraries(vf_ui_effects PUBLIC vf_ui_interface Qt6::Widgets)
