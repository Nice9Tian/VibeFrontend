# 设计项目的规则

这个文件夹是一个 VibeFrontend 设计项目，是“导出成 Qt”的最小例子。

规则和仓库里的示例项目相同，完整内容见 [../../../project/README.md](../../../project/README.md)。修改这个项目之前先读它，尤其是第 9 节“导出成 Qt 用到的写法”，这个例子把那一节的四样东西都用到了：

| 用到的 | 在哪里 |
| --- | --- |
| 业务管的状态 | `logic/app.logic.yaml` 的 `layer.visible` |
| 业务事件 | `logic/app.logic.yaml` 的 `layerToggleVisible` |
| 外部容器 | `ui/scene.json` 的 `canvasHost` |
| 需要翻译的效果 | `effects/PanelExpand/`，用在 `detailPanel` 的显示和隐藏上 |

改了 `effects/` 里的文件，效果的哈希会变，`../qt/ui/ui_effects/` 里对应的 Qt 实现要重新翻译。

导出的位置写在 `project.json` 的 `export.qt` 里，是 `../qt/ui`。
