# 给 Agent 的说明

这个仓库里主要有以下内容，动手前请先分清你要改的是哪一样。

| 文件夹或文件 | 是什么 | 什么时候改 |
| --- | --- | --- |
| `project/` | **默认设计项目**：用 VibeFrontend 工具设计的界面，包括画布、逻辑、说明文档和控件实现 | 用户让你做控件、改界面、改交互逻辑、写说明时，**只改这里**（或用户指定的 `examples/*/design/`） |
| `app/` | VibeFrontend 工具本身的源码（Tauri 2 + TypeScript 原型，含导出器 `app/src/export/` 和 Qt 导出模板 `app/qt-templates/`） | 只有用户明确要求修改工具本身或 Qt 导出器时才改 |
| `可视化界面与语义逻辑设计工具.md` | 工具的产品与数据设计文档 | 只有用户明确要求修改设计文档时才改 |
| `计划-AnimeAn界面翻译.md` | AnimeAn 界面翻译与导出验证的工作计划与现状记录 | 只有用户明确要求更新该计划文档时才改 |

以下文件夹与“导出成 Qt”及 AnimeAn 工程有关：

| 文件夹 | 是什么 | 什么时候改 |
| --- | --- | --- |
| `examples/minimal/` | 导出成 Qt 的最小例子：`design/` 是设计项目，`qt/ui/` 是从它导出的界面，`qt/business/`、`qt/app/`、`qt/violations/` 是示范用的假业务工程与分层检查测试 | `design/` 按设计项目的规则改；`qt/ui/` 里除了 `ui_effects/` 都是生成的，**不要手改**，要改就改 `design/` 再重新导出。细则见 `examples/minimal/qt/ui/AGENTS.md` |
| `examples/animean/` | AnimeAn 新界面的完整例子：`design/` 是设计项目，`qt/ui/` 是导出产物（`qt/ui/ui_effects/` 下含手写的 `PanelExpand` 过渡效果与 `ColorPickerDraw` 自绘效果），`qt/business/` 与 `qt/app/` 是假业务工程与冒烟测试 | `design/` 按设计项目的规则改；`qt/ui/` 里除 `ui_effects/` 外均由导出生成，**不要手改**。细则见 `examples/animean/qt/ui/AGENTS.md` |
| `examples/shapes/` | 基础图形（`Shape`）与线条（`Line`）导出成 Qt 的例子：`design/` 是设计项目，`qt/ui/` 是从它导出的界面 | `design/` 按设计项目的规则改；`qt/ui/` 里除了 `ui_effects/` 都是生成的，**不要手改** |
| `animean/` | AnimeAn 动画软件本身的 C++ / Qt / Python 工程。其中 `animean/business/`（`AnimeanBusiness`）是解耦出来的无界面业务层，只依赖 `animean_core`、`Qt::Core`、`Qt::Gui`，禁止包含 `QWidget`；第三方依赖 `animean/external`（如 `pybind11`）和本地 Python 运行时 `animean/tools/python312` 不提交到 git | 只有用户明确要求修改 AnimeAn 工程或其业务层时才改。细则见 `animean/AGENTS.md` |
| `qt-sample/` | 写导出器之前手工写的样板，现在只保留其中的 SVG 试验 | 一般不用改 |

### `app/qt-templates` 与 `examples/*/qt/ui/` 的关系

- `app/qt-templates/generated/` 存放导出成 Qt 时的固定模板文件（如 `ui_binding/Ui.h`、`ui_binding/Ui.cpp`、`ui_binding/UiDriver.h`、`ui_binding/UiDriver.cpp`、`CMakeLists.txt`、`cmake/LayerRules.cmake`、`preview/main.cpp`、`AGENTS.md` 等）。执行导出时，`app/src/export/qt.ts` 与 `app/src/export/qt-code.ts` 会将模板里的 `//@VF:...` 标记替换为根据设计项目生成的 C++ 代码，并写入目标导出目录（如 `examples/*/qt/ui/`）。
- `app/qt-templates/scaffold/` 存放 `ui_effects/` 的起始文件（`CMakeLists.txt`、`EffectsSetup.h`、`EffectsSetup.cpp`），仅在目标导出目录中尚不存在对应文件时写入，不会覆盖已手写的效果实现。
- 因此，`examples/*/qt/ui/` 中除 `ui_effects/` 以外的所有文件都是由对应的 `design/` 和 `app/qt-templates/` 通过 `npm run export:qt` 生成的产物。不要直接手改 `examples/*/qt/ui/` 里的生成文件；若要调整界面或逻辑请修改 `design/`，若要调整通用导出运行时或模板请修改 `app/qt-templates/` 与 `app/src/export/`，然后重新运行 `npm run export:qt`。

## 修改设计项目

1. 所有修改都在 `project/` 文件夹（或用户指定的 `examples/*/design/` 文件夹）内进行。
2. 动手之前先读 [project/README.md](project/README.md)，里面写明了文件结构、控件的写法、YAML 逻辑的写法，以及哪些东西不能改。
3. 用户贴给你的文字里如果有 `User referenced "control=...; scene=...; root=..."` 这样的一行，那是从工具里复制出来的引用，指明了用户说的是哪个控件、哪个文件的哪几行。路径相对于其中的 `root`，`#89-96` 表示第 89 到 96 行。引用后面跟着的才是用户的要求。先读引用指向的内容，再动手。完整的格式见 `project/README.md` 第 3 节。
4. 工具会监听 `project/` 中的文件变化并自动刷新，不需要你重启任何东西。
5. 改完后自查：`project/README.md` 末尾有检查清单。工具底部的问题栏会显示同样的检查结果，用户会看到。

## 不要做的事

- 不要为了完成 `project/` 里的任务去改 `app/`。如果你认为工具本身有缺陷或缺少功能，在回复中告诉用户，不要自己动手改。
- 不要改动控件的 ID、位置和尺寸，除非用户明确要求。
