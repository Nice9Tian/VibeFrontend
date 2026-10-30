// 导出成 Qt 时，随设计项目变化的那些文字：两个接口层的头文件、界面绑定层里的生成部分、接口清单。
// 固定不变的文件在 app/qt-templates/ 里，是普通的 C++ 和 CMake 文件；其中写着 //@VF:名字@ 的行由这里生成的内容替换。
import type { Value } from "../expr.ts";
import { paddingOf, type DockArea, type LayoutSpec, type MenuItemSpec } from "../model.ts";
import type { BusinessState, ControlPlan, EffectSlot, EventParam, InterfaceSummary, WindowPlan } from "./qt.ts";

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

function sanitize(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, "_");
}

function cppValue(value: Value): string {
  if (typeof value === "string") return qstr(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return "QVariant()";
}

function stateTypes(state: BusinessState): { param: string; result: string; convert: string; toJs: string; text: string } {
  if (state.type === "boolean") return { param: "bool value", result: "bool", convert: "toBool()", toJs: "value", text: "真或假" };
  if (state.type === "number") return { param: "double value", result: "double", convert: "toNumber()", toJs: "value", text: "数字" };
  if (state.type === "array") {
    return {
      param: "const QVariantList &value",
      result: "QVariantList",
      convert: "toVariant().toList()",
      toJs: "d->engine.toScriptValue(value)",
      text: "列表（QVariantList）",
    };
  }
  if (state.type === "object") {
    return {
      param: "const QVariantMap &value",
      result: "QVariantMap",
      convert: "toVariant().toMap()",
      toJs: "d->engine.toScriptValue(value)",
      text: "对象（QVariantMap）",
    };
  }
  if (state.type === "enum") {
    return {
      param: "const QString &value",
      result: "QString",
      convert: "toString()",
      toJs: "value",
      text: `${(state.values ?? []).join("、")} 之一`,
    };
  }
  return { param: "const QString &value", result: "QString", convert: "toString()", toJs: "value", text: "字符串" };
}

function paramCppDecl(p: EventParam): string {
  if (p.type === "boolean") return `bool ${p.name}`;
  if (p.type === "number") return `double ${p.name}`;
  return `const QString &${p.name}`;
}

function paramsSignature(params: EventParam[] | undefined): string {
  return (params ?? []).map(paramCppDecl).join(", ");
}

// ---------- 业务接口层 ----------

export function businessInterfaceHeader(context: Context): string {
  const { states, events, externals } = context.summary;
  const requests = context.summary.requests ?? [];
  const actions = context.summary.actions ?? [];
  const needVariantList = states.some((s) => s.type === "array");
  const needVariantMap = actions.length > 0 || states.some((s) => s.type === "object");
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
  ];
  if (needVariantList) lines.push("#include <QVariantList>");
  if (needVariantMap) lines.push("#include <QVariantMap>");
  lines.push(
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
  );
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
  if (requests.length > 0) {
    lines.push("", "    // ---- 请求事件（业务 → 界面）----", "    // 业务主动通知界面执行其中写的步骤（如更新提示、切换状态）。");
    for (const req of requests) {
      lines.push(
        `    // ${req.name}${req.text ? `：${oneLine(req.text)}` : ""}`,
        `    virtual void ${req.method}(${paramsSignature(req.params)}) = 0;`,
      );
    }
  }
  if (actions.length > 0) {
    lines.push("", "    // ---- 动作回调（业务 → 界面）----", "    // 连接了动作信号的业务完成或失败后，调用这两个函数驱动 onSuccess / onError 步骤。");
    for (const act of actions) {
      lines.push(
        `    // ${act.name}${act.text ? `：${oneLine(act.text)}` : ""}`,
        `    virtual void ${act.finishSuccess}(const QVariantMap &result) = 0;`,
        `    virtual void ${act.finishError}(const QString &message) = 0;`,
      );
    }
  }
  if (externals.length > 0) {
    lines.push("", "    // ---- 外部容器 ----", "    // 把业务自己的控件放进界面。传空指针表示拿走，界面重新显示占位的文字。");
    for (const external of externals) {
      lines.push(`    // ${external.id}`, `    virtual void ${external.setter}(QWidget *widget) = 0;`);
    }
  }
  if (events.length > 0 || actions.length > 0) {
    lines.push(
      "",
      "signals:",
      "    // ---- 事件 ----",
      "    // 连接了某个信号，界面就把这个事件交给业务，不再执行设计项目里为它写的模拟步骤。",
      "    // 没有连接的信号，界面照旧执行模拟步骤。",
    );
    for (const event of events) {
      lines.push(
        `    // ${event.name}${event.text ? `：${oneLine(event.text)}` : ""}`,
        `    void ${event.signal}(${paramsSignature(event.params)});`,
      );
    }
    for (const act of actions) {
      lines.push(
        `    // 动作 ${act.name}${act.text ? `：${oneLine(act.text)}` : ""}`,
        `    void ${act.signal}(const QVariantMap &input);`,
      );
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
  const requests = context.summary.requests ?? [];
  const actions = context.summary.actions ?? [];
  const lines: string[] = [];
  for (const state of states) {
    const types = stateTypes(state);
    lines.push(`    void ${state.setter}(${types.param}) override;`, `    ${types.result} ${state.getter}() const override;`);
  }
  for (const req of requests) {
    lines.push(`    void ${req.method}(${paramsSignature(req.params)}) override;`);
  }
  for (const act of actions) {
    lines.push(
      `    void ${act.finishSuccess}(const QVariantMap &result) override;`,
      `    void ${act.finishError}(const QString &message) override;`,
    );
  }
  for (const external of externals) lines.push(`    void ${external.setter}(QWidget *widget) override;`);
  if (lines.length === 0) lines.push("    // 这个设计项目没有业务管的状态，也没有外部容器");
  return lines.join("\n");
}

function usesExtendedLayout(context: Context): boolean {
  const { window, controls } = context;
  return (
    window.partitioned ||
    Boolean(window.layout) ||
    controls.some(
      (c) =>
        Boolean(c.layout) ||
        c.kind === "dock" ||
        c.kind === "dialog" ||
        (c.contextMenu?.length ?? 0) > 0 ||
        (c.popupMenu?.length ?? 0) > 0,
    )
  );
}

/** Ui.cpp 用到的、模板里没有包含的 Qt 控件类 */
export function includes(context: Context): string {
  const already = new Set([
    "QAbstractSlider",
    "QActionGroup",
    "QCheckBox",
    "QComboBox",
    "QDialog",
    "QDialogButtonBox",
    "QDockWidget",
    "QFrame",
    "QGridLayout",
    "QHBoxLayout",
    "QHeaderView",
    "QIcon",
    "QKeySequence",
    "QLabel",
    "QLayout",
    "QLineEdit",
    "QListWidget",
    "QMainWindow",
    "QMenu",
    "QMenuBar",
    "QPainter",
    "QPixmap",
    "QPlainTextEdit",
    "QPushButton",
    "QScrollBar",
    "QSizePolicy",
    "QSlider",
    "QSpinBox",
    "QStatusBar",
    "QTabBar",
    "QTreeWidget",
    "QTreeWidgetItem",
    "QVBoxLayout",
    "QWidget",
  ]);
  const classes = new Set<string>();
  for (const control of context.controls) {
    if (!already.has(control.qtClass)) classes.add(control.qtClass);
  }
  const lines = [...classes].sort().map((name) => `#include <${name}>`);
  return lines.length > 0 ? lines.join("\n") : "// （这个设计项目没有用到别的 Qt 控件类）";
}

function prefWidthPlan(c: ControlPlan): number {
  return Math.round(c.size?.fixedWidth ?? c.size?.preferredWidth ?? c.width ?? 100);
}

function prefHeightPlan(c: ControlPlan): number {
  return Math.round(c.size?.fixedHeight ?? c.size?.preferredHeight ?? c.height ?? 32);
}

function clampWidthPlan(c: ControlPlan, w: number): number {
  if (c.size?.fixedWidth !== undefined) return Math.round(c.size.fixedWidth);
  if (c.size?.horizontal === "fixed") return prefWidthPlan(c);
  const minW = c.size?.minWidth ?? 0;
  const maxW = c.size?.maxWidth ?? Infinity;
  return Math.round(Math.max(minW, Math.min(maxW, w)));
}

function clampHeightPlan(c: ControlPlan, h: number): number {
  if (c.size?.fixedHeight !== undefined) return Math.round(c.size.fixedHeight);
  if (c.size?.vertical === "fixed") return prefHeightPlan(c);
  const minH = c.size?.minHeight ?? 0;
  const maxH = c.size?.maxHeight ?? Infinity;
  return Math.round(Math.max(minH, Math.min(maxH, h)));
}

function qtDockArea(area: DockArea | undefined): string {
  if (area === "right") return "Qt::RightDockWidgetArea";
  if (area === "top") return "Qt::TopDockWidgetArea";
  if (area === "bottom") return "Qt::BottomDockWidgetArea";
  return "Qt::LeftDockWidgetArea";
}

function emitMenuItems(lines: string[], parentMenuVar: string, items: MenuItemSpec[], groupVars: Set<string>): void {
  for (const item of items) {
    if (item.kind === "separator") {
      lines.push(`    ${parentMenuVar}->addSeparator();`);
      continue;
    }
    if (item.items && item.items.length > 0) {
      const subVar = `sub_${sanitize(item.id)}`;
      lines.push(`    auto *${subVar} = ${parentMenuVar}->addMenu(${qstr(item.text)});`);
      lines.push(`    addMenuAction(${qstr(item.id)}, ${subVar}->menuAction());`);
      emitMenuItems(lines, subVar, item.items, groupVars);
      continue;
    }
    const aVar = `act_${sanitize(item.id)}`;
    lines.push(`    auto *${aVar} = ${parentMenuVar}->addAction(${qstr(item.text)});`);
    const isRadio = item.kind === "radio" || Boolean(item.group);
    const isCheck = isRadio || item.kind === "check" || Boolean(item.checkable) || Boolean(item.dock);
    if (isCheck) lines.push(`    ${aVar}->setCheckable(true);`);
    if (item.checked !== undefined) lines.push(`    ${aVar}->setChecked(${item.checked ? "true" : "false"});`);
    if (item.shortcut) lines.push(`    ${aVar}->setShortcut(QKeySequence(${qstr(item.shortcut)}));`);
    if (item.group) {
      const gVar = `grp_${sanitize(item.group)}`;
      if (!groupVars.has(gVar)) {
        groupVars.add(gVar);
        lines.push(`    auto *${gVar} = new QActionGroup(&window);`);
        lines.push(`    ${gVar}->setExclusive(true);`);
      }
      lines.push(`    ${gVar}->addAction(${aVar});`);
    }
    lines.push(`    addMenuAction(${qstr(item.id)}, ${aVar});`);
  }
}

function emitControlEventConnections(lines: string[], control: ControlPlan, v: string): void {
  for (const event of control.events) {
    if (
      event.signal === "itemReordered" ||
      event.signal === "itemCheckToggled" ||
      event.signal === "itemCollapseToggled" ||
      event.signal === "fieldChanged" ||
      (control.qtClass === "QTreeWidget" && event.signal === "currentRowChanged")
    ) {
      continue;
    }
    if (control.qtClass === "QPlainTextEdit" && event.signal === "textChanged") {
      lines.push(
        `    QObject::connect(${v}, &QPlainTextEdit::textChanged, q, [this, ${v}] {`,
        `        dispatch(${qstr(control.id)}, ${qstr(event.event)}, ${v}->toPlainText());`,
        "    });",
      );
      continue;
    }
    const param = event.type === "string" ? "const QString &value" : event.type === "number" ? "double value" : event.type === "boolean" ? "bool value" : "";
    const value = param ? ", value" : "";
    lines.push(
      `    QObject::connect(${v}, &${control.qtClass}::${event.signal}, q, [this](${param}) {`,
      `        dispatch(${qstr(control.id)}, ${qstr(event.event)}${value});`,
      "    });",
    );
  }
}

function emitLayoutForContainer(
  lines: string[],
  containerVar: string,
  layout: LayoutSpec,
  children: ControlPlan[],
  ownerPlan?: ControlPlan,
): void {
  const [padTop, padRight, padBottom, padLeft] = paddingOf(layout);
  const layVar = `lay_${sanitize(containerVar)}`;

  if (layout.kind === "flow" || (layout.kind === "hbox" && layout.wrap)) {
    const colGap = layout.columnGap ?? layout.gap ?? 0;
    const rowGap = layout.rowGap ?? layout.gap ?? 0;
    const minContainerH = ownerPlan
      ? Math.round(ownerPlan.size?.minHeight ?? (ownerPlan.kind === "dock" ? prefHeightPlan(ownerPlan) : 0))
      : 0;
    const maxContainerH = ownerPlan && ownerPlan.size?.maxHeight !== undefined ? Math.round(ownerPlan.size.maxHeight) : 1000000;
    const autoHeight = ownerPlan ? !(ownerPlan.size?.fixedHeight !== undefined || ownerPlan.size?.vertical === "fixed") : true;
    lines.push(
      `    auto *${layVar} = new VfFlowLayout(${containerVar}, ${padLeft}, ${padTop}, ${padRight}, ${padBottom}, ${colGap}, ${rowGap}, ${minContainerH}, ${maxContainerH}, ${autoHeight ? "true" : "false"});`,
    );
    for (const c of children) {
      const cv = c.variable;
      const prefW = clampWidthPlan(c, prefWidthPlan(c));
      const prefH = clampHeightPlan(c, prefHeightPlan(c));
      const minW = Math.round(c.size?.minWidth ?? 0);
      const maxW = c.size?.maxWidth !== undefined ? Math.round(c.size.maxWidth) : 1000000;
      const hFixed = c.size?.fixedWidth !== undefined || c.size?.horizontal === "fixed";
      const stretch = hFixed ? 0 : (c.size?.stretch ?? (c.size?.horizontal === "expanding" ? 1 : 0));
      lines.push(`    ${layVar}->addFlowWidget(${cv}, ${prefW}, ${prefH}, ${minW}, ${maxW}, ${stretch});`);
    }
    return;
  }

  if (layout.kind === "vbox") {
    const gap = layout.gap ?? layout.rowGap ?? 0;
    lines.push(
      `    auto *${layVar} = new QVBoxLayout(${containerVar});`,
      `    ${layVar}->setContentsMargins(${padLeft}, ${padTop}, ${padRight}, ${padBottom});`,
      `    ${layVar}->setSpacing(${gap});`,
    );
    let anyStretch = false;
    for (const c of children) {
      const cv = c.variable;
      const stretch = c.size?.stretch ?? (c.size?.vertical === "expanding" ? 1 : 0);
      if (stretch > 0) anyStretch = true;
      const hFixed = c.size?.fixedWidth !== undefined || c.size?.horizontal === "fixed";
      if (hFixed) {
        lines.push(`    ${cv}->setFixedWidth(${prefWidthPlan(c)});`);
      } else {
        if (c.size?.minWidth !== undefined) lines.push(`    ${cv}->setMinimumWidth(${Math.round(c.size.minWidth)});`);
        if (c.size?.maxWidth !== undefined) lines.push(`    ${cv}->setMaximumWidth(${Math.round(c.size.maxWidth)});`);
      }
      if (stretch > 0) {
        lines.push(`    ${cv}->setMinimumHeight(${Math.round(c.size?.minHeight ?? 0)});`);
        if (c.size?.maxHeight !== undefined) lines.push(`    ${cv}->setMaximumHeight(${Math.round(c.size.maxHeight)});`);
        lines.push(
          `    ${cv}->setSizePolicy(${hFixed ? "QSizePolicy::Fixed" : "QSizePolicy::Ignored"}, QSizePolicy::Ignored);`,
          `    ${layVar}->addWidget(${cv}, ${stretch}${hFixed ? ", Qt::AlignLeft" : ""});`,
        );
      } else if (
        (c.layout?.kind === "flow" || (c.layout?.kind === "hbox" && c.layout?.wrap)) &&
        c.size?.fixedHeight === undefined &&
        c.size?.vertical !== "fixed"
      ) {
        lines.push(
          `    ${cv}->setSizePolicy(${hFixed ? "QSizePolicy::Fixed" : "QSizePolicy::Expanding"}, QSizePolicy::Preferred);`,
          `    ${layVar}->addWidget(${cv}, 0${hFixed ? ", Qt::AlignLeft" : ""});`,
        );
      } else {
        const bh = clampHeightPlan(c, prefHeightPlan(c));
        lines.push(
          `    ${cv}->setFixedHeight(${bh});`,
          `    ${cv}->setSizePolicy(${hFixed ? "QSizePolicy::Fixed" : "QSizePolicy::Ignored"}, QSizePolicy::Fixed);`,
          `    ${layVar}->addWidget(${cv}, 0${hFixed ? ", Qt::AlignLeft" : ""});`,
        );
      }
    }
    if (!anyStretch) lines.push(`    ${layVar}->addStretch(1);`);
    return;
  }

  if (layout.kind === "hbox") {
    const gap = layout.gap ?? layout.columnGap ?? 0;
    lines.push(
      `    auto *${layVar} = new QHBoxLayout(${containerVar});`,
      `    ${layVar}->setContentsMargins(${padLeft}, ${padTop}, ${padRight}, ${padBottom});`,
      `    ${layVar}->setSpacing(${gap});`,
    );
    let anyStretch = false;
    for (const c of children) {
      const cv = c.variable;
      const stretch = c.size?.stretch ?? (c.size?.horizontal === "expanding" ? 1 : 0);
      if (stretch > 0) anyStretch = true;
      const vFixed = c.size?.fixedHeight !== undefined || c.size?.vertical === "fixed";
      if (vFixed) {
        lines.push(`    ${cv}->setFixedHeight(${prefHeightPlan(c)});`);
      } else {
        lines.push(`    ${cv}->setMinimumHeight(${Math.round(c.size?.minHeight ?? 0)});`);
        if (c.size?.maxHeight !== undefined) lines.push(`    ${cv}->setMaximumHeight(${Math.round(c.size.maxHeight)});`);
      }
      if (stretch > 0) {
        lines.push(`    ${cv}->setMinimumWidth(${Math.round(c.size?.minWidth ?? 0)});`);
        if (c.size?.maxWidth !== undefined) lines.push(`    ${cv}->setMaximumWidth(${Math.round(c.size.maxWidth)});`);
        lines.push(
          `    ${cv}->setSizePolicy(QSizePolicy::Ignored, ${vFixed ? "QSizePolicy::Fixed" : "QSizePolicy::Ignored"});`,
          `    ${layVar}->addWidget(${cv}, ${stretch}${vFixed ? ", Qt::AlignTop" : ""});`,
        );
      } else {
        const bw = clampWidthPlan(c, prefWidthPlan(c));
        lines.push(
          `    ${cv}->setFixedWidth(${bw});`,
          `    ${cv}->setSizePolicy(QSizePolicy::Fixed, ${vFixed ? "QSizePolicy::Fixed" : "QSizePolicy::Ignored"});`,
          `    ${layVar}->addWidget(${cv}, 0${vFixed ? ", Qt::AlignTop" : ""});`,
        );
      }
    }
    if (!anyStretch) lines.push(`    ${layVar}->addStretch(1);`);
    return;
  }

  if (layout.kind === "grid") {
    const cols = Math.max(1, layout.columns ?? 2);
    const colGap = layout.columnGap ?? layout.gap ?? 0;
    const rowGap = layout.rowGap ?? layout.gap ?? 0;
    lines.push(
      `    auto *${layVar} = new QGridLayout(${containerVar});`,
      `    ${layVar}->setContentsMargins(${padLeft}, ${padTop}, ${padRight}, ${padBottom});`,
      `    ${layVar}->setHorizontalSpacing(${colGap});`,
      `    ${layVar}->setVerticalSpacing(${rowGap});`,
    );
    interface GridCell {
      plan: ControlPlan;
      row: number;
      col: number;
      rowSpan: number;
      colSpan: number;
    }
    const items: GridCell[] = [];
    let autoIdx = 0;
    for (const c of children) {
      const row = c.row ?? Math.floor(autoIdx / cols);
      const col = c.column ?? (autoIdx % cols);
      const rowSpan = Math.max(1, c.rowSpan ?? 1);
      const colSpan = Math.max(1, Math.min(cols - col, c.columnSpan ?? 1));
      items.push({ plan: c, row, col, rowSpan, colSpan });
      autoIdx++;
    }
    const numRows = Math.max(1, ...items.map((it) => it.row + it.rowSpan));
    const colStretches = Array.from({ length: cols }, (_, col) => layout.columnStretch?.[col] ?? 1);
    for (let col = 0; col < cols; col++) {
      lines.push(`    ${layVar}->setColumnStretch(${col}, ${colStretches[col]});`);
      if (colStretches[col] === 0) {
        let maxW = 0;
        for (const it of items) {
          if (it.col === col && it.colSpan === 1) maxW = Math.max(maxW, clampWidthPlan(it.plan, prefWidthPlan(it.plan)));
        }
        lines.push(`    ${layVar}->setColumnMinimumWidth(${col}, ${maxW || 60});`);
      }
    }
    const rowStretches = Array.from({ length: numRows }, (_, row) => layout.rowStretch?.[row] ?? 0);
    let anyRowStretch = false;
    for (let row = 0; row < numRows; row++) {
      if (rowStretches[row] > 0) anyRowStretch = true;
      lines.push(`    ${layVar}->setRowStretch(${row}, ${rowStretches[row]});`);
      if (rowStretches[row] === 0) {
        let maxH = 0;
        for (const it of items) {
          if (it.row === row && it.rowSpan === 1) maxH = Math.max(maxH, clampHeightPlan(it.plan, prefHeightPlan(it.plan)));
        }
        lines.push(`    ${layVar}->setRowMinimumHeight(${row}, ${maxH || 32});`);
      }
    }
    if (!anyRowStretch) lines.push(`    ${layVar}->setRowStretch(${numRows}, 1);`);
    for (const it of items) {
      const c = it.plan;
      const cv = c.variable;
      const hFixed = c.size?.fixedWidth !== undefined || c.size?.horizontal === "fixed" || (it.colSpan === 1 && colStretches[it.col] === 0);
      const vFixed = c.size?.fixedHeight !== undefined || c.size?.vertical === "fixed" || (it.rowSpan === 1 && rowStretches[it.row] === 0);
      if (hFixed) {
        lines.push(`    ${cv}->setFixedWidth(${clampWidthPlan(c, prefWidthPlan(c))});`);
      } else {
        if (c.size?.minWidth !== undefined) lines.push(`    ${cv}->setMinimumWidth(${Math.round(c.size.minWidth)});`);
        if (c.size?.maxWidth !== undefined) lines.push(`    ${cv}->setMaximumWidth(${Math.round(c.size.maxWidth)});`);
      }
      if (vFixed) {
        lines.push(`    ${cv}->setFixedHeight(${clampHeightPlan(c, prefHeightPlan(c))});`);
      } else {
        if (c.size?.minHeight !== undefined) lines.push(`    ${cv}->setMinimumHeight(${Math.round(c.size.minHeight)});`);
        if (c.size?.maxHeight !== undefined) lines.push(`    ${cv}->setMaximumHeight(${Math.round(c.size.maxHeight)});`);
      }
      lines.push(
        `    ${cv}->setSizePolicy(${hFixed ? "QSizePolicy::Fixed" : "QSizePolicy::Ignored"}, ${vFixed ? "QSizePolicy::Fixed" : "QSizePolicy::Ignored"});`,
        `    ${layVar}->addWidget(${cv}, ${it.row}, ${it.col}, ${it.rowSpan}, ${it.colSpan});`,
      );
    }
    return;
  }

  if (layout.kind === "form") {
    const colGap = layout.columnGap ?? layout.gap ?? 8;
    const rowGap = layout.rowGap ?? layout.gap ?? 8;
    const labelW = layout.labelWidth ?? 96;
    lines.push(
      `    auto *${layVar} = new QGridLayout(${containerVar});`,
      `    ${layVar}->setContentsMargins(${padLeft}, ${padTop}, ${padRight}, ${padBottom});`,
      `    ${layVar}->setHorizontalSpacing(${colGap});`,
      `    ${layVar}->setVerticalSpacing(${rowGap});`,
      `    ${layVar}->setColumnMinimumWidth(0, ${labelW});`,
      `    ${layVar}->setColumnStretch(0, 0);`,
      `    ${layVar}->setColumnStretch(1, 1);`,
    );
    let row = 0;
    for (let i = 0; i < children.length; i += 2) {
      const labelPlan = children[i];
      const fieldPlan = children[i + 1];
      const rowH = Math.max(labelPlan ? prefHeightPlan(labelPlan) : 0, fieldPlan ? prefHeightPlan(fieldPlan) : 0, 28);
      if (labelPlan) {
        lines.push(
          `    ${labelPlan.variable}->setFixedSize(${labelW}, ${rowH});`,
          `    ${layVar}->addWidget(${labelPlan.variable}, ${row}, 0);`,
        );
      }
      if (fieldPlan) {
        const hFixed = fieldPlan.size?.fixedWidth !== undefined || fieldPlan.size?.horizontal === "fixed";
        if (hFixed) {
          lines.push(
            `    ${fieldPlan.variable}->setFixedSize(${prefWidthPlan(fieldPlan)}, ${rowH});`,
            `    ${layVar}->addWidget(${fieldPlan.variable}, ${row}, 1, Qt::AlignLeft);`,
          );
        } else {
          if (fieldPlan.size?.minWidth !== undefined) lines.push(`    ${fieldPlan.variable}->setMinimumWidth(${Math.round(fieldPlan.size.minWidth)});`);
          if (fieldPlan.size?.maxWidth !== undefined) lines.push(`    ${fieldPlan.variable}->setMaximumWidth(${Math.round(fieldPlan.size.maxWidth)});`);
          lines.push(
            `    ${fieldPlan.variable}->setFixedHeight(${rowH});`,
            `    ${fieldPlan.variable}->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);`,
            `    ${layVar}->addWidget(${fieldPlan.variable}, ${row}, 1);`,
          );
        }
      }
      row++;
    }
    lines.push(`    ${layVar}->setRowStretch(${row}, 1);`);
    return;
  }

  if (layout.kind === "stack") {
    lines.push(
      `    auto *${layVar} = new QVBoxLayout(${containerVar});`,
      `    ${layVar}->setContentsMargins(${padLeft}, ${padTop}, ${padRight}, ${padBottom});`,
      `    ${layVar}->setSpacing(0);`,
    );
    for (const c of children) {
      lines.push(
        `    ${c.variable}->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);`,
        `    ${layVar}->addWidget(${c.variable}, 1);`,
      );
    }
  }
}

function buildFunction(context: Context): string[] {
  const { window, controls, summary } = context;
  if (!usesExtendedLayout(context)) {
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
      emitControlEventConnections(lines, control, v);
    }
    lines.push("}");
    return lines;
  }

  // 带主窗口分区、停靠面板、对话框或排版的界面
  const byId = new Map<string, ControlPlan>();
  for (const c of controls) byId.set(c.id, c);
  const groupVars = new Set<string>();

  const lines: string[] = [
    "// 控件树、分区、停靠面板和排版。每个控件的对象名就是它在设计项目里的 ID。",
    "void Ui::Private::build()",
    "{",
    "    QApplication::setStyle(QStringLiteral(\"Fusion\"));",
    `    window.setWindowTitle(${qstr(window.title)});`,
    `    window.resize(${window.width}, ${window.height});`,
    "    window.setAnimated(false);",
    "    window.setStyleSheet(QStringLiteral(\"QMainWindow::separator { width: 0px; height: 0px; border: none; }\"));",
    "    window.setCorner(Qt::TopLeftCorner, Qt::TopDockWidgetArea);",
    "    window.setCorner(Qt::TopRightCorner, Qt::TopDockWidgetArea);",
    "    window.setCorner(Qt::BottomLeftCorner, Qt::BottomDockWidgetArea);",
    "    window.setCorner(Qt::BottomRightCorner, Qt::BottomDockWidgetArea);",
  ];

  if (window.partitioned) {
    lines.push(`    add(${qstr(window.id)}, &window);`);
  } else {
    lines.push(
      `    auto *${window.variable} = new QWidget(&window);`,
      `    window.setCentralWidget(${window.variable});`,
      `    add(${qstr(window.id)}, ${window.variable});`,
    );
  }

  if (window.menuBar && (window.menuBar.menus?.length ?? 0) > 0) {
    lines.push(
      "",
      "    // 菜单栏",
      "    auto *menuBar = window.menuBar();",
      "    menuBar->setNativeMenuBar(false);",
      `    menuBar->setFixedHeight(${window.menuBar.height ?? 28});`,
    );
    for (const menu of window.menuBar.menus) {
      const mVar = `menu_${sanitize(menu.id)}`;
      lines.push(`    auto *${mVar} = menuBar->addMenu(${qstr(menu.title)});`);
      emitMenuItems(lines, mVar, menu.items ?? [], groupVars);
    }
  }

  const prevDockByArea = new Map<DockArea, string>();

  for (const control of controls) {
    const v = control.variable;
    if (control.kind === "dock") {
      const area: DockArea = control.dockArea ?? "left";
      const hdrH = control.headerHeight ?? 26;
      lines.push(
        "",
        `    // ${control.id}：停靠面板（${area}）`,
        `    auto *${v} = new QDockWidget(${qstr(control.title ?? control.id)}, &window);`,
        `    ${v}->setFeatures(QDockWidget::NoDockWidgetFeatures);`,
        `    ${v}->setStyleSheet(QStringLiteral("QDockWidget { border: none; }"));`,
        `    auto *hdr_${v} = new QLabel(${qstr(control.title ?? control.id)}, ${v});`,
        `    hdr_${v}->setFixedHeight(${hdrH});`,
        `    ${v}->setTitleBarWidget(hdr_${v});`,
        `    auto *${control.bodyVariable} = new QWidget(${v});`,
        `    ${v}->setWidget(${control.bodyVariable});`,
      );
      if (area === "left" || area === "right") {
        lines.push(`    ${v}->setFixedWidth(${prefWidthPlan(control)});`);
      } else {
        lines.push(`    ${v}->setFixedHeight(${prefHeightPlan(control)});`);
      }
      const prevDock = prevDockByArea.get(area);
      if (!prevDock) {
        lines.push(`    window.addDockWidget(${qtDockArea(area)}, ${v});`);
      } else {
        const orient = area === "left" || area === "right" ? "Qt::Horizontal" : "Qt::Vertical";
        lines.push(`    window.splitDockWidget(${prevDock}, ${v}, ${orient});`);
      }
      prevDockByArea.set(area, v);
    } else if (control.kind === "dialog") {
      lines.push(
        "",
        `    // ${control.id}：对话框`,
        `    auto *${v} = new QDialog(&window);`,
        `    ${v}->setWindowTitle(${qstr(control.title ?? control.id)});`,
        `    ${v}->setFixedSize(${control.width}, ${control.height});`,
        `    ${v}->setModal(${control.modal !== false ? "true" : "false"});`,
        `    dialogs.append(${v});`,
      );
    } else {
      const label =
        control.kind === "external"
          ? "外部容器"
          : control.kind === "container"
            ? "容器"
            : control.kind === "placeholder"
              ? `${control.type}（占位）`
              : control.type;
      lines.push("", `    // ${control.id}：${label}`, `    auto *${v} = new ${control.qtClass}(${control.parentVariable});`);
      if (control.isCentral) {
        lines.push(`    window.setCentralWidget(${v});`);
      } else if (control.isStatusBar) {
        lines.push(
          "    auto *qtStatusBar = new QStatusBar(&window);",
          "    qtStatusBar->setSizeGripEnabled(false);",
          "    qtStatusBar->setContentsMargins(0, 0, 0, 0);",
          `    qtStatusBar->setFixedHeight(${prefHeightPlan(control)});`,
          `    ${v}->setParent(qtStatusBar);`,
          `    ${v}->setGeometry(0, 0, ${window.width}, ${prefHeightPlan(control)});`,
          "    qtStatusBar->installEventFilter(q);",
          "    statusBar = qtStatusBar;",
          `    statusBarControl = ${v};`,
          "    window.setStatusBar(qtStatusBar);",
        );
      }
      if (control.kind === "external") {
        lines.push(
          `    addExternal(${qstr(control.id)}, ${v}, ${qstr(control.placeholder ?? "")});`,
          `    ${v}->setFrameShape(QFrame::NoFrame);`,
        );
        if (control.contextMenu && control.contextMenu.length > 0) {
          const ctxVar = `ctx_${v}`;
          lines.push(`    auto *${ctxVar} = new QMenu(${v});`);
          emitMenuItems(lines, ctxVar, control.contextMenu, groupVars);
          lines.push(
            `    ${v}->setContextMenuPolicy(Qt::CustomContextMenu);`,
            `    QObject::connect(${v}, &QWidget::customContextMenuRequested, q, [${v}, ${ctxVar}](const QPoint &pos) {`,
            `        ${ctxVar}->popup(${v}->mapToGlobal(pos));`,
            "    });",
          );
        }
        continue;
      }
      if (control.kind === "container") {
        lines.push(`    ${v}->setFrameShape(QFrame::NoFrame);`);
        if (control.placeholder !== null) lines.push(`    addPlaceholder(${v}, ${qstr(control.placeholder)});`);
      } else if (control.kind === "placeholder") {
        lines.push(`    ${v}->setFrameShape(QFrame::StyledPanel);`);
        if (control.placeholder !== null) lines.push(`    addPlaceholder(${v}, ${qstr(control.placeholder)});`);
      }
    }

    for (const [name, value] of control.fixed) lines.push(`    ${v}->setProperty("${escapeCpp(name)}", ${cppValue(value)});`);
    const props = control.props.map(([name, qtName]) => `{ ${qstr(name)}, "${escapeCpp(qtName)}" }`).join(", ");
    const effect = control.effect >= 0 ? `${control.effect} /* 效果 ${summary.effects[control.effect].name} */` : "";
    const args = [qstr(control.id), v];
    if (props || effect) args.push(props ? `{ ${props} }` : "{}");
    if (effect) args.push(effect);
    lines.push(`    add(${args.join(", ")});`);
    if (control.kind === "dialog") {
      lines.push(
        `    QObject::connect(${v}, &QDialog::finished, q, [this] {`,
        `        onDialogFinished(${qstr(control.id)});`,
        "    });",
      );
    }
    if (control.contextMenu && control.contextMenu.length > 0) {
      const ctxVar = `ctx_${v}`;
      lines.push(`    auto *${ctxVar} = new QMenu(${v});`);
      emitMenuItems(lines, ctxVar, control.contextMenu, groupVars);
      lines.push(
        `    ${v}->setContextMenuPolicy(Qt::CustomContextMenu);`,
        `    QObject::connect(${v}, &QWidget::customContextMenuRequested, q, [${v}, ${ctxVar}](const QPoint &pos) {`,
        `        ${ctxVar}->popup(${v}->mapToGlobal(pos));`,
        "    });",
      );
    }
    if (control.popupMenu && control.popupMenu.length > 0) {
      const popVar = `pop_${v}`;
      lines.push(`    auto *${popVar} = new QMenu(${v});`);
      emitMenuItems(lines, popVar, control.popupMenu, groupVars);
      lines.push(`    addPopupMenu(${v}, ${popVar});`);
    }
    emitControlEventConnections(lines, control, v);
  }

  // 为根窗口（非分区模式）和各容器挂载排版或设置子控件几何位置
  if (!window.partitioned) {
    const rootChildren = window.childIds.map((id) => byId.get(id)).filter((c): c is ControlPlan => Boolean(c));
    if (window.layout && rootChildren.length > 0) {
      lines.push("", `    // ${window.id} 的排版`);
      emitLayoutForContainer(lines, window.variable, window.layout, rootChildren);
    } else {
      for (const c of rootChildren) {
        if (c.kind !== "dialog" && c.kind !== "dock") {
          lines.push(`    ${c.variable}->setGeometry(${c.x}, ${c.y}, ${c.width}, ${c.height});`);
        }
      }
    }
  }

  for (const control of controls) {
    const childPlans = control.childIds.map((id) => byId.get(id)).filter((c): c is ControlPlan => Boolean(c));
    if (childPlans.length === 0) continue;
    if (control.layout) {
      lines.push("", `    // ${control.id} 的排版（${control.layout.kind}）`);
      emitLayoutForContainer(lines, control.bodyVariable, control.layout, childPlans, control);
    } else {
      for (const c of childPlans) {
        lines.push(`    ${c.variable}->setGeometry(${c.x}, ${c.y}, ${c.width}, ${c.height});`);
      }
    }
  }

  lines.push("}");
  return lines;
}

function raiseFunction(context: Context): string[] {
  const { events } = context.summary;
  const actions = context.summary.actions ?? [];
  const anyParams = events.some((e) => (e.params?.length ?? 0) > 0) || actions.length > 0;
  const lines: string[] = [
    "// 交给业务的事件：业务连接了对应的信号，就发信号并返回 true；没有连接，返回 false，由调用方执行模拟步骤。",
    "bool Ui::Private::raiseBusinessEvent(const QString &name, const QJSValue &args)",
    "{",
  ];
  if (!anyParams) lines.push("    Q_UNUSED(args);");
  for (const event of events) {
    const callArgs = (event.params ?? [])
      .map((p) => {
        const conv = p.type === "boolean" ? "toBool()" : p.type === "number" ? "toNumber()" : "toString()";
        return `args.property(${qstr(p.name)}).${conv}`;
      })
      .join(", ");
    lines.push(
      `    if (name == QLatin1String("${event.name}")) {`,
      `        static const QMetaMethod signal = QMetaMethod::fromSignal(&BusinessInterface::${event.signal});`,
      "        if (!q->isSignalConnected(signal))",
      "            return false;",
      `        emit q->${event.signal}(${callArgs});`,
      "        return true;",
      "    }",
    );
  }
  for (const act of actions) {
    lines.push(
      `    if (name == QLatin1String("${act.name}")) {`,
      `        static const QMetaMethod signal = QMetaMethod::fromSignal(&BusinessInterface::${act.signal});`,
      "        if (!q->isSignalConnected(signal))",
      "            return false;",
      `        emit q->${act.signal}(args.toVariant().toMap());`,
      "        return true;",
      "    }",
    );
  }
  if (events.length === 0 && actions.length === 0) lines.push("    Q_UNUSED(name);");
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
  const requests = context.summary.requests ?? [];
  const actions = context.summary.actions ?? [];
  const lines: string[] = ["// 业务接口的实现"];
  for (const state of states) {
    const types = stateTypes(state);
    lines.push(
      `void Ui::${state.setter}(${types.param})`,
      "{",
      `    d->setBusinessState(${qstr(state.path)}, ${types.toJs});`,
      "}",
      "",
      `${types.result} Ui::${state.getter}() const`,
      "{",
      `    return d->call("getState", { ${qstr(state.path)} }).${types.convert};`,
      "}",
      "",
    );
  }
  for (const req of requests) {
    lines.push(`void Ui::${req.method}(${paramsSignature(req.params)})`, "{", "    QJSValue args = d->engine.newObject();");
    for (const p of req.params) {
      lines.push(`    args.setProperty(${qstr(p.name)}, ${p.name});`);
    }
    lines.push(`    d->requestEvent(${qstr(req.name)}, args);`, "}", "");
  }
  for (const act of actions) {
    lines.push(
      `void Ui::${act.finishSuccess}(const QVariantMap &result)`,
      "{",
      `    d->drain(d->call("finishActionSuccess", { ${qstr(act.name)}, d->engine.toScriptValue(result) }));`,
      "}",
      "",
      `void Ui::${act.finishError}(const QString &message)`,
      "{",
      `    d->drain(d->call("finishActionError", { ${qstr(act.name)}, message }));`,
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
  const requests = context.summary.requests ?? [];
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
    for (const event of events) {
      lines.push(`| \`${event.name}\` | \`${event.signal}(${paramsSignature(event.params)})\` | ${oneLine(event.text) || "—"} |`);
    }
  }
  if (requests.length > 0) {
    lines.push("", "### 请求事件（业务 → 界面）", "", "| 事件 | 调用函数 | 含义 |", "| --- | --- | --- |");
    for (const req of requests) {
      lines.push(`| \`${req.name}\` | \`${req.method}(${paramsSignature(req.params)})\` | ${oneLine(req.text) || "—"} |`);
    }
  }
  const actions = context.summary.actions ?? [];
  if (actions.length > 0) {
    lines.push("", "### 动作（界面 ↔ 业务）", "", "| 动作 | 信号（界面 → 业务） | 成功回调 / 失败回调（业务 → 界面） |", "| --- | --- | --- |");
    for (const act of actions) {
      lines.push(`| \`${act.name}\` | \`${act.signal}(const QVariantMap &input)\` | \`${act.finishSuccess}(result)\` / \`${act.finishError}(message)\` |`);
    }
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
