# 业务层：数据模型和业务自己的控件（这里是一个假的绘图区）。
# 它不链接任何界面层，所以看不到界面绑定层、界面效果层和两个接口层的头文件。
vf_add_layer(business LayerModel.h LayerModel.cpp CanvasWidget.h CanvasWidget.cpp)
target_link_libraries(business PUBLIC Qt6::Widgets)
