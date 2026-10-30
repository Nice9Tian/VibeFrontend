cmake_minimum_required(VERSION 3.21)
project(VfAnimeAnExample LANGUAGES CXX)

# AnimeAn 假业务工程，示范怎样把 VibeFrontend 导出的界面接进来，并由业务接管“图层是否可见”。
#   ui/        VibeFrontend 从 ../design 导出的界面
#   business/  业务层
#   app/       业务和业务接口之间的连接，以及程序入口

find_package(Qt6 REQUIRED COMPONENTS Widgets)

# 顺带构建不接业务的预览程序 vf_preview
set(VF_BUILD_PREVIEW ON CACHE BOOL "")
add_subdirectory(ui)

add_subdirectory(business)
add_subdirectory(app)
