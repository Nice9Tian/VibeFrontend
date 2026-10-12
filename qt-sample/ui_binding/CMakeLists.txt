# 界面绑定层：控件树、位置、排版、事件、状态和逻辑。由工具生成，不要手改。
# 能包含的只有两个接口层和 Qt。它看不到业务层和界面效果层的任何头文件。
vf_add_layer(vf_ui_binding Ui.h Ui.cpp LogicScript.cpp LogicScript.h)
target_link_libraries(vf_ui_binding
  PUBLIC vf_business_interface vf_ui_interface Qt6::Widgets
  PRIVATE Qt6::Qml)
