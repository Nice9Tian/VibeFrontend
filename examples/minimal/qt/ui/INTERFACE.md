# 接口清单：导出样板

由 VibeFrontend 导出，不要手改：下次导出会整个覆盖。

这里列出这个界面对外的全部接口。规则见同一文件夹的 `AGENTS.md`。

## 和上一次导出相比

最近一次有变化的导出，变了这些：

- 效果 PanelExpand：在工具里的实现改了，哈希从 77a08c49 变成 4c42b870，需要对照 effects/PanelExpand/index.js 重新翻译

## 业务接口层

头文件：`business_interface/BusinessInterface.h`，类：`vf::BusinessInterface`。按名字和类型对接。

### 业务事件（界面 → 业务）

| 事件 | 信号 | 含义 |
| --- | --- | --- |
| `layerToggleVisible` | `layerToggleVisibleRequested()` | 用户点了“切换图层可见” |

### 业务管的状态（业务 → 界面）

| 状态 | 类型 | 写 | 读 |
| --- | --- | --- | --- |
| `layer.visible` | 真或假 | `setLayerVisible(bool value)` | `layerVisible()` |

### 外部容器（业务 → 界面）

| 控件 ID | 放入控件 |
| --- | --- |
| `canvasHost` | `setCanvasHostWidget(QWidget *widget)` |

## 界面接口层

头文件：`ui_interface/UiEffects.h`。按“名称 + 哈希”对接：实现要继承带哈希的抽象类。

| 效果 | 种类 | 要继承的类 | 在设计项目里的实现 | 用在哪些控件上 |
| --- | --- | --- | --- | --- |
| `PanelExpand`（面板展开） | 显示和隐藏的过渡 | `vf::PanelExpandEffect<0x4c42b870>` | `effects/PanelExpand/index.js` | `detailPanel` |
