// 右侧“交互事件”页签：不进预览，直接让选中的控件收到一个事件，看它的状态怎么变。
import type { Value } from "./expr.ts";
import { declFor, MOUSE_EVENTS, type RuntimeProject } from "./model.ts";
import type { Runtime } from "./runtime.ts";

export type EventValueType = "string" | "number" | "boolean";

export interface EventRow {
  event: string;
  label: string;
  /** 有逻辑接着这个事件：写了步骤，或者是绑定状态的 change */
  wired: boolean;
  /** 事件要带的值的类型；鼠标事件不带值 */
  valueType: EventValueType | null;
}

const EVENT_LABELS: Record<string, string> = {
  click: "被单击",
  dblclick: "被双击",
  mousedown: "鼠标按下",
  mouseup: "鼠标松开",
  mouseenter: "鼠标移入",
  mouseleave: "鼠标移出",
  change: "值改变",
};

/** 这个控件能收到的全部事件，接了逻辑的排在前面。 */
export function eventRowsFor(project: RuntimeProject, id: string): EventRow[] {
  const node = project.scene.nodes[id];
  if (!node) return [];
  const decl = declFor(project, node.type);
  const object = project.logic.objects?.[id];
  const handlers = object?.events ?? {};
  const own = decl?.events ?? [];
  const names = [...new Set([...own, ...MOUSE_EVENTS, ...Object.keys(handlers)])];
  const rows = names.map((event): EventRow => {
    const bound = event === "change" && Boolean(object?.bind);
    return {
      event,
      label: EVENT_LABELS[event] ?? event,
      wired: Boolean(handlers[event]) || bound,
      valueType: own.includes(event) ? ((decl?.bind as EventValueType | undefined) ?? "string") : null,
    };
  });
  return [...rows.filter((row) => row.wired), ...rows.filter((row) => !row.wired)];
}

export interface EventEditDeps {
  getProject(): RuntimeProject;
  getSelectedId(): string | null;
  /** 现在显示的运行状态 */
  getRuntime(): Runtime;
  /** 显示的是不是预览留下的状态（否则是初始状态） */
  isLive(): boolean;
  fire(id: string, event: string, value?: Value): void;
  toggleCondition(id: string): void;
  resetState(): void;
  activateRightTab(tab: string): void;
}

let deps: EventEditDeps | null = null;

export function initEventEdit(options: EventEditDeps): void {
  deps = options;
  const right = document.getElementById("right");
  const tabs = right?.querySelector(".tabs");
  if (!tabs || !right) return;

  if (!document.getElementById("tab-events")) {
    const tabBtn = document.createElement("button");
    tabBtn.id = "tab-events";
    tabBtn.type = "button";
    tabBtn.setAttribute("role", "tab");
    tabBtn.setAttribute("aria-selected", "false");
    tabBtn.textContent = "交互事件";
    tabBtn.title = "不进预览，直接触发选中控件的事件，切换它的状态";
    tabs.insertBefore(tabBtn, document.getElementById("tab-doc"));
    tabBtn.addEventListener("click", () => deps?.activateRightTab("events"));
  }

  if (!document.getElementById("pane-events")) {
    const pane = document.createElement("div");
    pane.id = "pane-events";
    pane.className = "pane vf-custom-pane";
    pane.hidden = true;
    right.append(pane);
  }
}

function section(title: string): HTMLElement {
  const sec = document.createElement("section");
  sec.className = "vf-edit-section";
  const head = document.createElement("div");
  head.className = "vf-sec-title";
  head.textContent = title;
  sec.append(head);
  return sec;
}

function note(text: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "vf-muted-note";
  el.textContent = text;
  return el;
}

function stateBlock(): HTMLElement {
  const sec = section("运行状态");
  const live = deps!.isLive();
  sec.append(note(live ? "画布显示的是操作之后的状态，只影响看，不写进文件。" : "画布显示的是初始状态。"));
  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = "恢复初始状态";
  reset.disabled = !live;
  reset.addEventListener("click", () => deps?.resetState());
  sec.append(reset);
  return sec;
}

/** 值的输入框：改完就触发。页签栏这类控件给下拉，不用记序号。 */
function valueInput(id: string, row: EventRow, current: Value | undefined, tabs: unknown): HTMLElement {
  const fire = (value: Value) => deps?.fire(id, row.event, value);
  if (row.valueType === "boolean") {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = Boolean(current);
    box.addEventListener("change", () => fire(box.checked));
    return box;
  }
  const names = typeof tabs === "string" ? tabs.split(",").map((name) => name.trim()).filter(Boolean) : [];
  if (row.valueType === "number" && names.length > 0) {
    const select = document.createElement("select");
    names.forEach((name, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = name;
      option.selected = index === Number(current ?? 0);
      select.append(option);
    });
    select.addEventListener("change", () => fire(Number(select.value)));
    return select;
  }
  const input = document.createElement("input");
  input.type = row.valueType === "number" ? "number" : "text";
  input.value = current === undefined || current === null ? "" : String(current);
  input.addEventListener("change", () => fire(row.valueType === "number" ? Number(input.value) : input.value));
  return input;
}

function eventBlock(id: string): HTMLElement {
  const project = deps!.getProject();
  const view = deps!.getRuntime().view(id);
  const sec = section("交互事件");
  if (!view.visible || !view.enabled) {
    sec.append(note(`这个控件现在${view.visible ? "不可用" : "不可见"}，事件可能被忽略，结果看底部的事件记录。`));
  }
  const handlers = project.logic.objects?.[id]?.events ?? {};
  for (const row of eventRowsFor(project, id)) {
    const line = document.createElement("div");
    line.className = "event-row" + (row.wired ? " wired" : "");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = row.label;
    button.title = row.wired ? `${row.event}：${JSON.stringify(handlers[row.event] ?? "写入绑定的状态")}` : `${row.event}：没有接逻辑，只影响悬停、按下这类显示`;
    if (row.valueType === null) {
      button.addEventListener("click", () => deps?.fire(id, row.event));
      line.append(button);
    } else {
      // 带值的事件没有“点一下”这回事，改输入框就是触发
      button.disabled = true;
      line.append(button, valueInput(id, row, view.props.value as Value | undefined, view.props.tabs));
    }
    const name = document.createElement("span");
    name.className = "muted";
    name.textContent = row.event;
    line.append(name);
    sec.append(line);
  }
  return sec;
}

function conditionBlock(id: string): HTMLElement | null {
  const prefix = `${id}.`;
  const conditions = deps!.getRuntime().conditions().filter((condition) => condition.id.startsWith(prefix));
  if (conditions.length === 0) return null;
  const sec = section("控件条件");
  for (const condition of conditions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "condition" + (condition.value ? " on" : "");
    button.textContent = `${condition.text || condition.id}：${condition.value ? "是" : "否"}`;
    button.disabled = condition.kind !== "text";
    button.title = condition.kind === "text" ? "点击切换" : "符号条件，由表达式计算";
    button.addEventListener("click", () => deps?.toggleCondition(condition.id));
    sec.append(button);
  }
  return sec;
}

export function renderEventPane(): void {
  if (!deps) return;
  const pane = document.getElementById("pane-events");
  if (!pane) return;
  const id = deps.getSelectedId();
  const blocks: Array<HTMLElement | null> = [stateBlock()];
  if (id && deps.getProject().scene.nodes[id]) blocks.push(eventBlock(id), conditionBlock(id));
  else blocks.push(note("先在图层或画布上选中一个控件。"));
  pane.replaceChildren(...blocks.filter((block): block is HTMLElement => block !== null));
}

/** 运行状态变了就跟上；正在往输入框里打字时先不动，免得光标跑掉。 */
export function refreshEventPane(): void {
  const pane = document.getElementById("pane-events");
  if (!pane || pane.hidden || pane.contains(document.activeElement)) return;
  renderEventPane();
}
