# 由 VibeFrontend 导出，不要手改：下次导出会整个覆盖。
#
# 两种用法：
#   1. 单独构建这个文件夹，得到一个不接业务的预览程序 vf_preview。
#   2. 在业务工程里 add_subdirectory(这个文件夹)，再链接 vf_ui_binding 和 vf_ui_effects。
#      业务代码只链接 vf_business_interface。
cmake_minimum_required(VERSION 3.21)
project(VfUi LANGUAGES CXX)

find_package(Qt6 REQUIRED COMPONENTS Widgets Qml Svg)

include("${CMAKE_CURRENT_LIST_DIR}/cmake/LayerRules.cmake")

add_subdirectory(business_interface)   # 业务接口层（工具生成的声明）
add_subdirectory(ui_interface)         # 界面接口层（工具生成的声明）
add_subdirectory(ui_binding)           # 界面绑定层（工具生成）
add_subdirectory(ui_effects)           # 界面效果层（Agent 翻译，导出时不覆盖）

if(CMAKE_SOURCE_DIR STREQUAL CMAKE_CURRENT_SOURCE_DIR)
  set(vf_preview_default ON)
else()
  set(vf_preview_default OFF)
endif()
option(VF_BUILD_PREVIEW "构建不接业务的预览程序 vf_preview" ${vf_preview_default})
if(VF_BUILD_PREVIEW)
  add_subdirectory(preview)
endif()
