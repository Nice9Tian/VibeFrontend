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
```

同一个控件在三处用同一个 **ID** 对应：`scene.json` 的 `nodes.<ID>`、`app.logic.yaml` 的 `objects.<ID>`，以及它在页面文档中的说明小节。

## 2. 哪些可以改，哪些不能改

| 内容 | 规则 |
| --- | --- |
| 控件的 ID | 不要改。ID 由用户在工具里命名 |
| `scene.json` 中的 `x`、`y`、`width`、`height`、`children` 的顺序 | 不要改，除非用户明确要求。位置和尺寸由用户在画布上拖出来 |
| `scene.json` 中的 `type` 和 `props` | 可以改。把容器做成控件就是改这两项 |
| `components/` | 可以新增和修改控件 |
| `app.logic.yaml` | 可以改，按第 5 节的写法 |
| `docs/*.md` | 可以改小节的正文；不要删除或改动 `<!-- ui-section: ... -->` 标记 |

## 3. 把容器做成控件

用户通常会贴来这样一段文字：

```text
[VibeFrontend] 请按项目规则处理这个控件：
项目：C:\...\project
规则：C:\...\project\README.md
控件：panelWindow / hintBox（ID: hintBox，当前类型：Container，尚未转换）
说明：docs/panel.md#hint-box
逻辑：logic/app.logic.yaml → objects.hintBox
```

步骤：

1. **读说明和逻辑。** “说明”一行指向页面文档中的小节（`#` 后面是小节标记名），“逻辑”一行指向 YAML 中的条目。先弄清用户想要什么。
2. **找或写控件。** 先看 `components/` 里有没有合适的控件可以直接用。没有就新建 `components/<类型名>/`，按第 4 节写 `component.json`、`index.js` 和 `style.css`。
3. **改画布。** 把 `ui/scene.json` 中这个节点的 `type` 从 `Container` 改成控件的类型名，按控件声明写入 `props`。控件不能包含子节点时，删掉节点上的 `children`。
4. **需要时改逻辑。** 在 `logic/app.logic.yaml` 的 `objects.<ID>` 下补充 `props`、`events`、`bind`。只能使用控件声明过的属性和事件（鼠标事件除外，见第 5.5 节）。
5. **自查。** 对照第 7 节的清单。

没有转换的容器（`type` 为 `Container`）也能参与逻辑：它支持 `visible` 属性和全部鼠标事件。

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

## 8. 原型还不支持的内容

以下内容在设计文档中有，但当前原型没有实现，请不要使用：

- 调用动作（`call` 步骤和 `actions`）
- 锁定、版本的恢复与重做、收藏的素材
- 列表、对话框、多窗口
