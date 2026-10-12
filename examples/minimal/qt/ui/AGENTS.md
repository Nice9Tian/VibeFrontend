# 给 Agent 的说明

这个文件夹是 VibeFrontend 从设计项目导出的 Qt 界面。动手之前先分清哪些能改。本文件每次导出都会被覆盖。

## 分层

```text
业务层      →  业务接口层  ─┐
                           ├→  界面绑定层
界面效果层  →  界面接口层  ─┘
```

| 文件夹 | 层 | 内容 | 能不能改 |
| --- | --- | --- | --- |
| `ui_binding/` | 界面绑定层 | 控件树、位置、事件、状态和逻辑 | **不能**。工具生成，下次导出整个覆盖 |
| `business_interface/` | 业务接口层 | 业务事件、业务管的状态、外部容器 | **不能**。工具生成 |
| `ui_interface/` | 界面接口层 | 每个“需要翻译”的效果要实现的抽象类 | **不能**。工具生成 |
| `cmake/`、`preview/`、`CMakeLists.txt`、`INTERFACE.md`、`vf-export.json` | | 构建规则、预览程序、接口清单、导出记录 | **不能**。工具生成 |
| `ui_effects/` | 界面效果层 | 效果在 Qt 里的实现 | **能**。这是你写的，导出时不会覆盖 |

业务层和“业务与业务接口之间的连接”不在这个文件夹里，在业务工程自己的目录里。

想改界面的长相、位置、交互逻辑，不要改这里的文件，去改设计项目，然后重新导出。

## 你能做的两件事

### 1. 把业务接到业务接口层

业务代码只包含 `business_interface/BusinessInterface.h`，只和 `vf::BusinessInterface` 打交道。有什么可以接，见 `INTERFACE.md`。

- **业务事件**是信号。连接它，在处理函数里调用业务自己的代码。连接之后，界面不再执行设计项目里为这个事件写的模拟步骤。没有连接的事件继续走模拟步骤，所以可以一个一个地接。
- **业务管的状态**各有一对读写函数。业务的数据变了，调用写函数把新值告诉界面。界面自己不会改这些状态。
- **外部容器**各有一个放入控件的函数，把业务自己的控件（例如绘图区）交给界面。

连接代码只做转发和数据转换，不写业务规则，也不直接操作界面里的控件。不要包含 `ui_binding/` 和 `ui_effects/` 的头文件，包含了也编译不过。

### 2. 在界面效果层翻译效果

设计项目里标为“需要翻译”的效果，在 `ui_interface/UiEffects.h` 里各有一个带哈希的抽象类，注释里写着它在设计项目里的实现在哪个文件。

1. 读设计项目里那个文件，弄清它做了什么：变化的是什么、时长、缓动。
2. 在 `ui_effects/` 里新建一个类，继承带哈希的抽象类，实现它的 `createTransition`，用 Qt 的动画把过渡重写一遍：

   ```cpp
   class PanelExpandAnimation : public vf::PanelExpandEffect<0x1a2b3c4d>
   {
   public:
       QAbstractAnimation *createTransition(QWidget *target, bool showing) override;
   };
   ```

   这个函数只做两件事：把控件摆成动画开始时的样子，创建动画并设好起止值，然后把动画返回。**不要自己启动动画，也不用写收尾。** 启动动画、等它结束、把控件的位置和大小恢复原样、清掉加在控件上的图形效果、把控件定到最终的显示或隐藏状态，都由界面绑定层负责。动画超时没有结束，界面绑定层也会照样收尾。

3. 在 `ui_effects/EffectsSetup.cpp` 的 `registerEffects` 里把它交出去。

界面效果层只能包含 `ui_interface/` 的头文件和 Qt，不能包含业务的头文件。

**哈希对不上时编译会失败**，报错里有 `[VF-EFFECT-HASH]`。这表示设计项目里的这个效果改过了，现在的翻译是照着旧的写的。这时必须对照新的实现重新翻译，再改基类里的哈希。**不允许只改哈希而不重新翻译。**

没有翻译的效果不影响行为：界面直接切到结束状态，只是没有过渡。

## 检查

单独构建这个文件夹会得到预览程序 `vf_preview`，它不接业务，业务管的状态走模拟步骤。

```bash
cmake -S . -B build -G Ninja -DCMAKE_PREFIX_PATH=<Qt 的安装目录>
```

```bash
cmake --build build
```

```bash
./build/preview/vf_preview --steps "state;check"
```

`--steps` 的写法见 `ui_binding/UiDriver.h`。`check` 输出 `check ok`，说明界面照着逻辑摆好了。
