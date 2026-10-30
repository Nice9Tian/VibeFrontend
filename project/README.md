# 设计项目的规则

这个文件夹是一个 VibeFrontend 设计项目。用户在 VibeFrontend 工具里摆放容器、写说明和逻辑；Agent 按这里的规则修改文件，把容器做成具体控件。工具监听这个文件夹，文件一变就自动刷新。

本文件描述的是**当前原型已经支持的内容**。没有写在这里的写法，原型不认识。

## 1. 文件结构

```text
project/
  README.md                 # 本文件
  project.json              # 项目名、窗口及其页面文档
  ui/scene.json             # 画布：控件树、类型、位置、尺寸、外观设置
  logic/app.logic.yaml      # 逻辑：状态、条件、全局事件、每个控件的行为
  docs/panel.md             # 页面文档：每个控件的说明小节
  components/<类型名>/       # 控件的声明和实现
    component.json
    index.js
    style.css
  effects/<效果名>/          # 需要翻译的效果（第 9.4 节），没有可以不建
  ui/presets.json           # 用户存下来的图形预设（第 10.4 节），没有可以不建
    effect.json
    index.js
```

同一个控件在三处用同一个 **ID** 对应：`scene.json` 的 `nodes.<ID>`、`app.logic.yaml` 的 `objects.<ID>`，以及它在页面文档中的说明小节。

## 2. 哪些可以改，哪些不能改

| 内容 | 规则 |
| --- | --- |
| 控件的 ID | 不要改。ID 由用户在工具里命名 |
| `scene.json` 中的 `x`、`y`、`width`、`height`、`rotation`、`locked`、`children` 的顺序 | 不要改，除非用户明确要求。位置、尺寸、旋转角度（`rotation`，单位为度，绕中心顺时针旋转，0 度时省略）和锁定标记（`locked: true`，未锁定时省略）由用户在画布上操作 |
| `scene.json` 中的 `type` 和 `props` | 可以改。把容器做成控件就是改这两项 |
| `components/` | 可以新增和修改控件 |
| `app.logic.yaml` | 可以改，按第 5 节的写法 |
| `docs/*.md` | 可以改小节的正文；不要删除或改动 `<!-- ui-section: ... -->` 标记 |
| `effects/` | 可以新增和修改效果，按第 9.4 节的写法 |

## 3. 引用，以及把容器做成控件

### 3.1 用户贴来的引用

用户在工具里复制“引用”，贴给你，后面再写上要求。引用是一行英文，格式固定：

```text
User referenced "键=值; 键=值; ..."
```

读法：

- 路径都相对于 `root`（设计项目文件夹的绝对路径）。
- `#` 后面是行号，从 1 开始，首尾都包含：`ui/scene.json#89-96` 是第 89 到 96 行，`docs/panel.md#9` 是第 9 行；没有 `#` 表示整个文件。
- `rules=README.md` 指的就是本文件。

引用一个控件，给出它在三处各自的位置：

```text
User referenced "control=hintBox; type=Container (unconverted); path=panelWindow/hintBox; scene=ui/scene.json#89-96; logic=logic/app.logic.yaml#111-114; doc=docs/panel.md#19-24; root=C:/.../project; rules=README.md"
```

| 键 | 含义 |
| --- | --- |
| `control` | 控件 ID |
| `type` | 当前类型；`Container (unconverted)` 表示还是没有转换的容器 |
| `path` | 从窗口到这个控件的层级 |
| `scene` | 它在画布文件中的节点 |
| `logic` | 它在 YAML 中的条目；`none (...)` 表示还没有条目，括号里写明应该加在哪里 |
| `doc` | 它的说明小节；`none` 表示还没有说明 |

其他几种引用：

| 开头的键 | 引用的是 | 其他键 |
| --- | --- | --- |
| `lines` | 文档或 YAML 中的几行 | `entry`（所在的 YAML 条目，如 `objects.lampA`）或 `section`（所在的说明小节） |
| `file` | 整个文件 | |
| `component` | 一种控件类型 | `decl`、`impl`、`style`：声明、实现和样式文件 |
| `problem` | 工具问题栏里的一条问题，值是 `error` 或 `hint` 加问题原文 | 有相关控件时，带上该控件的 `control`、`scene`、`logic`、`doc` |
| `project` | 整个设计项目 | `scene`、`logic`、`doc`：三个主要文件 |

读到引用时：

- 行号是复制那一刻的。动手前先打开文件核对，尤其是你自己刚改过那个文件之后。
- 引用只说明“指的是哪里”，要做什么以引用后面用户写的话为准。
- 用户只引用了某几行，就只处理那几行涉及的内容，不要顺带改别的地方。

### 3.2 把容器做成控件

用户引用一个“尚未转换”的容器，并要求把它做成某种控件时，按下面的步骤做：

1. **读说明和逻辑。** 引用中的 `doc` 指向页面文档中的小节，`logic` 指向 YAML 中的条目。先弄清用户想要什么。
2. **找或写控件。** 先看 `components/` 里有没有合适的控件可以直接用。没有就新建 `components/<类型名>/`，按第 4 节写 `component.json`、`index.js` 和 `style.css`。
3. **改画布。** 把 `ui/scene.json` 中这个节点的 `type` 从 `Container` 改成控件的类型名，按控件声明写入 `props`。控件不能包含子节点时，删掉节点上的 `children`。
4. **需要时改逻辑。** 在 `logic/app.logic.yaml` 的 `objects.<ID>` 下补充 `props`、`events`、`bind`。只能使用控件声明过的属性和事件（鼠标事件除外，见第 5.5 节）。
5. **自查。** 对照第 7 节的清单。

没有转换的容器（`type` 为 `Container`）也能参与逻辑：它支持 `visible` 属性和全部鼠标事件。

另有几种工具自带的类型：`External`（外部容器）见第 9.3 节；`Shape`（基础图形）和 `Line`（线条）见第 10 节。

## 4. 控件的写法

### 4.1 声明 `component.json`

```json
{
  "type": "Lamp",
  "label": "灯",
  "description": "圆形指示灯，下面有名字；on 为真时发光",
  "defaultSize": { "width": 120, "height": 124 },
  "entry": "index.js",
  "style": "style.css",
  "props": {
    "label":   { "type": "string",  "default": "灯" },
    "on":      { "type": "boolean", "default": false, "logic": true },
    "enabled": { "type": "boolean", "default": true,  "logic": true }
  },
  "children": false
}
```

| 字段 | 含义 |
| --- | --- |
| `type` | 类型名，与文件夹名相同，用大写字母开头的英文 |
| `label`、`description` | 在工具的素材栏中显示的名字和说明 |
| `defaultSize` | 从素材栏拖入时的默认尺寸 |
| `props` | 属性及其类型（`string`、`number`、`boolean`）和默认值。标了 `"logic": true` 的属性可以在 YAML 的 `props` 中由表达式控制；没标的只能在 `scene.json` 中写固定值 |
| `bind` | 可以双向绑定的值的类型，目前只支持 `"string"`；不能绑定的控件不写这一项 |
| `events` | 控件自己会发出的事件名，例如输入框的 `["change"]`。**鼠标事件不用写**，运行层会自动提供 |
| `children` | 是否可以包含子节点 |
| `qt` | 这个控件导出成 Qt 时对应什么，见第 9.5 节。不导出可以不写 |

两个有固定含义的属性名：

- `enabled`：为 `false` 时，运行层不再把这个控件的事件交给逻辑。控件自己负责画出不可用的样子。
- `visible`：所有控件都支持，由运行层负责显示和隐藏，**不要**在 `props` 中声明。

### 4.2 实现 `index.js`

一个 ES 模块，默认导出一个创建函数：

```js
export default function create(el, { props, emit, mode }) {
  const input = document.createElement("input");
  input.addEventListener("input", () => emit("change", input.value));
  el.append(input);

  function update(props) {
    input.placeholder = props.placeholder;
    input.disabled = !props.enabled;
    const value = props.value ?? "";
    if (input.value !== value) input.value = value;
  }
  update(props);

  return { update, destroy: () => input.remove() };
}
```

| 名字 | 含义 |
| --- | --- |
| `el` | 运行层准备好的元素，已经按 `scene.json` 定好位置和尺寸。控件把自己的内容放进去，并撑满它（宽高 100%） |
| `props` | 当前的属性值：声明中的默认值、`scene.json` 中的值、YAML 计算出的值依次覆盖。可绑定的控件还会收到 `props.value` |
| `emit(事件名, 值)` | 发出控件自己声明的事件。可绑定的控件在用户输入时调用 `emit("change", 新值)`，运行层把值写入绑定的状态，再通过 `props.value` 传回来 |
| `mode` | `"design"`（编辑模式）或 `"preview"`（预览模式）。一般不需要区别处理 |
| 返回值 | `update(props)` 在属性变化时被调用；`destroy()` 在控件被移除时被调用 |

限制：

- `index.js` 必须是**单个文件**，不能 `import` 其他文件，也不能使用 npm 包。
- 不要自己监听 `click`、`mouseenter` 等鼠标事件再用 `emit` 转发，运行层已经为每个控件提供了这些事件（第 5.5 节）。控件只需要用 CSS 做出悬停、按下的视觉反馈。
- `update` 可能被频繁调用，只更新变化的部分，不要重建整个 DOM。

### 4.3 样式 `style.css`

- 运行层在加载时会自动把样式限定在这个控件类型的范围内。**不要在选择器里写类型名**，直接写自己的类名即可，例如 `.bulb { ... }`。
- 颜色、字体等使用带默认值的 CSS 变量，例如 `var(--color-primary, #2563eb)`，不要依赖项目中别的文件。
- 悬停、按下、聚焦等交互反馈用 `:hover`、`:active`、`:focus` 写在这里。编辑模式下控件收不到鼠标事件，这些效果只在预览模式下出现。
- 文字可能放不下，要写好处理方式：换行、截断并显示省略号，或缩小字号。不要假设文字宽度固定。

## 5. 逻辑 `app.logic.yaml` 的写法

### 5.1 整体结构

```yaml
version: 1

state:                # 状态变量
  lamps:
    a: { type: boolean, initial: false }

conditions:           # 全局条件
  run:
    type: text
    text: 程序正在启动

events:               # 全局事件
  allOff:
    - set: lamps.a = false

objects:              # 每个控件的行为，键是控件 ID
  lampA:
    doc: docs/panel.md#lamp
    props:
      on: lamps.a
    events:
      click:
        - set: lamps.a = not lamps.a
```

### 5.2 状态 `state`

状态可以分层，最底层的每一项写明类型和初始值：

| `type` | 说明 |
| --- | --- |
| `string` | 字符串 |
| `number` | 数字 |
| `boolean` | 真或假 |
| `enum` | 几个固定值之一，另外用 `values: [a, b, c]` 列出 |

引用时用点号连接，例如 `lamps.a`、`panel.message`。

每一项还可以写 `owner`，标明这个状态归谁管，见第 9.1 节。不写就是界面自己管。

### 5.3 表达式

`props` 的值、`if` 的条件、条件的 `expr`，以及 `set` 等号右边，**一律是表达式**：

- 状态路径直接写：`lamps.a`
- 条件代号直接写：`run`、`allOffButton.canTurnOff`
- 字符串用单引号：`'none'`
- 数字、`true`、`false`
- 运算：`==`、`!=`、`and`、`or`、`not`，可以用括号

没有算术运算、大小比较和字符串拼接。

固定的文字必须加引号。写在 YAML 里时，如果表达式以引号开头，或包含 `: `、` #`，整个表达式要再用双引号括起来，例如 `text: "'请先输入标题'"`。

### 5.4 条件 `conditions`

条件是一个有代号、结果为真或假的判断。

```yaml
conditions:
  run:                          # 文字条件：只写一句话，工具无法计算，预览时由用户用开关切换
    type: text
    text: 程序正在启动
    preview: false              # 预览开始时的值，可省略，默认 false
  anyOn:                        # 符号条件：由表达式计算
    type: symbol
    text: 至少有一盏灯亮着        # 可省略，给人看的说明
    expr: lamps.a or lamps.b or lamps.c
```

- 写在顶层 `conditions` 下的是全局条件，代号就是键名，如 `run`。
- 写在 `objects.<ID>.conditions` 下的是控件条件，完整代号是“控件 ID.条件名”，如 `allOffButton.canTurnOff`。在控件自己的条目里引用它，也必须写完整代号。
- 状态的根名（如 `lamps`）、控件 ID、全局条件代号不能重名。
- 把文字条件改写成符号条件时：把 `type` 改成 `symbol`，补上 `expr`，代号保持不变。

### 5.5 事件

**控件事件**写在 `objects.<ID>.events` 下。每个控件（包括没有转换的容器）都自动拥有这些鼠标事件：

| 事件 | 触发时机 |
| --- | --- |
| `click` | 单击 |
| `dblclick` | 双击 |
| `mousedown`、`mouseup` | 按下、松开鼠标键 |
| `mouseenter`、`mouseleave` | 鼠标移入、移出 |

点击类事件只交给鼠标下最里面的那个控件，不会同时交给外层的容器。控件还可以有自己声明的事件，例如输入框的 `change`。

**全局事件**写在顶层 `events` 下：

| 事件 | 触发时机 |
| --- | --- |
| `app.start` | 预览开始时，以及点“重新开始”时 |
| `window.click` | 设计窗口里发生任何点击之后（先处理被点控件的 `click`，再处理它） |
| 自定义名字，如 `allOff` | 被某个步骤用 `emit` 触发时 |

全局事件里还有一种交给业务处理的“业务事件”，写法不同，见第 9.2 节。

### 5.6 步骤

事件的内容是一个步骤列表，按顺序执行。有三种步骤：

```yaml
- set: panel.message = '已全部关闭'      # 给状态赋值，等号左边必须是状态路径
- emit: allOff                           # 触发一个全局事件，它的步骤会立即在这里执行
- if: lamps.a                            # 条件分支，then 和 else 里仍然是步骤列表，else 可省略
  then:
    - set: lamps.a = false
  else:
    - set: lamps.a = true
```

一次事件的全部步骤作为一批处理：后面的步骤读得到前面步骤写入的新值，全部执行完后界面只刷新一次。给状态赋的值类型不对（例如给 `enum` 赋了不在 `values` 里的值）时，这一步被跳过，并在事件记录中报错。

### 5.7 控件条目 `objects.<ID>`

| 键 | 含义 |
| --- | --- |
| `doc` | 指向说明小节，格式为 `文档路径#小节标记名` |
| `props` | 由逻辑控制的属性：`visible`，以及控件声明中标了 `"logic": true` 的属性。值是表达式 |
| `bind` | 与一个状态路径双向绑定，控件声明中必须有 `bind` |
| `conditions` | 属于这个控件的条件 |
| `events` | 事件及其步骤 |
| `effects` | 给属性的变化指定效果，目前只支持 `visible`，见第 9.4 节 |

`scene.json` 中 `props` 的值是固定的默认值；YAML `props` 中同名属性的计算结果会覆盖它。

## 6. 说明文档

每个控件的说明是页面文档中的一个小节，用标记包起来：

```md
<!-- ui-section: hint-box -->
## 提示框

鼠标移到某盏灯上时出现……
<!-- /ui-section -->
```

- YAML 中的 `doc: docs/panel.md#hint-box` 指向标记名为 `hint-box` 的小节。标记名决定小节的身份，标题可以随意改。
- 说明里写的是用户的意图。做控件时以它为准；如果说明和现有逻辑矛盾，在回复中指出来，不要自己猜。
- 做完控件后，可以在小节里补充实现上的要点，但不要删改用户写的内容。

## 7. 改完后的检查清单

- [ ] `scene.json` 是合法的 JSON；节点的 `type` 在 `components/` 中有对应的文件夹。
- [ ] `scene.json` 中节点的 `props` 只用了控件声明里有的属性。
- [ ] YAML `props` 中除 `visible` 外，只用了声明里标了 `"logic": true` 的属性。
- [ ] YAML `events` 中除鼠标事件外，只用了控件声明过的事件。
- [ ] 用了 `bind` 的控件，声明里有 `bind`，并且在用户输入时调用了 `emit("change", 新值)`。
- [ ] 表达式里出现的每个名字，都是已定义的状态路径或条件代号；固定文字加了引号。
- [ ] `emit` 的全局事件在顶层 `events` 中有定义。
- [ ] 没有改动控件的 ID、位置和尺寸，没有删改说明小节的标记。
- [ ] `index.js` 是单个文件，没有 `import`，默认导出创建函数，返回 `update` 和 `destroy`。
- [ ] `style.css` 的选择器里没有写类型名，文字放不下的情况有处理。
- [ ] 业务管的状态只在业务事件的 `simulate` 里修改；`simulate` 里没有修改界面自己管的状态。
- [ ] `effects` 里写的效果在 `effects/` 中有对应的文件夹；改了效果的实现之后，告诉用户它的哈希变了，Qt 那边的翻译要重做。

## 8. 原型还不支持的内容

以下内容在设计文档中有，但当前原型没有实现，请不要使用：

- 基础图形、线条与节点旋转导出成 Qt（详见第 10.5 节）

## 9. 导出成 Qt 用到的写法

设计项目可以导出成 Qt 工程（在工具的 `app/` 文件夹里运行 `npm run export:qt -- <设计项目文件夹>`）。导出后界面和业务代码分开：界面是生成的，业务通过接口接进来。下面几种写法决定接口里有什么。只在工具里预览、不导出的项目，可以完全不用它们。

### 9.1 状态归谁管

每个状态可以写 `owner`：

```yaml
state:
  layer:
    visible: { type: boolean, initial: true, owner: business }   # 业务管
  panel:
    expanded: { type: boolean, initial: false }                  # 界面自己管（不写 owner，或写 owner: ui）
```

| `owner` | 含义 | 谁能改 |
| --- | --- | --- |
| 不写，或 `ui` | 界面自己管，例如哪个面板展开着 | 任何事件的步骤 |
| `business` | 业务管，例如图层是否可见 | 只有业务事件的 `simulate`（第 9.2 节）。导出后由业务写入 |

怎样判断归谁：这个值如果要保存进文件、要参与计算、或者别的地方也会改它，就归业务；只影响界面当前怎么显示的，归界面。

业务管的状态可以照常用在表达式里（`props`、`if`、条件）。不能用 `bind` 绑定到业务管的状态。

导出后，每个业务管的状态在业务接口里有一对读写函数，例如 `layer.visible` 对应 `setLayerVisible(bool)` 和 `layerVisible()`。所以这类状态的路径只能用英文字母、数字和下划线。

### 9.2 业务事件

用户的操作需要业务来处理时，不要直接改状态，而是发一个业务事件。业务事件写在顶层 `events` 下，是一个对象，不是步骤列表：

```yaml
events:
  layerToggleVisible:
    owner: business
    text: 用户点了“切换图层可见”          # 给人看的说明，可省略
    simulate:                            # 业务没有接上时用来顶替的步骤
      - set: layer.visible = not layer.visible

objects:
  toggleButton:
    events:
      click:
        - emit: layerToggleVisible
```

- 在工具里预览时，以及导出后业务还没有接这个事件时，执行 `simulate` 里的步骤，界面照样能用。
- 导出后业务接了这个事件（连接了它的信号），`simulate` 不再执行：界面把事件交给业务，业务处理完，把结果写回它管的状态。
- 业务可以只接一部分事件，没接的继续走 `simulate`。

规则：

- `simulate` 里的 `set` 只能改业务管的状态。原因是业务接上以后 `simulate` 不执行，写在里面的界面状态修改会丢。界面自己的变化写在发出事件的那个步骤列表里。
- `simulate` 里可以 `emit` 别的业务事件，不能 `emit` 普通全局事件。
- 业务事件不在当前这批步骤里执行，而是等这批步骤生效之后再处理。所以同一批里排在 `emit` 后面的步骤，读到的还是业务状态原来的值。
- 事件名只能用英文字母、数字和下划线。导出后它在业务接口里是一个信号，例如 `layerToggleVisibleRequested()`。

### 9.3 外部容器

有些区域的内容不由界面画，而是由业务提供，例如绘图区。在画布里放一个类型为 `External` 的节点（素材栏“基础素材”里的“外部容器”）：

```json
"canvasHost": { "type": "External", "x": 12, "y": 12, "width": 496, "height": 244 }
```

- 在工具里它只是一个占位框。导出后业务接口里有一个放入控件的函数，例如 `setCanvasHostWidget(QWidget *)`，业务把自己的控件交进来。
- 它不能有子节点，也不能写 `events`：里面的控件是业务的，界面收不到它上面的鼠标事件。可以用 `props.visible` 控制显示和隐藏。
- ID 只能用英文字母、数字和下划线。

### 9.4 效果（需要翻译）

控件显示和隐藏时的过渡动画写成“效果”，放在 `effects/<效果名>/`：

```json
{
  "name": "PanelExpand",
  "label": "面板展开",
  "description": "显示时高度从 0 变到原本的高度，同时淡入；隐藏时反过来。时长 180 毫秒",
  "kind": "visibility",
  "entry": "index.js"
}
```

`kind` 目前只有 `visibility`（显示和隐藏的过渡）一种。`index.js` 默认导出一个播放函数：

```js
export default function play(el, { showing }) {
  // el 是控件最外层的元素；showing 为 true 表示正在显示，false 表示正在隐藏
  for (const running of el.getAnimations()) running.cancel();   // 上一次还没放完，先停掉
  const animation = el.animate(
    showing ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }],
    { duration: 180 },
  );
  return animation.finished;   // 返回动画，或者一个在放完时结束的 Promise
}
```

- 调用时元素是显示着的：显示时运行层先把它显示出来再调用；隐藏时等返回的 Promise 结束才把它藏起来。
- 放完后元素要回到原样。用 `el.animate()` 写的动画放完会自动还原；如果改了 `el.style`，要自己改回去。
- 和控件一样，`index.js` 必须是单个文件，不能 `import`。

在 YAML 里把效果指给某个控件的 `visible`：

```yaml
objects:
  detailPanel:
    props:
      visible: panel.expanded
    effects:
      visible: PanelExpand
```

导出成 Qt 时，效果不会自动转换，要由 Agent 在导出工程的界面效果层用 Qt 的动画重写一遍，这就是“需要翻译”。没有翻译时不影响行为，控件直接显示或隐藏，只是没有过渡。

每个效果有一个**哈希**，由效果的名字、种类和文件夹里全部文件的内容算出来（`label` 和 `description` 不算）。Qt 那边的翻译是照着某个哈希写的。**改了效果的实现，哈希就变了，Qt 那边旧的翻译会编译不过，必须重新翻译。** 所以改 `effects/` 里的文件之后，要在回复里告诉用户。当前的哈希显示在工具的问题栏里。

### 9.5 控件在 Qt 里对应什么

控件声明 `component.json` 里的 `qt` 写明它导出成哪个 Qt 控件：

```json
"qt": {
  "widget": "QLineEdit",
  "props":  { "placeholder": "placeholderText", "value": "text" },
  "set":    { "clearButtonEnabled": true },
  "events": { "change": { "signal": "textEdited", "type": "string" } }
}
```

| 字段 | 含义 |
| --- | --- |
| `widget` | Qt 的控件类名，例如 `QPushButton`、`QLabel`、`QLineEdit` |
| `props` | 控件属性名 → Qt 属性名。逻辑算出的属性值会写到对应的 Qt 属性上。用了 `bind` 的控件，要写明 `value` 对应哪个 Qt 属性 |
| `set` | 固定写死的 Qt 属性，可省略 |
| `events` | 控件自己声明的事件 → Qt 的信号。`type` 是信号带的值的类型（`string`、`number`、`boolean`），不带值就不写 |

- `visible`、`enabled` 和鼠标事件不用写，导出时自动处理。
- 没有写 `qt` 的控件，导出后是一个占位框，上面写着类型名和 ID。它的事件、状态和逻辑照常工作，只是长相没有过来。
- 用到了、但没有写在 `qt.props` 里的属性（例如只影响网页样式的 `variant`），导出后不起作用，导出时会提示。

### 9.6 导出之后

在 `project.json` 里可以写默认导出到哪里（相对于设计项目文件夹）：

```json
"export": { "qt": "../qt/ui" }
```

导出的文件夹里有一份 `AGENTS.md`，写明哪些文件是生成的、不能改，以及怎样接业务、怎样翻译效果；`INTERFACE.md` 列出全部接口和相对上一次导出的变化。可以参考仓库里的 `examples/minimal/`。

## 10. 基础图形和线条

除了控件，画布上还可以放基础图形和线条，用来画示意图、流程图。它们是工具自带的两种类型 `Shape` 和 `Line`，不需要 `components/` 里有文件夹。用户在工具里用画图工具画（参照 Figma 和 FigJam），Agent 也可以直接写进 `scene.json`。

### 10.1 形状 `Shape`

```json
"decision1": {
  "type": "Shape",
  "x": 200, "y": 120, "width": 140, "height": 100,
  "props": { "shape": "diamond", "fill": "#e2ecff", "stroke": "#2563eb", "text": "已登录？" }
}
```

| 属性 | 类型 | 默认 | 含义 |
| --- | --- | --- | --- |
| `shape` | string | `rectangle` | 形状，见下表 |
| `fill` | string | `#ffffff` | 填充色，`none` 表示不填 |
| `stroke` | string | `#1f2430` | 描边色，`none` 表示不描边 |
| `strokeWidth` | number | 2 | 描边粗细 |
| `strokeStyle` | string | `solid` | `solid` 实线、`dashed` 虚线、`dotted` 点线 |
| `radius` | number | 0 | 圆角，只对 `rectangle` 有效；很大的值（如 999）得到胶囊形 |
| `sides` | number | 5 | 边数，只对 `polygon` 有效 |
| `points`、`ratio` | number | 5、0.45 | 角数和内径比例，只对 `star` 有效 |
| `opacity` | number | 1 | 不透明度，0 到 1 |
| `text` | string | 空 | 写在形状里的字，可以换行 |
| `textColor`、`fontSize`、`fontWeight`、`textAlign` | | `#1f2430`、14、`normal`、`center` | 文字的颜色、字号、粗细（`bold`）、对齐（`left`、`center`、`right`） |

`shape` 可以是：

| 分组 | 取值 |
| --- | --- |
| 基础图形 | `rectangle` 矩形、`ellipse` 椭圆、`diamond` 菱形、`triangle` 三角形、`triangleDown` 倒三角、`polygon` 多边形、`star` 星形、`plus` 十字、`arrowRight` 右箭头、`arrowLeft` 左箭头、`arrowBoth` 双向箭头、`chevron` 折角箭头、`speechBubble` 对话气泡、`cloud` 云、`text` 纯文字（没有轮廓） |
| 流程图 | `hexagon` 六边形（准备）、`parallelogram` 平行四边形（输入输出）、`parallelogramLeft`、`trapezoid` 梯形（手动操作）、`manualInput` 手动输入、`cylinder` 圆柱（数据库）、`cylinderHorizontal` 横向圆柱、`document` 文档、`multiDocument` 多文档、`predefinedProcess` 预定义处理、`internalStorage` 内部存储、`file` 文件、`or` 或、`summingJunction` 求和 |

### 10.2 线条 `Line`

```json
"connector1": {
  "type": "Line",
  "x": 0, "y": 0, "width": 1, "height": 1,
  "props": {
    "startNode": "start1", "startSide": "right",
    "endNode": "decision1", "endSide": "auto",
    "x1": 0, "y1": 0, "x2": 0, "y2": 0,
    "route": "elbow", "endCap": "triangle", "label": "下一步"
  }
}
```

| 属性 | 类型 | 默认 | 含义 |
| --- | --- | --- | --- |
| `x1`、`y1`、`x2`、`y2` | number | 0、0、160、0 | 起点和终点，相对于线所在的父节点 |
| `startNode`、`endNode` | string | 空 | 这一头挂在哪个节点上。挂着时位置由那个节点决定，节点移动时线跟着走；`x1` 等只在节点被删掉后使用 |
| `startSide`、`endSide` | string | `auto` | 挂在节点的哪里：`top`、`right`、`bottom`、`left` 是那一边的中点；`auto` 是朝着另一头自动选边；`outline` 是外轮廓上的某一点，见下一行。形状的“边中点”和外轮廓都按形状真实的轮廓算（三角形的左边中点在斜边上），不按方框 |
| `startAt`、`endAt` | string | 空 | `side` 为 `outline` 时，这一点在节点方框里的相对位置，`x,y` 形式，0 到 1，例如 `0.959,0.356`。节点缩放后按这个比例找回位置，再贴到轮廓上 |
| `bends` | string | 空 | 折线手动调整过的拐点，`x,y;x,y` 的形式，相对于线的父节点，不含两头。空表示由工具自动走线。只对 `route: elbow` 有效 |
| `route` | string | `straight` | `straight` 直线、`elbow` 折线（只走水平和竖直）、`curved` 曲线 |
| `startCap`、`endCap` | string | `none` | 端头：`none`、`arrow` 线形箭头、`triangle` 实心箭头、`circle` 圆点、`diamond` 菱形、`bar` 短横 |
| `stroke`、`strokeWidth`、`strokeStyle`、`opacity` | | 同形状 | 线的颜色、粗细、线型、不透明度 |
| `label`、`textColor`、`fontSize` | | 空、`#1f2430`、12 | 线中间的文字 |

- 线的 `x`、`y`、`width`、`height` 是工具算出来的外框，写个大概就行，工具保存时会重算。
- 挂上去的节点可以是形状，也可以是任何控件和容器，但不能是线，也不能是窗口本身。
- 线不能包含子节点；形状也不能。

### 10.3 和逻辑一起用

形状和线条也是普通的节点：有 ID，能收到第 5.5 节的鼠标事件，可以在 `app.logic.yaml` 的 `objects.<ID>.props` 里用表达式控制 `visible` 和除了位置以外的属性（例如 `fill: demo.color`、`text: panel.message`）。所以示意图也可以做成能点、能变的。

### 10.4 预设

工具素材栏里的“基础图形”“流程图”“线条”是工具自带的预设。用户在工具里把某个形状的样式“存为预设”后，存在 `ui/presets.json`：

```json
{
  "version": 1,
  "presets": [
    {
      "id": "user-abc123", "label": "判断 · 蓝", "group": "我的预设",
      "type": "Shape", "idBase": "decision", "width": 140, "height": 100,
      "props": { "shape": "diamond", "fill": "#e2ecff", "stroke": "#2563eb" }
    }
  ]
}
```

用户要求“加一个预设”时，可以按这个格式往里加。`props` 里只放样式，不放 `text`、位置和挂接。

### 10.5 导出

形状和线条目前还不能导出成 Qt，导出后是占位框，事件和逻辑照常。除线条外的节点可以在 `scene.json` 节点顶层写 `"rotation": 角度`（单位为度，绕节点中心顺时针旋转，0 度时不写）；导出成 Qt 时暂不处理旋转，工具问题栏会给出提示。

## 11. 排版、标准控件、窗口分区与扩展逻辑

本节列出在基础规则之上新增的语言规格：五种排版与尺寸规则、主窗口分区与停靠面板、8 种自带标准控件、数组状态、逻辑 JS 函数、多窗口与模态对话框、带参事件与请求事件、以及动作调用与模拟。这些写法在工具预览和导出成 Qt 时具有一致的行为。

### 11.1 五种排版与控件尺寸规则

容器除了自由摆放子控件外，还可以用 `VBox`、`HBox`、`Grid`、`Form`、`Stack` 五种类型（或在节点上写 `layout` 字段）按规则自动计算子控件的位置和大小，导出成 Qt 时对应 `QVBoxLayout`、`QHBoxLayout`、`QGridLayout` 和层叠容器：

```json
"inspectorDock": {
  "type": "Dock",
  "dockArea": "right",
  "width": 260, "height": 580,
  "layout": { "kind": "vbox", "padding": 10, "gap": 8 },
  "children": ["inspectorTabs", "inspectorStack"]
}
```

| 排版类型 / `layout.kind` | 含义 | 常用字段 |
| --- | --- | --- |
| `VBox` / `"vbox"` | 竖排：子控件从上到下依次排列 | `padding`（数字或 `[上, 右, 下, 左]`）、`gap` |
| `HBox` / `"hbox"` | 横排：子控件从左到右依次排列 | `padding`、`gap` |
| `Grid` / `"grid"` | 网格：按行列排列，子控件可写 `row`、`column`、`rowSpan`、`columnSpan` | `columns`、`gap`、`rowGap`、`columnGap`、`columnStretch`、`rowStretch` |
| `Form` / `"form"` | 表单：子控件两两成对（左列标签、右列输入控件），左列宽度固定为 `labelWidth`（默认 96），右列自动撑满 | `labelWidth`、`padding`、`gap`、`rowGap`、`columnGap` |
| `Stack` / `"stack"` | 层叠：同一时间只显示 `props.currentIndex`（或 `props.currentPage`）指向的那一页子容器 | `padding`；在 YAML `props` 中控制 `currentIndex` 或 `currentPage` |

每个控件可以用 `size` 指定尺寸规则：

```json
"layerList": {
  "type": "List",
  "width": 220, "height": 220,
  "size": {
    "stretch": 1,
    "vertical": "expanding",
    "minHeight": 120,
    "maxHeight": 800
  }
}
```

| `size` 字段 | 含义 |
| --- | --- |
| `preferredWidth`、`preferredHeight` | 建议尺寸（不写时取节点的 `width`、`height`） |
| `minWidth`、`minHeight` | 最小尺寸 |
| `maxWidth`、`maxHeight` | 最大尺寸 |
| `fixedWidth`、`fixedHeight` | 固定尺寸（也可以写 `horizontal: "fixed"` 或 `vertical: "fixed"`） |
| `stretch` | 在主轴方向分配剩余空间的权重（正整数按比例分配，`0` 或不写表示不伸缩；也可以写 `horizontal: "expanding"` 或 `vertical: "expanding"`） |

### 11.2 主窗口分区与停靠面板

根窗口 `Window` 可以配置菜单栏（`menuBar`）、状态栏（`statusBar`）、中央区（`central`）和四个方向的停靠面板（`docks`，对应 `left`、`right`、`top`、`bottom` 四个停靠区），并可用 `dockLayout` 描述停靠区的厚度、并排分栏（`groups`）、叠页签（`tabs` + `active`）和独立浮窗（`floating`）。导出成 Qt 时对应 `QMainWindow` 的 `QMenuBar`、`QStatusBar`、`centralWidget` 和 `QDockWidget`：

```json
"window": {
  "type": "Window",
  "width": 1280, "height": 800,
  "title": "AnimeAn 动画工作台",
  "menuBar": {
    "height": 28,
    "menus": [
      {
        "id": "fileMenu", "title": "文件",
        "items": [{ "id": "menuNewProject", "text": "新建项目...", "emit": "openNewProject" }]
      },
      {
        "id": "viewMenu", "title": "视图",
        "items": [{ "id": "menuToggleLayers", "text": "图层面板", "dock": "layersDock", "checkable": true, "checked": true }]
      }
    ]
  },
  "statusBar": "statusBar",
  "central": "centralArea",
  "docks": ["toolsDock", "layersDock", "inspectorDock", "timelineDock"],
  "dockLayout": {
    "areas": {
      "top":    { "size": 68,  "groups": [{ "tabs": ["toolsDock"],     "active": "toolsDock" }] },
      "left":   { "size": 240, "groups": [{ "tabs": ["layersDock"],    "active": "layersDock" }] },
      "right":  { "size": 260, "groups": [{ "tabs": ["inspectorDock"], "active": "inspectorDock" }] },
      "bottom": { "size": 96,  "groups": [{ "tabs": ["timelineDock"],  "active": "timelineDock" }] }
    },
    "floating": []
  },
  "children": ["toolsDock", "layersDock", "centralArea", "inspectorDock", "timelineDock", "statusBar"]
}
```

- 停靠面板节点的 `type` 为 `"Dock"`，用 `dockArea` 指定默认停在 `"left"`、`"right"`、`"top"` 或 `"bottom"`，用 `title` 指定标题栏文字，`headerHeight` 指定标题栏高度（默认 26）。
- 在预览模式和导出的 Qt 界面中，停靠面板支持完整的 `QMainWindow + QDockWidget` 停靠规则：
  1. **四边吸附（`move`）**：按住面板标题栏拖向主窗口左、右、上、下四边，吸附到对应停靠区。
  2. **区内并排分栏（`split`）**：拖向另一个已停靠面板的上/下半区（左/右停靠区）或左/右半区（上/下停靠区），在同一停靠区内并排分栏显示。
  3. **叠成页签（`tabify` / `tab`）**：拖向另一个已停靠面板的中央，两个面板叠成一组页签，点击标题栏上的页签按钮切换当前显示的面板。
  4. **拖出成浮窗与恢复（`float` / `restore`）**：点击标题栏上的 `⧉` 按钮（或双击标题栏、或拖到空白处）将面板浮出为独立浮窗，浮窗右下角可拖拽缩放大小；点击 `↙` 按钮（或再次双击标题栏）恢复回原停靠区。
  5. **拖动分隔条改大小（`resize` / `resizeSplit`）**：拖动停靠区与中央区之间的分隔条调整停靠区宽度/高度，或拖动并排面板之间的分隔条调整各分栏尺寸。
  6. **关闭与从菜单重新打开（`close` / `open`）**：点击标题栏上的 `×` 按钮关闭面板；菜单项如果写了 `"dock": "<停靠面板ID>"`，点击该菜单项会自动切换对应停靠面板的显示和隐藏，并同步菜单项的勾选状态。
- 菜单项如果写了 `"emit": "<全局事件名>"`（也可以在 YAML `objects.<菜单项ID>.events.click` 中写步骤），点击时触发对应事件。

### 11.3 9 种工具自带标准控件（含浮动嵌入框 `FloatBox`）

工具在 `app/standard/` 中内置了 9 种常用控件与容器，不需要在设计项目的 `components/` 下创建文件夹即可直接在 `scene.json` 中使用（如果 `components/` 下有同名控件，以项目自己的为准）：

| 类型名 | 中文名 | 对应 Qt 类 | 主要属性（标 `*` 的支持在 YAML `props` 中由表达式控制） | 双向绑定 `bind` 与事件 |
| --- | --- | --- | --- | --- |
| `Label` | 文字 | `QLabel` | `text*`、`tone*`（`normal` / `title` / `muted` / `error` / `accent`）、`align`（`left` / `center` / `right`） | — |
| `Button` | 按钮 | `QPushButton` | `text*`、`variant*`（`primary` / `secondary` / `danger` / `ghost`）、`checkable`、`checked*`、`enabled*` | 事件 `toggle`（带布尔值） |
| `TextInput` | 输入框 | `QLineEdit` | `placeholder*`、`value*`、`enabled*` | `bind: string`，事件 `change` |
| `SpinBox` | 数字框 | `QSpinBox` | `min`、`max`、`step`、`suffix`、`value*`、`enabled*` | `bind: number`，事件 `change` |
| `ComboBox` | 下拉框 | `QComboBox` | `options*`（逗号分隔的选项字符串，如 `"1080p,720p,Square"`）、`value*`、`enabled*` | `bind: string`，事件 `change` |
| `CheckBox` | 复选框 | `QCheckBox` | `text*`、`value*`、`enabled*` | `bind: boolean`，事件 `change` |
| `List` | 列表 | `QListWidget` | `items*`（数组状态）、`value*`（当前选中行下标，从 0 开始）、`checkable`（是否在行首显示圆点指示）、`emptyText`、`enabled*` | `bind: number`，事件 `change` / `select` |
| `Separator` | 分隔线 | `QFrame` | `orientation`（`horizontal` / `vertical`） | — |
| `FloatBox` | 浮动嵌入框 | `QFrame`（含标题栏与切换按钮） | `title*`、`floating*`（默认 `false` 嵌入父容器排版，为 `true` 时脱离原排版成为窗口内浮动框）、`floatX*`、`floatY*`、`floatWidth*`、`floatHeight*`、`headerHeight`（默认 24）、`enabled*`；支持包含子节点（`children: true`）与 `layout` | `bind: boolean`，事件 `toggle` / `change` / `move` |

### 11.4 数组状态与增删移动

状态的类型除了 `string`、`number`、`boolean`、`enum` 外，还可以是 `array`（元素为对象或基本值）：

```yaml
state:
  layers:
    items:
      type: array
      initial:
        - { id: 1, name: "背景层", visible: true }
        - { id: 2, name: "人物线稿", visible: true }
    selectedIndex: { type: number, initial: 0 }
    nextId:        { type: number, initial: 3 }
```

在表达式和步骤中可以对数组状态做以下操作：

- **读取长度与下标访问**：`layers.items.length`、`layers.items[layers.selectedIndex].visible`。
- **修改某一项或某一项的字段（`set`）**：
  ```yaml
  - set: layers.items[layers.selectedIndex].visible = false
  ```
- **新增一项（`push`）**：追加到末尾，或用可选的 `index` 插入到指定下标：
  ```yaml
  - push:
      to: layers.items
      item:
        id: layers.nextId
        name: '"图层 " + layers.nextId'
        visible: true
  ```
- **删除一项（`remove`）**：按 `index` 删除指定下标的元素：
  ```yaml
  - remove:
      from: layers.items
      index: layers.selectedIndex
  ```
- **移动一项（`move`）**：把下标 `from` 的元素移到下标 `to`：
  ```yaml
  - move:
      in: layers.items
      from: layers.selectedIndex
      to: layers.selectedIndex - 1
  ```

### 11.5 表达式扩展与调用逻辑 JS 函数

表达式除了 `==`、`!=`、`and`、`or`、`not` 外，还支持：

- 大小比较：`<`、`<=`、`>`、`>=`
- 算术加减与字符串拼接：`+`、`-`
- 三目条件表达式：`条件 ? 值1 : 值2`

当一段纯数据计算用单行表达式不方便写时，可以在设计项目的 `functions/<函数名>.js` 中写一个纯 JS 函数，并在事件步骤中用 `- fn: <函数名>` 调用：

```js
// functions/syncPresetDimensions.js
export default function syncPresetDimensions(state, param) {
  const preset = state.newProject?.preset ?? "1080p";
  if (preset === "720p") return { "newProject.width": 1280, "newProject.height": 720 };
  return { "newProject.width": 1920, "newProject.height": 1080 };
}
```

- 函数接收当前状态的只读快照 `state` 和事件参数 `param`，返回一个 `{ "状态路径": 新值 }` 对象，运行层会把返回的新值批量写入对应的界面状态。
- **禁止使用网页元素（静态检查 + 运行时隔离）**：因为逻辑函数在导出后会原样放进 Qt 的无 DOM JS 引擎（`QJSEngine`）运行：
  1. **静态检查**：检查器通过单遍词法扫描检查 `functions/*.js`（包括模板字符串 `${...}` 内的表达式与 `\uXXXX` / `\u{...}` Unicode 转义解码），禁止出现 `document`、`window`、`globalThis`、`self`、`top`、`parent`、`frames`、`Function`、`eval`、`HTMLElement`、`localStorage`、`fetch` 等浏览器专属对象或动态逃逸入口。
  2. **运行时全局隔离**：在网页端运行层（`Runtime`）编译执行逻辑函数时，函数以 `"use strict"` 严格模式运行，并将 `window`、`document`、`globalThis`、`self`、`top`、`parent`、`frames`、`navigator`、`location`、`localStorage`、`sessionStorage`、`fetch`、`XMLHttpRequest`、`HTMLElement` 等浏览器全局名字全部遮蔽为 `undefined`（未绑定 `this` 也为 `undefined`），即使绕过静态检查也无法在运行时访问宿主 DOM。

### 11.6 多窗口与模态对话框

设计项目可以在 `project.json` 的 `windows` 和 `ui/scene.json` 中包含多个窗口或对话框（类型为 `Dialog` 或 `Window`）：

```json
"newProjectDialog": {
  "type": "Dialog",
  "modal": true,
  "initialOpen": false,
  "width": 420, "height": 320,
  "title": "新建动画项目",
  "layout": { "kind": "vbox", "padding": 16, "gap": 12 },
  "children": ["newProjectForm", "dialogSep", "dialogFooter"]
}
```

在事件步骤中用 `openWindow` 和 `closeWindow` 打开或关闭窗口：

```yaml
- openWindow: newProjectDialog
- closeWindow: newProjectDialog
```

- `modal: true`（默认）表示模态对话框：它打开期间，背后的主窗口不能点击，直到它被关闭。
- 导出成 Qt 时，`Dialog` 节点生成对应的 `QDialog`（设好 `setModal`），并且对话框被用户通过 `Esc` 键或标题栏 `×` 按钮关闭（`QDialog::finished` / `QEvent::Close`）时会自动同步回运行层，把该对话框的打开状态置为 `false`，立即解除对主窗口的模态锁定。

### 11.7 带参数的事件与请求事件（业务 → 界面）

- **业务事件带参数（界面 → 业务）**：业务事件可以用 `params` 声明参数类型（`string`、`number`、`boolean`），触发时用 `emit: { event: 事件名, args: { 参数名: 表达式 } }` 传入；导出后在 `BusinessInterface` 的信号上生成对应参数，在 `simulate` 步骤中可通过 `param.<参数名>` 读取。
- **请求事件（业务 → 界面）**：当业务主动通知界面做一件事（如在状态栏显示提示、跳到指定页）时，在顶层 `events` 下定义 `owner: ui` 的请求事件：
  ```yaml
  events:
    notifyStatus:
      owner: ui
      text: 业务通知界面在状态栏显示一条消息
      params:
        message: string
      steps:
        - set: project.statusMessage = param.message
  ```
  导出成 Qt 后，`vf::BusinessInterface` 上会生成纯虚函数 `virtual void requestNotifyStatus(const QString &message) = 0;`，业务调用它即可触发 `steps` 里的界面逻辑。

### 11.8 调用动作与动作模拟

需要执行一段带输入输出的操作（例如导出视频、校验数据）并根据成功或失败分别更新界面时，在顶层 `actions` 下声明动作，并在事件步骤中用 `- call: <动作名>` 调用：

```yaml
actions:
  exportClip:
    handler: actions/exportClip.js
    input:
      title: project.title
      layerCount: layers.items.length
    mockResult:
      outputPath: "exports/mock.mp4"
      summary: "模拟导出完成"
    mockError: "磁盘空间不足，导出失败"
    onSuccess:
      - set: project.exportResult = result.summary
      - set: project.statusMessage = result.summary
    onError:
      - set: project.exportResult = error.message
      - set: project.statusMessage = error.message
```

- 在工具的预览栏（以及命令行测试步骤 `mock:<动作名>:real|success|error[:delayMs]`）中，可以把每个动作切换为三种模式之一，并可指定模拟延迟毫秒数 `delayMs`（也可以在动作定义里写 `delayMs`）：
  1. **真跑（`real`）**：执行 `actions/<动作名>.js` 默认导出的函数（支持同步返回或异步返回 `Promise`），把返回值作为 `result` 传给 `onSuccess`（抛出异常或 `Promise` reject 则把错误消息传给 `onError`）。
  2. **模拟成功（`success`）**：不执行实现文件，把 `mockResult` 作为 `result` 执行 `onSuccess`。
  3. **模拟失败（`error`）**：不执行实现文件，把 `mockError` 作为 `error.message` 执行 `onError`。
- 导出成 Qt 后，每个动作都会在 `vf::BusinessInterface` 上暴露信号 `action<Name>Requested(const QVariantMap &input)` 以及完成回调 `finish<Name>Success(const QVariant &result)` 和 `finish<Name>Error(const QString &message)`：业务连接该信号即可接管动作并在完成后回调成功或失败；若业务未连接该信号，则自动回退到内置的 `actions/<动作名>.js` 或模拟模式。
