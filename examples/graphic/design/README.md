# 平面设计项目的规则

这个文件夹是一个 VibeFrontend **平面设计**项目（`project.json` 里 `"kind": "graphic"`）：海报、作品集、宣传页这类按纸张尺寸做的版面。
用户在 VibeFrontend 工具里摆放、拖动、改字；Agent 按这里的规则修改文件。工具监听这个文件夹，文件一变就自动刷新。

和界面设计项目（`kind` 不写或写 `"ui"`）共用同一个编辑器：画布、图层、选中、拖动、吸附、撤销、锁定、引用、说明文档都一样。
不一样的是：画板是**页面**，单位是**毫米**，没有逻辑（YAML）和停靠、菜单这些窗口的东西，导出成网页、PDF 和图片而不是 Qt。

## 1. 文件结构

```text
design/
  README.md                 # 本文件
  project.json              # 项目名、kind、样式表清单、页面和说明文档、导出位置
  ui/scene.json             # 画布：页面、节点、位置、尺寸、属性
  styles/*.css              # 项目的样式表：颜色、字体、文字样式（第 4 节）
  components/<类型名>/       # 项目自己的控件：由脚本画的图（第 5 节）
    component.json
    index.js
    style.css               # 可选
  lib/*.js                  # 几个控件共用的脚本（可选）
  assets/                   # 图片、字体、数据
  docs/*.md                 # 说明文档
  parts/<名字>/              # 子项目（可选，第 8 节）：从这里拆出去单独做的一块
    project.json
    ui/scene.json
    docs/part.md
```

`project.json`：

```json
{
  "version": 1,
  "id": "……",
  "name": "平面设计示例",
  "kind": "graphic",
  "styles": ["styles/tokens.css", "styles/text.css"],
  "boards": [{ "id": "spread1", "doc": "docs/spread1.md" }],
  "export": { "web": "../web" }
}
```

`styles` 按顺序挂进设计窗口、播放页和导出的网页；`icon`（可选）是项目里一张图片的路径，预览成电脑时窗口标题栏和任务栏上用它；`boards` 是页面和它的说明文档；`export.web` 是导出成网页时默认放在哪里（相对于本文件夹）。

## 2. 画布 `ui/scene.json`

```json
{
  "version": 1,
  "unit": "mm",
  "root": "spread1",
  "boards": ["spread1", "page3"],
  "nodes": {
    "spread1": {
      "type": "Page", "width": 420, "height": 297,
      "props": { "sheets": 2, "marginTop": 14, "marginBottom": 16, "marginOuter": 14, "marginInner": 20, "class": "paper" },
      "children": ["title"]
    },
    "title": { "type": "Text", "x": 14, "y": 14, "width": 150, "height": 34, "props": { "class": "title", "html": "设计类型" } }
  }
}
```

- `unit` 是 `"mm"`：所有 `x`、`y`、`width`、`height` 都是毫米，小数最多两位。
- `boards` 是页面的先后顺序；`root` 是第一页。编辑时全部页面按这个顺序一页接一页往下摆在画布上（位置是自动算的，不用写）；第一页总在原点，后面的页面写了 `x`、`y` 的照写的放，一般不要写。
- 页面（`Page`）可以由几张纸左右拼成（`sheets: 2` 是跨页）。`margin*` 是版心的边距（外、内、上、下），工具据此画参考线、做吸附，**不**改变内容的位置。导出 PDF 时每个页面一页；有跨页时另出一份按纸拆开的。
- 成册印刷时写 `"cover": "wrap"`：第一个页面是包封，两张纸拼成，左半是封底（最后一页）、右半是封面（第 1 页），翻开后从第 2 页起两页一版（第 2–3 页、第 4–5 页……）。翻页条、页面的名字和导出都按这个页码，按纸拆开的 `sheets.pdf` 按页码排，封面在第一页。骑马钉装订时总页数要是 4 的倍数。
- 节点的位置相对于它的父节点：页面里的节点相对于页面左上角，组里的节点相对于组的左上角。

能用的节点类型：

| 类型 | 是什么 | `props` |
| --- | --- | --- |
| `Page` | 页面 | `sheets`、`marginTop`、`marginBottom`、`marginOuter`、`marginInner`、`class` |
| `Text` | 文本框：一段 HTML | `html`、`class`；只改这一个文本框的 `fontSize`（pt）、`lineHeight`（倍）、`letterSpacing`（em）、`textAlign`（left / center / right / justify），不写就照样式类 |
| `Image` | 图片 | `src`（项目里的路径）、`fit`（contain / cover / fill / none）、`position`、`alt`、`class` |
| `Group` | 组：把几样东西归在一起，一起移动 | `class` |
| `Part` | 子项目：显示 `parts/<名字>/` 里那一页的内容，自己不放东西（第 8 节） | `part`（`"parts/<名字>"`）、`board`（子项目里的页面，不写是第一页） |
| `Shape` | 基础图形（矩形、圆、多边形……） | 同界面设计，见工具里的样式条 |
| `Container` | 还没做的占位框 | — |
| `components/` 里的类型 | 项目自己的控件 | 由它的声明决定 |

线条（`Line`）和界面设计专用的类型（窗口、对话框、排版容器、停靠面板、外部容器）在平面设计里不能用。

## 3. 哪些可以改，哪些不能改

| 内容 | 规则 |
| --- | --- |
| 节点的 ID | 不要改。ID 由用户在工具里命名 |
| `x`、`y`、`width`、`height`、`rotation`、`locked`、`children` 的顺序 | 不要改，除非用户明确要求。位置和尺寸由用户在画布上拖 |
| `type` 和 `props` | 可以改 |
| `styles/` | 可以改：文字长什么样、颜色和字体都在这里 |
| `components/`、`lib/` | 可以新增和修改 |
| `docs/*.md` | 可以改正文；不要删改 `<!-- ui-section: ... -->` 标记 |
| `Part` 节点 | 不要往里放东西，也不要改 `props.part`；那一块的内容在 `parts/<名字>/ui/scene.json` 里改 |

## 4. 文字和样式类

- 文本框的内容是一段 HTML（`props.html`），可以带行内标签（`<b>`、`<i>`、`<span class='…'>`、`<br>`）、几个段落或者一张表。属性用**单引号**，JSON 里才不用转义。
- 文字长什么样**由样式类决定**：`props.class` 写类名，类写在 `styles/*.css` 里。个别文本框要另调字号、行距、字距、对齐时，用上面那几个属性（右侧“属性”页签的“文字”一栏，没填时灰字是样式类给的值），它们盖在样式类上；几处共用的写成样式类。不要在 HTML 里写 `style="…"`。
- 样式表里用 `/* @style 名字 */` 标出给人选的样式，右侧“属性”页签只列这些；一个都没标时列出所有单独成规则的类。

  ```css
  /* @style 正文 */
  .body { font-size: 9.5pt; line-height: 16pt; }
  ```

- 长度用 `mm`，字号用 `pt`：这些是印出来的尺寸。
- 节点在哪、多大只由画布决定。样式类里给节点写的 `position`、`left`、`top`、`width`、`height`、`margin` 对节点不起作用；只对节点**里面**的东西起作用。
- 页面的样式类（纸色、正文字体、纸纹）写在页面的 `class` 上。
- 用户双击文本框直接改字，存下来的就是 `props.html`。

## 5. 项目自己的控件（由脚本画的图）

写法和界面设计的控件一样（`component.json` + `index.js` + 可选 `style.css`），另外：

- `defaultSize` 按**毫米**写。
- 属性声明里，数值可以写 `unit`（显示的单位）、`step`、`min`、`max`；选项可以写 `optionLabels`（选项在界面上的名字）；`group` 把属性归到“属性”页签里的一组。没有默认值的属性可以不写，这时界面上灰着显示控件实际用的值（控件的实例提供 `effective()` 时）。
- `index.js` 可以用相对路径 `import` 项目里的别的脚本（例如 `../../lib/wave.js`），几个控件共用的计算放 `lib/`。同一个页面里一个模块只有一份，几个控件可以靠它共享状态。
- 元素用 `el.ownerDocument` 建，不要用全局的 `document` 去找别的控件的元素：控件只管自己方框里的东西。
- 根元素铺满节点的方框：给它加上 `vf-fill` 这个类，再加上 `props.class`。根元素是 `<svg>` 也可以。
- 创建函数的第二个参数里有 `stage`（设计窗口给的环境）：

  | 名字 | 用途 |
  | --- | --- |
  | `stage.still` | 只画静止的一帧。编辑时、导出 PDF 和图片时为真；预览、独立预览和导出的网页里为假，这时可以动 |
  | `stage.print` | 正在导出 PDF 或图片。用 WebGL 的控件建画布时传 `preserveDrawingBuffer: stage.print` |
  | `stage.url(路径)` | 项目里一个文件的地址（图片、数据、字体） |
  | `stage.wait(名字)` | 有异步加载时先调用，加载完再调用它返回的函数。导出会等所有这样的加载完成 |
  | `stage.unit` | `{ css: "mm", px: 3.78 }`：1 毫米合多少 CSS 像素 |

- 动的东西要有静帧：`stage.still` 为真时只画一次，画的就是印出来的那一刻。静帧选哪一刻通常写成一个属性（例如 `still`）。
- 导出 PDF 时画布（`<canvas>`）会被自动换成同样大小的图片，控件不用自己处理。
- `destroy()` 里停掉动画、取消订阅、释放 WebGL：编辑时每改一次画布，控件都会重建。

例子：`components/Wave/`（用 `lib/wave.js`，预览时流动、编辑时停在 `still` 的相位）。

## 6. 预览和导出

- 工具里切到“预览模式”，或者点“▶ 独立预览”（打开播放页，按页排开，和导出的网页一样）。
- 顶栏的“导出”：
  - 网页：`npm run export:web -- <本文件夹> [导出到哪里]`。导出的文件夹要经一个本地服务打开。
  - PDF 和图片：`npm run export:print -- <本文件夹> [输出文件夹] [--scale 2] [--no-png] [--no-split]`。输出 `boards.pdf`（每个页面一页）、`sheets.pdf`（跨页按纸拆开）、每页的 PNG 和 `report.json`。
- 导出时页面报的错（控件加载失败、运行出错）写在 `report.json` 的 `errors` 里，命令行也会打印出来。

## 7. 改完后的检查清单

- [ ] `scene.json` 是合法的 JSON，`unit` 是 `"mm"`，`boards` 里的每一项都是 `Page`。
- [ ] 节点的 `type` 是上面表里的类型，或者在 `components/` 里有文件夹。
- [ ] `props` 只用了声明里有的属性；`class` 里的类在样式表里有。
- [ ] 文本框的 HTML 里没有 `style="…"`，属性用单引号。
- [ ] 跨页上文本框不压中缝（问题栏会提示）。
- [ ] 控件的 `index.js` 用 `el.ownerDocument` 建元素，根元素带 `vf-fill`，有异步加载的用了 `stage.wait`，`destroy()` 里把动画停掉。
- [ ] 没有改动节点的 ID、位置和尺寸，没有删改说明小节的标记。
- [ ] 改子项目里的东西时，改的是 `parts/<名字>/ui/scene.json`；子项目节点的 `part` 指向的文件夹存在。

## 8. 子项目 `parts/<名字>/`

用户在工具里右键一样东西 ▸“拆成子项目”（或多选几样一起拆），它们就搬进 `parts/<名字>/`，原处换成一个 `Part` 节点（几样一起拆时，方框是它们合起来的范围，位置换成相对这个方框的）。子项目是一个只有一页的小项目：

```json
// parts/x23/project.json
{ "version": 1, "id": "……", "name": "×23 那一行", "kind": "graphic", "part": { "of": "../.." },
  "boards": [{ "id": "part", "doc": "docs/part.md" }] }
```

```json
// parts/x23/ui/scene.json：页面就是这一块的大小，样式类照抄总项目那一页的
{ "version": 1, "unit": "mm", "root": "part", "boards": ["part"],
  "nodes": {
    "part": { "type": "Page", "width": 176, "height": 34.07, "props": { "sheets": 1, "class": "spread", "marginTop": 0, "marginBottom": 0, "marginOuter": 0, "marginInner": 0 }, "children": ["times"] },
    "times": { "type": "Group", "x": 0, "y": 0, "width": 176, "height": 34.07, "props": { "class": "times" }, "children": ["…"] }
  } }
```

```json
// 总项目 ui/scene.json 里原来的位置
"times": { "type": "Part", "x": 20, "y": 164.6, "width": 176, "height": 34.07, "props": { "part": "parts/x23", "board": "part" } }
```

- 子项目里改了，总项目跟着变：编辑器、播放页和导出都按子项目的文件去画 `Part` 节点。
- `styles/`、`components/`、`lib/`、`assets/` 只有总项目里的一份，子项目直接用，路径照总项目的写（`styles/kata.css`、`assets/…`）。子项目的设计类型和样式表跟着总项目，`project.json` 里不用写。
- 子项目里可以再放 `Part`（最多 4 层），不能放它自己。
- `Part` 节点的方框和子项目页面一样大；不一样时超出方框的部分看不到，问题栏会提示。
- 拆的时候，样式画在方框外面的描边和 `::before` / `::after` 框也算进范围（工具量出来的），所以子项目的页面可能比原来的方框大一点，里面的东西相应往里挪；总项目里看位置不变。
