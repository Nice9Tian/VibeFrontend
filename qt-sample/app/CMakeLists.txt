# 业务和业务接口之间的连接。由 Agent 写。
# 只能包含业务层和业务接口层的头文件，看不到界面绑定层和界面效果层。
vf_add_layer(business_connection Connect.h Connect.cpp)
target_link_libraries(business_connection PUBLIC business vf_business_interface)

# 程序入口：把各层装到一起。只有这里同时看得到所有层。
add_executable(vf_sample main.cpp)
target_link_libraries(vf_sample PRIVATE vf_ui_binding vf_ui_effects business business_connection)
vf_check_includes("${CMAKE_CURRENT_SOURCE_DIR}/main.cpp")
