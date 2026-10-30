include("${CMAKE_CURRENT_SOURCE_DIR}/LayerRules.cmake")

set(ANIMEAN_BUSINESS_SOURCES
    animeanbusiness.cpp
    animeanbusiness.h
)

if(ANIMEAN_WITH_PYTHON)
    list(APPEND ANIMEAN_BUSINESS_SOURCES
        "${CMAKE_SOURCE_DIR}/pythonbind/python_bindings.cpp"
        "${CMAKE_SOURCE_DIR}/pythonbind/python_bindings.h"
    )
endif()

animean_add_business_layer(animean_business
    ${ANIMEAN_BUSINESS_SOURCES}
)

# 业务层只依赖 animean_core、Qt::Core、Qt::Gui，绝不链接 Qt::Widgets 或 Qt::OpenGLWidgets。
target_link_libraries(animean_business PUBLIC
    animean_core
    Qt${QT_VERSION_MAJOR}::Core
    Qt${QT_VERSION_MAJOR}::Gui
)

target_compile_definitions(animean_business PRIVATE
    ANIMEAN_SOURCE_DIR="${ANIMEAN_SOURCE_DIR}"
    ANIMEAN_PYFILE_DIR="${ANIMEAN_PYFILE_DIR}"
)

if(ANIMEAN_WITH_PYTHON)
    target_include_directories(animean_business PUBLIC
        "${CMAKE_SOURCE_DIR}/pythonbind"
    )
    target_link_libraries(animean_business PUBLIC pybind11::embed)
    target_compile_definitions(animean_business PUBLIC
        ANIMEAN_WITH_PYTHON
        ANIMEAN_SOURCE_DIR="${ANIMEAN_SOURCE_DIR}"
        ANIMEAN_PYFILE_DIR="${ANIMEAN_PYFILE_DIR}"
        ANIMEAN_PYTHONBIND_DIR="${ANIMEAN_PYTHONBIND_DIR}"
        ANIMEAN_OPENTOONZ_TOOLS_DIR="${ANIMEAN_OPENTOONZ_TOOLS_DIR}"
        ANIMEAN_PYTHON_HOME="${ANIMEAN_PYTHON_HOME}"
        ANIMEAN_PYTHON_DIR_NAME="${ANIMEAN_PYTHON_DIR_NAME}"
    )
endif()

if(BUILD_TESTING)
    # 仿 examples/minimal/qt/violations/CMakeLists.txt：
    # 故意在只链接 animean_business 的目标中包含 <QWidget>，平时不编译，ctest 时触发编译并期望失败。
    function(animean_expect_build_failure name expected source)
        add_library(${name} STATIC EXCLUDE_FROM_ALL ${source})
        target_link_libraries(${name} PRIVATE ${ARGN})
        add_test(NAME ${name}
            COMMAND "${CMAKE_COMMAND}" --build "${CMAKE_BINARY_DIR}" --target ${name})
        set_tests_properties(${name} PROPERTIES
            PASS_REGULAR_EXPRESSION "${expected}"
            RUN_SERIAL TRUE)
    endfunction()

    animean_expect_build_failure(
        violation_business_include_qwidget
        "QWidget: No such file or directory"
        violation_include_qwidget.cpp
        animean_business
    )

    add_test(NAME violation_business_layer_rule
        COMMAND "${CMAKE_COMMAND}"
            "-DFILE=${CMAKE_CURRENT_SOURCE_DIR}/violation_include_qwidget.cpp"
            -P "${CMAKE_CURRENT_SOURCE_DIR}/LayerRules.cmake")
    set_tests_properties(violation_business_layer_rule PROPERTIES
        PASS_REGULAR_EXPRESSION "ANIMEAN-LAYER")
endif()
