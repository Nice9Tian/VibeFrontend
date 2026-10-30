// 工具自带的 8 种标准控件：文字、按钮、输入框、数字框、下拉框、复选框、列表、分隔线。
// 每种包含共用声明（component.json）、网页实现（index.js / style.css）和对应的 Qt 映射。
import type { Value } from "../src/expr.ts";
import type { ComponentCreate, ComponentDecl, LoadedComponent } from "../src/model.ts";
import buttonDecl from "./Button/component.json" with { type: "json" };
import checkBoxDecl from "./CheckBox/component.json" with { type: "json" };
import comboBoxDecl from "./ComboBox/component.json" with { type: "json" };
import labelDecl from "./Label/component.json" with { type: "json" };
import listDecl from "./List/component.json" with { type: "json" };
import separatorDecl from "./Separator/component.json" with { type: "json" };
import spinBoxDecl from "./SpinBox/component.json" with { type: "json" };
import textInputDecl from "./TextInput/component.json" with { type: "json" };

export interface StandardComponent extends LoadedComponent {
  styleText: string;
}

const createLabel: ComponentCreate = (el, { props }) => {
  const label = document.createElement("div");
  label.className = "vf-std-label";
  el.append(label);
  const update = (next: Record<string, Value>) => {
    label.textContent = String(next.text ?? "");
    label.dataset.tone = String(next.tone ?? "normal");
    label.dataset.align = String(next.align ?? "left");
  };
  update(props);
  return { update, destroy: () => label.remove() };
};

const createButton: ComponentCreate = (el, { props, emit }) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "vf-std-button";
  let current = props;
  button.addEventListener("click", () => {
    if (current.enabled === false) return;
    if (current.checkable) emit("toggle", !current.checked);
  });
  el.append(button);
  const update = (next: Record<string, Value>) => {
    current = next;
    button.textContent = String(next.text ?? "");
    button.dataset.variant = String(next.variant ?? "secondary");
    button.dataset.checked = String(Boolean(next.checked));
    button.disabled = next.enabled === false;
  };
  update(props);
  return { update, destroy: () => button.remove() };
};

const createTextInput: ComponentCreate = (el, { props, emit }) => {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "vf-std-input";
  input.addEventListener("input", () => emit("change", input.value));
  el.append(input);
  const update = (next: Record<string, Value>) => {
    input.placeholder = String(next.placeholder ?? "");
    input.disabled = next.enabled === false;
    const value = String(next.value ?? "");
    if (input.value !== value) input.value = value;
  };
  update(props);
  return { update, destroy: () => input.remove() };
};

const createSpinBox: ComponentCreate = (el, { props, emit }) => {
  const wrap = document.createElement("div");
  wrap.className = "vf-std-spinbox";
  const input = document.createElement("input");
  input.type = "number";
  input.className = "vf-std-spinbox-input";
  const suffix = document.createElement("span");
  suffix.className = "vf-std-spinbox-suffix";
  wrap.append(input, suffix);
  el.append(wrap);
  input.addEventListener("input", () => {
    const n = Number(input.value);
    if (Number.isFinite(n)) emit("change", n);
  });
  const update = (next: Record<string, Value>) => {
    input.min = String(next.min ?? 0);
    input.max = String(next.max ?? 9999);
    input.step = String(next.step ?? 1);
    input.disabled = next.enabled === false;
    const val = String(next.value ?? 0);
    if (input.value !== val) input.value = val;
    const sfx = String(next.suffix ?? "");
    suffix.textContent = sfx;
    suffix.hidden = !sfx;
  };
  update(props);
  return { update, destroy: () => wrap.remove() };
};

const createComboBox: ComponentCreate = (el, { props, emit }) => {
  const select = document.createElement("select");
  select.className = "vf-std-combobox";
  let lastOptions = "";
  select.addEventListener("change", () => emit("change", select.value));
  el.append(select);
  const update = (next: Record<string, Value>) => {
    const rawOptions = String(next.options ?? "");
    if (rawOptions !== lastOptions) {
      lastOptions = rawOptions;
      select.replaceChildren();
      for (const item of rawOptions.split(",").map((s) => s.trim()).filter(Boolean)) {
        const opt = document.createElement("option");
        opt.value = item;
        opt.textContent = item;
        select.append(opt);
      }
    }
    select.disabled = next.enabled === false;
    const val = String(next.value ?? "");
    if (val && select.value !== val) select.value = val;
  };
  update(props);
  return { update, destroy: () => select.remove() };
};

const createCheckBox: ComponentCreate = (el, { props, emit }) => {
  const label = document.createElement("label");
  label.className = "vf-std-checkbox";
  const box = document.createElement("input");
  box.type = "checkbox";
  const text = document.createElement("span");
  label.append(box, text);
  el.append(label);
  box.addEventListener("change", () => emit("change", box.checked));
  const update = (next: Record<string, Value>) => {
    box.checked = Boolean(next.value);
    box.disabled = next.enabled === false;
    text.textContent = String(next.text ?? "");
    label.dataset.disabled = String(next.enabled === false);
  };
  update(props);
  return { update, destroy: () => label.remove() };
};

const createList: ComponentCreate = (el, { props, emit }) => {
  const container = document.createElement("div");
  container.className = "vf-std-list";
  el.append(container);
  let dragFrom = -1;

  const itemLabel = (item: Value): string => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return String(item.name ?? item.label ?? item.title ?? item.text ?? item.id ?? "");
    }
    return String(item ?? "");
  };

  const itemVisible = (item: Value): boolean => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      if ("visible" in item) return Boolean(item.visible);
      if ("checked" in item) return Boolean(item.checked);
    }
    return true;
  };

  const update = (next: Record<string, Value>) => {
    container.replaceChildren();
    const disabled = next.enabled === false;
    container.dataset.disabled = String(disabled);
    const items = Array.isArray(next.items) ? next.items : [];
    const selected = typeof next.value === "number" ? next.value : 0;
    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "vf-std-list-empty";
      empty.textContent = String(next.emptyText ?? "暂无内容");
      container.append(empty);
      return;
    }
    items.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "vf-std-list-row" + (index === selected ? " selected" : "");
      if (next.checkable) {
        const check = document.createElement("span");
        const vis = itemVisible(item);
        check.className = "vf-std-list-check" + (vis ? " on" : "");
        check.textContent = vis ? "●" : "○";
        check.title = vis ? "可见" : "隐藏";
        check.addEventListener("click", (e) => {
          e.stopPropagation();
          if (disabled) return;
          emit("change", index);
          emit("select", index);
          emit("toggleItem", index);
        });
        row.append(check);
      }
      const text = document.createElement("span");
      text.className = "vf-std-list-text";
      text.textContent = itemLabel(item);
      row.append(text);
      if (next.checkable && !itemVisible(item)) {
        const tag = document.createElement("span");
        tag.className = "vf-std-list-badge";
        tag.textContent = "隐藏";
        row.append(tag);
      }
      row.addEventListener("click", () => {
        if (disabled) return;
        emit("change", index);
        emit("select", index);
      });
      if (next.reorderable && !disabled) {
        row.draggable = true;
        row.addEventListener("dragstart", () => {
          dragFrom = index;
        });
        row.addEventListener("dragover", (e) => e.preventDefault());
        row.addEventListener("drop", (e) => {
          e.preventDefault();
          if (dragFrom >= 0 && dragFrom !== index) {
            emit("moveItem", `${dragFrom},${index}`);
          }
          dragFrom = -1;
        });
      }
      container.append(row);
    });
  };
  update(props);
  return { update, destroy: () => container.remove() };
};

const createSeparator: ComponentCreate = (el, { props }) => {
  const line = document.createElement("div");
  line.className = "vf-std-separator";
  el.append(line);
  const update = (next: Record<string, Value>) => {
    line.dataset.orientation = String(next.orientation ?? "horizontal");
  };
  update(props);
  return { update, destroy: () => line.remove() };
};

export const STANDARD_COMPONENT_LIST: StandardComponent[] = [
  {
    decl: labelDecl as ComponentDecl,
    folder: "Label",
    create: createLabel,
    styleText: `.vf-std-label { display: flex; align-items: center; width: 100%; height: 100%; color: var(--color-text, #1e293b); font-size: 13px; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; overflow-wrap: anywhere; }
.vf-std-label[data-align="center"] { justify-content: center; text-align: center; }
.vf-std-label[data-align="right"] { justify-content: flex-end; text-align: right; }
.vf-std-label[data-tone="title"] { font-size: 15px; font-weight: 600; color: var(--color-heading, #0f172a); }
.vf-std-label[data-tone="muted"] { color: var(--color-muted, #64748b); font-size: 12px; }
.vf-std-label[data-tone="error"] { color: var(--color-error, #dc2626); }
.vf-std-label[data-tone="accent"] { color: var(--color-primary, #2563eb); font-weight: 500; }`,
  },
  {
    decl: buttonDecl as ComponentDecl,
    folder: "Button",
    create: createButton,
    styleText: `.vf-std-button { width: 100%; height: 100%; padding: 0 10px; border: 1px solid var(--color-border, #cbd5e1); border-radius: 6px; background: var(--color-surface, #ffffff); color: var(--color-text, #1e293b); font: inherit; font-size: 13px; font-weight: 500; cursor: pointer; transition: background 0.12s, border-color 0.12s, box-shadow 0.12s, transform 0.06s; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vf-std-button[data-variant="primary"], .vf-std-button[data-checked="true"] { border-color: var(--color-primary, #2563eb); background: var(--color-primary, #2563eb); color: #ffffff; }
.vf-std-button[data-variant="danger"] { border-color: #ef4444; background: #fef2f2; color: #dc2626; }
.vf-std-button:hover:not(:disabled) { border-color: var(--color-primary, #2563eb); box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.18); }
.vf-std-button:active:not(:disabled) { transform: scale(0.98); }
.vf-std-button:disabled { opacity: 0.45; cursor: not-allowed; }`,
  },
  {
    decl: textInputDecl as ComponentDecl,
    folder: "TextInput",
    create: createTextInput,
    styleText: `.vf-std-input { box-sizing: border-box; width: 100%; height: 100%; padding: 0 10px; border: 1px solid var(--color-border, #cbd5e1); border-radius: 6px; background: var(--color-surface, #ffffff); color: var(--color-text, #1e293b); font: inherit; font-size: 13px; outline: none; }
.vf-std-input:focus { border-color: var(--color-primary, #2563eb); box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.18); }
.vf-std-input:disabled { opacity: 0.5; background: #f8fafc; }`,
  },
  {
    decl: spinBoxDecl as ComponentDecl,
    folder: "SpinBox",
    create: createSpinBox,
    styleText: `.vf-std-spinbox { box-sizing: border-box; display: flex; align-items: center; width: 100%; height: 100%; padding: 0 8px; border: 1px solid var(--color-border, #cbd5e1); border-radius: 6px; background: var(--color-surface, #ffffff); color: var(--color-text, #1e293b); }
.vf-std-spinbox:focus-within { border-color: var(--color-primary, #2563eb); box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.18); }
.vf-std-spinbox-input { flex: 1; min-width: 0; height: 100%; border: none; background: transparent; color: inherit; font: inherit; font-size: 13px; outline: none; }
.vf-std-spinbox-suffix { margin-left: 4px; color: var(--color-muted, #64748b); font-size: 12px; white-space: nowrap; }`,
  },
  {
    decl: comboBoxDecl as ComponentDecl,
    folder: "ComboBox",
    create: createComboBox,
    styleText: `.vf-std-combobox { box-sizing: border-box; width: 100%; height: 100%; padding: 0 8px; border: 1px solid var(--color-border, #cbd5e1); border-radius: 6px; background: var(--color-surface, #ffffff); color: var(--color-text, #1e293b); font: inherit; font-size: 13px; outline: none; cursor: pointer; }
.vf-std-combobox:focus { border-color: var(--color-primary, #2563eb); box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.18); }
.vf-std-combobox:disabled { opacity: 0.5; cursor: not-allowed; }`,
  },
  {
    decl: checkBoxDecl as ComponentDecl,
    folder: "CheckBox",
    create: createCheckBox,
    styleText: `.vf-std-checkbox { display: flex; align-items: center; gap: 8px; width: 100%; height: 100%; color: var(--color-text, #1e293b); font-size: 13px; cursor: pointer; user-select: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vf-std-checkbox input { width: 15px; height: 15px; margin: 0; accent-color: var(--color-primary, #2563eb); cursor: inherit; }
.vf-std-checkbox[data-disabled="true"] { opacity: 0.5; cursor: not-allowed; }`,
  },
  {
    decl: listDecl as ComponentDecl,
    folder: "List",
    create: createList,
    styleText: `.vf-std-list { box-sizing: border-box; display: flex; flex-direction: column; gap: 2px; width: 100%; height: 100%; padding: 4px; border: 1px solid var(--color-border, #cbd5e1); border-radius: 6px; background: var(--color-surface, #ffffff); overflow-y: auto; }
.vf-std-list[data-disabled="true"] { opacity: 0.5; pointer-events: none; }
.vf-std-list-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--color-muted, #64748b); font-size: 12px; }
.vf-std-list-row { display: flex; align-items: center; gap: 8px; min-height: 28px; padding: 0 8px; border-radius: 4px; color: var(--color-text, #1e293b); font-size: 13px; cursor: pointer; user-select: none; }
.vf-std-list-row:hover { background: #f1f5f9; }
.vf-std-list-row.selected { background: #eff6ff; color: var(--color-primary, #2563eb); font-weight: 500; }
.vf-std-list-check { font-size: 12px; color: #94a3b8; cursor: pointer; }
.vf-std-list-check.on { color: var(--color-primary, #2563eb); }
.vf-std-list-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vf-std-list-badge { padding: 1px 5px; border-radius: 4px; background: #f1f5f9; color: #64748b; font-size: 11px; }`,
  },
  {
    decl: separatorDecl as ComponentDecl,
    folder: "Separator",
    create: createSeparator,
    styleText: `.vf-std-separator { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
.vf-std-separator::after { content: ""; display: block; width: 100%; height: 1px; background: var(--color-border, #e2e8f0); }
.vf-std-separator[data-orientation="vertical"]::after { width: 1px; height: 100%; }`,
  },
];

export const STANDARD_COMPONENTS = new Map<string, StandardComponent>(
  STANDARD_COMPONENT_LIST.map((item) => [item.decl.type, item]),
);
