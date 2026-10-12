# 业务接口层：界面绑定层朝向业务的一面。由工具生成，不要手改。
# 只依赖 Qt。
vf_add_layer(vf_business_interface BusinessInterface.h)
target_link_libraries(vf_business_interface PUBLIC Qt6::Widgets)
