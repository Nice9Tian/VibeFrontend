cmake_minimum_required(VERSION 3.21)
project(VfMinimalExample LANGUAGES CXX)

# 一个假的业务工程，用来示范怎样把 VibeFrontend 导出的界面接进来。
#   ui/        VibeFrontend 从 ../design 导出的界面（生成的，其中 ui_effects/ 由 Agent 写）
#   business/  业务层
#   app/       业务和业务接口之间的连接，以及程序入口

find_package(Qt6 REQUIRED COMPONENTS Widgets)

# 顺带构建不接业务的预览程序 vf_preview
set(VF_BUILD_PREVIEW ON CACHE BOOL "")
add_subdirectory(ui)

add_subdirectory(business)
add_subdirectory(app)

enable_testing()
add_subdirectory(violations)   # 故意越界的代码，用来证明约束能被编译检查出来
