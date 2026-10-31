# 计划：在工具里写界面，一键导出成 Qt 界面

**日期：** 2026-10-09（第九稿）  
**状态：** 计划中的“第一步”（手工样板 `qt-sample/`）与“步骤”第 1 至 6 项均已完成；`animean/business/` 无 `QWidget` 业务接口层及无头测试已完成。各项结果与尚未收尾的事项见文末。  
**参照项目：** `C:\Users\admin\Documents\AnimeAn`（仓库内对应副本为 `animean/`）。它提供两样东西：一份真实界面的规模清单，用来确定工具要支持什么；以及接入新界面的业务代码。

## 目的

在工具里写一套比现在更好、更丰富、更美观的界面，一键换成 Qt 界面。换出来的界面通过接口层对外，之后 Agent 只做连接，不改界面本身。

出处：你说“我们直接在工具中写一套更好的，更丰富，更美观的界面，然后可以直接一键换成QT界面。这个翻译后的QT界面附带一个接口层，事后只允许Agent在业务层和接口层直接做连接。”

不再照着现在的 AnimeAn 原样做一遍。
出处：对“照着现在的 AnimeAn 原样做一遍，还要不要作为一个阶段”，你回答“不用”。

## 分层

你给的结构是两条线在界面绑定层会合：

```text
业务层      →  业务接口层  ─┐
                           ├→  界面绑定层
界面效果层  →  界面接口层  ─┘
```

出处：你说“业务层 -> 业务接口层 ->界面绑定层；界面效果层 ->界面接口层 -> 界面绑定层……我拆分出两个接口层对接界面绑定层。”以及“事件，位置等都在绑定。而remotion/motion动画的转义实现在界面效果”。

第四稿里我把这几层理解反了。按你后一句话更正如下：**界面绑定层是中心，是工具机械翻译出来的那部分；业务和效果各从一个接口层接进来。**

| 层 | 里面是什么 | 谁来写 |
| --- | --- | --- |
| 界面绑定层 | 控件树、位置、排版、停靠、事件、状态和逻辑运行层。也就是“哪个控件在哪里、会发出什么事件、绑定着什么状态” | 工具生成，纯机械翻译，每次导出整体覆盖 |
| 业务接口层 | 绑定层朝向业务的一面：事件往外送，状态和请求往里收，外部容器接收业务提供的控件 | 声明由工具生成；和业务之间的连接由 Agent 写 |
| 业务层 | 数据模型、算法、文件读写、脚本 | 业务项目 |
| 界面接口层 | 绑定层朝向效果的一面：每个自动转不了的效果在这里有一个位置，写明它在什么时候被调用、拿到哪些参数 | 声明由工具生成 |
| 界面效果层 | 这些效果在 Qt 里的实现。例如工具里用 Motion 或 Remotion 写的动画，在这里用 Qt 的动画重写一遍 | Agent 翻译 |

两条约束，都可以由编译来检查：

- 业务层不包含界面绑定层和界面效果层的头文件，只通过业务接口层打交道。
- 界面效果层不包含业务的头文件，只通过界面接口层打交道。

**在工具里预览时**，业务这一侧由逻辑文件里的模拟步骤顶替（见“方案”第 5 节）；效果这一侧就是网页里原本的动画。

## 你已经定下来的事

| 事项 | 决定 | 你的原话 |
| --- | --- | --- |
| 一致的含义 | 只看用户感知到的交互行为 | “我说了只要用户感知到的交互行为是一致的就行” |
| 界面由谁搭 | 在工具里可视化地搭，编辑模式要支持布局、伸缩和停靠 | 对“你在工具里可视化地搭……”回答“这个” |
| 停靠 | 工具自己写一套，叫“Qt 停靠”，作为默认的停靠功能 | “可以写一套，就叫做QT停靠。作为工具默认的停靠功能” |
| 浮动嵌入 | 也要支持 | “都要支持。但只需要行为上一致” |
| 标准控件 | 工具自带 | “自带” |
| 列表 | 加、删、拖动重排都要做 | “要做” |
| 逻辑写不下时 | YAML 指向 JS 函数 | “好，那就JS” |
| 时间 | 预览有一个绝对时间，状态可以跟着走 | “只需要给预览模式加一个绝对时间” |
| 效果要不要限制 | 不限制，转不了的标成“需要翻译” | “不限制，标成需要翻译” |
| 需要翻译的控件 | 实现从接口层进来，生成的代码保持纯机械翻译 | “需要翻译的部分也都是从接口层流入。这样代码是纯机械翻译的，有确定性” |
| 界面接口层怎样对接 | 用“名称 + 哈希”，工具里效果的实现改了，哈希就变，对接不上，编译直接报错。只用于界面接口层 | “界面接口层可以是按照工具中的实现，转换为哈希。使用名称+哈希，来实现的对接。这样工具中实现修改以后，哈希就变了，会对接不上编译直接抛出错误”“我说的是界面接口层按照哈希算” |
| 状态图片 | 由 Agent 直接写 SVG，过渡用透明度变化 | “直接写SVG吧”“平滑动画比如发光，只需要做一个透明度变化” |
| 状态归谁管 | 每个状态标明“界面自己管”还是“业务管” | 对这条规则回答“可以” |
| 绘图区 | 工具里只做占位；增加一种“外部容器”，导出后由业务把真正的绘图区放进来 | “是的，增加一个从外部引入容器，这样就可以对接业务层的绘图区” |
| 界面自己管的逻辑 | 放在界面绑定层 | 对“界面自己管的逻辑放哪”回答“放在绑定层” |
| 效果翻译得像不像 | 不单独检验。以后做素材库，保证库里的翻译准确；这部分以后逐步换成算法 | “这个无所谓，以后做素材库，素材库里面的翻译都准确就可以。而且这部分可以之后渐渐替换成算法” |
| 用什么界面来试 | 用 AnimeAn：在工具里给它做一套新界面，面板划分沿用现在的 | “就用AnimeAn来试。”“就以这个工程为原型尝试。” |
| 业务有没有接上 | 不用业务声明，由绑定层自动判断：某个事件的信号有人连接，就交给业务；没人连接，就执行模拟步骤 | 对这个做法回答“认可，同时把这个特性记录下来” |
| 导出的程序依赖 Qt 的 Qml 模块 | 接受 | “认可” |
| Agent 能改哪里 | 只在业务层和接口层之间做连接；绑定层是生成的，不改 | “事后只允许Agent在业务层和接口层直接做连接”“事件，位置等都在绑定” |

## 假设

- **导出物是 Qt 6 Widgets 的 C++ 工程，用 CMake 构建，停靠用 Qt 自带的停靠面板（`QMainWindow` + `QDockWidget`）。**
  出处：验证：`ls /c/Qt/6.9.1/mingw_64/bin` 中有 `Qt6Widgets.dll`、`Qt6Qml.dll`、`Qt6Svg.dll`；`/c/Qt/Tools` 下有 `CMake_64`、`Ninja`、`mingw1310_64`。AnimeAn 的 `CMakeLists.txt:33` 是 `find_package(QT NAMES Qt6 Qt5 REQUIRED COMPONENTS Widgets OpenGLWidgets)`。
- **试用的界面就是 AnimeAn 新界面的第一版。** 面板划分沿用现在的：工具、工具选项、图层、素材、历史、时间轴，中间是绘图区，另有菜单栏和新建项目对话框。第一版由我照这个划分写出来，长相和细节你再改。现在的样子见 `参考截图/AnimeAn-主窗口.png` 和 `参考截图/AnimeAn-时间轴.png`。
  出处：你说“就用AnimeAn来试”；规模见界面盘点报告第 1、2 节（子 Agent 只读调查）：8 个 `QDockWidget`、主菜单栏静态动作 27 个、常驻叶子控件约 60 个。“第一版由我写”是我的假设。
- **验收只比较两边：工具里的预览，和导出的 Qt 程序。** 同一批用例在两边跑，结果要相同。
  出处：你取消了原样复刻，所以不再有“和原程序一致”这个外部基准；你之前定的原则是“本工具转换为QT界面后，逻辑也一致”。
- **样例界面先由 Agent 按文件格式写出来，可视化编辑放在后面做。**
  出处：一般经验。排版和导出没做出来之前，可视化编辑没有东西可以编辑。

## 方案

### 1. 语言要加的东西

| 要加的 | 为什么需要（AnimeAn 这种规模的界面里对应什么） |
| --- | --- |
| 多个窗口，“打开”“关闭”步骤，是否模态 | 新建项目对话框、设置对话框、弹出面板 |
| 主窗口的分区：菜单栏、状态栏、中央区、四个停靠区 | 我核对过 AnimeAn 的原文：`setCorner(Qt::BottomLeftCorner, Qt::BottomDockWidgetArea);`（mainwindow.cpp:709） |
| 布局容器：竖排、横排、网格、表单、层叠、页签，以及“放不下就换行” | 各面板；时间轴的播放条变窄时折成两行 |
| 控件的尺寸规则：建议、最小、最大、固定、伸缩因子 | 例如工具按钮固定 44×44 |
| 菜单和动作：层级、快捷键、可勾选、单选组、右键菜单、弹出菜单 | 主菜单栏、图层右键菜单 |
| 列表和树：行绑定到数组状态，支持勾选、选中、展开、拖动重排 | 图层、素材、历史、帧 |
| 由数据生成的表单：业务给出一组控件的描述，界面照着生成 | 工具选项面板由 Python 返回的数据生成 |
| 逻辑：数组状态的增、删、移动；调用 JS 函数；时间；状态的归属 | 加减图层；预设与宽高同步；播放 |
| 外部容器：一个从外部引入控件的容器。工具里显示为占位，导出后由业务放入真正的控件 | 绘图区 |

出处：界面盘点报告第 1 至 5 节，逐条带源码位置；“由数据生成的表单”对应其中“优先取 Python `toolcontrol.options_for_tool_json(tool, state)`”（mainwindow.cpp:2906-2937）。

### 2. 标准控件包

工具自带 17 种标准控件（`app/standard/index.ts`），每种有三样东西：网页实现、对应的 Qt 类、两边共用的属性和事件声明。包括：文字（`Label`）、按钮（`Button`，含可勾选和带图标）、输入框（`TextInput`）、多行文本（`TextArea`）、数字框（`SpinBox`）、滑条（`Slider`）、滚动条（`ScrollBar`）、下拉框（`ComboBox`）、复选框（`CheckBox`）、页签栏（`TabBar`）、列表（`List`）、树（`Tree`）、由数据生成的表单（`DataForm`）、对话框按钮组（`DialogButtonBox`）、空白伸缩条（`Spacer`）、分隔线（`Separator`）、浮动嵌入框（`FloatBox`）。

素材栏主体分为基础素材（`#palette-basic`：容器 `Container`、外部容器 `External`、6 种布局容器、停靠面板 `Dock`、对话框 `Dialog`）、收藏的素材（`#palette-library`）、项目素材（`#palette-project`：先列出 17 种内置标准控件并标“（标准）”，随后列出本项目 `components/` 中的自定义控件）三栏，下方另有基础图形、流程图、线条与我的预设。设计文档第 1.1 节与第 3.2 节已同步更新。

### 3. Qt 停靠

工具自己实现一套停靠（`app/src/dock.ts`），规则照 Qt 的来：四个停靠区、面板可以并排、叠成页签、拖出成浮窗、关闭后从菜单重新打开、拖动分隔条调整大小。导出成 Qt 时对应 `QMainWindow` + `QDockWidget`（配自定义标题栏 `setTitleBarWidget` / `DockEntry` 与分隔条 `DockSplitterEntry` / `rebuildDockSplitters`，见 `app/qt-templates/generated/ui_binding/Ui.cpp`），面板的排列和拖拽落点用同一份描述（`DockLayoutSpec`）和同一套几何规则（`dock.ts` 的 `computeDropAction` 与 `Ui.cpp` 的 `Ui::Private::dockDropActionAt`）。浮动嵌入框（`FloatBox`）做成内置标准容器，网页和 Qt 各实现一次，放在工具自带的标准控件包里。

### 4. 什么能机械翻译，什么标成“需要翻译”

设计时不限制能用的效果。一个控件拆成四部分来看，前三部分都能机械翻译，只有第四部分可能需要 Agent：

| 部分 | 例子 | 到 Qt 的办法 | 落在哪一层 |
| --- | --- | --- | --- |
| 结构和位置 | 这个按钮在哪个布局里、多大、怎样伸缩 | 机械翻译 | 界面绑定层 |
| 事件和状态 | 点击发出什么事件、是否可用绑定着哪个状态 | 机械翻译 | 界面绑定层 |
| 纯计算 | 取色器里“鼠标位置对应哪个颜色” | 写成 JS 函数，两边运行同一份 | 界面绑定层 |
| 效果 | 悬停时的发光动画、取色器的渐变画面、面板展开的过渡 | 能用状态图片表示的自动转换；其余标成“需要翻译” | 界面效果层 |

所以“需要翻译”标在**效果**上，不是标在整个控件上。工具在素材栏、图层和问题栏里显示哪些控件带有需要翻译的效果。

| 效果的状态 | 含义 | 导出时 |
| --- | --- | --- |
| 可自动转换 | 没有特别的效果，或者效果能用状态图片表示 | 直接生成 Qt 代码 |
| 需要翻译 | 用了自动转不了的东西，例如 Motion 或 Remotion 的动画、随数值变化的绘制 | 只在界面接口层留一个位置。没有人提供实现时，动画表现为直接切到结束状态，绘制表现为一个占位框 |

**状态图片**是让自己设计的外观也能自动转换的办法：一个控件由若干张状态图片组成（正常、悬停、按下、选中、不可用），网页和 Qt 显示同一批图片，状态切换时换图，过渡用透明度变化。

- **图片由 Agent 直接写成 SVG 文件**，放在控件的文件夹里。网页和 Qt 读的是同一批文件，所以两边的长相出自同一个来源，不存在“翻译得像不像”的问题。
- SVG 是矢量的，控件多大、屏幕分辨率多高都清晰，不用准备多套尺寸。
- 文字不放进图片，由控件另外画，这样文字能随状态变化。
- 会被拉伸的控件用九宫格方式拉伸，四个角不变形。
- Qt 的 SVG 模块只支持 SVG 的一部分写法。实测结果（Qt 6.9.1）：渐变、模糊、偏移、合并、遮罩、类名样式都能画；`feDropShadow`、`feComponentTransfer` 和 `clip-path` 不行。工具在检查时把这三种写法报出来，并提示替代写法。完整的表和规则见 `qt-sample/README.md`。

**翻译过的效果进素材库。** 一个效果翻译好之后，它在工具里的实现和 Qt 里的实现作为一对（`pairedEffects`），一起收进素材库（设计文档第 3.2 节的“收藏的素材”）。以后别的控件、别的项目用到同一个效果，直接带着这对实现走，不用再翻译。素材库里的效果要保证翻译准确，这是质量把关的地方。

以后可以逐步用算法代替人工翻译：某一类效果找到了机械的转换办法，就从“需要翻译”改成“可自动转换”。因为效果是通过界面接口层接进来的，换成算法生成时，绑定层和业务都不受影响。

这样拆的好处是：**效果没翻译，不影响行为。** 事件、状态和计算都在绑定层，已经机械翻译好了。缺的只是“好看的那一下”，程序的每个按钮照样能点、状态照样会变，行为用例照样能跑。

### 5. 逻辑：界面自己管的，和业务管的

- YAML 写状态、条件和简单步骤；写不下的指向一个 JS 函数。函数读入状态、返回要改的状态，不能使用网页的元素，检查器发现了就报错。
- 预览有一个时钟，作为只读的状态。测试时可以把时钟拨到指定时刻。
- **业务有没有接上，由绑定层自动判断，按事件逐个判断。** 绑定层要发出一个交给业务的事件之前，先看这个事件的信号有没有人连接：有，就发信号，由业务处理并把结果写回；没有，就执行逻辑文件里的模拟步骤。业务不需要另外声明“我来接管”，也可以只接一部分事件，没接的那些继续走模拟。样板里已经验证（`qt-sample/README.md` 第 1 节）。
- **每个状态标明归属。**
  - 界面自己管：例如哪个页签在前面、哪个面板展开。这部分逻辑属于界面绑定层，导出后照常运行。
  - 业务管：例如图层列表、图层是否可见。YAML 里修改它的步骤是“模拟”，只在业务没有接这个事件时执行。

所以同一份项目文件有两种运行方式：

| | 谁处理业务管的状态 |
| --- | --- |
| 在工具里预览，或者导出后业务还没接上 | 逻辑文件里的模拟步骤 |
| 导出后业务接上了 | 事件经业务接口层交给业务，业务把结果写回界面；模拟步骤不执行 |

导出到 Qt 时，逻辑运行层和 JS 函数一起嵌进 Qt 自带的 JS 引擎运行，网页和 Qt 跑的是同一份代码。

### 6. 两个接口层

**业务接口层**：绑定层和业务之间。

| 内容 | 方向 | 来自项目里的什么 | 例子 |
| --- | --- | --- | --- |
| 事件 | 界面 → 业务 | 控件事件和全局事件 | 用户点了某个图层的眼睛 |
| 状态 | 业务 → 界面 | 标为“业务管”的状态变量，包括数组 | 图层列表、当前工具 |
| 请求 | 业务 → 界面 | 全局事件 | 打开设置窗口、在状态栏显示一句话 |
| 外部容器 | 业务 → 界面 | 画布里的外部容器 | 把真正的绘图区控件放进中央区的外部容器 |

**界面接口层**：绑定层和效果之间。

| 内容 | 方向 | 来自项目里的什么 | 例子 |
| --- | --- | --- | --- |
| 过渡效果 | 绑定层 → 效果 | 标为“需要翻译”的动画 | 控件显示/隐藏切换时，调用它的过渡效果创建 `QAbstractAnimation` |
| 绘制效果 | 绑定层 → 效果 | 标为“需要翻译”的绘制 | 取色器需要重画时，传入 `QPainter`、画布区域和当前的属性字典 |

两个接口层生成出来都是带类型的 C++ 头文件（`business_interface/BusinessInterface.h` 与 `ui_interface/UiEffects.h`）。

**业务接口层按名字和类型对接。** 每个事件一个信号，每个状态一对读写函数，每个外部容器一个放入控件的函数。事件的参数、状态的类型改了，或者某一项被删掉、改名，业务那边的连接代码自然编译不过。界面换颜色、调布局、改动画，都不影响它。每次导出另附一份接口变化清单，写明增加、删除、改动了哪些项。

**界面接口层按“名称 + 哈希”对接。** 每个效果要实现的抽象类，名字里带着哈希，哈希由这个效果在工具里的实现算出来。界面效果层里的 Qt 实现继承这个带哈希的类。工具里这个效果改了，重新导出后接口里的哈希就变了，照着旧哈希写的实现没有可以继承的类，编译直接失败，并指到出问题的那个实现。

```cpp
// 界面效果层里的一个实现。0x4c42b870 是翻译时工具里这个效果的哈希
class PanelExpandAnimation : public vf::PanelExpandEffect<0x4c42b870>
{
public:
    QAbstractAnimation *createTransition(QWidget *target, bool showing) override;
};
```

```text
编译错误（样板里实际得到的输出）：
violations/effect_hash_mismatch.cpp:5:37:   required from here
error: static assertion failed: [VF-EFFECT-HASH] 效果 PanelExpand 在工具里的实现已经改变，现在的哈希是 3fa2c1。
这个实现是照着旧哈希写的，请对照工具里的新实现重新翻译，再把基类改成 vf::PanelExpandEffect<0x3fa2c1>。
```

这样做的效果：

- **工具里改了效果，Qt 那边过时的翻译不可能悄悄留着。** 哈希是类名的一部分，没有可以绕过的检查：哈希不对，就没有可以继承的类，也交不进界面接口层。
- **错误精确到项。** 每个效果有自己的哈希，改了哪一个，就只有它的实现报错，其余照常编译。
- **机制管不了的只有一件事**：有人把哈希改成新的，却没有真的重新翻译。规则文件里写明不允许这样做。

哈希覆盖这个效果的名字、参数，以及它在工具里的实现（算法同设计文档第 3.2 节的结构哈希）。别的效果、别的控件的修改不会让它变。

导出的工程里还附一份给 Agent 的规则文件，写明哪些文件夹是生成的、不能改，和本仓库的 `AGENTS.md` 是同样的做法。

### 7. 验收

一批用例，每条是“从某个状态开始，做一串操作，各控件的状态应该变成什么”。同一批用例在工具的预览里跑一遍，在导出的 Qt 程序里跑一遍，结果要相同。排版另外比较：三个窗口尺寸下，同名控件的位置和大小在两边相同，差在几个像素以内。

## 步骤

时间按一个人加 Agent 连续工作估算，属于一般经验，没有依据可引。

1. **最小的一条线：一个窗口、一个按钮、一个状态，从项目文件导出成能运行的 Qt 程序，带两个接口层、一段示范的业务连接和一个示范的效果实现。**
   产出：导出器的骨架；生成的工程按“分层”一节的结构分好文件夹；一个假的业务层，用来示范连接；一个过渡动画，用来示范效果怎样通过界面接口层提供。预计：1 到 1.5 周。
   完成的标志：导出的程序在本机编译运行；去掉业务连接，程序仍能运行并走模拟步骤；去掉效果实现，程序仍能运行，只是没有动画；在界面效果层里包含业务头文件会编译失败。

2. **竖切片：排版、标准控件、逻辑各做最小的一份。** 语言规格；竖排、横排、网格、表单、层叠五种排版；标准控件先做 8 种；逻辑加数组状态、调用 JS 函数、打开和关闭窗口、状态的归属；停靠先只做固定排列和从菜单显示隐藏。由 Agent 写出 AnimeAn 新界面的第一块：主窗口骨架、图层面板、新建项目对话框。
   产出：工具里能预览、能导出运行的 AnimeAn 新界面骨架。预计：3 到 4 周。
   完成的标志：这一块的用例在预览和导出的程序里全部通过；业务接管“图层是否可见”后，界面不会自己再改一次。这一步结束时，就能判断整条路是否成立。

3. **Qt 停靠和浮动嵌入框。**
   产出：预览里可以拖动、吸附、叠页签、浮出；导出后排列相同。预计：2 到 3 周。
   完成的标志：一组固定的停靠操作做完后，面板的排列在两边相同。

4. **补齐 AnimeAn 的其余面板。** 其余标准控件、菜单的全部形式、由数据生成的表单、换行排版、时钟；工具、工具选项、素材、历史、时间轴等面板。
   产出：AnimeAn 新界面的完整第一版。预计：2 到 3 周。
   完成的标志：界面盘点报告第 4 节里属于界面级的每一类“触发 → 效果”，新界面里都有对应的用例并通过。

5. **编辑模式支持布局和停靠。** 往布局里拖、调整顺序和伸缩、摆放停靠面板、编辑菜单、标注状态的归属。
   产出：不靠 Agent 写文件，也能在工具里搭出第 2 步的那一块界面。预计：2 到 3 周。
   完成的标志：在空项目里用鼠标搭出图层面板，行为与 Agent 写的那份相同。

6. **状态图片，以及“需要翻译”的全流程。**
   产出：状态图片的格式和导出；过渡效果和绘制效果在界面接口层的声明方式；两个示范，一个是用 Motion 写的面板展开动画，一个是取色器的绘制，各自的 Qt 实现放在界面效果层。预计：1 到 2 周。

合计约 11 到 16 周。

## 优点

- **导出的结果是确定的。** 生成的代码里没有手写的部分，同样的输入得到同样的输出。
  出处：你说“这样代码是纯机械翻译的，有确定性”。
- **界面、业务、效果三边可以各改各的。** 界面重新导出，只要业务接口没变，业务那边的连接不用动；只要某个效果没变，它的 Qt 实现不用动。
  出处：一般经验，这是绑定层两侧各隔一个接口层带来的直接结果。
- **效果改了，过时的翻译一定会被发现。** 界面接口层用名称加哈希对接，对不上的地方在编译时就报错。
  出处：你说“这样工具中实现修改以后，哈希就变了，会对接不上编译直接抛出错误”。
- **界面可以脱离业务单独试。** 模拟步骤顶替业务，工具里就能把交互走通。
  出处：原型的预览已经是这样工作的：`app/README.md`“设计窗口的预览模式：控件接收鼠标事件，逻辑运行”。
- **行为只写一遍。** 网页和 Qt 运行同一份逻辑和同一批 JS 函数。
  出处：`app/README.md` 的代码结构表：“`src/runtime.ts` | 逻辑运行层，不依赖 Tauri”。本机 Qt 套件里有 `Qt6Qml.dll`。
- **导出侧与工具侧共用同一套停靠排列描述。**
  出处：网页端与 Qt 端停靠宿主共用 `DockLayoutSpec` 与同一套停靠几何/落点计算规则（`app/src/dock.ts`、`app/qt-templates/generated/ui_binding/Ui.cpp`）。

## 缺点

- **工作量比原型已有的部分大一个量级。**
  出处：`project/README.md` 早期版本的范围说明。
- **不限制效果，意味着“需要翻译”的效果可能很多。** 每多一个，导出后就有一处动画缺失或一块占位，直到 Agent 把它写出来。一键得到的是行为完整的程序，不一定是好看的程序。
  出处：你选了“不限制，标成需要翻译”；Qt 的窗口控件做不了网页里的许多效果（一般经验，无原文）。
- **效果翻译得像不像，没有自动的检验办法。** 行为可以用用例比较，动画和绘制只能靠人看。你已经表示这一点可以接受：准确性由素材库来保证，以后逐步换成算法。
  出处：你说“这个无所谓，以后做素材库，素材库里面的翻译都准确就可以。而且这部分可以之后渐渐替换成算法”。
- **网页里的停靠只能做到结果相同，拖动的手感不保证相同。**
  出处：“Qt 的停靠系统……逻辑极度复杂……Web 库只能做到“长得像”，在拖拽吸附的边界排版行为上极可能无法做到与真实程序完全一致”——Gemini 讨论第 1 轮，它标注“有把握”。未核实，与一般经验相符。
- **标准控件每种要做两遍，还要保证两边的行为相同。**
  出处：一般经验，无原文。
- **哈希挡不住“只改哈希、不看内容”。** Agent 把旧哈希直接换成新哈希，编译就过了。只能靠规则文件和接口变化清单来约束。
  出处：一般经验，无原文。

## 限制

1. **JS 函数不能碰网页里的元素。** Qt 的 JS 引擎里没有它们。
   出处：一般经验：QJSEngine 是纯 JavaScript 引擎，不提供浏览器的 DOM。
2. **本机的 Qt 套件没有网页视图模块，** 不能用“在 Qt 程序里嵌一个网页”来代替翻译。
   出处：验证：`ls /c/Qt/6.9.1/mingw_64/bin | grep -i webengine` 无结果。
3. **新界面要接进 AnimeAn，AnimeAn 得先有业务接口层。** 现在 `animean/business/` 已抽出不依赖 `QWidget` 的 `AnimeanBusiness` 业务层并通过 45 项无头测试；含 Python 绑定部分的原工程主程序合入联调见文末“尚未完成的工作”。
   出处：“UI→模型 / 文件 / Python 约 58 个（65%）”——界面盘点报告第 4 节，对 mainwindow.cpp 中 90 处信号连接的粗略分类。

## 还没解决的问题

目前没有。之前列出的问题都已经由你定下来，见“你已经定下来的事”。

## 第一步的结果（已完成）

手工写出了一个最小项目应该导出成的 Qt 工程，放在 `qt-sample/`，五层各一个文件夹。四件事都得到了确认，详细记录和复现办法见 `qt-sample/README.md`。

| 要确认的事 | 结果 | 出处 |
| --- | --- | --- |
| 这个结构能在本机编译运行 | 能。30 个编译步骤一次通过 | 验证：`cmake --build build` → `[30/30] Linking CXX executable app\vf_sample.exe` |
| 业务接上后，界面不会自己再改一次 | 对。点一次按钮，业务模型只被改了 1 次 | 验证：`vf_sample --selftest` → `model.visible=false model.changeCount=1` |
| 业务没接、效果没提供时，程序照样能用 | 对。业务没接时走模拟步骤；效果没提供时没有过渡，行为不变 | 验证：`--no-business` → `model.changeCount=0`，界面状态照样改变；`--no-effects` → `heightDuringTransition=46 finalHeight=46`，有效果时是 27 和 46 |
| 分层的约束能由编译检查出来 | 能。七段故意越界的代码全部被拦住 | 验证：`ctest --test-dir build` → `100% tests passed, 0 tests failed out of 7` |
| 效果的哈希对不上，编译失败并给出看得懂的错误 | 能，并指到实现文件的那一行 | 验证：GCC 输出 `effect_hash_mismatch.cpp:5:37: required from here` 和 `error: static assertion failed: [VF-EFFECT-HASH] 效果 PanelExpand 在工具里的实现已经改变，现在的哈希是 3fa2c1。……` |
| Qt 能画出哪些 SVG | 大部分能，三种不能 | 验证：`vf_svg_test` 渲染六个文件，结果图在 `qt-sample/docs/` |

三点和原先设想不同的地方：

- **“业务有没有接”不用业务声明。** 绑定层发事件前检查信号有没有被连接，没有就执行模拟步骤。这比让业务调用一个“我来接管”的函数更不容易出错。
- **哈希直接做成类名的一部分。** 最初我做成了“另加一道检查”，那样可以被故意绕过。按你的提醒改成哈希就在类名里（`vf::PanelExpandEffect<0x3fa2c1>`）之后，哈希不对就没有可以继承的类，不存在绕过。
- **阴影要换一种写法。** Qt 画不出 `feDropShadow`。可行的写法是先画一个模糊的深色形状，再在上面画清晰的形状。

## “步骤”第 1 项的结果（已完成）

导出器的骨架写好了：从一个最小的设计项目，生成出分好五层、能编译运行的 Qt 工程。设计项目在 `examples/minimal/design/`，导出的结果和一个示范用的假业务工程在 `examples/minimal/qt/`。复现办法和完整记录见 `examples/minimal/README.md`。

计划里这一项的四个完成标志：

| 完成的标志 | 结果 | 出处 |
| --- | --- | --- |
| 导出的程序在本机编译运行 | 能。导出的文件夹单独构建得到预览程序；接进假业务工程构建得到完整程序 | 验证：`npm run export:qt -- ../examples/minimal/design` → `生成的文件 22 个`；`cmake --build build` → `Linking CXX executable app\vf_minimal.exe` |
| 去掉业务连接，程序仍能运行并走模拟步骤 | 对。界面状态照样改变，业务模型没有被碰 | 验证：`vf_minimal --no-business --steps ...` → `model visible=true changeCount=0`，而界面状态里 `layer.visible` 变成了 `false` |
| 去掉效果实现，程序仍能运行，只是没有动画 | 对 | 验证：`--no-effects` → `size detailPanel 496x96`（点击后 60 毫秒就是完整高度）；有效果时同一时刻是 `496x58` |
| 在界面效果层里包含业务头文件会编译失败 | 对。连同另外五种越界一起被拦住 | 验证：`ctest --test-dir build` → `100% tests passed, 0 tests failed out of 7` |

另外确认的三件事：

| 事项 | 结果 | 出处 |
| --- | --- | --- |
| 业务接上后，界面不会自己再改一次 | 对。点一次按钮，业务模型只被改了 1 次 | 验证：`vf_minimal --steps ...` → `model visible=false changeCount=1` |
| 工具里和导出的程序里，同一串操作之后状态相同 | 逐字相同。四种组合都比过；另外用仓库里原有的示例项目“灯光面板”（14 个控件，含悬停、双击、输入框绑定、不可用的按钮）比过 9 个时刻，也逐字相同 | 验证：`npm run case -- <项目> "<步骤>"` 的输出，和 Qt 程序 `--steps "<步骤>"` 输出中以 `state ` 开头的行做 `diff`，没有差异 |
| 设计项目里改了效果，Qt 那边旧的翻译编译不过 | 对。导出器先报告哈希变了，随后构建失败，错误指到旧翻译所在的那一行 | 验证：把效果的时长从 180 改成 240 后导出 → `哈希从 77a08c49 变成 640a41f7`；构建 → `PanelExpandEffect.h:11:41: required from here` 和 `error: static assertion failed: [VF-EFFECT-HASH] ……` |

### 实现时我做的选择

| 事项 | 我的做法 | 为什么 |
| --- | --- | --- |
| 怎样写“交给业务的事件” | 在逻辑文件的全局事件里写成一个对象：`owner: business`，加一段 `simulate` 步骤。控件用原有的 `emit` 触发它 | 状态已经用 `owner: business` 标归属，事件用同一个写法，容易记 |
| 谁能改业务管的状态 | 只有业务事件的 `simulate`。别处写了，工具的问题栏直接报错 | 这样“业务接上后哪些步骤不再执行”有一条清楚的线，不用逐步去猜 |
| `simulate` 里能不能改界面自己管的状态 | 不能，问题栏报错 | 业务接上后 `simulate` 不执行，写在里面的界面变化会丢，而且只在导出后才暴露 |
| 业务事件什么时候处理 | 等当前这批步骤生效之后。同一批里排在后面的步骤，读到的还是业务状态原来的值 | 业务接上后，结果本来就是事后才写回来。模拟时也这样排，两种情况下顺序才相同 |
| 效果和界面怎样分工 | 效果的实现只创建过渡动画并把它交回来。启动动画、监听它结束、把控件恢复原样、定到最终的显示或隐藏状态，都由界面绑定层用生成的代码做；动画超时没有结束，也照样收尾 | 你的要求：“我觉得应该用代码方法，在代码结束之后让界面层收到消息。这样作为兜底。”这样翻译的人写漏了什么，控件也一定会到达最终状态。验证：故意让动画停在开头不动，界面在动画时长加 300 毫秒后自行收尾（`size detailPanel 496x0` → `496x96`，`check ok`）；故意把控件缩小却不交回动画，界面立刻恢复（`496x96`，`check ok`） |
| 控件怎样对应到 Qt | 控件声明里加一项 `qt`，写明 Qt 的类名、属性的对应、信号的对应。没写的导出成占位框，事件和逻辑照常 | 这是“标准控件包”的最小形式。等标准控件由工具自带时，这份对应关系跟着控件走 |
| 导出的文件夹怎样组织 | 自成一体：能单独构建出预览程序，也能被业务工程整个引入。界面效果层放在里面，导出时不覆盖 | 真实项目（例如 AnimeAn）有自己的工程，导出物应该是其中的一个子文件夹 |
| 逻辑怎样放进程序 | 逻辑运行层打包成一个脚本文件，和项目数据一起作为 Qt 的资源编进去 | 文件能直接打开看，也避开了某些编译器对超长字符串的限制 |
| 哈希的长度 | MD5 的前 8 位十六进制（32 位） | 一个项目里的效果是几十个的量级，32 位足够；类名也不至于太长 |
| 效果在设计项目里放哪 | 单独的 `effects/<效果名>/` 文件夹，在逻辑文件里指给某个控件的 `visible` | 效果可以被多个控件共用，哈希也按效果算 |

出处：以上对应的规则写在 `project/README.md` 第 9 节与第 11 节。

## “步骤”第 2 至 6 项的结果（已完成）

### 1. 语言、运行层与标准控件（对应“步骤”第 2、4 项）

| 能力 | 实现位置 | 结果 |
| --- | --- | --- |
| 六种排版与尺寸规则 | `app/src/model.ts`、`app/qt-templates/generated/ui_binding/Ui.cpp` | 支持竖排 `VBox`、横排 `HBox`、换行 `Flow`（含 `HBox` 的 `wrap: true` 与 Qt 端 `VfFlowLayout`）、网格 `Grid`、表单 `Form`、层叠 `Stack`，以及水平/垂直 `SizePolicy`（`preferred`/`minimum`/`maximum`/`fixed`/`expanding`）和 `stretch` 伸缩因子 |
| 17 种内置标准控件 | `app/standard/index.ts`、`app/qt-templates/generated/ui_binding/Ui.cpp` | 内置 `Label`、`Button`、`TextInput`、`TextArea`、`SpinBox`、`Slider`、`ScrollBar`、`ComboBox`、`CheckBox`、`TabBar`、`List`、`Tree`、`DataForm`、`DialogButtonBox`、`Spacer`、`Separator`、`FloatBox`；`List` 与 `Tree` 支持 `draggable: true` 行拖拽重排并发出 `reorder` 事件（`{ from, to }`）；`DataForm`（Qt 端 `QFrame` + `rebuildDataForm`/`syncDataFormValues`）根据 JSON 描述动态生成参数控件并支持 `visible_when` 条件显隐 |
| 菜单全部形态 | `app/src/model.ts`、`app/src/main.ts`、`app/qt-templates/generated/ui_binding/Ui.cpp` | 支持顶部菜单栏 `menuBar`、多级子菜单、分隔线、快捷键 `shortcut`、可勾选项 `checkable`、单选互斥组 `group`（Qt 侧 `QActionGroup`）、停靠面板显隐绑定 `dock`、右键菜单 `contextMenu`、按钮弹出菜单 `popupMenu` |
| 数组状态与纯逻辑 JS 函数 | `app/src/runtime.ts`、`app/src/check.ts` | 支持 `array` 状态及 `push`/`remove`/`move`/下标赋值；支持 `fn` 调用 `functions/<函数名>.js`，静态词法检查与运行时全局名遮蔽双重禁止访问浏览器 DOM/BOM/网络对象 |
| 多窗口、业务/请求事件、动作与时钟 | `app/src/runtime.ts`、`app/src/export/qt-code.ts` | 支持 `openWindow`/`closeWindow`（Qt 侧模态 `QDialog` 原生关闭同步回写窗口栈）；支持 `owner: business` 业务事件、`owner: ui` 请求事件、异步动作 `actions`（Qt 侧 `action<Name>Requested` / `finish<Name>Success` / `finish<Name>Error`）及预览时钟 `clock`（`clock.ms`、`clock.sec`、`clock.tick`） |

验证：`node scripts/test-step2.ts` 5/5 通过。

### 2. Qt 停靠与浮动嵌入框（对应“步骤”第 3 项）

- 工具端（`app/src/dock.ts`）与 Qt 导出端（`QMainWindow` + `QDockWidget` + `DockEntry` + `DockSplitterEntry`，见 `app/qt-templates/generated/ui_binding/Ui.cpp:2705-3465`）共用同一份停靠排列描述 `DockLayoutSpec`（四侧停靠区 `left`/`right`/`top`/`bottom`、各区宽/高 `size`、同区多组并排 `groups` 及组间比例、同组多页签 `tabs` 与当前激活页签 `active`、浮动面板列表 `floating`）。
- 双端采用相同的拖拽落点判定（`dock.ts` 的 `computeDropAction` 与 `Ui.cpp` 的 `Ui::Private::dockDropActionAt`）：靠近主窗口内侧四边吸附带（左右距窗口边缘 `28px` 以内，上下含菜单栏/状态栏偏移共 `56px` 以内）整侧停靠；落入现有可见已停靠面板时，若属于同一页签组（`sameTabGroup`）且在标题栏及下方 `8px` 带内（`headerHeight + 8`）则保持叠页签状态（`tabify`，同组不误拆分为上下分栏），否则沿该停靠区主分栏轴前后边缘 `25%`（`0.25`）拆分为同轴分栏、沿次分栏轴前后边缘 `22%`（`0.22`）拆分为垂直于主轴的分栏，中心区域叠成页签（`tabify`）；拖到空白处（或按住 `Shift` / 拖出窗口外）拆成浮窗（从停靠区拖出时初始尺寸钳制在 `180~320 × 120~440`）；支持拖动分隔条调整停靠区与分栏尺寸、双击标题栏或点击浮出/还原按钮切换浮动状态、点击 `×` 关闭并从菜单重新打开。
- 内置标准容器 `FloatBox`（`app/standard/index.ts`、`Ui.cpp` 的 `registerFloatBox`）支持在容器内嵌与窗口内浮动卡片之间切换并拖动位置。

验证：`npm run test:dock` 3/3 通过（模型纯函数单测、无头浏览器真实 DOM 交互、停靠变形后网页端与 Qt 端几何比对）。

### 3. 编辑模式与工作流扩充（对应“步骤”第 5 项）

- 编辑模式支持往布局容器拖放控件、在画布或右侧“布局”页签调整子控件顺序与伸缩因子 `stretch`、配置 `SizePolicy` 与网格单元格（`row`/`column`/`rowSpan`/`columnSpan`）、配置停靠面板四侧归属 `dockArea` 与窗口分区（`app/src/layoutedit.ts`）。
- 右侧提供“菜单”页签（`app/src/menuedit.ts`，编辑主窗口顶部菜单栏 `menuBar` 的顶级菜单与一级菜单项 `id`/`text`/`shortcut`/`checkable`/`checked`/`dock`/`emit`，并支持将 `Dock` 一键绑定到视图菜单）与“状态”页签（`app/src/stateedit.ts`，标注状态归属 `owner: ui | business`、增删改状态变量与业务事件）。
- 素材库支持收藏与跨项目复用（`app/src/library.ts`）、文档页签支持“源码 | 预览”分块往返编辑与小节锁定保护（`app/src/docview.ts`）、画布支持进程内 200 步撤销/重做与版本跳转（`app/src/history.ts`）、顶部栏提供“导出成 Qt”按钮与对话框（`app/src/main.ts`）。

验证：`npm run test:editor` 20/20、`npm run test:library` 15/15、`npm run test:docview` 9/9、`npm run test:layout-edit` 8/8 全部通过。

### 4. 状态图片、需翻译效果与 AnimeAn 新界面验收（对应“步骤”第 4、6 项）

- **状态图片 `stateImages`**：支持 `normal`/`hover`/`pressed`/`selected`/`disabled` 5 状态 SVG、九宫格拉伸 `slice` 与透明度过渡 `transitionMs`（网页端 `renderNinePatchSvg`，Qt 端 `StateImageWidget` + `QSvgRenderer` + `QVariantAnimation`），检查器自动检测 `<feDropShadow>`、`<feComponentTransfer>` 与 `clip-path`（`app/src/check.ts`）。
- **需翻译效果与成对收藏**：支持显隐/过渡效果（`kind: "visibility" | "transition"`，Qt 基类纯虚函数 `createTransition(QWidget *target, bool showing)`）和自绘效果（`kind: "paint"`，Qt 端 `PaintEffectWidget` 与基类纯虚函数 `paint(QPainter *painter, const QRect &rect, const QVariantMap &props)`），类名带 8 位 MD5 哈希与 `[VF-EFFECT-HASH]` 编译期静态断言；素材库支持把工具端效果与 Qt 端 `ui_effects/` 实现作为 `pairedEffects` 成对收藏与复制。
- **基础图形与线条导出**：`Shape` 与 `Line` 在 Qt 端由 `VfGraphicWidget` 用 `QPainter` 绘制，覆盖形状轮廓、填充/描边、折线/曲线拐点、端头、挂接与 `Shape` 旋转（`examples/shapes/`）。
- **AnimeAn 新界面（`examples/animean/`）**：设计项目 `examples/animean/design/` 含 **148 个画布节点**（主窗口 `window`、菜单栏、状态栏、中央区 `External` 外部容器 `canvasHost`、`onionSkinBox` 浮动嵌入框 `FloatBox`、`toolsDock` / `layersDock` / `inspectorDock` / `timelineDock` 4 个停靠面板，以及 `newProjectDialog`、`drawSettingsDialog`、`textureFloatDialog` 3 个对话框）、**2 个自定义控件**（`StateButton` 九宫格状态图片按钮、`ColorPicker` 取色器）、**2 个效果**（`PanelExpand` 哈希 `0x4c42b870`、`ColorPickerDraw` 哈希 `0xba2779df`）、**6 个纯逻辑函数**（`applyToolOption.js`、`manageLayerGroup.js`、`recordHistory.js`、`rewindHistory.js`、`syncPresetDimensions.js`、`syncToolOptions.js`）、**1 个动作**（`exportClip.js`）；导出至 `examples/animean/qt/ui/`，并在 `examples/animean/qt/business/`（`LayerModel.h/.cpp`、`CanvasWidget.h/.cpp`）与 `examples/animean/qt/app/Connect.cpp` 中提供了最小示范桩连接。
- **双端自动化对齐验收**：
  - 行为用例：`node scripts/run-case.ts ../examples/animean/design --suite <vf_animean.exe>` 跑通 `examples/animean/design` 的全部 **68 个用例**，连续 3 轮共 **204/204 全部通过**。
  - 几何布局对比：`node scripts/compare-layout.ts` 对比网页端与 Qt 端同名控件位置与尺寸，`examples/minimal/design`（7 个场景，4 个可见控件）最大偏差 `0px <= 3px`；`examples/shapes/design`（7 个场景，17 个可见控件）最大偏差 `0px <= 3px`；`examples/animean/design`（8 个场景，最多 119 个可见控件）最大偏差 `2px <= 3px`。
  - 视觉像素对比：`examples/shapes` 独立渲染逐像素对比（`840×520` 画面，网页端 `?preview=1` 与 Qt 端 `vf_preview.exe --steps "shot:..."`），单通道容差 16 下差异像素 `4007 / 436800`（`0.917% < 2%`），容差 32 下 `2846 / 436800`（`0.652%`）。

### 5. AnimeAn 业务层解耦结果（`animean/business/`）

- 在 `animean/business/animeanbusiness.h` 与 `animean/business/animeanbusiness.cpp` 中抽出了不依赖 `QWidget` 的 `AnimeanBusiness` 类（继承 `QObject`），通过属性、信号与槽封装了绘图区适配器 `AnimePaintViewAdapter`、项目新建/打开/保存、图层增删移动显隐与树重排、工具切换与工具选项 JSON 生成、素材管理、历史撤销/重做、时间轴播放与洋葱皮、嵌入式 Python 脚本入口。
- `animean/business/LayerRules.cmake` 强制检查业务层源码不包含 `QWidget` 等界面头文件。
- `animean/CMakeLists.txt` 默认设置 `ANIMEAN_WITH_PYTHON=ON`，`animean/tests/business_tests.cpp` 中包含 `py::scoped_interpreter`（`pybind11`）驱动 `pyfile/*.py` 的测试用例；最后一次集成验收在 `ANIMEAN_WITH_PYTHON=OFF` 下编译 `animean/` 并运行 `ctest`，6/6 项测试（`projectio_roundtrip`、`animemodel_asset_gc`、`strokefit_zoom_invariance`、含 45 项无界面用例的 `business_headless`，以及 2 项分层违规负向编译测试 `violation_business_include_qwidget`、`violation_business_layer_rule`）全部通过。

## 尚未完成的工作

1. **`animean/mainwindow.cpp` 中剩余的界面与 Python UI 回调剥离**：`animean/mainwindow.cpp` 与 `animean/pythonbind/python_bindings.cpp` 中尚未剥离的 9 类直接操作画布/弹窗/光标/菜单的 Python UI 回调（`animean/business/README.md` 归纳的 `registerAnimeanUiOverlayCallback`、`registerAnimeanUiEditHandlesCallback` / `registerAnimeanUiEditHandleCallback`、`registerAnimeanUiCursorCallback`、`registerAnimeanUiMenuCallbacks`、`registerAnimeanUiLayerContextCallbacks`、`registerAnimeanUiDialogCallbacks`、`registerAnimeanUiFreezeCallbacks` / `registerAnimeanUiFreezeCallback`、`registerAnimeanUiPythonDebugCallback`、`registerAnimeanUiStatusCallback` 以及 `registerAnimeanUiWindowsCallback`、`registerAnimeanUiFillPaintModeCallback`、`registerAnimeanUiPadValueCallback`）、动态脚本菜单、Python 调试 REPL 面板、交互式导入弹窗等耦合尚未迁入 `AnimeanBusiness`。
2. **`examples/animean/qt/app/` 接入真实 `AnimeanBusiness` 及 `ANIMEAN_WITH_PYTHON=ON` 最终重跑**：`examples/animean/qt/app/Connect.cpp` 目前只连接了示范桩代码（`LayerModel` + `CanvasWidget`，仅接线 `layerToggleVisibleRequested` 与 `setCanvasHostWidget`），尚未接入 `AnimeanBusiness`，也未将 `examples/animean/qt/ui/` 导出的新界面直接合入 `animean/` 主程序；`ANIMEAN_WITH_PYTHON=ON` 未在最终版本上重跑。
3. **Tauri 桌面运行路径实机验证**：Tauri 桌面运行路径（`inTauri` / `isInTauri()` 分支，如素材库桌面读写、独立预览 `WebviewWindow`、导出目录选择与写盘）仅通过 `cargo check` 和浏览器/Node 端模拟验证，未实际启动 Tauri 桌面端验证。
4. **批量跑用例偶发长卡顿根因排查**：批量跑用例时曾出现单轮 300 到 610 秒的卡顿，后来多轮没有再出现，根因未查明。
5. **普通控件（非基础图形 `Shape` 的 `QWidget`）在导出成 Qt 时的旋转绘制**：基础图形 `Shape` 的旋转已在 Qt 端按 `QPainter` 旋转绘制；普通控件设置了旋转角度时，问题栏会给出提示，导出成 Qt 时暂不旋转 `QWidget`。
