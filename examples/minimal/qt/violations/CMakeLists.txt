# 故意越界的代码。平时不编译；运行 ctest 时逐个去编译，期望它们失败，并且是因为预期的原因失败。
# 这些测试通过，说明分层约束和哈希对接确实由编译把关。

# 期望编译失败，并且错误输出里出现 expected。
function(vf_expect_build_failure name expected source)
  add_library(${name} STATIC EXCLUDE_FROM_ALL ${source})
  target_link_libraries(${name} PRIVATE ${ARGN})
  add_test(NAME ${name}
    COMMAND "${CMAKE_COMMAND}" --build "${CMAKE_BINARY_DIR}" --target ${name})
  set_tests_properties(${name} PROPERTIES
    PASS_REGULAR_EXPRESSION "${expected}"
    RUN_SERIAL TRUE)
endfunction()

# 界面效果层只链接界面接口层：包含业务层、界面绑定层的头文件都应该找不到
vf_expect_build_failure(violation_effects_include_business "LayerModel\\.h:" effects_include_business.cpp vf_ui_interface)
vf_expect_build_failure(violation_effects_include_binding "Ui\\.h:" effects_include_binding.cpp vf_ui_interface)

# 界面绑定层只链接两个接口层：包含业务层的头文件应该找不到
vf_expect_build_failure(violation_binding_include_business "LayerModel\\.h:" binding_include_business.cpp vf_business_interface vf_ui_interface)

# 业务层不链接任何界面层：包含界面绑定层的头文件应该找不到
vf_expect_build_failure(violation_business_include_binding "Ui\\.h:" business_include_binding.cpp Qt6::Widgets)

# 业务连接代码只链接业务层和业务接口层：包含界面绑定层的头文件应该找不到
vf_expect_build_failure(violation_connection_include_binding "Ui\\.h:" connection_include_binding.cpp business vf_business_interface)

# 效果实现照着写的哈希和接口里现在的不一致：应该在编译时报出看得懂的错误
vf_expect_build_failure(violation_effect_hash_mismatch "VF-EFFECT-HASH" effect_hash_mismatch.cpp vf_ui_interface)

# 用 ../ 绕过分层：配置阶段的检查应该拦住
add_test(NAME violation_relative_include
  COMMAND "${CMAKE_COMMAND}" "-DFILE=${CMAKE_CURRENT_SOURCE_DIR}/relative_include.cpp"
          -P "${CMAKE_SOURCE_DIR}/ui/cmake/LayerRules.cmake")
set_tests_properties(violation_relative_include PROPERTIES PASS_REGULAR_EXPRESSION "VF-LAYER")
