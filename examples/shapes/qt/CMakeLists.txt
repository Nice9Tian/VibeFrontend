cmake_minimum_required(VERSION 3.21)
project(VfShapesExample LANGUAGES CXX)

find_package(Qt6 REQUIRED COMPONENTS Widgets)

# 构建不接业务的预览程序 vf_preview
set(VF_BUILD_PREVIEW ON CACHE BOOL "")
add_subdirectory(ui)
