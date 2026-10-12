# 分层规则的辅助函数。
#
# 每一层是一个独立的库。一层能包含哪些头文件，只取决于它链接了哪些层：
# 没有链接的层，它的文件夹不在包含路径里，#include 就找不到。
# 剩下的漏洞是用 "../别的层/xxx.h" 这样的相对路径绕过去，下面的检查把它堵上。

# 检查一组源文件里有没有用相对路径跳出本层，或者写绝对路径。发现就报错。
function(vf_check_includes)
  foreach(file IN LISTS ARGN)
    file(STRINGS "${file}" lines REGEX "^[ \t]*#[ \t]*include")
    foreach(line IN LISTS lines)
      if(line MATCHES "\"\\.\\./" OR line MATCHES "\"[A-Za-z]:[/\\\\]" OR line MATCHES "\"/")
        message(FATAL_ERROR
          "[VF-LAYER] ${file} 里的包含写法越过了本层的边界：\n  ${line}\n"
          "只能包含本层的头文件，或者本层链接的那些层的头文件，不能用 ../ 或绝对路径。")
      endif()
    endforeach()
  endforeach()
endfunction()

# 声明一个层：建库，并在配置阶段检查它的全部源文件。
function(vf_add_layer name)
  add_library(${name} STATIC ${ARGN})
  target_include_directories(${name} PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}")
  set(files "")
  foreach(source IN LISTS ARGN)
    list(APPEND files "${CMAKE_CURRENT_SOURCE_DIR}/${source}")
  endforeach()
  vf_check_includes(${files})
endfunction()

# 作为独立脚本运行：cmake -DFILE=某个文件 -P LayerRules.cmake
if(CMAKE_SCRIPT_MODE_FILE AND DEFINED FILE)
  vf_check_includes("${FILE}")
endif()
