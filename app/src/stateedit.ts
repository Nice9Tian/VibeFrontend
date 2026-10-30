// 状态归属（owner: ui | business）标注、状态变量增删改与业务事件编辑：
// 1) 列出 logic/app.logic.yaml 中的全部状态叶子节点，支持一键切换 owner: ui（界面自管）或 owner: business（业务管）；
// 2) 支持可视化新增、修改初始值和删除状态变量（string / number / boolean / enum / array）；
// 3) 支持添加或编辑业务事件（owner: business 及 simulate 模拟步骤）；
// 4) 所有修改通过 editLogic 保留 YAML 注释格式并计入撤销/重做历史。
import { isMap, isSeq, parseDocument, type Document } from "yaml";
import { parseAssignment, parseExpr, pathsIn, type Value } from "./expr.ts";
import {
  allStateLeaves,
  businessEvent,
  findCondition,
  findStateLeaf,
  isBusinessState,
  isNameTakenAcrossTables,
  isValidIdentifier,
  requestEvent,
  type ConditionDef,
  type Logic,
  type Project,
  type Scene,
  type StateLeaf,
  type Step,
} from "./model.ts";

const YAML_OUTPUT = { lineWidth: 0 };

function ensureBlockStyle(node: unknown): void {
  if (isMap(node)) {
    node.flow = false;
    for (const pair of node.items) {
      ensureBlockStyle(pair.value);
    }
  } else if (isSeq(node)) {
    node.flow = false;
    for (const item of node.items) {
      ensureBlockStyle(item);
    }
  }
}

function docToLogic(doc: Document): Logic {
  try {
    return (doc.toJS() as Logic | null) ?? {};
  } catch {
    return {};
  }
}

/**
 * 状态路径必须至少包含两段（<分组>.<状态名>），且每段都是合法的非保留字标识符。
 */
export function isValidStatePath(statePath: string): boolean {
  const parts = statePath.trim().split(".");
  return parts.length >= 2 && parts.every((seg) => isValidIdentifier(seg));
}

function collectStepTargets(steps: Step[] | undefined, out: string[] = []): string[] {
  if (!Array.isArray(steps)) return out;
  for (const step of steps) {
    if (!step || typeof step !== "object") continue;
    if ("set" in step && typeof step.set === "string") {
      try {
        const parsed = parseAssignment(step.set);
        out.push(parsed.target);
      } catch {
        // 语法错误由专门校验处理
      }
    } else if ("push" in step) {
      const to = typeof step.push === "string" ? step.push : step.push?.to;
      if (typeof to === "string" && to) out.push(to);
    } else if ("remove" in step) {
      const from = typeof step.remove === "string" ? step.remove : step.remove?.from;
      if (typeof from === "string" && from) out.push(from);
    } else if ("move" in step) {
      const target = typeof step.move === "string" ? step.move : step.move?.in;
      if (typeof target === "string" && target) out.push(target);
    } else if ("if" in step) {
      collectStepTargets(step.then, out);
      collectStepTargets(step.else, out);
    }
  }
  return out;
}

/**
 * 校验将状态 statePath 切换为 nextOwner 是否与当前逻辑中的 bind、普通事件步骤或业务事件 simulate 冲突。
 * 若合法返回 null，否则返回人类可读的冲突原因。
 */
export function validateStateOwnerChange(
  logic: Logic,
  statePath: string,
  nextOwner: "ui" | "business",
): string | null {
  if (nextOwner === "business") {
    for (const [objId, obj] of Object.entries(logic.objects ?? {})) {
      if (!obj) continue;
      if (obj.bind === statePath) {
        return `状态“${statePath}”已被控件“${objId}”绑定（bind），不能改为业务管`;
      }
      for (const [evName, steps] of Object.entries(obj.events ?? {})) {
        if (collectStepTargets(steps).includes(statePath)) {
          return `状态“${statePath}”在控件“${objId}”的 ${evName} 事件中被直接修改，不能改为业务管`;
        }
      }
    }
    for (const [evName, def] of Object.entries(logic.events ?? {})) {
      if (Array.isArray(def)) {
        if (collectStepTargets(def).includes(statePath)) {
          return `状态“${statePath}”在全局事件“${evName}”中被直接修改，不能改为业务管`;
        }
      } else if (def && typeof def === "object" && def.owner === "ui") {
        const rDef = requestEvent(logic, evName);
        if (rDef && collectStepTargets(rDef.steps).includes(statePath)) {
          return `状态“${statePath}”在请求事件“${evName}”中被直接修改，不能改为业务管`;
        }
      }
    }
    for (const [actName, act] of Object.entries(logic.actions ?? {})) {
      if (!act) continue;
      if (
        collectStepTargets(act.onSuccess).includes(statePath) ||
        collectStepTargets(act.onError).includes(statePath)
      ) {
        return `状态“${statePath}”在动作“${actName}”的回调中被直接修改，不能改为业务管`;
      }
    }
  } else {
    for (const [evName] of Object.entries(logic.events ?? {})) {
      const bDef = businessEvent(logic, evName);
      if (bDef && collectStepTargets(bDef.simulate).includes(statePath)) {
        return `状态“${statePath}”在业务事件“${evName}”的模拟步骤（simulate）中被修改，不能改为界面自管`;
      }
    }
  }
  return null;
}

/**
 * 校验业务事件的 simulate 步骤是否合法：目标状态必须存在且归属为 business。
 */
export function validateSimulateSteps(logic: Logic, steps: Step[]): string | null {
  for (const step of steps) {
    if ("set" in step) {
      let parsed: ReturnType<typeof parseAssignment>;
      try {
        parsed = parseAssignment(step.set);
      } catch (e) {
        return `模拟赋值语法无效：${(e as Error).message}`;
      }
      const leaf = findStateLeaf(logic, parsed.target);
      if (!leaf) {
        return `模拟步骤的目标“${parsed.target}”不是已知状态路径`;
      }
      if (!isBusinessState(leaf)) {
        return `模拟步骤只能修改业务管（owner: business）的状态，“${parsed.target}”是界面自管状态`;
      }
      if (parsed.index !== undefined && leaf.type !== "array") {
        return `模拟步骤的目标“${parsed.target}”不是数组状态（type: array）`;
      }
    } else {
      for (const target of collectStepTargets([step])) {
        const leaf = findStateLeaf(logic, target);
        if (!leaf) {
          return `模拟步骤的目标“${target}”不是已知状态路径`;
        }
        if (!isBusinessState(leaf)) {
          return `模拟步骤只能修改业务管（owner: business）的状态，“${target}”是界面自管状态`;
        }
      }
    }
  }
  return null;
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
  if (!isMap(node) || typeof node.get("type") !== "string") return false;
  const logic = docToLogic(doc);
  if (validateStateOwnerChange(logic, statePath.trim(), owner) !== null) {
    return false;
  }
  if (isMap(doc.contents)) doc.contents.flow = false;
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
  scene?: Scene,
): boolean {
  if (!isValidStatePath(statePath)) return false;
  const parts = statePath.trim().split(".");
  const rootSeg = parts[0]!;
  const logic = docToLogic(doc);

  // 检查状态根名是否与控件 ID、菜单/菜单项 ID、全局条件名或 objects 键冲突
  if (isNameTakenAcrossTables(rootSeg, { scene, logic, allowStateRoot: true })) {
    return false;
  }
  if (logic.objects && rootSeg in logic.objects) {
    return false;
  }

  if (isMap(doc.contents)) doc.contents.flow = false;
  let stateRoot = doc.get("state");
  if (!isMap(stateRoot)) {
    const created = doc.createNode({});
    ensureBlockStyle(created);
    doc.set("state", created);
    stateRoot = doc.get("state");
  }
  if (isMap(stateRoot)) stateRoot.flow = false;

  // 检查中间路径是否穿过已有叶子节点
  for (let i = 1; i < parts.length; i++) {
    const prefix = ["state", ...parts.slice(0, i)];
    const prefixNode = doc.getIn(prefix);
    if (isMap(prefixNode)) {
      if (typeof prefixNode.get("type") === "string") {
        // 已是状态叶子，不能再作为父级分组写入子路径
        return false;
      }
      prefixNode.flow = false;
    } else if (prefixNode !== undefined && prefixNode !== null) {
      return false;
    }
  }

  // 检查目标路径是否已经是非叶子的状态分组，或更新已有叶子时违反归属约束
  const existing = doc.getIn(["state", ...parts]);
  if (isMap(existing)) {
    if (typeof existing.get("type") !== "string") {
      return false;
    }
    const nextOwner = spec.owner === "business" ? "business" : "ui";
    if (validateStateOwnerChange(logic, statePath.trim(), nextOwner) !== null) {
      return false;
    }
  }

  for (let i = 1; i < parts.length; i++) {
    const prefix = ["state", ...parts.slice(0, i)];
    if (!isMap(doc.getIn(prefix))) {
      const groupNode = doc.createNode({});
      ensureBlockStyle(groupNode);
      doc.setIn(prefix, groupNode);
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

  const leafNode = doc.createNode(leafObj);
  ensureBlockStyle(leafNode);
  doc.setIn(["state", ...parts], leafNode);
  return true;
}

/**
 * 修改已有状态叶子节点的 initial 初始值。
 */
export function updateStateInitialInDoc(doc: Document, statePath: string, initial: Value): boolean {
  if (!isValidStatePath(statePath)) return false;
  const parts = statePath.trim().split(".");
  const node = doc.getIn(["state", ...parts]);
  if (!isMap(node) || typeof node.get("type") !== "string") return false;
  if (isMap(doc.contents)) doc.contents.flow = false;
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
  if (isMap(doc.contents)) doc.contents.flow = false;
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
  if (!isValidIdentifier(clean)) return false;
  const steps: Step[] =
    spec.simulateSteps ??
    (spec.simulateSet?.trim() ? [{ set: spec.simulateSet.trim() }] : []);
  const logic = docToLogic(doc);
  if (validateSimulateSteps(logic, steps) !== null) {
    return false;
  }

  if (isMap(doc.contents)) doc.contents.flow = false;
  let eventsMap = doc.get("events");
  if (!isMap(eventsMap)) {
    const created = doc.createNode({});
    ensureBlockStyle(created);
    doc.set("events", created);
    eventsMap = doc.get("events");
  }
  if (isMap(eventsMap)) eventsMap.flow = false;

  const evObj: Record<string, unknown> = {
    owner: "business",
  };
  if (spec.text?.trim()) evObj.text = spec.text.trim();
  if (steps.length > 0) evObj.simulate = steps;
  const evNode = doc.createNode(evObj);
  ensureBlockStyle(evNode);
  doc.setIn(["events", clean], evNode);
  return true;
}

/**
 * 在 YAML Document 中新增或更新一个全局条件。
 */
export function upsertGlobalConditionInDoc(
  doc: Document,
  condId: string,
  spec: ConditionDef,
  scene?: Scene,
): boolean {
  const clean = condId.trim();
  if (!isValidIdentifier(clean)) return false;
  const logic = docToLogic(doc);
  if (isNameTakenAcrossTables(clean, { scene, logic, allowCondition: true })) {
    // 若与 state 根名、scene 节点或菜单/菜单项冲突则拒绝（允许更新同名已有条件）
    return false;
  }
  if (logic.state && clean in logic.state) return false;
  if (logic.objects && clean in logic.objects) return false;

  if (spec.type === "symbol") {
    if (!spec.expr?.trim()) return false;
    try {
      const ast = parseExpr(spec.expr);
      for (const p of pathsIn(ast)) {
        const known =
          Boolean(findStateLeaf(logic, p)) ||
          Boolean(findCondition(logic, p)) ||
          (p.endsWith(".length") && Boolean(findStateLeaf(logic, p.slice(0, -".length".length))));
        if (!known) return false;
      }
    } catch {
      return false;
    }
  }

  if (isMap(doc.contents)) doc.contents.flow = false;
  let condMap = doc.get("conditions");
  if (!isMap(condMap)) {
    const created = doc.createNode({});
    ensureBlockStyle(created);
    doc.set("conditions", created);
    condMap = doc.get("conditions");
  }
  if (isMap(condMap)) condMap.flow = false;

  const condNode = doc.createNode(spec);
  ensureBlockStyle(condNode);
  doc.setIn(["conditions", clean], condNode);
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
      deps?.toast("状态路径格式无效（需为 分组.名称，如 layer.visible）");
      return;
    }
    const rootSeg = path.split(".")[0]!;
    if (isNameTakenAcrossTables(rootSeg, { scene: project.scene, logic: project.logic, allowStateRoot: true })) {
      deps?.toast(`状态分组名“${rootSeg}”已与控件、菜单或全局条件重名`);
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
    let applied = false;
    void deps
      ?.editLogic((doc) => {
        applied = upsertStateLeafInDoc(
          doc,
          path,
          {
            type: sType,
            initial: parsed.value,
            owner: sOwner,
          },
          project.scene,
        );
      }, `添加状态 ${path}`)
      .then(() => {
        if (!applied) {
          deps?.toast(`状态路径“${path}”与已有状态叶子或分组冲突，或归属切换被已有逻辑阻止`);
        }
      });
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
        const err = validateStateOwnerChange(project.logic, path, "ui");
        if (err) {
          deps?.toast(err);
          return;
        }
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
        const err = validateStateOwnerChange(project.logic, path, "business");
        if (err) {
          deps?.toast(err);
          return;
        }
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
    if (!isValidIdentifier(name)) {
      deps?.toast("请输入合法的业务事件名");
      return;
    }
    const sim = evSimIn.value.trim();
    const steps: Step[] = sim ? [{ set: sim }] : [];
    const simErr = validateSimulateSteps(project.logic, steps);
    if (simErr) {
      deps?.toast(simErr);
      return;
    }
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

    const headRow = document.createElement("div");
    headRow.className = "vf-row-between";
    const nameStrong = document.createElement("strong");
    nameStrong.textContent = name;
    const tagSpan = document.createElement("span");
    tagSpan.className = "vf-type-tag";
    tagSpan.textContent = "owner: business";
    headRow.append(nameStrong, tagSpan);

    const simNote = document.createElement("div");
    simNote.className = "vf-muted-note";
    simNote.textContent = `simulate: ${simStr}`;
    item.append(headRow, simNote);
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
    if (!isValidIdentifier(id) || !expr) {
      deps?.toast("请输入合法的条件名与表达式");
      return;
    }
    if (isNameTakenAcrossTables(id, { scene: project.scene, logic: project.logic, allowCondition: true })) {
      deps?.toast(`条件名“${id}”已与控件、菜单或状态分组重名`);
      return;
    }
    let applied = false;
    void deps
      ?.editLogic((doc) => {
        applied = upsertGlobalConditionInDoc(doc, id, { type: "symbol", expr }, project.scene);
      }, `添加全局条件 ${id}`)
      .then(() => {
        if (!applied) {
          deps?.toast(`条件“${id}”名称冲突或表达式引用了未知的状态路径`);
        }
      });
  });
  condForm.append(condIdIn, condExprIn, addCondBtn);
  condSec.append(condForm);

  const condList = document.createElement("div");
  condList.className = "vf-state-list";
  for (const [cid, cDef] of Object.entries(project.logic.conditions ?? {})) {
    const item = document.createElement("div");
    item.className = "vf-state-row";
    item.dataset.conditionRow = cid;

    const headRow = document.createElement("div");
    headRow.className = "vf-row-between";
    const idStrong = document.createElement("strong");
    idStrong.textContent = cid;
    const typeSpan = document.createElement("span");
    typeSpan.className = "vf-type-tag";
    typeSpan.textContent = cDef.type;
    headRow.append(idStrong, typeSpan);

    const exprNote = document.createElement("div");
    exprNote.className = "vf-muted-note";
    exprNote.textContent = cDef.expr ?? cDef.text ?? "";
    item.append(headRow, exprNote);
    condList.append(item);
  }
  condSec.append(condList);
  pane.append(condSec);
}
