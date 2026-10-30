// 工具自带的 16 种标准控件：文字、按钮、输入框、多行文本、数字框、滑条、滚动条、下拉框、复选框、页签栏、列表、树、对话框按钮组、分隔线、占位区、数据生成表单。
// 每种包含共用声明（component.json）、网页实现（index.js / style.css）和对应的 Qt 映射。
import type { Value } from "../src/expr.ts";
import type { ComponentCreate, ComponentDecl, LoadedComponent } from "../src/model.ts";
import buttonDecl from "./Button/component.json" with { type: "json" };
import checkBoxDecl from "./CheckBox/component.json" with { type: "json" };
import comboBoxDecl from "./ComboBox/component.json" with { type: "json" };
import dataFormDecl from "./DataForm/component.json" with { type: "json" };
import dialogButtonBoxDecl from "./DialogButtonBox/component.json" with { type: "json" };
import labelDecl from "./Label/component.json" with { type: "json" };
import listDecl from "./List/component.json" with { type: "json" };
import scrollBarDecl from "./ScrollBar/component.json" with { type: "json" };
import separatorDecl from "./Separator/component.json" with { type: "json" };
import sliderDecl from "./Slider/component.json" with { type: "json" };
import spacerDecl from "./Spacer/component.json" with { type: "json" };
import spinBoxDecl from "./SpinBox/component.json" with { type: "json" };
import tabBarDecl from "./TabBar/component.json" with { type: "json" };
import textAreaDecl from "./TextArea/component.json" with { type: "json" };
import textInputDecl from "./TextInput/component.json" with { type: "json" };
import treeDecl from "./Tree/component.json" with { type: "json" };

export interface StandardComponent extends LoadedComponent {
  styleText: string;
}

const ICONS: Record<string, string> = {
  arrow: '<path d="M5 3l12 7-5 1.5L9.5 16 5 3z" fill="currentColor"/>',
  pen: '<path d="M14.5 2.5l3 3-9.5 9.5-3.5.5.5-3.5 9.5-9.5zm-8.5 11l-1 1" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  eraser: '<path d="M11 4l6 6-7 7H5l-2-2 8-11zm-4 13h10" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  fill: '<path d="M9 3l6 6-6 6-6-6 6-6zm7 9c1.2 1.5 2 2.7 2 3.8a2 2 0 1 1-4 0c0-1.1.8-2.3 2-3.8z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  transfer: '<path d="M4 7h11m-3-3l3 3-3 3M16 13H5m3-3l-3 3 3 3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  connect: '<path d="M5 15c2-6 8-6 10-10M5 15a1.5 1.5 0 1 0 0 .1zm10-10a1.5 1.5 0 1 0 0 .1z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
  hline: '<path d="M3 10h14M6 6v8m8-8v8" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
  vline: '<path d="M10 3v14M6 6h8m-8 8h8" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
  area: '<rect x="3.5" y="4.5" width="13" height="11" rx="1.5" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2.5 2" fill="none"/>',
  addline: '<path d="M4 14L14 4m-3 11h5m-2.5-2.5v5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
  automap: '<path d="M10 3l2 4.5L16.5 9 12 11l-2 4.5L8 11 3.5 9 8 7.5 10 3z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/>',
  plus: '<path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/>',
  minus: '<path d="M4 10h12" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/>',
  duplicate: '<rect x="6.5" y="6.5" width="9" height="9" rx="1.2" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M4.5 12.5V5a1 1 0 0 1 1-1h7.5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
  play: '<path d="M6 4.5l10 5.5-10 5.5V4.5z" fill="currentColor"/>',
  pause: '<path d="M6.5 4.5h2.5v11H6.5zm4.5 0h2.5v11H11z" fill="currentColor"/>',
  prev: '<path d="M5.5 5v10M14.5 5l-7 5 7 5V5z" stroke="currentColor" stroke-width="1.4" fill="currentColor" stroke-linecap="round" stroke-linejoin="round"/>',
  next: '<path d="M14.5 5v10M5.5 5l7 5-7 5V5z" stroke="currentColor" stroke-width="1.4" fill="currentColor" stroke-linecap="round" stroke-linejoin="round"/>',
  loop: '<path d="M14 6l2 2-2 2M6 14l-2-2 2-2M4 10V8a2 2 0 0 1 2-2h10m0 4v2a2 2 0 0 1-2 2H4" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  onion: '<circle cx="8.5" cy="10" r="4.5" stroke="currentColor" stroke-width="1.4" fill="none"/><circle cx="11.5" cy="10" r="4.5" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 1.5" fill="none"/>',
  clear: '<path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
  hold: '<path d="M5 5v10m4-10v10m3-5h4m-2-2v4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
};

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
    const iconName = String(next.icon ?? "").trim();
    const text = String(next.text ?? "");
    if (iconName && ICONS[iconName]) {
      const svg = `<svg viewBox="0 0 20 20" width="14" height="14" style="flex-shrink:0;display:block">${ICONS[iconName]}</svg>`;
      const span = text ? `<span style="overflow:hidden;text-overflow:ellipsis">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</span>` : "";
      button.innerHTML = svg + span;
      button.dataset.hasIcon = "true";
    } else {
      button.textContent = text;
      delete button.dataset.hasIcon;
    }
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

const createTextArea: ComponentCreate = (el, { props, emit }) => {
  const area = document.createElement("textarea");
  area.className = "vf-std-textarea";
  area.addEventListener("input", () => emit("change", area.value));
  el.append(area);
  const update = (next: Record<string, Value>) => {
    area.placeholder = String(next.placeholder ?? "");
    area.readOnly = Boolean(next.readOnly);
    area.disabled = next.enabled === false;
    const value = String(next.value ?? "");
    if (area.value !== value) area.value = value;
  };
  update(props);
  return { update, destroy: () => area.remove() };
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
  let min = 0;
  let max = 9999;
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  input.addEventListener("input", () => {
    const n = Number(input.value);
    if (Number.isFinite(n)) {
      const clamped = clamp(n);
      if (input.value !== String(clamped)) input.value = String(clamped);
      emit("change", clamped);
    }
  });
  const update = (next: Record<string, Value>) => {
    min = Number(next.min ?? 0);
    max = Number(next.max ?? 9999);
    input.min = String(min);
    input.max = String(max);
    input.step = String(next.step ?? 1);
    input.disabled = next.enabled === false;
    const raw = Number(next.value ?? 0);
    const val = String(Number.isFinite(raw) ? clamp(raw) : min);
    if (input.value !== val) input.value = val;
    const sfx = String(next.suffix ?? "");
    suffix.textContent = sfx;
    suffix.hidden = !sfx;
  };
  update(props);
  return { update, destroy: () => wrap.remove() };
};

const createSlider: ComponentCreate = (el, { props, emit }) => {
  const wrap = document.createElement("div");
  wrap.className = "vf-std-slider";
  const input = document.createElement("input");
  input.type = "range";
  input.className = "vf-std-slider-input";
  wrap.append(input);
  el.append(wrap);
  input.addEventListener("input", () => emit("change", Number(input.value)));
  const update = (next: Record<string, Value>) => {
    const min = Number(next.min ?? 0);
    const max = Number(next.max ?? 100);
    const step = Number(next.step ?? 1);
    const val = Number(next.value ?? 0);
    input.min = String(min);
    input.max = String(max);
    input.step = String(step > 0 ? step : 1);
    if (Number(input.value) !== val) input.value = String(val);
    input.disabled = next.enabled === false;
    wrap.dataset.orientation = String(next.orientation ?? "horizontal");
  };
  update(props);
  return { update, destroy: () => wrap.remove() };
};

const createScrollBar: ComponentCreate = (el, { props, emit }) => {
  const track = document.createElement("div");
  track.className = "vf-std-scrollbar";
  const thumb = document.createElement("div");
  thumb.className = "vf-std-scrollbar-thumb";
  track.append(thumb);
  el.append(track);
  let current = props;
  const update = (next: Record<string, Value>) => {
    current = next;
    const min = Number(next.min ?? 0);
    const max = Math.max(min, Number(next.max ?? 100));
    const page = Math.max(1, Number(next.pageStep ?? 10));
    const val = Math.min(max, Math.max(min, Number(next.value ?? 0)));
    const range = Math.max(1, max - min);
    const ratio = Math.min(0.85, Math.max(0.15, page / (range + page)));
    const posRatio = max > min ? (val - min) / (max - min) : 0;
    const vertical = next.orientation === "vertical";
    track.dataset.orientation = vertical ? "vertical" : "horizontal";
    track.dataset.disabled = String(next.enabled === false);
    if (vertical) {
      thumb.style.left = "1px";
      thumb.style.right = "1px";
      thumb.style.width = "auto";
      thumb.style.height = `${ratio * 100}%`;
      thumb.style.top = `${(1 - ratio) * posRatio * 100}%`;
    } else {
      thumb.style.top = "1px";
      thumb.style.bottom = "1px";
      thumb.style.height = "auto";
      thumb.style.width = `${ratio * 100}%`;
      thumb.style.left = `${(1 - ratio) * posRatio * 100}%`;
    }
  };
  track.addEventListener("mousedown", (ev) => {
    if (current.enabled === false) return;
    const rect = track.getBoundingClientRect();
    const min = Number(current.min ?? 0);
    const max = Math.max(min, Number(current.max ?? 100));
    const step = Math.max(1, Number(current.step ?? 1));
    const frac =
      current.orientation === "vertical"
        ? (ev.clientY - rect.top) / Math.max(1, rect.height)
        : (ev.clientX - rect.left) / Math.max(1, rect.width);
    const clamped = Math.min(1, Math.max(0, frac));
    const snapped = Math.min(max, Math.max(min, Math.round((min + clamped * (max - min)) / step) * step));
    emit("change", snapped);
  });
  update(props);
  return { update, destroy: () => track.remove() };
};

const createComboBox: ComponentCreate = (el, { props, emit }) => {
  const select = document.createElement("select");
  select.className = "vf-std-combobox";
  let lastOptions = "";
  select.addEventListener("change", () => emit("change", select.value));
  el.append(select);
  const update = (next: Record<string, Value>) => {
    const rawOptions = Array.isArray(next.options) ? next.options.map(String).join(",") : String(next.options ?? "");
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

const createTabBar: ComponentCreate = (el, { props, emit }) => {
  const bar = document.createElement("div");
  bar.className = "vf-std-tabbar";
  el.append(bar);
  const parseTabs = (raw: Value): string[] => {
    if (Array.isArray(raw)) {
      return raw.map((it, i) =>
        typeof it === "object" && it !== null && !Array.isArray(it)
          ? String(it.label ?? it.title ?? it.name ?? i)
          : String(it),
      );
    }
    return String(raw ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  };
  const update = (next: Record<string, Value>) => {
    bar.replaceChildren();
    const tabs = parseTabs(next.tabs ?? "");
    const cur = Number(next.value ?? 0);
    const disabled = next.enabled === false;
    tabs.forEach((label, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.vfTab = String(idx);
      btn.className = "vf-std-tabbar-tab" + (idx === cur ? " active" : "");
      btn.textContent = label;
      btn.disabled = disabled;
      btn.addEventListener("click", () => {
        if (disabled) return;
        if (idx !== cur) emit("change", idx);
      });
      bar.append(btn);
    });
  };
  update(props);
  return { update, destroy: () => bar.remove() };
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

  const update = (next: Record<string, Value>) => {
    container.replaceChildren();
    const disabled = next.enabled === false;
    container.dataset.disabled = String(disabled);
    const items = Array.isArray(next.items) ? next.items : [];
    const selected = typeof next.value === "number" ? next.value : 0;
    const draggable = Boolean(next.draggable);
    const mutedFrom = typeof next.mutedFrom === "number" ? next.mutedFrom : -1;
    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "vf-std-list-empty";
      empty.textContent = String(next.emptyText ?? "暂无内容");
      container.append(empty);
      return;
    }
    items.forEach((item, index) => {
      const isObj = item !== null && typeof item === "object" && !Array.isArray(item);
      const muted = (isObj && Boolean(item.muted)) || (mutedFrom >= 0 && index >= mutedFrom);
      const row = document.createElement("div");
      row.dataset.vfRow = String(index);
      row.className = "vf-std-list-row" + (index === selected ? " selected" : "") + (muted ? " muted" : "");
      const text = document.createElement("span");
      text.className = "vf-std-list-text";
      text.textContent = itemLabel(item);
      row.append(text);
      if (isObj && item.badge !== undefined && item.badge !== "") {
        const badge = document.createElement("span");
        badge.className = "vf-std-list-badge";
        badge.textContent = String(item.badge);
        row.append(badge);
      }
      row.addEventListener("click", () => {
        if (disabled) return;
        emit("select", index);
        if (index !== selected) {
          emit("change", index);
        }
      });
      if (draggable) {
        row.draggable = true;
        row.addEventListener("dragstart", (ev) => {
          dragFrom = index;
          if (ev.dataTransfer) {
            ev.dataTransfer.effectAllowed = "move";
            ev.dataTransfer.setData("text/plain", String(index));
          }
        });
        row.addEventListener("dragover", (ev) => {
          ev.preventDefault();
          if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
        });
        row.addEventListener("drop", (ev) => {
          ev.preventDefault();
          if (disabled) return;
          const from = dragFrom >= 0 ? dragFrom : Number(ev.dataTransfer?.getData("text/plain") ?? -1);
          dragFrom = -1;
          if (from >= 0 && from !== index) {
            emit("reorder", { from, to: index });
          }
        });
      }
      container.append(row);
    });
  };
  update(props);
  return { update, destroy: () => container.remove() };
};

interface FlatTreeRow {
  index: number;
  id: string;
  label: string;
  kind: string;
  isGroup: boolean;
  depth: number;
  collapsed: boolean;
  checked: boolean;
}

function normalizeTreeItems(rawItems: Value): FlatTreeRow[] {
  if (!Array.isArray(rawItems)) return [];
  const flat: FlatTreeRow[] = [];
  const walk = (list: Value[], depthOffset: number) => {
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        flat.push({
          index: flat.length,
          id: String(flat.length),
          label: String(item ?? ""),
          kind: "",
          isGroup: false,
          depth: depthOffset,
          collapsed: false,
          checked: true,
        });
        continue;
      }
      const children = Array.isArray(item.children) ? item.children : [];
      const depth = typeof item.depth === "number" ? item.depth : depthOffset;
      const idx = flat.length;
      flat.push({
        index: idx,
        id: String(item.id ?? item.name ?? idx),
        label: String(item.label ?? item.name ?? item.text ?? idx),
        kind: String(item.kind ?? ""),
        isGroup: Boolean(item.isGroup || children.length > 0),
        depth,
        collapsed: Boolean(item.collapsed),
        checked: item.checked !== undefined ? Boolean(item.checked) : item.visible !== undefined ? Boolean(item.visible) : true,
      });
      if (children.length > 0) walk(children, depth + 1);
    }
  };
  walk(rawItems, 0);
  return flat;
}

const createTree: ComponentCreate = (el, { props, emit }) => {
  const container = document.createElement("div");
  container.className = "vf-std-tree";
  el.append(container);
  let dragFrom = -1;

  const update = (next: Record<string, Value>) => {
    container.replaceChildren();
    const disabled = next.enabled === false;
    container.dataset.disabled = String(disabled);
    const rows = normalizeTreeItems(next.items ?? []);
    const selected = typeof next.value === "number" ? next.value : Number(next.selectedIndex ?? 0);
    const checkable = next.checkable !== false;
    const draggable = next.draggable !== false;
    if (rows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "vf-std-tree-empty";
      empty.textContent = String(next.emptyText ?? "暂无内容");
      container.append(empty);
      return;
    }
    let collapsedDepth: number | null = null;
    for (const r of rows) {
      if (collapsedDepth !== null) {
        if (r.depth > collapsedDepth) continue;
        collapsedDepth = null;
      }
      if (r.isGroup && r.collapsed) collapsedDepth = r.depth;
      const row = document.createElement("div");
      row.dataset.vfRow = String(r.index);
      row.dataset.vfItemId = r.id;
      row.className = "vf-std-tree-row" + (r.index === selected ? " selected" : "") + (!r.checked ? " unchecked" : "");
      row.style.paddingLeft = `${6 + r.depth * 14}px`;

      const caret = document.createElement("span");
      caret.className = "vf-std-tree-caret";
      if (r.isGroup) {
        caret.dataset.vfAction = "collapse";
        caret.textContent = r.collapsed ? "▸" : "▾";
        caret.addEventListener("click", (ev) => {
          ev.stopPropagation();
          if (disabled) return;
          emit("toggleCollapse", { index: r.index, id: r.id, collapsed: !r.collapsed });
        });
      }
      row.append(caret);

      if (checkable) {
        const chk = document.createElement("input");
        chk.type = "checkbox";
        chk.dataset.vfAction = "check";
        chk.className = "vf-std-tree-check";
        chk.checked = r.checked;
        chk.addEventListener("click", (ev) => ev.stopPropagation());
        chk.addEventListener("change", (ev) => {
          ev.stopPropagation();
          if (disabled) return;
          emit("toggleCheck", { index: r.index, id: r.id, checked: chk.checked });
        });
        row.append(chk);
      }

      const label = document.createElement("span");
      label.className = "vf-std-tree-text" + (r.isGroup ? " group" : "");
      label.textContent = r.label;
      row.append(label);

      if (r.kind) {
        const badge = document.createElement("span");
        badge.className = "vf-std-tree-badge";
        badge.textContent = r.kind;
        row.append(badge);
      }

      row.addEventListener("click", () => {
        if (disabled) return;
        emit("select", r.index);
        if (r.index !== selected) emit("change", r.index);
      });

      if (draggable) {
        row.draggable = true;
        row.addEventListener("dragstart", (ev) => {
          dragFrom = r.index;
          if (ev.dataTransfer) {
            ev.dataTransfer.effectAllowed = "move";
            ev.dataTransfer.setData("text/plain", String(r.index));
          }
        });
        row.addEventListener("dragover", (ev) => {
          ev.preventDefault();
          if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
        });
        row.addEventListener("drop", (ev) => {
          ev.preventDefault();
          if (disabled) return;
          const from = dragFrom >= 0 ? dragFrom : Number(ev.dataTransfer?.getData("text/plain") ?? -1);
          dragFrom = -1;
          if (from >= 0 && from !== r.index) {
            emit("reorder", { from, to: r.index });
          }
        });
      }
      container.append(row);
    }
  };
  update(props);
  return { update, destroy: () => container.remove() };
};

const createDialogButtonBox: ComponentCreate = (el, { props, emit }) => {
  const bar = document.createElement("div");
  bar.className = "vf-std-buttonbox";
  el.append(bar);
  const parseButtons = (raw: Value): string[] => {
    if (Array.isArray(raw)) return raw.map(String);
    return String(raw ?? "OK,Cancel")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  };
  const update = (next: Record<string, Value>) => {
    bar.replaceChildren();
    const list = parseButtons(next.buttons ?? "OK,Cancel");
    const disabled = next.enabled === false;
    for (const role of list) {
      const isAccept = /^(ok|accept|yes|apply|create|save|confirm)$/i.test(role);
      const isReject = /^(cancel|reject|no|close)$/i.test(role);
      const text =
        isAccept && next.okText && next.okText !== "OK"
          ? String(next.okText)
          : isReject && next.cancelText && next.cancelText !== "Cancel"
            ? String(next.cancelText)
            : role;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.vfRole = isAccept ? "accept" : isReject ? "reject" : role.toLowerCase();
      btn.className = "vf-std-buttonbox-btn" + (isAccept ? " primary" : "");
      btn.textContent = text;
      btn.disabled = disabled;
      btn.addEventListener("click", () => {
        if (disabled) return;
        if (isAccept) emit("accept");
        else if (isReject) emit("reject");
      });
      bar.append(btn);
    }
  };
  update(props);
  return { update, destroy: () => bar.remove() };
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

const createSpacer: ComponentCreate = (el) => {
  const spacer = document.createElement("div");
  spacer.className = "vf-std-spacer";
  el.append(spacer);
  return { update() {}, destroy: () => spacer.remove() };
};

interface DataFormControlSpec {
  name?: string;
  type?: string;
  title?: string;
  hook?: string;
  value?: Value;
  min?: number;
  max?: number;
  options?: Value[];
  row?: number;
  column?: number;
  start_column?: number;
  end_column?: number;
  state?: string;
  visible_when?: string | { control?: string; field?: string; equals?: Value; not_equals?: Value; in?: Value[] };
}

function parseDataFormSchema(raw: Value): { row_spacing: number; column_spacing: number; controls: DataFormControlSpec[] } {
  let target = raw;
  if (typeof target === "string") {
    try {
      target = JSON.parse(target) as Value;
    } catch {
      return { row_spacing: 8, column_spacing: 6, controls: [] };
    }
  }
  if (Array.isArray(target)) {
    return { row_spacing: 8, column_spacing: 6, controls: target as DataFormControlSpec[] };
  }
  if (typeof target === "object" && target !== null) {
    const obj = target as Record<string, Value>;
    return {
      row_spacing: Number(obj.row_spacing ?? 8),
      column_spacing: Number(obj.column_spacing ?? 6),
      controls: Array.isArray(obj.controls) ? (obj.controls as DataFormControlSpec[]) : [],
    };
  }
  return { row_spacing: 8, column_spacing: 6, controls: [] };
}

function parseDataFormValues(raw: Value): Record<string, Value> {
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as Value;
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) return raw;
  return {};
}

function isDataFormControlVisible(ctrl: DataFormControlSpec, valMap: Record<string, Value>): boolean {
  const cond = ctrl.visible_when;
  if (!cond) return true;
  if (typeof cond === "string") {
    const eqIdx = cond.indexOf("==");
    if (eqIdx > 0) {
      const key = cond.slice(0, eqIdx).trim();
      const rhs = cond.slice(eqIdx + 2).trim().replace(/^['"]|['"]$/g, "");
      return String(valMap[key] ?? "") === rhs;
    }
    return Boolean(valMap[cond.trim()]);
  }
  if (typeof cond !== "object") return true;
  const target = String(cond.control ?? cond.field ?? "");
  if (!target) return true;
  const actual = valMap[target];
  if (cond.equals !== undefined) return actual === cond.equals;
  if (cond.not_equals !== undefined) return actual !== cond.not_equals;
  if (Array.isArray(cond.in)) return cond.in.includes(actual);
  return true;
}

const createDataForm: ComponentCreate = (el, { props, emit }) => {
  const root = document.createElement("div");
  root.className = "vf-std-dataform";
  el.append(root);
  let localOverrides: Record<string, Value> = {};
  let lastSchemaKey = "";

  const update = (next: Record<string, Value>) => {
    const schema = parseDataFormSchema(next.schema ?? []);
    const schemaKey = JSON.stringify(schema.controls.map((c) => `${c?.name}:${c?.type}`));
    if (schemaKey !== lastSchemaKey) {
      localOverrides = {};
      lastSchemaKey = schemaKey;
    }
    const extValues = parseDataFormValues(next.values ?? "{}");
    const valMap: Record<string, Value> = {};
    for (const c of schema.controls) {
      if (!c || typeof c !== "object") continue;
      const name = String(c.name ?? "");
      if (!name) continue;
      if (extValues[name] !== undefined) valMap[name] = extValues[name];
      else if (localOverrides[name] !== undefined) valMap[name] = localOverrides[name];
      else valMap[name] = c.value ?? null;
    }

    root.replaceChildren();
    if (schema.controls.length === 0) {
      const empty = document.createElement("div");
      empty.className = "vf-std-dataform-empty";
      empty.textContent = String(next.emptyText ?? "当前工具无可调选项");
      root.append(empty);
      return;
    }

    const grid = document.createElement("div");
    grid.className = "vf-std-dataform-grid";
    grid.style.rowGap = `${Math.max(4, schema.row_spacing)}px`;
    grid.style.columnGap = `${Math.max(4, schema.column_spacing)}px`;

    const emitField = (c: DataFormControlSpec, val: Value) => {
      const name = String(c.name ?? "");
      localOverrides[name] = val;
      emit("change", {
        name,
        value: val,
        hook: String(c.hook ?? ""),
        type: String(c.type ?? ""),
      });
      update(next);
    };

    for (const c of schema.controls) {
      if (!c || typeof c !== "object") continue;
      const stateStr = String(c.state ?? "normal");
      if (stateStr === "hidden" || !isDataFormControlVisible(c, valMap)) continue;
      const disabled = next.enabled === false || stateStr === "disabled";
      const name = String(c.name ?? "");
      const title = String(c.title ?? name);
      const type = String(c.type ?? "button");
      const val = valMap[name];
      const row = Number(c.row ?? 0) + 1;
      const startCol = Number(c.start_column ?? c.column ?? 0) + 1;
      const endCol = Number(c.end_column ?? c.start_column ?? c.column ?? 1) + 2;

      const cell = document.createElement("div");
      cell.className = "vf-std-dataform-cell";
      cell.dataset.vfField = name;
      cell.style.gridRow = String(row);
      cell.style.gridColumn = `${startCol} / ${Math.max(startCol + 1, endCol)}`;

      if (type === "slider") {
        const head = document.createElement("div");
        head.className = "vf-std-dataform-head";
        const lbl = document.createElement("span");
        lbl.textContent = title;
        const num = document.createElement("span");
        num.className = "vf-std-dataform-val";
        num.dataset.vfFieldValue = name;
        num.textContent = String(val ?? c.min ?? 0);
        head.append(lbl, num);

        const input = document.createElement("input");
        input.type = "range";
        input.className = "vf-std-dataform-slider";
        input.min = String(c.min ?? 0);
        input.max = String(c.max ?? 100);
        input.value = String(val ?? c.min ?? 0);
        input.disabled = disabled;
        input.addEventListener("input", () => {
          num.textContent = input.value;
        });
        input.addEventListener("change", () => {
          emitField(c, Number(input.value));
        });
        cell.append(head, input);
      } else if (type === "list" || type === "select") {
        const rowBox = document.createElement("div");
        rowBox.className = "vf-std-dataform-row";
        const lbl = document.createElement("span");
        lbl.textContent = title;
        const sel = document.createElement("select");
        sel.className = "vf-std-dataform-select";
        sel.disabled = disabled;
        const opts = Array.isArray(c.options) ? c.options : [];
        for (const opt of opts) {
          const o = document.createElement("option");
          o.value = String(opt);
          o.textContent = String(opt);
          if (String(opt) === String(val)) o.selected = true;
          sel.append(o);
        }
        sel.addEventListener("change", () => emitField(c, sel.value));
        rowBox.append(lbl, sel);
        cell.append(rowBox);
      } else if (type === "check" || type === "checkbox") {
        const lbl = document.createElement("label");
        lbl.className = "vf-std-dataform-check";
        const chk = document.createElement("input");
        chk.type = "checkbox";
        chk.checked = Boolean(val);
        chk.disabled = disabled;
        chk.addEventListener("change", () => emitField(c, chk.checked));
        const span = document.createElement("span");
        span.textContent = title;
        lbl.append(chk, span);
        cell.append(lbl);
      } else if (type === "color" || type === "palette") {
        const rowBox = document.createElement("div");
        rowBox.className = "vf-std-dataform-row";
        const lbl = document.createElement("span");
        lbl.textContent = title;
        const sw = document.createElement("input");
        sw.type = "color";
        sw.value = typeof val === "string" && val.startsWith("#") ? val : "#4a90d9";
        sw.disabled = disabled;
        sw.addEventListener("change", () => emitField(c, sw.value));
        rowBox.append(lbl, sw);
        cell.append(rowBox);
      } else {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "vf-std-dataform-btn";
        btn.disabled = disabled;
        btn.textContent = title;
        btn.addEventListener("click", () => emitField(c, true));
        cell.append(btn);
      }
      grid.append(cell);
    }
    root.append(grid);
  };
  update(props);
  return { update, destroy: () => root.remove() };
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
    styleText: `.vf-std-button { width: 100%; height: 100%; padding: 0 10px; border: 1px solid var(--color-border, #cbd5e1); border-radius: 6px; background: var(--color-surface, #ffffff); color: var(--color-text, #1e293b); font: inherit; font-size: 13px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 5px; transition: background 0.12s, border-color 0.12s, box-shadow 0.12s, transform 0.06s; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vf-std-button[data-has-icon="true"] { padding: 0 6px; }
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
    decl: textAreaDecl as ComponentDecl,
    folder: "TextArea",
    create: createTextArea,
    styleText: `.vf-std-textarea { box-sizing: border-box; width: 100%; height: 100%; padding: 6px 8px; border: 1px solid var(--color-border, #cbd5e1); border-radius: 6px; background: var(--color-surface, #ffffff); color: var(--color-text, #1e293b); font: inherit; font-size: 12px; line-height: 1.4; resize: none; outline: none; }
.vf-std-textarea:focus { border-color: var(--color-primary, #2563eb); box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.18); }
.vf-std-textarea:disabled { opacity: 0.5; }`,
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
    decl: sliderDecl as ComponentDecl,
    folder: "Slider",
    create: createSlider,
    styleText: `.vf-std-slider { box-sizing: border-box; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
.vf-std-slider-input { width: 100%; margin: 0; accent-color: var(--color-primary, #2563eb); cursor: pointer; }
.vf-std-slider[data-orientation="vertical"] .vf-std-slider-input { writing-mode: vertical-lr; width: auto; height: 100%; }`,
  },
  {
    decl: scrollBarDecl as ComponentDecl,
    folder: "ScrollBar",
    create: createScrollBar,
    styleText: `.vf-std-scrollbar { box-sizing: border-box; position: relative; width: 100%; height: 100%; border: 1px solid var(--color-border, #cbd5e1); border-radius: 4px; background: var(--color-surface, #f1f5f9); overflow: hidden; cursor: pointer; user-select: none; }
.vf-std-scrollbar-thumb { position: absolute; border-radius: 3px; background: var(--color-muted, #94a3b8); }
.vf-std-scrollbar[data-disabled="true"] { opacity: 0.5; pointer-events: none; }`,
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
    decl: tabBarDecl as ComponentDecl,
    folder: "TabBar",
    create: createTabBar,
    styleText: `.vf-std-tabbar { box-sizing: border-box; display: flex; align-items: stretch; gap: 2px; width: 100%; height: 100%; padding: 2px 4px 0 4px; border-bottom: 1px solid var(--color-border, #cbd5e1); overflow: hidden; }
.vf-std-tabbar-tab { flex: 1 1 0; min-width: 0; height: 100%; padding: 0 8px; border: 1px solid var(--color-border, #cbd5e1); border-bottom: none; border-radius: 5px 5px 0 0; background: transparent; color: var(--color-muted, #64748b); font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vf-std-tabbar-tab.active { background: var(--color-surface, #ffffff); border-color: var(--color-primary, #2563eb); border-bottom: 2px solid var(--color-primary, #2563eb); color: var(--color-text, #1e293b); font-weight: 600; }`,
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
.vf-std-list-row.muted { opacity: 0.45; }
.vf-std-list-check { font-size: 12px; color: #94a3b8; cursor: pointer; }
.vf-std-list-check.on { color: var(--color-primary, #2563eb); }
.vf-std-list-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vf-std-list-badge { padding: 1px 5px; border-radius: 4px; background: #f1f5f9; color: #64748b; font-size: 11px; }`,
  },
  {
    decl: treeDecl as ComponentDecl,
    folder: "Tree",
    create: createTree,
    styleText: `.vf-std-tree { box-sizing: border-box; display: flex; flex-direction: column; gap: 2px; width: 100%; height: 100%; padding: 4px; border: 1px solid var(--color-border, #cbd5e1); border-radius: 6px; background: var(--color-surface, #ffffff); overflow-y: auto; user-select: none; }
.vf-std-tree[data-disabled="true"] { opacity: 0.5; pointer-events: none; }
.vf-std-tree-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--color-muted, #64748b); font-size: 12px; }
.vf-std-tree-row { display: flex; align-items: center; gap: 5px; min-height: 24px; padding-right: 6px; border-radius: 4px; color: var(--color-text, #1e293b); font-size: 12px; cursor: pointer; }
.vf-std-tree-row.selected { background: var(--color-primary, #2563eb); color: #ffffff; }
.vf-std-tree-row.unchecked .vf-std-tree-text { opacity: 0.55; }
.vf-std-tree-caret { width: 14px; height: 14px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; flex-shrink: 0; }
.vf-std-tree-check { width: 13px; height: 13px; margin: 0; accent-color: var(--color-primary, #2563eb); cursor: pointer; flex-shrink: 0; }
.vf-std-tree-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vf-std-tree-text.group { font-weight: 600; }
.vf-std-tree-badge { padding: 1px 4px; border-radius: 3px; background: rgba(148, 163, 184, 0.2); font-size: 10px; flex-shrink: 0; }`,
  },
  {
    decl: dialogButtonBoxDecl as ComponentDecl,
    folder: "DialogButtonBox",
    create: createDialogButtonBox,
    styleText: `.vf-std-buttonbox { box-sizing: border-box; display: flex; align-items: center; justify-content: flex-end; gap: 8px; width: 100%; height: 100%; }
.vf-std-buttonbox-btn { min-width: 72px; height: 28px; padding: 0 12px; border: 1px solid var(--color-border, #cbd5e1); border-radius: 5px; background: var(--color-surface, #ffffff); color: var(--color-text, #1e293b); font: inherit; font-size: 12px; cursor: pointer; }
.vf-std-buttonbox-btn.primary { border-color: var(--color-primary, #2563eb); background: var(--color-primary, #2563eb); color: #ffffff; font-weight: 500; }`,
  },
  {
    decl: separatorDecl as ComponentDecl,
    folder: "Separator",
    create: createSeparator,
    styleText: `.vf-std-separator { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
.vf-std-separator::after { content: ""; display: block; width: 100%; height: 1px; background: var(--color-border, #e2e8f0); }
.vf-std-separator[data-orientation="vertical"]::after { width: 1px; height: 100%; }`,
  },
  {
    decl: spacerDecl as ComponentDecl,
    folder: "Spacer",
    create: createSpacer,
    styleText: `.vf-std-spacer { width: 100%; height: 100%; pointer-events: none; }`,
  },
  {
    decl: dataFormDecl as ComponentDecl,
    folder: "DataForm",
    create: createDataForm,
    styleText: `.vf-std-dataform { box-sizing: border-box; width: 100%; height: 100%; padding: 6px; border: 1px solid var(--color-border, #cbd5e1); border-radius: 6px; background: var(--color-surface, #ffffff); color: var(--color-text, #1e293b); font-size: 12px; overflow: auto; }
.vf-std-dataform-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--color-muted, #64748b); font-size: 12px; }
.vf-std-dataform-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: center; }
.vf-std-dataform-cell { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.vf-std-dataform-head { display: flex; justify-content: space-between; align-items: center; font-size: 11px; }
.vf-std-dataform-val { color: var(--color-primary, #2563eb); font-variant-numeric: tabular-nums; font-weight: 500; }
.vf-std-dataform-slider { width: 100%; margin: 0; accent-color: var(--color-primary, #2563eb); }
.vf-std-dataform-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.vf-std-dataform-select { flex: 1; min-width: 0; height: 24px; padding: 0 4px; border: 1px solid var(--color-border, #cbd5e1); border-radius: 4px; background: var(--color-surface, #ffffff); color: var(--color-text, #1e293b); font-size: 11px; }
.vf-std-dataform-check { display: flex; align-items: center; gap: 6px; height: 22px; cursor: pointer; }
.vf-std-dataform-btn { height: 26px; padding: 0 8px; border: 1px solid var(--color-border, #cbd5e1); border-radius: 4px; background: var(--color-surface, #ffffff); color: var(--color-text, #1e293b); font-size: 11px; cursor: pointer; }`,
  },
];

export const STANDARD_COMPONENTS = new Map<string, StandardComponent>(
  STANDARD_COMPONENT_LIST.map((item) => [item.decl.type, item]),
);
