// 导出成 Qt 时，随设计项目变化的那些文字：两个接口层的头文件、界面绑定层里的生成部分、接口清单。
// 固定不变的文件在 app/qt-templates/ 里，是普通的 C++ 和 CMake 文件；其中写着 //@VF:名字@ 的行由这里生成的内容替换。
import type { Value } from "../expr.ts";
import type { BusinessState, ControlPlan, EffectSlot, InterfaceSummary, WindowPlan } from "./qt.ts";

export interface Context {
  projectName: string;
  window: WindowPlan;
  controls: ControlPlan[];
  summary: InterfaceSummary;
  lastChanges: string[];
}

const GENERATED_NOTE = "由 VibeFrontend 导出，不要手改：下次导出会整个覆盖。";

/** 把模板里写着 //@VF:名字@ 的行换成对应的内容。模板里有没给内容的标记，或者给了内容却没有标记，都算出错。 */
export function fill(template: string, parts: Record<string, string>): string {
  const used = new Set<string>();
  const lines = template.split("\n").map((line) => {
    const match = /^\s*\/\/@VF:([A-Za-z]+)@\s*$/.exec(line);
    if (!match) return line;
    const name = match[1];
    if (parts[name] === undefined) throw new Error(`模板里的标记 ${name} 没有对应的内容`);
    used.add(name);
    return parts[name];
  });
  for (const name of Object.keys(parts)) {
    if (!used.has(name)) throw new Error(`模板里找不到标记 ${name}`);
  }
  return lines.join("\n");
}

/** C++ 字符串字面量里的内容。源文件按 UTF-8 编译，中文原样写。 */
function escapeCpp(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "").replace(/\n/g, "\\n").replace(/\t/g, "\\t");
}

function qstr(text: string): string {
  return `QStringLiteral("${escapeCpp(text)}")`;
}

/** 注释里不能有换行 */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function cppValue(value: Value): string {
  if (typeof value === "string") return qstr(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return "QVariant()";
}

function stateTypes(state: BusinessState): { param: string; result: string; convert: string; text: string } {
  if (state.type === "boolean") return { param: "bool value", result: "bool", convert: "toBool()", text: "真或假" };
  if (state.type === "number") return { param: "double value", result: "double", convert: "toNumber()", text: "数字" };
  if (state.type === "enum") {
    return { param: "const QString &value", result: "QString", convert: "toString()", text: `${(state.values ?? []).join("、")} 之一` };
  }
  return { param: "const QString &value", result: "QString", convert: "toString()", text: "字符串" };
}

// ---------- 业务接口层 ----------

export function businessInterfaceHeader(context: Context): string {
  const { states, events, externals } = context.summary;
  const lines: string[] = [
    `// 业务接口层。${GENERATED_NOTE}`,
    "//",
    "// 业务代码只通过这个类和界面打交道：",
    "//   事件      界面 → 业务   每个业务事件一个信号",
    "//   状态      业务 → 界面   每个“业务管”的状态一对读写函数",
    "//   外部容器  业务 → 界面   每个外部容器一个放入控件的函数",
    "//",
    "// 这一层按名字和类型对接：类型改了、某一项被删掉或改名，业务那边的连接代码自然编译不过。",
    "// 界面换颜色、调位置、改动画，都不影响这里。",
    "#pragma once",
    "",
    "#include <QObject>",
    "#include <QString>",
    "",
    "class QWidget;",
    "",
    "namespace vf {",
    "",
    "class BusinessInterface : public QObject",
    "{",
    "    Q_OBJECT",
    "",
    "public:",
    "    using QObject::QObject;",
  ];
  if (states.length > 0) {
    lines.push("", "    // ---- 状态（业务管）----", "    // 业务的数据变了，调用写函数把新值告诉界面。界面自己不会改这些状态。");
    for (const state of states) {
      const types = stateTypes(state);
      lines.push(
        `    // ${state.path}：${types.text}`,
        `    virtual void ${state.setter}(${types.param}) = 0;`,
        `    virtual ${types.result} ${state.getter}() const = 0;`,
      );
    }
  }
  if (externals.length > 0) {
    lines.push("", "    // ---- 外部容器 ----", "    // 把业务自己的控件放进界面。传空指针表示拿走，界面重新显示占位的文字。");
    for (const external of externals) {
      lines.push(`    // ${external.id}`, `    virtual void ${external.setter}(QWidget *widget) = 0;`);
    }
  }
  if (events.length > 0) {
    lines.push(
      "",
      "signals:",
      "    // ---- 事件 ----",
      "    // 连接了某个信号，界面就把这个事件交给业务，不再执行设计项目里为它写的模拟步骤。",
      "    // 没有连接的信号，界面照旧执行模拟步骤。",
    );
    for (const event of events) {
      lines.push(`    // ${event.name}${event.text ? `：${oneLine(event.text)}` : ""}`, `    void ${event.signal}();`);
    }
  }
  lines.push("};", "", "} // namespace vf", "");
  return lines.join("\n");
}

// ---------- 界面接口层 ----------

function effectHex(effect: EffectSlot): string {
  return `0x${effect.hash}`;
}

export function uiEffectsHeader(context: Context): string {
  const { effects } = context.summary;
  const lines: string[] = [
    `// 界面接口层。${GENERATED_NOTE}`,
    "//",
    "// 设计项目里标为“需要翻译”的效果，每个在这里有一个要实现的抽象类。",
    "// 类名里带着哈希，哈希由这个效果在工具里的实现算出来：",
    "//",
    "//     class MyEffect : public vf::SomeEffect<0x1a2b3c4d> { ... };",
    "//",
    "// 工具里这个效果改了，重新导出后这里的哈希就变了。照着旧哈希写的实现，",
    "// 它的基类不再是有效的类，编译失败，必须重新翻译。",
    "#pragma once",
    "",
    "#include <memory>",
    "",
    "class QAbstractAnimation;",
    "class QWidget;",
    "",
    "namespace vf {",
  ];
  for (const effect of effects) {
    const name = effect.className;
    const hex = effectHex(effect);
    lines.push(
      "",
      "// ---------------------------------------------------------------------------",
      `// 效果 ${effect.name}（${oneLine(effect.label)}）：控件显示和隐藏时的过渡`,
      `// 工具里的实现：设计项目的 ${effect.source}`,
      `// 当前哈希：${effect.hash}`,
      "// ---------------------------------------------------------------------------",
      "",
      "// 哈希不是当前值的，一律落到这里，编译时报错。",
      "template <unsigned Hash>",
      `class ${name}`,
      "{",
      `    static_assert(Hash == ${hex},`,
      `                  "[VF-EFFECT-HASH] 效果 ${escapeCpp(effect.name)} 在工具里的实现已经改变，现在的哈希是 ${effect.hash}。"`,
      `                  "这个实现是照着旧哈希写的，请对照工具里的新实现（${escapeCpp(effect.source)}）重新翻译，"`,
      `                  "再把基类改成 vf::${name}<${hex}>。");`,
      "};",
      "",
      "// 哈希是当前值的，才是真正要实现的抽象类。",
      "template <>",
      `class ${name}<${hex}>`,
      "{",
      "public:",
      `    virtual ~${name}() = default;`,
      "",
      "    // 创建这次过渡的动画并返回它。target：要显示或隐藏的控件。showing：true 为显示，false 为隐藏。",
      "    // 调用时控件是显示着的，位置和大小是画布上定下的样子。没有动画可做时返回空指针。",
      "    //",
      "    // 实现里只做两件事：把控件摆成动画开始时的样子，创建动画并设好起止值。不要自己启动动画。",
      "    // 其余的事由界面绑定层负责，不用写，写漏了也不会出错：",
      "    //   - 启动动画，监听它的结束；动画超时没有结束时也照样收尾；",
      "    //   - 动画结束，或者被下一次过渡打断时，停掉并删除动画，把控件的位置和大小恢复成画布上的样子，",
      "    //     清掉控件上的图形效果（QGraphicsEffect，例如为了淡入淡出加的透明度效果）；",
      "    //   - 把控件定到最终的显示或隐藏状态。",
      "    virtual QAbstractAnimation *createTransition(QWidget *target, bool showing) = 0;",
      "};",
    );
  }
  lines.push(
    "",
    "// 界面绑定层通过它拿到各个效果的实现。某个效果没有人提供时返回空，界面就直接切到结束状态。",
    "class UiEffects",
    "{",
  );
  if (effects.length > 0) {
    lines.push("public:");
    for (const effect of effects) {
      const type = `${effect.className}<${effectHex(effect)}>`;
      lines.push(
        `    void ${effect.setter}(std::unique_ptr<${type}> effect) { m_${effect.getter} = std::move(effect); }`,
        `    ${type} *${effect.getter}() const { return m_${effect.getter}.get(); }`,
      );
    }
    lines.push("", "private:");
    for (const effect of effects) lines.push(`    std::unique_ptr<${effect.className}<${effectHex(effect)}>> m_${effect.getter};`);
  }
  lines.push("};", "", "} // namespace vf", "");
  return lines.join("\n");
}

// ---------- 界面绑定层里生成的部分 ----------

/** Ui.h 里对业务接口的实现声明 */
export function businessOverrides(context: Context): string {
  const { states, externals } = context.summary;
  const lines: string[] = [];
  for (const state of states) {
    const types = stateTypes(state);
    lines.push(`    void ${state.setter}(${types.param}) override;`, `    ${types.result} ${state.getter}() const override;`);
  }
  for (const external of externals) lines.push(`    void ${external.setter}(QWidget *widget) override;`);
  if (lines.length === 0) lines.push("    // 这个设计项目没有业务管的状态，也没有外部容器");
  return lines.join("\n");
}

/** Ui.cpp 用到的、模板里没有包含的 Qt 控件类 */
export function includes(context: Context): string {
  const already = new Set(["QFrame", "QLabel", "QMainWindow", "QWidget"]);
  const classes = new Set<string>();
  for (const control of context.controls) {
    if (!already.has(control.qtClass)) classes.add(control.qtClass);
  }
  const lines = [...classes].sort().map((name) => `#include <${name}>`);
  return lines.length > 0 ? lines.join("\n") : "// （这个设计项目没有用到别的 Qt 控件类）";
}

function buildFunction(context: Context): string[] {
  const { window, controls, summary } = context;
  const lines: string[] = [
    "// 控件树和位置。每个控件的对象名就是它在设计项目里的 ID。",
    "void Ui::Private::build()",
    "{",
    `    window.setWindowTitle(${qstr(window.title)});`,
    `    auto *${window.variable} = new QWidget(&window);`,
    `    ${window.variable}->setFixedSize(${window.width}, ${window.height});`,
    `    window.setCentralWidget(${window.variable});`,
    `    add(${qstr(window.id)}, ${window.variable});`,
  ];
  for (const control of controls) {
    const v = control.variable;
    const label =
      control.kind === "external" ? "外部容器" : control.kind === "container" ? "容器" : control.kind === "placeholder" ? `${control.type}（占位）` : control.type;
    lines.push("", `    // ${control.id}：${label}`, `    auto *${v} = new ${control.qtClass}(${control.parentVariable});`);
    lines.push(`    ${v}->setGeometry(${control.x}, ${control.y}, ${control.width}, ${control.height});`);
    if (control.kind === "external") {
      lines.push(`    addExternal(${qstr(control.id)}, ${v}, ${qstr(control.placeholder ?? "")});`);
      continue;
    }
    if (control.kind === "container" || control.kind === "placeholder") {
      lines.push(`    ${v}->setFrameShape(QFrame::StyledPanel);`);
      if (control.placeholder !== null) lines.push(`    addPlaceholder(${v}, ${qstr(control.placeholder)});`);
    }
    for (const [name, value] of control.fixed) lines.push(`    ${v}->setProperty("${escapeCpp(name)}", ${cppValue(value)});`);
    const props = control.props.map(([name, qtName]) => `{ ${qstr(name)}, "${escapeCpp(qtName)}" }`).join(", ");
    const effect = control.effect >= 0 ? `${control.effect} /* 效果 ${summary.effects[control.effect].name} */` : "";
    const args = [qstr(control.id), v];
    if (props || effect) args.push(props ? `{ ${props} }` : "{}");
    if (effect) args.push(effect);
    lines.push(`    add(${args.join(", ")});`);
    for (const event of control.events) {
      const param = event.type === "string" ? "const QString &value" : event.type === "number" ? "double value" : event.type === "boolean" ? "bool value" : "";
      const value = param ? ", value" : "";
      lines.push(
        `    QObject::connect(${v}, &${control.qtClass}::${event.signal}, q, [this](${param}) {`,
        `        dispatch(${qstr(control.id)}, ${qstr(event.event)}${value});`,
        "    });",
      );
    }
  }
  lines.push("}");
  return lines;
}

function raiseFunction(context: Context): string[] {
  const { events } = context.summary;
  const lines: string[] = [
    "// 交给业务的事件：业务连接了对应的信号，就发信号并返回 true；没有连接，返回 false，由调用方执行模拟步骤。",
    "bool Ui::Private::raiseBusinessEvent(const QString &name)",
    "{",
  ];
  for (const event of events) {
    lines.push(
      `    if (name == QLatin1String("${event.name}")) {`,
      `        static const QMetaMethod signal = QMetaMethod::fromSignal(&BusinessInterface::${event.signal});`,
      "        if (!q->isSignalConnected(signal))",
      "            return false;",
      `        emit q->${event.signal}();`,
      "        return true;",
      "    }",
    );
  }
  if (events.length === 0) lines.push("    Q_UNUSED(name);");
  lines.push("    return false;", "}");
  return lines;
}

function effectFunction(context: Context): string[] {
  const { effects } = context.summary;
  const lines: string[] = [
    "// 显示隐藏的过渡：有人提供了实现，就让它创建动画并返回；没有就返回空，由调用方直接切到结束状态。",
    "QAbstractAnimation *Ui::Private::createVisibility(int effect, QWidget *target, bool showing)",
    "{",
  ];
  if (effects.length === 0) {
    lines.push("    Q_UNUSED(effect);", "    Q_UNUSED(target);", "    Q_UNUSED(showing);", "    return nullptr;", "}");
    return lines;
  }
  lines.push("    switch (effect) {");
  effects.forEach((effect, index) => {
    lines.push(
      `    case ${index}: // ${effect.name}`,
      `        if (auto *implementation = effects.${effect.getter}())`,
      "            return implementation->createTransition(target, showing);",
      "        break;",
    );
  });
  lines.push("    default:", "        break;", "    }", "    return nullptr;", "}");
  return lines;
}

function businessFunctions(context: Context): string[] {
  const { states, externals } = context.summary;
  const lines: string[] = ["// 业务接口的实现"];
  for (const state of states) {
    const types = stateTypes(state);
    lines.push(
      `void Ui::${state.setter}(${types.param})`,
      "{",
      `    d->setBusinessState(${qstr(state.path)}, value);`,
      "}",
      "",
      `${types.result} Ui::${state.getter}() const`,
      "{",
      `    return d->call("getState", { ${qstr(state.path)} }).${types.convert};`,
      "}",
      "",
    );
  }
  for (const external of externals) {
    lines.push(`void Ui::${external.setter}(QWidget *widget)`, "{", `    d->setExternal(${qstr(external.id)}, widget);`, "}", "");
  }
  if (lines.length > 1) lines.pop();
  else lines.push("// （这个设计项目没有业务管的状态，也没有外部容器）");
  return lines;
}

/** Ui.cpp 末尾生成的部分 */
export function generatedPart(context: Context): string {
  return [...buildFunction(context), "", ...raiseFunction(context), "", ...effectFunction(context), "", ...businessFunctions(context)].join("\n");
}

// ---------- 界面效果层的起始文件 ----------

export function effectList(context: Context): string {
  const { effects } = context.summary;
  if (effects.length === 0) return "//   （没有）";
  return effects.map((effect) => `//   ${effect.name}（${oneLine(effect.label)}）：继承 vf::${effect.className}<${effectHex(effect)}>，照着设计项目的 ${effect.source} 翻译`).join("\n");
}

// ---------- 接口清单 ----------

export function interfaceDoc(context: Context): string {
  const { states, events, externals, effects } = context.summary;
  const lines: string[] = [
    `# 接口清单：${context.projectName}`,
    "",
    `${GENERATED_NOTE}`,
    "",
    "这里列出这个界面对外的全部接口。规则见同一文件夹的 `AGENTS.md`。",
    "",
    "## 和上一次导出相比",
    "",
  ];
  if (context.lastChanges.length === 0) lines.push("没有变化的记录（这是第一次导出，或者接口一直没有变过）。");
  else lines.push("最近一次有变化的导出，变了这些：", "", ...context.lastChanges.map((change) => `- ${change}`));

  lines.push("", "## 业务接口层", "", "头文件：`business_interface/BusinessInterface.h`，类：`vf::BusinessInterface`。按名字和类型对接。", "", "### 业务事件（界面 → 业务）", "");
  if (events.length === 0) lines.push("没有。");
  else {
    lines.push("| 事件 | 信号 | 含义 |", "| --- | --- | --- |");
    for (const event of events) lines.push(`| \`${event.name}\` | \`${event.signal}()\` | ${oneLine(event.text) || "—"} |`);
  }
  lines.push("", "### 业务管的状态（业务 → 界面）", "");
  if (states.length === 0) lines.push("没有。");
  else {
    lines.push("| 状态 | 类型 | 写 | 读 |", "| --- | --- | --- | --- |");
    for (const state of states) {
      const types = stateTypes(state);
      lines.push(`| \`${state.path}\` | ${types.text} | \`${state.setter}(${types.param})\` | \`${state.getter}()\` |`);
    }
  }
  lines.push("", "### 外部容器（业务 → 界面）", "");
  if (externals.length === 0) lines.push("没有。");
  else {
    lines.push("| 控件 ID | 放入控件 |", "| --- | --- |");
    for (const external of externals) lines.push(`| \`${external.id}\` | \`${external.setter}(QWidget *widget)\` |`);
  }

  lines.push("", "## 界面接口层", "", "头文件：`ui_interface/UiEffects.h`。按“名称 + 哈希”对接：实现要继承带哈希的抽象类。", "");
  if (effects.length === 0) lines.push("没有需要翻译的效果。");
  else {
    lines.push("| 效果 | 种类 | 要继承的类 | 在设计项目里的实现 | 用在哪些控件上 |", "| --- | --- | --- | --- | --- |");
    effects.forEach((effect, index) => {
      const users = context.controls.filter((control) => control.effect === index).map((control) => `\`${control.id}\``);
      lines.push(
        `| \`${effect.name}\`（${oneLine(effect.label)}） | 显示和隐藏的过渡 | \`vf::${effect.className}<${effectHex(effect)}>\` | \`${effect.source}\` | ${users.join("、") || "（没有用到）"} |`,
      );
    });
  }
  lines.push("");
  return lines.join("\n");
}
