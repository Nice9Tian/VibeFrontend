cmake_minimum_required(VERSION 3.21)
project(VfExportSample LANGUAGES CXX)

# 这个工程是手工写的样板：它是“工具把一个最小项目导出成 Qt”之后应该得到的样子。
# 五层各一个文件夹，谁能包含谁的头文件由下面各层的 CMakeLists.txt 决定。

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)

find_package(Qt6 REQUIRED COMPONENTS Widgets Qml Svg)

if(CMAKE_CXX_COMPILER_ID STREQUAL "GNU")
  # 源文件和程序里的字符串都按 UTF-8 处理，中文才不会乱
  add_compile_options(-finput-charset=UTF-8 -fexec-charset=UTF-8 -Wall)
endif()

include(cmake/LayerRules.cmake)

add_subdirectory(business_interface)   # 业务接口层（工具生成的声明）
add_subdirectory(ui_interface)         # 界面接口层（工具生成的声明）
add_subdirectory(ui_binding)           # 界面绑定层（工具生成）
add_subdirectory(ui_effects)           # 界面效果层（Agent 翻译）
add_subdirectory(business)             # 业务层
add_subdirectory(app)                  # 程序入口，以及业务和业务接口之间的连接
add_subdirectory(svg_test)             # 试 Qt 能画出哪些 SVG

enable_testing()
add_subdirectory(violations)           # 故意越界的代码，用来证明约束能被编译检查出来
