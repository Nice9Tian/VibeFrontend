# 由 VibeFrontend 导出，不要手改：下次导出会整个覆盖。
#
# 界面绑定层：控件树、位置、事件、状态和逻辑。
# 能包含的只有两个接口层和 Qt。它看不到业务层和界面效果层的任何头文件。
vf_add_layer(vf_ui_binding Ui.h Ui.cpp UiDriver.h UiDriver.cpp)
target_link_libraries(vf_ui_binding
  PUBLIC vf_business_interface vf_ui_interface Qt6::Widgets Qt6::Svg
  PRIVATE Qt6::Qml)

# 逻辑脚本和项目数据编进程序里，运行时从 :/vf/logic/ 读取
qt_add_resources(vf_ui_binding vf_logic PREFIX "/vf" FILES logic/runtime.js logic/project.json)
