// 右侧“属性”页签：选中节点的位置和尺寸、控件声明里的属性、样式类；没有选中时是当前页面的设置。
// 这里只管把界面上的输入变成对画布数据的修改，存盘和撤销由 main.ts 提供的 saveScene 负责。
import { classStylesOf, splitClasses, toggleClass } from "./classstyles.ts";
import type { Value } from "./expr.ts";
import { formatLength } from "./kinds.ts";
import { declFor, roundInScene, unitOf, type ComponentDecl, type Project, type PropDecl, type SceneNode } from "./model.ts";
import { PAPER_SIZES, pageIds, pageLabel, sheetCount } from "./pages.ts";

export interface PropsEditDeps {
  getProject(): Project;
  getSelectedId(): string | null;
  /** 没有选中节点时，显示的是哪个画板 */
  getBoardId(): string;
  isLocked(id: string): boolean;
  /** 节点的位置是不是由排版容器决定的（这时不能手填 X、Y） */
  isLayoutPositioned(id: string): boolean;
  /** 画布数据改好了：存盘、记进历史、重画 */
  saveScene(options?: { label?: string }): Promise<void>;
  toast(message: string): void;
  activateRightTab(tab: string): void;
  /** 列出项目里可以当素材用的文件（图片等），相对于项目文件夹 */
  listAssets(): Promise<string[]>;
  /** 控件现在实际用的属性值（见 ComponentInstance.effective），没写的属性拿来灰着显示 */
  effectiveProps(id: string): Record<string, Value> | null;
}

let deps: PropsEditDeps | null = null;
let assetCache: string[] | null = null;

export function initPropsEdit(options: PropsEditDeps): void {
  deps = options;
  const right = document.getElementById("right");
  const tabs = right?.querySelector(".tabs");
  if (!tabs || !right) return;
  if (!document.getElementById("tab-props")) {
    const tabBtn = document.createElement("button");
    tabBtn.id = "tab-props";
    tabBtn.type = "button";
    tabBtn.setAttribute("role", "tab");
    tabBtn.setAttribute("aria-selected", "false");
    tabBtn.textContent = "属性";
    tabBtn.addEventListener("click", () => options.activateRightTab("props"));
    tabs.prepend(tabBtn);
  }
  if (!document.getElementById("pane-props")) {
    const pane = document.createElement("div");
    pane.id = "pane-props";
    pane.className = "pane props-pane";
    pane.hidden = true;
    right.append(pane);
  }
}

/** 素材文件的清单改了（项目文件有变化）之后调用，下次打开下拉再重新列。 */
export function invalidatePropsAssets(): void {
  assetCache = null;
}

// ---------- 小部件 ----------

function section(title: string): HTMLElement {
  const box = document.createElement("section");
  box.className = "props-section";
  const head = document.createElement("h4");
  head.textContent = title;
  box.append(head);
  return box;
}

function row(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const line = document.createElement("label");
  line.className = "props-row";
  const name = document.createElement("span");
  name.className = "props-label";
  name.textContent = label;
  if (hint) name.title = hint;
  line.append(name, control);
  return line;
}

function numberInput(value: number, step: number, disabled: boolean, onCommit: (value: number) => void): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "number";
  input.step = String(step);
  input.value = String(value);
  input.disabled = disabled;
  input.addEventListener("change", () => {
    const next = Number(input.value);
    if (!Number.isFinite(next)) {
      input.value = String(value);
      return;
    }
    onCommit(next);
  });
  // 回车直接生效，不用先点到别处
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
  });
  return input;
}

function textInput(value: string, disabled: boolean, onCommit: (value: string) => void): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.spellcheck = false;
  input.value = value;
  input.disabled = disabled;
  input.addEventListener("change", () => onCommit(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
  });
  return input;
}

// ---------- 改数据 ----------

function setProp(node: SceneNode, decl: ComponentDecl | null, key: string, value: Value | undefined): void {
  const next = { ...(node.props ?? {}) };
  const fallback = decl?.props?.[key]?.default;
  // 和默认值一样就不写进文件，文件里只留用户真正改过的
  if (value === undefined || value === fallback || (value === "" && (fallback === undefined || fallback === ""))) delete next[key];
  else next[key] = value;
  if (Object.keys(next).length > 0) node.props = next;
  else delete node.props;
}

function commit(label: string): void {
  void deps?.saveScene({ label });
}

// ---------- 各个分区 ----------

function geometrySection(project: Project, id: string, node: SceneNode, isBoard: boolean, locked: boolean): HTMLElement {
  const unit = unitOf(project.scene);
  const box = section(isBoard ? "页面尺寸" : "位置和尺寸");
  const grid = document.createElement("div");
  grid.className = "props-grid";
  const field = (label: string, value: number, apply: (value: number) => boolean, disabled = false) => {
    const input = numberInput(Number(formatLength(unit, value)), unit.nudge[0], locked || disabled, (next) => {
      if (apply(roundInScene(project.scene, next))) commit(isBoard ? "修改页面尺寸" : "修改位置和尺寸");
      else input.value = formatLength(unit, value);
    });
    const cell = document.createElement("label");
    cell.className = "props-cell";
    const name = document.createElement("span");
    name.textContent = label;
    cell.append(name, input);
    grid.append(cell);
  };
  const positive = (apply: (value: number) => void) => (value: number) => {
    if (!(value > 0)) return false;
    apply(value);
    return true;
  };
  if (!isBoard) {
    const fixed = deps?.isLayoutPositioned(id) ?? false;
    field("X", node.x ?? 0, (value) => ((node.x = value), true), fixed);
    field("Y", node.y ?? 0, (value) => ((node.y = value), true), fixed);
  }
  field("宽", node.width, positive((value) => (node.width = value)));
  field("高", node.height, positive((value) => (node.height = value)));
  box.append(grid);
  const unitNote = document.createElement("div");
  unitNote.className = "props-note";
  unitNote.textContent = `单位：${unit.css === "mm" ? "毫米" : "像素"}`;
  box.append(unitNote);

  if (!isBoard) {
    const rotation = numberInput(node.rotation ?? 0, 1, locked, (next) => {
      const clamped = Math.max(-360, Math.min(360, next));
      if (clamped) node.rotation = clamped;
      else delete node.rotation;
      commit("旋转控件");
    });
    box.append(row("旋转（度）", rotation));
  }
  return box;
}

function paperSection(project: Project, id: string, node: SceneNode, locked: boolean): HTMLElement | null {
  if (unitOf(project.scene).css !== "mm") return null;
  const box = section("纸张");
  const sheets = sheetCount(node);
  const sheetWidth = node.width / sheets;
  const landscape = sheetWidth > node.height;
  const short = Math.min(sheetWidth, node.height);
  const long = Math.max(sheetWidth, node.height);
  const select = document.createElement("select");
  select.disabled = locked;
  const custom = document.createElement("option");
  custom.value = "";
  custom.textContent = "自定义";
  select.append(custom);
  let matched = false;
  for (const paper of PAPER_SIZES) {
    const option = document.createElement("option");
    option.value = paper.name;
    option.textContent = `${paper.name}（${paper.width} × ${paper.height}）`;
    if (Math.abs(paper.width - short) < 0.05 && Math.abs(paper.height - long) < 0.05) {
      option.selected = true;
      matched = true;
    }
    select.append(option);
  }
  custom.selected = !matched;
  select.addEventListener("change", () => {
    const paper = PAPER_SIZES.find((each) => each.name === select.value);
    if (!paper) return;
    const w = landscape ? paper.height : paper.width;
    const h = landscape ? paper.width : paper.height;
    node.width = roundInScene(project.scene, w * sheets);
    node.height = roundInScene(project.scene, h);
    commit("修改纸张");
  });
  box.append(row("每张纸", select, "页面由几张纸左右拼成时，这里是其中一张的尺寸"));

  const turn = document.createElement("button");
  turn.type = "button";
  turn.className = "tool";
  turn.disabled = locked;
  turn.textContent = landscape ? "改成竖放" : "改成横放";
  turn.addEventListener("click", () => {
    node.width = roundInScene(project.scene, node.height * sheets);
    node.height = roundInScene(project.scene, sheetWidth);
    commit("纸张横竖互换");
  });
  box.append(row("方向", turn));

  // 成册：只在第一个页面上问。打开以后第一个页面是包封（左封底、右封面），翻开封面看到的是第 2–3 页
  const scene = project.scene;
  if (pageIds(scene)[0] === id) {
    const wrap = document.createElement("input");
    wrap.type = "checkbox";
    wrap.checked = scene.cover === "wrap";
    wrap.disabled = locked || (sheets !== 2 && !wrap.checked);
    wrap.addEventListener("change", () => {
      if (wrap.checked) scene.cover = "wrap";
      else delete scene.cover;
      commit(wrap.checked ? "第一个页面改成包封" : "第一个页面不再是包封");
    });
    box.append(
      row(
        "封底 + 封面",
        wrap,
        sheets === 2
          ? "成册印刷：这一页左半是封底（最后一页），右半是封面（第 1 页），翻开后从第 2 页起两页一版"
          : "要先把拼页数改成 2，左半是封底、右半是封面",
      ),
    );
  }
  return box;
}

function classEditor(project: Project, node: SceneNode, decl: ComponentDecl | null, key: string, locked: boolean): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "props-classes";
  const current = splitClasses(node.props?.[key]);
  const input = textInput(current.join(" "), locked, (value) => {
    setProp(node, decl, key, splitClasses(value).join(" "));
    commit("修改样式类");
  });
  input.placeholder = "样式类，空格分隔";
  wrap.append(input);
  const styles = classStylesOf(project.styles ?? []);
  if (styles.length > 0) {
    const chips = document.createElement("div");
    chips.className = "props-chips";
    for (const style of styles) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "props-chip";
      chip.dataset.class = style.name;
      chip.setAttribute("aria-pressed", String(current.includes(style.name)));
      chip.textContent = style.label;
      chip.title = `.${style.name}　写在 ${style.path}`;
      chip.disabled = locked;
      chip.addEventListener("click", () => {
        setProp(node, decl, key, toggleClass(node.props?.[key], style.name));
        commit("修改样式类");
      });
      chips.append(chip);
    }
    wrap.append(chips);
  }
  return wrap;
}

/**
 * 声明里的数值属性。带单位、步长和范围；没有默认值的可以不写，这时输入框是空的，
 * 灰字显示画面上实际的值（例如样式类给的字号），旁边没有“恢复”按钮。
 */
function specNumberInput(
  spec: PropDecl,
  raw: Value | undefined,
  now: Value | undefined,
  disabled: boolean,
  apply: (value: number | undefined) => void,
): HTMLElement {
  const optional = spec.default === undefined;
  const wrap = document.createElement("span");
  wrap.className = "props-number";
  const input = document.createElement("input");
  input.type = "number";
  input.step = spec.step !== undefined ? String(spec.step) : "any";
  if (spec.min !== undefined) input.min = String(spec.min);
  if (spec.max !== undefined) input.max = String(spec.max);
  const shown = typeof raw === "number" && Number.isFinite(raw) ? String(raw) : "";
  input.value = shown;
  input.disabled = disabled;
  if (optional && typeof now === "number") {
    input.placeholder = String(now);
    input.title = `没有单独设置，现在是 ${now}${spec.unit ? ` ${spec.unit}` : ""}（来自样式）。填一个值只改这一个`;
  }
  input.addEventListener("change", () => {
    const text = input.value.trim();
    if (text === "") {
      if (optional) apply(undefined);
      else input.value = shown;
      return;
    }
    let next = Number(text);
    if (!Number.isFinite(next)) {
      input.value = shown;
      return;
    }
    if (spec.min !== undefined) next = Math.max(spec.min, next);
    if (spec.max !== undefined) next = Math.min(spec.max, next);
    apply(next);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
  });
  wrap.append(input);
  if (spec.unit) {
    const unit = document.createElement("span");
    unit.className = "props-unit";
    unit.textContent = spec.unit;
    wrap.append(unit);
  }
  if (optional && shown !== "") {
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "props-reset";
    reset.textContent = "↺";
    reset.title = "不单独设置，回到样式给的值";
    reset.disabled = disabled;
    // 按下时不抢焦点：输入框失焦会先提交一次、重画属性页签，这个按钮就没了，点击会落空
    reset.addEventListener("mousedown", (e) => e.preventDefault());
    reset.addEventListener("click", (e) => {
      e.preventDefault();
      apply(undefined);
    });
    wrap.append(reset);
  }
  return wrap;
}

function propControl(
  project: Project,
  node: SceneNode,
  decl: ComponentDecl,
  key: string,
  spec: PropDecl,
  locked: boolean,
  effective: Record<string, Value> | null,
): HTMLElement {
  const raw = node.props?.[key] ?? spec.default;
  const label = spec.label ?? key;
  const apply = (value: Value | undefined) => {
    setProp(node, decl, key, value);
    commit(`修改${label}`);
  };
  if (key === "class" && spec.type === "string") return classEditor(project, node, decl, key, locked);
  if (spec.type === "boolean") {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(raw);
    input.disabled = locked;
    input.addEventListener("change", () => apply(input.checked));
    return input;
  }
  if (spec.type === "number") return specNumberInput(spec, raw, effective?.[key], locked, apply);
  if (spec.type === "string" && spec.options?.length) {
    const select = document.createElement("select");
    select.disabled = locked;
    const name = (value: string) => spec.optionLabels?.[value] ?? value;
    // 没有默认值的属性可以不写：第一项是“不单独设置”，后面注明现在实际是哪个
    if (spec.default === undefined) {
      const option = document.createElement("option");
      option.value = "";
      const now = effective?.[key];
      option.textContent = typeof now === "string" && now ? `跟随样式（${name(now)}）` : "跟随样式";
      option.selected = raw === undefined || raw === "";
      select.append(option);
    }
    for (const value of spec.options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = name(value);
      option.selected = raw === value;
      select.append(option);
    }
    select.addEventListener("change", () => apply(select.value === "" ? undefined : select.value));
    return select;
  }
  if (spec.type === "string" && spec.multiline) {
    const area = document.createElement("textarea");
    area.spellcheck = false;
    area.rows = 6;
    area.value = typeof raw === "string" ? raw : "";
    area.disabled = locked;
    area.addEventListener("change", () => apply(area.value));
    area.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) area.blur();
    });
    return area;
  }
  if (spec.type === "string") {
    const input = textInput(typeof raw === "string" ? raw : "", locked, (value) => apply(value));
    if (spec.asset) {
      // 素材路径：点进去时列出项目里的图片，可以直接选
      const listId = "props-asset-list";
      input.setAttribute("list", listId);
      input.placeholder = "assets/…";
      input.addEventListener("focus", () => {
        void assetList().then((files) => {
          let list = document.getElementById(listId) as HTMLDataListElement | null;
          if (!list) {
            list = document.createElement("datalist");
            list.id = listId;
            document.body.append(list);
          }
          list.replaceChildren(
            ...files.map((file) => {
              const option = document.createElement("option");
              option.value = file;
              return option;
            }),
          );
        });
      });
    }
    return input;
  }
  // 数组和对象：按 JSON 编辑
  const area = document.createElement("textarea");
  area.spellcheck = false;
  area.rows = 4;
  area.value = raw === undefined ? "" : JSON.stringify(raw, null, 2);
  area.disabled = locked;
  area.addEventListener("change", () => {
    try {
      apply(area.value.trim() ? (JSON.parse(area.value) as Value) : undefined);
    } catch (e) {
      deps?.toast(`${label} 不是有效的 JSON：${(e as Error).message}`);
    }
  });
  return area;
}

async function assetList(): Promise<string[]> {
  if (!assetCache) assetCache = deps ? await deps.listAssets() : [];
  return assetCache;
}

/** 控件声明里的属性，按 group 分组，每组一个分区；没写 group 的在“属性”组。 */
function declaredPropsSections(project: Project, id: string, node: SceneNode, decl: ComponentDecl | null, locked: boolean): HTMLElement[] {
  const entries = Object.entries(decl?.props ?? {});
  if (!decl || entries.length === 0) return [];
  const effective = deps?.effectiveProps(id) ?? null;
  const groups = new Map<string, HTMLElement>();
  for (const [key, spec] of entries) {
    const title = spec.group ?? "属性";
    let box = groups.get(title);
    if (!box) {
      box = section(title);
      groups.set(title, box);
    }
    const control = propControl(project, node, decl, key, spec, locked, effective);
    const wide = control instanceof HTMLTextAreaElement || control.classList.contains("props-classes");
    const line = row(spec.label ?? key, control, spec.label ? key : undefined);
    line.dataset.prop = key;
    if (wide) line.classList.add("wide");
    box.append(line);
  }
  return [...groups.values()];
}

// ---------- 整个页签 ----------

export function renderPropsPane(): void {
  const pane = document.getElementById("pane-props");
  if (!pane || !deps) return;
  // 正在某个输入框里打字时不重建，免得光标跳走；失去焦点后的那次重画会补上
  if (pane.contains(document.activeElement) && document.activeElement instanceof HTMLElement && document.activeElement.matches("input, textarea, select")) return;
  const project = deps.getProject();
  const selected = deps.getSelectedId();
  const id = selected ?? deps.getBoardId();
  const node = project.scene.nodes[id];
  pane.replaceChildren();
  if (!node) return;
  const isBoard = node.type === "Page" || node.type === "Window" || node.type === "Dialog";
  const locked = deps.isLocked(id);
  const decl = declFor(project, node.type);

  const head = document.createElement("div");
  head.className = "props-head";
  head.textContent =
    node.type === "Page"
      ? `${pageLabel(project.scene, id)}（${id}）${selected ? "" : "　没有选中控件时，这里是当前页面的设置"}`
      : `${id} · ${decl?.label ?? node.type}${locked ? "（已锁定，不能修改）" : ""}`;
  pane.append(head);

  pane.append(geometrySection(project, id, node, isBoard, locked));
  if (node.type === "Page") {
    const paper = paperSection(project, id, node, locked);
    if (paper) pane.append(paper);
    const title = section("名字");
    title.append(
      row(
        "标题",
        textInput(node.title ?? "", locked, (value) => {
          if (value.trim()) node.title = value.trim();
          else delete node.title;
          commit("修改页面标题");
        }),
        "显示在翻页条上；不写就用页码",
      ),
    );
    pane.append(title);
  }
  pane.append(...declaredPropsSections(project, id, node, decl, locked));
}
