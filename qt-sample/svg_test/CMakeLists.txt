# 试验：Qt 的 SVG 模块能画出哪些写法。把 svg/ 里的每个文件渲染成 PNG，人工对照。
add_executable(vf_svg_test main.cpp)
target_link_libraries(vf_svg_test PRIVATE Qt6::Gui Qt6::Svg)
