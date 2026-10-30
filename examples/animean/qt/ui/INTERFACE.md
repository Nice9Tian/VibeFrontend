# 接口清单：AnimeAn

由 VibeFrontend 导出，不要手改：下次导出会整个覆盖。

这里列出这个界面对外的全部接口。规则见同一文件夹的 `AGENTS.md`。

## 和上一次导出相比

没有变化的记录（这是第一次导出，或者接口一直没有变过）。

## 业务接口层

头文件：`business_interface/BusinessInterface.h`，类：`vf::BusinessInterface`。按名字和类型对接。

### 业务事件（界面 → 业务）

| 事件 | 信号 | 含义 |
| --- | --- | --- |
| `layerToggleVisible` | `layerToggleVisibleRequested()` | 用户请求切换当前图层的显示与隐藏 |

### 请求事件（业务 → 界面）

| 事件 | 调用函数 | 含义 |
| --- | --- | --- |
| `notifyStatus` | `requestNotifyStatus(const QString &message)` | 业务通知界面在状态栏显示一条消息 |

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

没有需要翻译的效果。
