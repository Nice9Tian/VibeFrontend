# 由 VibeFrontend 导出，不要手改：下次导出会整个覆盖。
#
# 预览程序：只有界面，不接业务。业务管的状态由设计项目里写的模拟步骤处理。
add_executable(vf_preview main.cpp)
vf_configure_target(vf_preview)
target_link_libraries(vf_preview PRIVATE vf_ui_binding vf_ui_effects)
vf_check_includes("${CMAKE_CURRENT_SOURCE_DIR}/main.cpp")
