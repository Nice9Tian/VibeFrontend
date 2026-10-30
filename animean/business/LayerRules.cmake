# animean/business 分层规则辅助函数（仿 examples/minimal/qt/ui/cmake/LayerRules.cmake）。
#
# 业务层（animean_business）只链接 animean_core、Qt::Core、Qt::Gui，不链接 Qt::Widgets。
# 因此 QtWidgets 的头文件目录不在编译器的包含路径中，任何 #include <QWidget> 等界面头文件
# 在编译期都会直接因为找不到头文件而失败。
# 下面的检查同时堵上用 "../" 相对路径、绝对路径或直接写 QtWidgets/QWidget 头文件的绕过方式。

function(animean_check_business_includes)
  foreach(file IN LISTS ARGN)
    file(STRINGS "${file}" lines REGEX "^[ \t]*#[ \t]*include")
    foreach(line IN LISTS lines)
      if(line MATCHES "\"\\.\\./" OR line MATCHES "\"[A-Za-z]:[/\\\\]" OR line MATCHES "\"/")
        message(FATAL_ERROR
          "[ANIMEAN-LAYER] ${file} 里的包含写法越过了业务层边界：\n  ${line}\n"
          "业务层不能使用 ../ 或绝对路径包含头文件。")
      endif()
      if(line MATCHES "[<\"](QtWidgets/|QWidget|QMainWindow|QDialog|QDockWidget|QOpenGLWidget|QTreeWidget|QListWidget|QPushButton|QLabel|QLineEdit|QComboBox|QSlider|QSpinBox|QCheckBox|QToolButton|QStatusBar|QMenuBar|QApplication)"
         OR line MATCHES "\"(mainwindow|openglwidget|parentwindow|centralpaintarea|paintviewcontainer|subcontrolframe)\\.h\"")
        message(FATAL_ERROR
          "[ANIMEAN-LAYER] ${file} 包含了界面层（QWidget/UI）头文件：\n  ${line}\n"
          "animean/business/ 只允许依赖 QtCore 和 QtGui，禁止包含任何 QWidget 类的头文件。")
      endif()
    endforeach()
  endforeach()
endfunction()

function(animean_configure_business_target name)
  target_compile_features(${name} PUBLIC cxx_std_17)
  if(MSVC)
    target_compile_options(${name} PRIVATE /utf-8)
  elseif(CMAKE_CXX_COMPILER_ID STREQUAL "GNU")
    target_compile_options(${name} PRIVATE -finput-charset=UTF-8 -fexec-charset=UTF-8)
  endif()
endfunction()

function(animean_add_business_layer name)
  add_library(${name} STATIC ${ARGN})
  set_target_properties(${name} PROPERTIES AUTOMOC ON)
  animean_configure_business_target(${name})
  target_include_directories(${name} PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}")
  set(files "")
  foreach(source IN LISTS ARGN)
    list(APPEND files "${CMAKE_CURRENT_SOURCE_DIR}/${source}")
  endforeach()
  animean_check_business_includes(${files})
endfunction()

# 作为独立脚本运行：cmake -DFILE=某个文件 -P LayerRules.cmake
if(CMAKE_SCRIPT_MODE_FILE AND DEFINED FILE)
  animean_check_business_includes("${FILE}")
endif()
