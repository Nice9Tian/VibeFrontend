// 状态归属（owner: ui | business）标注、状态变量增删改与业务事件编辑：
// 1) 列出 logic/app.logic.yaml 中的全部状态叶子节点，支持一键切换 owner: ui（界面自管）或 owner: business（业务管）；
// 2) 支持可视化新增、修改初始值和删除状态变量（string / number / boolean / enum / array）；
// 3) 支持添加或编辑业务事件（owner: business 及 simulate 模拟步骤）；
// 4) 所有修改通过 editLogic 保留 YAML 注释格式并计入撤销/重做历史。
import { isMap, parseDocument, type Document } from "yaml";
import type { Value } from "./expr.ts";
import {
  allStateLeaves,
  businessEvent,
  type ConditionDef,
  type Project,
  type StateLeaf,
  type Step,
} from "./model.ts";

const VALID_SEG_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const YAML_OUTPUT = { lineWidth: 0 };

export function isValidStatePath(statePath: string): boolean {
  const parts = statePath.trim().split(".");
  return parts.length > 0 && parts.every((seg) => VALID_SEG_RE.test(seg));
}

// ---------- 纯数据操作函数（供界面与自动化测试共用） ----------

/**
 * 在 YAML Document 中设置某个状态路径的归属（owner: "ui" | "business"）。
 * 当 owner 为 "ui" 时移除 owner 字段（还原为默认的界面自管）；当 owner 为 "business" 时写入 owner: business。
 */
export function setStateOwnerInDoc(doc: Document, statePath: string, owner: "ui" | "business"): boolean {
  if (!isValidStatePath(statePath)) return false;
  if (owner !== "ui" && owner !== "business") return false;
  const parts = statePath.trim().split(".");
  const node = doc.getIn(["state", ...parts]);
  if (!isMap(node)) return false;
  if (owner === "business") {
    doc.setIn(["state", ...parts, "owner"], "business");
  } else {
    doc.deleteIn(["state", ...parts, "owner"]);
  }
  return true;
}

/**
 * 在 YAML 文本上直接切换状态归属并返回新的 YAML 文本。
 */
export function setStateOwnerInYaml(yamlText: string, statePath: string, owner: "ui" | "business"): string {
  const doc = parseDocument(yamlText);
  if (doc.errors.length > 0) return yamlText;
  if (!setStateOwnerInDoc(doc, statePath, owner)) return yamlText;
  return doc.toString(YAML_OUTPUT);
}

/**
 * 在 YAML Document 中新增或更新一个状态叶子节点。
 */
export function upsertStateLeafInDoc(
  doc: Document,
  statePath: string,
  spec: {
    type: StateLeaf["type"];
    initial?: Value;
    values?: string[];
    owner?: "ui" | "business";
  },
): boolean {
  if (!isValidStatePath(statePath)) return false;
  const parts = statePath.trim().split(".");
  if (!isMap(doc.get("state"))) {
    doc.set("state", doc.createNode({}));
  }
  for (let i = 1; i < parts.length; i++) {
    const prefix = ["state", ...parts.slice(0, i)];
    if (!isMap(doc.getIn(prefix))) {
      doc.setIn(prefix, doc.createNode({}));
    }
  }

  let defaultInitial: Value = "";
  if (spec.initial !== undefined) {
    defaultInitial = spec.initial;
  } else if (spec.type === "number") {
    defaultInitial = 0;
  } else if (spec.type === "boolean") {
    defaultInitial = false;
  } else if (spec.type === "array") {
    defaultInitial = [];
  } else if (spec.type === "enum") {
    defaultInitial = spec.values?.[0] ?? "";
  }

  const leafObj: Record<string, unknown> = {
    type: spec.type,
    initial: defaultInitial,
  };
  if (spec.type === "enum" && Array.isArray(spec.values) && spec.values.length > 0) {
    leafObj.values = spec.values;
  }
  if (spec.owner === "business") {
    leafObj.owner = "business";
  }

  doc.setIn(["state", ...parts], doc.createNode(leafObj));
  return true;
}

/**
 * 修改已有状态叶子节点的 initial 初始值。
 */
export function updateStateInitialInDoc(doc: Document, statePath: string, initial: Value): boolean {
  if (!isValidStatePath(statePath)) return false;
  const parts = statePath.trim().split(".");
  const node = doc.getIn(["state", ...parts]);
  if (!isMap(node)) return false;
  doc.setIn(["state", ...parts, "initial"], doc.createNode(initial));
  return true;
}

/**
 * 从 YAML Document 中删除某个状态叶子节点，并清理变空的父级分组。
 */
export function removeStateLeafInDoc(doc: Document, statePath: string): boolean {
  if (!isValidStatePath(statePath)) return false;
  const parts = statePath.trim().split(".");
  if (!isMap(doc.getIn(["state", ...parts]))) return false;
  doc.deleteIn(["state", ...parts]);
  for (let i = parts.length - 1; i >= 1; i--) {
    const parentPath = ["state", ...parts.slice(0, i)];
    const parentNode = doc.getIn(parentPath);
    if (isMap(parentNode) && parentNode.items.length === 0) {
      doc.deleteIn(parentPath);
    } else {
      break;
    }
  }
  return true;
}

/**
 * 在 YAML Document 中新增或更新一个业务事件（owner: business）。
 */
export function upsertBusinessEventInDoc(
  doc: Document,
  eventName: string,
  spec: { text?: string; simulateSet?: string; simulateSteps?: Step[] },
): boolean {
  const clean = eventName.trim();
  if (!VALID_SEG_RE.test(clean)) return false;
  if (!isMap(doc.get("events"))) {
    doc.set("events", doc.createNode({}));
  }
  const steps: Step[] =
    spec.simulateSteps ??
    (spec.simulateSet?.trim() ? [{ set: spec.simulateSet.trim() }] : []);
  const evObj: Record<string, unknown> = {
    owner: "business",
  };
  if (spec.text?.trim()) evObj.text = spec.text.trim();
  if (steps.length > 0) evObj.simulate = steps;
  doc.setIn(["events", clean], doc.createNode(evObj));
  return true;
}

/**
 * 在 YAML Document 中新增或更新一个全局条件。
 */
export function upsertGlobalConditionInDoc(
  doc: Document,
  condId: string,
  spec: ConditionDef,
): boolean {
  const clean = condId.trim();
  if (!VALID_SEG_RE.test(clean)) return false;
  if (!isMap(doc.get("conditions"))) {
    doc.set("conditions", doc.createNode({}));
  }
  doc.setIn(["conditions", clean], doc.createNode(spec));
  return true;
}

export function parseInitialValueByType(type: StateLeaf["type"], raw: string): { ok: boolean; value: Value } {
  const trimmed = raw.trim();
  if (type === "boolean") {
    return { ok: true, value: trimmed === "true" || trimmed === "1" };
  }
  if (type === "number") {
    const n = Number(trimmed);
    return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, value: 0 };
  }
  if (type === "array") {
    if (!trimmed) return { ok: true, value: [] };
    try {
      const parsed = JSON.parse(trimmed) as Value;
      return Array.isArray(parsed) ? { ok: true, value: parsed } : { ok: false, value: [] };
    } catch {
      return { ok: false, value: [] };
    }
  }
  return { ok: true, value: raw };
}

// ---------- 右侧“状态”页签界面 ----------

export interface StateEditDeps {
  getProject: () => Project;
  editLogic: (mutate: (doc: Document) => void, label?: string) => Promise<boolean>;
  toast: (msg: string) => void;
  activateRightTab: (tabId: string) => void;
}

let deps: StateEditDeps | null = null;

export function initStateEdit(options: StateEditDeps): void {
  deps = options;
  const right = document.getElementById("right");
  const tabs = right?.querySelector(".tabs") ?? document.getElementById("tabs");
  if (!tabs || !right) return;

  if (!document.getElementById("tab-state")) {
    const tabBtn = document.createElement("button");
    tabBtn.id = "tab-state";
    tabBtn.type = "button";
    tabBtn.setAttribute("role", "tab");
    tabBtn.setAttribute("aria-selected", "false");
    tabBtn.textContent = "状态";
    tabBtn.title = "标注状态归属（owner: ui / business）、管理状态变量与业务事件";
    const tabDoc = document.getElementById("tab-doc");
    if (tabDoc) tabs.insertBefore(tabBtn, tabDoc);
    else tabs.append(tabBtn);
    tabBtn.addEventListener("click", () => deps?.activateRightTab("state"));
  }

  if (!document.getElementById("pane-state")) {
    const pane = document.createElement("div");
    pane.id = "pane-state";
    pane.className = "pane vf-custom-pane";
    pane.hidden = true;
    right.append(pane);
  }
}

export function renderStateEditPane(): void {
  if (!deps) return;
  const pane = document.getElementById("pane-state");
  if (!pane) return;
  pane.replaceChildren();

  const project = deps.getProject();
  const leaves = allStateLeaves(project.logic);

  // 1. 状态归属与变量列表
  const stateSec = document.createElement("section");
  stateSec.className = "vf-edit-section";
  const stateTitle = document.createElement("div");
  stateTitle.className = "vf-sec-title";
  stateTitle.textContent = `状态变量与归属标注（共 ${leaves.length} 项）`;
  stateSec.append(stateTitle);

  const note = document.createElement("div");
  note.className = "vf-muted-note";
  note.textContent = "界面自管 (ui)：界面事件可直接 set 修改；业务管 (business)：由业务代码供给，界面事件不能直接改写（业务事件的 simulate 模拟步骤除外）。";
  stateSec.append(note);

  // 新增状态表单
  const addForm = document.createElement("div");
  addForm.className = "vf-state-add-form";

  const pathIn = document.createElement("input");
  pathIn.type = "text";
  pathIn.placeholder = "状态路径（如 layer.visible）";
  pathIn.dataset.newStatePath = "true";

  const typeSel = document.createElement("select");
  typeSel.dataset.newStateType = "true";
  for (const [val, label] of [
    ["string", "文字 (string)"],
    ["number", "数字 (number)"],
    ["boolean", "布尔 (boolean)"],
    ["array", "列表 (array)"],
    ["enum", "枚举 (enum)"],
  ] as const) {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = label;
    typeSel.append(opt);
  }

  const initIn = document.createElement("input");
  initIn.type = "text";
  initIn.placeholder = "初始值（如 true / 0 / []）";
  initIn.dataset.newStateInitial = "true";

  const ownerSel = document.createElement("select");
  ownerSel.dataset.newStateOwner = "true";
  for (const [val, label] of [
    ["ui", "界面自管 (ui)"],
    ["business", "业务管 (business)"],
  ] as const) {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = label;
    ownerSel.append(opt);
  }

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "vf-primary-btn";
  addBtn.dataset.stateAction = "add-state";
  addBtn.textContent = "+ 添加状态";
  addBtn.addEventListener("click", () => {
    const path = pathIn.value.trim();
    if (!isValidStatePath(path)) {
      deps?.toast("状态路径格式无效（如 layer.visible）");
      return;
    }
    const sType = typeSel.value as StateLeaf["type"];
    const sOwner = ownerSel.value as "ui" | "business";
    const rawInit = initIn.value.trim();
    const parsed = rawInit ? parseInitialValueByType(sType, rawInit) : { ok: true, value: undefined };
    if (!parsed.ok) {
      deps?.toast("初始值格式与类型不匹配");
      return;
    }
    void deps?.editLogic((doc) => {
      upsertStateLeafInDoc(doc, path, {
        type: sType,
        initial: parsed.value,
        owner: sOwner,
      });
    }, `添加状态 ${path}`);
  });

  addForm.append(pathIn, typeSel, initIn, ownerSel, addBtn);
  stateSec.append(addForm);

  // 状态列表
  const listWrap = document.createElement("div");
  listWrap.className = "vf-state-list";

  if (leaves.length === 0) {
    const empty = document.createElement("div");
    empty.className = "vf-pane-empty";
    empty.textContent = "暂无状态变量";
    listWrap.append(empty);
  } else {
    for (const { path, leaf } of leaves) {
      const isBiz = leaf.owner === "business";
      const row = document.createElement("div");
      row.className = "vf-state-row" + (isBiz ? " is-business" : "");
      row.dataset.stateRow = path;

      const topLine = document.createElement("div");
      topLine.className = "vf-row-between";

      const infoSpan = document.createElement("div");
      infoSpan.className = "vf-state-info";
      const pathStrong = document.createElement("strong");
      pathStrong.textContent = path;
      const typeTag = document.createElement("span");
      typeTag.className = "vf-type-tag";
      typeTag.textContent = leaf.type;
      infoSpan.append(pathStrong, typeTag);

      // 归属切换按钮组 (ui vs business)
      const ownerGroup = document.createElement("div");
      ownerGroup.className = "vf-seg-bar";

      const uiBtn = document.createElement("button");
      uiBtn.type = "button";
      uiBtn.className = "vf-seg-btn" + (!isBiz ? " active" : "");
      uiBtn.dataset.stateOwnerUi = path;
      uiBtn.textContent = "界面 (ui)";
      uiBtn.title = "标注为界面自管状态 (owner: ui)";
      uiBtn.addEventListener("click", () => {
        if (!isBiz) return;
        void deps?.editLogic((doc) => {
          setStateOwnerInDoc(doc, path, "ui");
        }, `标注状态 ${path} 为 ui`);
      });

      const bizBtn = document.createElement("button");
      bizBtn.type = "button";
      bizBtn.className = "vf-seg-btn" + (isBiz ? " active" : "");
      bizBtn.dataset.stateOwnerBusiness = path;
      bizBtn.textContent = "业务 (business)";
      bizBtn.title = "标注为业务状态 (owner: business)";
      bizBtn.addEventListener("click", () => {
        if (isBiz) return;
        void deps?.editLogic((doc) => {
          setStateOwnerInDoc(doc, path, "business");
        }, `标注状态 ${path} 为 business`);
      });

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "vf-mini-btn danger";
      delBtn.dataset.stateDelete = path;
      delBtn.textContent = "×";
      delBtn.title = `删除状态 ${path}`;
      delBtn.addEventListener("click", () => {
        void deps?.editLogic((doc) => {
          removeStateLeafInDoc(doc, path);
        }, `删除状态 ${path}`);
      });

      ownerGroup.append(uiBtn, bizBtn, delBtn);
      topLine.append(infoSpan, ownerGroup);

      // 初始值编辑行
      const initLine = document.createElement("div");
      initLine.className = "vf-state-init-line";
      const initLabel = document.createElement("span");
      initLabel.textContent = "初始值：";
      const initField = document.createElement("input");
      initField.type = "text";
      initField.dataset.stateInitial = path;
      initField.value =
        leaf.type === "array" || typeof leaf.initial === "object"
          ? JSON.stringify(leaf.initial ?? [])
          : String(leaf.initial ?? "");
      initField.addEventListener("change", () => {
        const parsed = parseInitialValueByType(leaf.type, initField.value);
        if (!parsed.ok) {
          deps?.toast("初始值格式与类型不匹配");
          renderStateEditPane();
          return;
        }
        void deps?.editLogic((doc) => {
          updateStateInitialInDoc(doc, path, parsed.value);
        }, `修改状态 ${path} 初始值`);
      });
      initLine.append(initLabel, initField);

      row.append(topLine, initLine);
      listWrap.append(row);
    }
  }
  stateSec.append(listWrap);
  pane.append(stateSec);

  // 2. 业务事件（owner: business）与模拟步骤配置
  const bizSec = document.createElement("section");
  bizSec.className = "vf-edit-section";
  const bizTitle = document.createElement("div");
  bizTitle.className = "vf-sec-title";
  bizTitle.textContent = "业务事件 (owner: business)";
  bizSec.append(bizTitle);

  const bizForm = document.createElement("div");
  bizForm.className = "vf-inline-form";
  const evNameIn = document.createElement("input");
  evNameIn.type = "text";
  evNameIn.placeholder = "业务事件名（如 layerToggleVisible）";
  evNameIn.dataset.newBizeventName = "true";

  const evSimIn = document.createElement("input");
  evSimIn.type = "text";
  evSimIn.placeholder = "模拟赋值（如 layer.visible = not layer.visible）";
  evSimIn.dataset.newBizeventSim = "true";

  const addEvBtn = document.createElement("button");
  addEvBtn.type = "button";
  addEvBtn.className = "vf-mini-btn";
  addEvBtn.dataset.stateAction = "add-bizevent";
  addEvBtn.textContent = "+ 添加业务事件";
  addEvBtn.addEventListener("click", () => {
    const name = evNameIn.value.trim();
    if (!VALID_SEG_RE.test(name)) {
      deps?.toast("请输入合法的业务事件名");
      return;
    }
    const sim = evSimIn.value.trim();
    void deps?.editLogic((doc) => {
      upsertBusinessEventInDoc(doc, name, { simulateSet: sim });
    }, `添加业务事件 ${name}`);
  });
  bizForm.append(evNameIn, evSimIn, addEvBtn);
  bizSec.append(bizForm);

  const bizList = document.createElement("div");
  bizList.className = "vf-state-list";
  for (const name of Object.keys(project.logic.events ?? {})) {
    const bDef = businessEvent(project.logic, name);
    if (!bDef) continue;
    const item = document.createElement("div");
    item.className = "vf-state-row is-business";
    item.dataset.bizeventRow = name;
    const firstSim = bDef.simulate?.[0];
    const simStr = firstSim && "set" in firstSim ? firstSim.set : JSON.stringify(bDef.simulate ?? []);
    item.innerHTML = `<div class="vf-row-between"><strong>${name}</strong><span class="vf-type-tag">owner: business</span></div><div class="vf-muted-note">simulate: ${simStr}</div>`;
    bizList.append(item);
  }
  bizSec.append(bizList);
  pane.append(bizSec);

  // 3. 全局符号条件（conditions）配置
  const condSec = document.createElement("section");
  condSec.className = "vf-edit-section";
  const condTitle = document.createElement("div");
  condTitle.className = "vf-sec-title";
  condTitle.textContent = "全局条件 (conditions)";
  condSec.append(condTitle);

  const condForm = document.createElement("div");
  condForm.className = "vf-inline-form";
  const condIdIn = document.createElement("input");
  condIdIn.type = "text";
  condIdIn.placeholder = "条件名（如 canRemoveLayer）";
  condIdIn.dataset.newCondId = "true";

  const condExprIn = document.createElement("input");
  condExprIn.type = "text";
  condExprIn.placeholder = "符号表达式（expr）";
  condExprIn.dataset.newCondExpr = "true";

  const addCondBtn = document.createElement("button");
  addCondBtn.type = "button";
  addCondBtn.className = "vf-mini-btn";
  addCondBtn.dataset.stateAction = "add-condition";
  addCondBtn.textContent = "+ 添加条件";
  addCondBtn.addEventListener("click", () => {
    const id = condIdIn.value.trim();
    const expr = condExprIn.value.trim();
    if (!VALID_SEG_RE.test(id) || !expr) {
      deps?.toast("请输入合法的条件名与表达式");
      return;
    }
    void deps?.editLogic((doc) => {
      upsertGlobalConditionInDoc(doc, id, { type: "symbol", expr });
    }, `添加全局条件 ${id}`);
  });
  condForm.append(condIdIn, condExprIn, addCondBtn);
  condSec.append(condForm);

  const condList = document.createElement("div");
  condList.className = "vf-state-list";
  for (const [cid, cDef] of Object.entries(project.logic.conditions ?? {})) {
    const item = document.createElement("div");
    item.className = "vf-state-row";
    item.dataset.conditionRow = cid;
    item.innerHTML = `<div class="vf-row-between"><strong>${cid}</strong><span class="vf-type-tag">${cDef.type}</span></div><div class="vf-muted-note">${cDef.expr ?? cDef.text ?? ""}</div>`;
    condList.append(item);
  }
  condSec.append(condList);
  pane.append(condSec);
}
