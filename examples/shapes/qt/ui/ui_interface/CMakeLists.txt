# 由 VibeFrontend 导出，不要手改：下次导出会整个覆盖。
#
# 界面接口层：界面绑定层朝向效果的一面。只有头文件，只依赖 Qt。
add_library(vf_ui_interface INTERFACE)
target_compile_features(vf_ui_interface INTERFACE cxx_std_17)
target_include_directories(vf_ui_interface INTERFACE "${CMAKE_CURRENT_SOURCE_DIR}")
target_link_libraries(vf_ui_interface INTERFACE Qt6::Widgets)
vf_check_includes("${CMAKE_CURRENT_SOURCE_DIR}/UiEffects.h")
