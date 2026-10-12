// 编辑器界面：素材栏、图层、设计窗口（编辑模式 / 预览模式）、文档与 YAML 页签、问题栏。
import { isMap, parseDocument, type Document } from "yaml";
import { watchProject, writeText } from "./fs";
import {
  appendSection,
  BUILTIN_TYPES,
  CONTAINER_DECL,
  declFor,
  EXTERNAL_DECL,
  getSection,
  loadProject,
  LOGIC_PATH,
  MOUSE_EVENTS,
  parseDocRef,
  replaceSection,
  SCENE_PATH,
  sectionNameFor,
  sectionOffsets,
  type ComponentInstance,
  type Project,
  type SceneNode,
} from "./project";
import {
  componentReference,
  controlReference,
  docSectionRange,
  fileReference,
  lineAt,
  linesReference,
  logicEntryRange,
  logicPathAt,
  problemReference,
  projectReference,
  selectionRange,
} from "./refs";
import { Runtime, type LogEntry } from "./runtime";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let project: Project;
let mode: "edit" | "preview" = "edit";
let selectedId: string | null = null;
/** 编辑模式用：只用来算出初始状态下各控件的样子 */
let designRuntime: Runtime;
/** 预览模式用：第一次进入预览时创建，之后一直保留状态 */
let previewRuntime: Runtime | null = null;

interface Mounted {
  wrapper: HTMLElement;
  body: HTMLElement;
  instance?: ComponentInstance;
  /** 预览模式下当前是不是显示着；undefined 表示还没有摆过 */
  shown?: boolean;
  /** 每次显示或隐藏加一，用来丢弃被打断的过渡 */
  generation: number;
}
const mounted = new Map<string, Mounted>();
const log: LogEntry[] = [];
/** 工具改写 YAML 时不自动折行，避免把长表达式拆成两行 */
const YAML_OUTPUT = { lineWidth: 0 };

// ---------- 小工具 ----------

let toastTimer: number | undefined;
function toast(message: string): void {
  const el = $("toast");
  el.textContent = message;
  el.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), 2200);
}

function node(id: string): SceneNode | undefined {
  return project.scene.nodes[id];
}

function parentOf(id: string): string | null {
  for (const [parentId, parent] of Object.entries(project.scene.nodes)) {
    if (parent.children?.includes(id)) return parentId;
  }
  return null;
}

/** 节点相对于设计窗口左上角的位置。根窗口在 (0, 0)。 */
function absRect(id: string): { x: number; y: number; width: number; height: number } {
  const n = node(id)!;
  let x = 0;
  let y = 0;
  for (let cursor: string | null = id; cursor && cursor !== project.scene.root; cursor = parentOf(cursor)) {
    x += node(cursor)?.x ?? 0;
    y += node(cursor)?.y ?? 0;
  }
  return { x, y, width: n.width, height: n.height };
}

/** 找出某个点下面最上层、最深的节点；只点到窗口空白处时返回 null。 */
function hitTest(px: number, py: number): string | null {
  const visit = (id: string): string | null => {
    const children = node(id)?.children ?? [];
    for (let i = children.length - 1; i >= 0; i--) {
      const hit = visit(children[i]);
      if (hit) return hit;
    }
    if (id === project.scene.root) return null;
    const r = absRect(id);
    return px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height ? id : null;
  };
  return visit(project.scene.root);
}

function canHoldChildren(id: string): boolean {
  const n = node(id);
  return n ? n.type === "Window" || declFor(project, n.type)?.children === true : false;
}

// ---------- 写文件 ----------

async function saveScene(): Promise<void> {
  await writeText(SCENE_PATH, JSON.stringify(project.scene, null, 2) + "\n");
  await reload();
}

/** 用保留注释和格式的方式修改 YAML。 */
async function editLogic(mutate: (doc: Document) => void): Promise<boolean> {
  const doc = parseDocument(project.logicText);
  if (doc.errors.length > 0) {
    toast("YAML 有语法错误，请先在 YAML 页签中修正");
    return false;
  }
  mutate(doc);
  yamlDirty = false;
  await writeText(LOGIC_PATH, doc.toString(YAML_OUTPUT));
  await reload();
  return true;
}

function ensureObject(doc: Document, id: string): void {
  if (!isMap(doc.getIn(["objects", id]))) doc.setIn(["objects", id], doc.createNode({}));
}

let loading = false;
let reloadAgain = false;
async function reload(): Promise<void> {
  if (loading) {
    reloadAgain = true;
    return;
  }
  loading = true;
  try {
    do {
      reloadAgain = false;
      const next = await loadProject(project);
      if (next.signature === project.signature) continue;
      project = next;
      designRuntime = new Runtime(project);
      previewRuntime?.adopt(project);
      if (selectedId && !node(selectedId)) selectedId = null;
      renderAll();
    } while (reloadAgain);
  } catch (e) {
    toast(`加载项目失败：${(e as Error).message}`);
  } finally {
    loading = false;
  }
}

// ---------- 设计窗口 ----------

function activeRuntime(): Runtime {
  return mode === "preview" && previewRuntime ? previewRuntime : designRuntime;
}

function showNodeError(body: HTMLElement, message: string): void {
  body.innerHTML = "";
  const box = document.createElement("div");
  box.className = "vf-error";
  box.textContent = message;
  body.append(box);
}

function buildNode(id: string, parentEl: HTMLElement): void {
  const n = node(id);
  if (!n) return;
  const wrapper = document.createElement("div");
  wrapper.className = "vf-node";
  wrapper.dataset.vfId = id;
  wrapper.dataset.vfType = n.type;
  Object.assign(wrapper.style, {
    left: `${n.x ?? 0}px`,
    top: `${n.y ?? 0}px`,
    width: `${n.width}px`,
    height: `${n.height}px`,
  });
  const body = document.createElement("div");
  body.className = "vf-body";
  wrapper.append(body);
  parentEl.append(wrapper);
  const entry: Mounted = { wrapper, body, generation: 0 };
  mounted.set(id, entry);

  if (n.type === "Container") {
    // 未转换的容器：没有子节点时显示自己的 ID，作为占位
    if (!n.children?.length) body.textContent = id;
  } else if (n.type === "External") {
    // 外部容器：工具里只是占位，导出后由业务把自己的控件放进来
    body.textContent = `外部容器 ${id}\n导出后由业务放入控件`;
  } else {
    const component = project.components.get(n.type);
    if (!component?.create) {
      showNodeError(body, component?.error ?? `找不到控件 ${n.type}`);
    } else {
      try {
        entry.instance = component.create(body, {
          props: activeRuntime().view(id).props,
          emit: (event, value) => {
            if (mode === "preview") previewRuntime?.dispatch(id, event, value);
          },
          mode: mode === "preview" ? "preview" : "design",
        });
      } catch (e) {
        showNodeError(body, `${n.type} 运行出错：${(e as Error).message}`);
      }
    }
  }

  // 每个节点都自动获得基础鼠标事件，不需要控件自己声明
  for (const name of MOUSE_EVENTS) {
    wrapper.addEventListener(name, (e) => {
      if (mode !== "preview" || !previewRuntime) return;
      const bubbles = name !== "mouseenter" && name !== "mouseleave";
      // 会冒泡的事件只交给最里面的那个节点，避免点按钮时外层容器也收到点击
      if (bubbles && (e.target as Element).closest(".vf-node") !== wrapper) return;
      // 按住 Alt 点击是“选中这个控件”，不交给逻辑；移入移出照常处理，免得悬停状态对不上
      if (bubbles && (e as MouseEvent).altKey) {
        if (name === "click") {
          select(id);
          showRightTab("doc");
        }
        return;
      }
      previewRuntime.dispatch(id, name);
    });
  }

  for (const child of n.children ?? []) buildNode(child, wrapper);
}

/**
 * 预览模式下显示或隐藏一个节点。节点的 visible 指定了效果时播放它：
 * 显示是先显示再播放，隐藏是播放完再隐藏；中途又变了，旧的那次作废。
 */
function setShown(id: string, entry: Mounted, shown: boolean): void {
  if (entry.shown === shown) return;
  const first = entry.shown === undefined;
  entry.shown = shown;
  const generation = ++entry.generation;
  const effectName = project.logic.objects?.[id]?.effects?.visible;
  const play = effectName ? project.effects.get(effectName)?.play : undefined;
  const finish = () => {
    if (entry.generation === generation) entry.wrapper.style.display = shown ? "" : "none";
  };
  // 刚摆出来时直接到位，不播放
  if (first || !play) return finish();
  entry.wrapper.style.display = "";
  try {
    const result = play(entry.wrapper, { showing: shown });
    const done = result && "finished" in result ? result.finished : result;
    Promise.resolve(done).then(finish, finish);
  } catch (e) {
    toast(`效果 ${effectName} 运行出错：${(e as Error).message}`);
    finish();
  }
}

/** 按当前运行层的计算结果更新每个节点的可见性和属性。 */
function applyViews(): void {
  const runtime = activeRuntime();
  for (const [id, entry] of mounted) {
    const view = runtime.view(id);
    if (mode === "preview") {
      setShown(id, entry, view.visible);
      entry.wrapper.classList.remove("vf-ghost");
    } else {
      entry.wrapper.style.display = "";
      entry.wrapper.classList.toggle("vf-ghost", !view.visible);
    }
    entry.wrapper.toggleAttribute("data-vf-disabled", !view.enabled);
    try {
      entry.instance?.update(view.props);
    } catch (e) {
      entry.instance = undefined;
      showNodeError(entry.body, `运行出错：${(e as Error).message}`);
    }
  }
}

function renderStage(): void {
  for (const entry of mounted.values()) {
    try {
      entry.instance?.destroy();
    } catch {
      // 控件的清理出错不影响重建
    }
  }
  mounted.clear();

  const root = node(project.scene.root);
  const stage = $("stage");
  stage.innerHTML = "";
  if (!root) return;
  stage.style.width = `${root.width}px`;
  stage.style.height = `${root.height}px`;
  $("stage-title").textContent = (root.title ?? project.scene.root) + (mode === "preview" ? "　·　预览中" : "");
  $("window-size").textContent = `窗口 ${root.width}×${root.height}`;

  for (const child of root.children ?? []) buildNode(child, stage);
  applyViews();
  if (mode === "edit") {
    stage.append(overlay);
    updateSelectionBox();
  }
}

// ---------- 编辑层 ----------

const overlay = document.createElement("div");
overlay.id = "overlay";
const selectionBox = document.createElement("div");
selectionBox.id = "selection";
const selectionTag = document.createElement("div");
selectionTag.className = "tag";
selectionBox.append(selectionTag);
const HANDLES: Record<string, [number, number]> = {
  nw: [0, 0], n: [50, 0], ne: [100, 0], e: [100, 50],
  se: [100, 100], s: [50, 100], sw: [0, 100], w: [0, 50],
};
for (const [name, [left, top]] of Object.entries(HANDLES)) {
  const handle = document.createElement("div");
  handle.className = "handle";
  handle.dataset.handle = name;
  handle.style.left = `${left}%`;
  handle.style.top = `${top}%`;
  handle.style.cursor = `${name}-resize`;
  selectionBox.append(handle);
}
overlay.append(selectionBox);

function updateSelectionBox(): void {
  const n = selectedId ? node(selectedId) : undefined;
  if (!selectedId || !n) {
    selectionBox.style.display = "none";
    return;
  }
  const r = absRect(selectedId);
  const isRoot = selectedId === project.scene.root;
  Object.assign(selectionBox.style, {
    display: "",
    left: `${r.x}px`,
    top: `${r.y}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
  });
  selectionTag.textContent = `${selectedId} · ${n.type}`;
  selectionTag.style.display = isRoot ? "none" : "";
  // 根窗口只能从右边和下边调整尺寸
  for (const handle of selectionBox.querySelectorAll<HTMLElement>(".handle")) {
    handle.style.display = !isRoot || ["e", "s", "se"].includes(handle.dataset.handle!) ? "" : "none";
  }
}

function stagePoint(e: MouseEvent): { x: number; y: number } {
  const rect = $("stage").getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

interface Drag {
  id: string;
  handle: string | null;
  startX: number;
  startY: number;
  orig: { x: number; y: number; width: number; height: number };
  moved: boolean;
}
let drag: Drag | null = null;
const MIN_SIZE = 8;

overlay.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  hideMenu();
  const handle = (e.target as HTMLElement).dataset.handle ?? null;
  let id = selectedId;
  if (!handle) {
    const pt = stagePoint(e);
    id = hitTest(pt.x, pt.y);
    select(id);
  }
  const n = id ? node(id) : undefined;
  if (!id || !n || (!handle && id === project.scene.root)) return;
  drag = {
    id,
    handle,
    startX: e.clientX,
    startY: e.clientY,
    orig: { x: n.x ?? 0, y: n.y ?? 0, width: n.width, height: n.height },
    moved: false,
  };
  overlay.setPointerCapture(e.pointerId);
});

overlay.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const n = node(drag.id);
  if (!n) return;
  const dx = Math.round(e.clientX - drag.startX);
  const dy = Math.round(e.clientY - drag.startY);
  if (dx === 0 && dy === 0 && !drag.moved) return;
  drag.moved = true;
  const { orig, handle } = drag;
  if (!handle) {
    n.x = orig.x + dx;
    n.y = orig.y + dy;
  } else {
    if (handle.includes("e")) n.width = Math.max(MIN_SIZE, orig.width + dx);
    if (handle.includes("s")) n.height = Math.max(MIN_SIZE, orig.height + dy);
    if (handle.includes("w")) {
      n.width = Math.max(MIN_SIZE, orig.width - dx);
      n.x = orig.x + orig.width - n.width;
    }
    if (handle.includes("n")) {
      n.height = Math.max(MIN_SIZE, orig.height - dy);
      n.y = orig.y + orig.height - n.height;
    }
  }
  if (drag.id === project.scene.root) {
    $("stage").style.width = `${n.width}px`;
    $("stage").style.height = `${n.height}px`;
  } else {
    const wrapper = mounted.get(drag.id)?.wrapper;
    if (wrapper) {
      Object.assign(wrapper.style, { left: `${n.x}px`, top: `${n.y}px`, width: `${n.width}px`, height: `${n.height}px` });
    }
  }
  updateSelectionBox();
});

overlay.addEventListener("pointerup", () => {
  const finished = drag;
  drag = null;
  if (finished?.moved) void saveScene();
});

overlay.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  const pt = stagePoint(e);
  const id = hitTest(pt.x, pt.y);
  select(id);
  if (id) showMenu(e.clientX, e.clientY, id);
});

document.addEventListener("keydown", (e) => {
  const target = e.target as HTMLElement;
  if (mode !== "edit" || target.matches("input, textarea") || !selectedId || selectedId === project.scene.root) return;
  const n = node(selectedId);
  if (!n) return;
  const step = e.shiftKey ? 10 : 1;
  const moves: Record<string, [number, number]> = {
    ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
  };
  if (e.key === "Delete") {
    e.preventDefault();
    void deleteNode(selectedId);
  } else if (moves[e.key]) {
    e.preventDefault();
    n.x = (n.x ?? 0) + moves[e.key][0];
    n.y = (n.y ?? 0) + moves[e.key][1];
    void saveScene();
  }
});

// 预览模式下，设计窗口里的任何点击都会再触发一次全局事件 window.click
$("stage").addEventListener("click", (e) => {
  if (mode === "preview" && !e.altKey) previewRuntime?.dispatch(null, "window.click");
});

// ---------- 对节点的操作 ----------

function newId(type: string): string {
  const base = type === "Container" ? "box" : type === "External" ? "host" : type.charAt(0).toLowerCase() + type.slice(1);
  const taken = new Set([
    ...Object.keys(project.scene.nodes),
    ...Object.keys(project.logic.state ?? {}),
    ...Object.keys(project.logic.conditions ?? {}),
  ]);
  for (let i = 1; ; i++) {
    if (!taken.has(`${base}${i}`)) return `${base}${i}`;
  }
}

async function addNode(type: string, px: number, py: number): Promise<void> {
  const decl = declFor(project, type) ?? CONTAINER_DECL;
  const size = decl.defaultSize ?? CONTAINER_DECL.defaultSize!;
  // 落点在能放子节点的控件里，就放进去；否则放在窗口里
  let parentId = project.scene.root;
  for (let hit = hitTest(px, py); hit; hit = parentOf(hit)) {
    if (canHoldChildren(hit)) {
      parentId = hit;
      break;
    }
  }
  const parentRect = absRect(parentId);
  const id = newId(type);
  const created: SceneNode = {
    type,
    x: Math.round(px - parentRect.x - size.width / 2),
    y: Math.round(py - parentRect.y - size.height / 2),
    width: size.width,
    height: size.height,
  };
  if (decl.children) created.children = [];
  project.scene.nodes[id] = created;
  (project.scene.nodes[parentId].children ??= []).push(id);
  selectedId = id;
  await saveScene();
}

async function deleteNode(id: string): Promise<void> {
  const parentId = parentOf(id);
  if (!parentId) return;
  const parent = node(parentId)!;
  parent.children = parent.children!.filter((child) => child !== id);
  const remove = (target: string) => {
    for (const child of node(target)?.children ?? []) remove(child);
    delete project.scene.nodes[target];
  };
  remove(id);
  selectedId = null;
  await saveScene();
}

async function reorder(id: string, toFront: boolean): Promise<void> {
  const parentId = parentOf(id);
  if (!parentId) return;
  const parent = node(parentId)!;
  const rest = parent.children!.filter((child) => child !== id);
  parent.children = toFront ? [...rest, id] : [id, ...rest];
  await saveScene();
}

async function revertToContainer(id: string): Promise<void> {
  const n = node(id);
  if (!n) return;
  n.type = "Container";
  delete n.props;
  n.children ??= [];
  await saveScene();
}

async function renameId(oldId: string, nextId: string): Promise<void> {
  if (nextId === oldId) return;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(nextId)) return toast("ID 只能用字母、数字和下划线，且不能以数字开头");
  if (node(nextId) || project.logic.state?.[nextId] !== undefined || project.logic.conditions?.[nextId]) {
    return toast(`“${nextId}”已经被别的控件、状态或条件使用`);
  }
  const doc = parseDocument(project.logicText);
  if (doc.errors.length > 0) return toast("YAML 有语法错误，请先修正再重命名");

  // 逻辑：改条目的键名，再把表达式里“旧 ID.条件名”的引用一起改掉
  const objects = doc.get("objects");
  if (isMap(objects)) {
    for (const pair of objects.items) {
      const key = pair.key as { value?: unknown };
      if (key.value === oldId) key.value = nextId;
    }
  }
  const escaped = oldId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const logicText = doc.toString(YAML_OUTPUT).replace(new RegExp(`(?<![\\w.])${escaped}\\.(?=[A-Za-z_])`, "g"), `${nextId}.`);

  const scene = project.scene;
  scene.nodes[nextId] = scene.nodes[oldId];
  delete scene.nodes[oldId];
  for (const n of Object.values(scene.nodes)) {
    if (n.children) n.children = n.children.map((child) => (child === oldId ? nextId : child));
  }
  if (scene.root === oldId) scene.root = nextId;
  selectedId = nextId;
  yamlDirty = false;
  await writeText(LOGIC_PATH, logicText);
  await saveScene();
}

async function createDocSection(id: string): Promise<void> {
  const name = sectionNameFor(id);
  const path = project.pageDoc;
  const current = project.docs.get(path) ?? `# ${project.name}\n`;
  if (getSection(current, name) === null) await writeText(path, appendSection(current, name, id));
  await editLogic((doc) => {
    ensureObject(doc, id);
    doc.setIn(["objects", id, "doc"], `${path}#${name}`);
  });
}

async function addCondition(id: string): Promise<void> {
  const existing = project.logic.objects?.[id]?.conditions ?? {};
  let name = "cond1";
  for (let i = 1; existing[name]; i++) name = `cond${i + 1}`;
  const ok = await editLogic((doc) => {
    ensureObject(doc, id);
    doc.setIn(["objects", id, "conditions", name], doc.createNode({ type: "text", text: "在这里写一句话", preview: false }));
  });
  if (ok) {
    showRightTab("yaml");
    scrollYamlTo(`${name}:`);
  }
}

/** 把一段引用放进剪贴板。 */
async function copyReference(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const helper = document.createElement("textarea");
    helper.value = text;
    document.body.append(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
  }
  toast("已复制引用，可以贴给 Agent");
}

// ---------- 右键菜单 ----------

function hideMenu(): void {
  $("menu").hidden = true;
}

type MenuItem = { label: string; action: () => void } | "separator";

function openMenu(x: number, y: number, items: MenuItem[]): void {
  const menu = $("menu");
  menu.innerHTML = "";
  for (const item of items) {
    if (item === "separator") {
      menu.append(document.createElement("hr"));
      continue;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = item.label;
    button.addEventListener("click", () => {
      hideMenu();
      item.action();
    });
    menu.append(button);
  }
  menu.hidden = false;
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, window.innerWidth - rect.width - 8)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - rect.height - 8)}px`;
}

/** 控件的右键菜单，画布和图层共用。 */
function showMenu(x: number, y: number, id: string): void {
  const items: MenuItem[] = [{ label: "复制引用", action: () => void copyReference(controlReference(project, id)) }];
  if (id !== project.scene.root) {
    items.push(
      "separator",
      { label: "打开说明", action: () => showRightTab("doc") },
      { label: "编辑逻辑", action: () => showRightTab("yaml") },
      { label: "添加条件", action: () => void addCondition(id) },
      "separator",
    );
    if (node(id)?.type !== "Container") items.push({ label: "还原为容器", action: () => void revertToContainer(id) });
    items.push(
      { label: "置于顶层", action: () => void reorder(id, true) },
      { label: "置于底层", action: () => void reorder(id, false) },
      { label: "删除", action: () => void deleteNode(id) },
    );
  }
  openMenu(x, y, items);
}

document.addEventListener("pointerdown", (e) => {
  if (!(e.target as Element).closest("#menu")) hideMenu();
});

// ---------- 素材栏与图层 ----------

function renderPalette(): void {
  const make = (type: string, label: string, title: string) => {
    const el = document.createElement("div");
    el.className = "palette-item";
    el.textContent = label;
    el.title = title;
    el.addEventListener("pointerdown", (e) => startPaletteDrag(e, type));
    if (!BUILTIN_TYPES.includes(type)) {
      el.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        openMenu(e.clientX, e.clientY, [
          { label: "复制引用", action: () => void copyReference(componentReference(project, type)) },
        ]);
      });
    }
    return el;
  };
  $("palette-basic").replaceChildren(
    make("Container", "□ 容器", "拖进设计窗口，再交给 Agent 做成具体控件"),
    make("External", "⧉ 外部容器", EXTERNAL_DECL.description ?? ""),
  );
  const items = [...project.components.values()]
    .filter((component) => !component.error)
    .map((component) => make(component.decl.type, component.decl.label ?? component.decl.type, component.decl.description ?? ""));
  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "palette-empty";
    empty.textContent = "Agent 做好的控件会出现在这里";
    items.push(empty);
  }
  $("palette-project").replaceChildren(...items);
}

function startPaletteDrag(down: PointerEvent, type: string): void {
  if (down.button !== 0) return;
  if (mode !== "edit") return toast("预览模式下不能添加控件，请先切回编辑模式");
  down.preventDefault();
  const size = (declFor(project, type) ?? CONTAINER_DECL).defaultSize ?? CONTAINER_DECL.defaultSize!;
  const ghost = document.createElement("div");
  ghost.id = "drag-ghost";
  ghost.style.width = `${size.width}px`;
  ghost.style.height = `${size.height}px`;
  const place = (e: PointerEvent) => {
    ghost.style.left = `${e.clientX - size.width / 2}px`;
    ghost.style.top = `${e.clientY - size.height / 2}px`;
  };
  place(down);
  document.body.append(ghost);
  const up = (e: PointerEvent) => {
    document.removeEventListener("pointermove", place);
    document.removeEventListener("pointerup", up);
    ghost.remove();
    const rect = $("stage").getBoundingClientRect();
    const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (inside) void addNode(type, e.clientX - rect.left, e.clientY - rect.top);
  };
  document.addEventListener("pointermove", place);
  document.addEventListener("pointerup", up);
}

function renderLayers(): void {
  const rows: HTMLElement[] = [];
  const visit = (id: string, depth: number) => {
    const n = node(id);
    if (!n) return;
    const row = document.createElement("div");
    row.className = "layer" + (id === selectedId ? " selected" : "");
    row.style.paddingLeft = `${6 + depth * 14}px`;
    const name = document.createElement("span");
    name.textContent = id;
    const type = document.createElement("span");
    type.className = "type";
    type.textContent = n.type;
    row.append(name, type);
    const effectName = project.logic.objects?.[id]?.effects?.visible;
    if (effectName) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "需翻译";
      badge.title = `显示和隐藏时播放效果 ${effectName}；导出成 Qt 后要在界面效果层为它提供实现`;
      row.append(badge);
    }
    row.addEventListener("click", () => select(id));
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      select(id);
      showMenu(e.clientX, e.clientY, id);
    });
    rows.push(row);
    // 列表里越靠上的在画面里越靠前
    for (const child of [...(n.children ?? [])].reverse()) visit(child, depth + 1);
  };
  visit(project.scene.root, 0);
  $("layers").replaceChildren(...rows);
}

function select(id: string | null): void {
  if (id === selectedId) return;
  flushEditors();
  selectedId = id;
  renderLayers();
  renderRight();
  updateSelectionBox();
  if (id) scrollYamlTo(`  ${id}:`);
}

// ---------- 右侧：文档与 YAML ----------

const docText = $<HTMLTextAreaElement>("doc-text");
const yamlText = $<HTMLTextAreaElement>("yaml-text");
let docDirty = false;
let yamlDirty = false;
/** 文档页签当前编辑的是哪份文件的哪个小节；section 为 null 表示整份文件 */
let docTarget: { path: string; section: string | null } | null = null;
let docTimer: number | undefined;
let yamlTimer: number | undefined;

function showRightTab(tab: "doc" | "yaml"): void {
  $("tab-doc").setAttribute("aria-selected", String(tab === "doc"));
  $("tab-yaml").setAttribute("aria-selected", String(tab === "yaml"));
  $("pane-doc").hidden = tab !== "doc";
  $("pane-yaml").hidden = tab !== "yaml";
  if (tab === "yaml" && selectedId) scrollYamlTo(`  ${selectedId}:`);
}

function noteWithButton(note: HTMLElement, text: string, label?: string, action?: () => void): void {
  note.replaceChildren(document.createTextNode(text));
  if (label && action) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", action);
    note.append(button);
  }
}

function setTextarea(area: HTMLTextAreaElement, value: string, enabled = true): void {
  if (area.value !== value) area.value = value;
  area.disabled = !enabled;
}

function renderRight(): void {
  const idInput = $<HTMLInputElement>("selection-id");
  const n = selectedId ? node(selectedId) : undefined;
  idInput.value = selectedId ?? "未选中控件";
  idInput.disabled = !selectedId;
  $("selection-type").textContent = n ? n.type : "";

  // 文档页签
  if (!docDirty) {
    const object = selectedId ? project.logic.objects?.[selectedId] : undefined;
    if (!selectedId) {
      docTarget = { path: project.pageDoc, section: null };
      noteWithButton($("doc-note"), `整份页面文档 ${project.pageDoc}`);
      setTextarea(docText, project.docs.get(project.pageDoc) ?? "");
    } else {
      const ref = object?.doc ? parseDocRef(object.doc) : null;
      const file = ref ? project.docs.get(ref.path) : undefined;
      const section = ref?.section && file !== undefined ? getSection(file, ref.section) : null;
      if (ref && file !== undefined && (ref.section === null || section !== null)) {
        docTarget = ref;
        const shared = Object.entries(project.logic.objects ?? {})
          .filter(([other, o]) => other !== selectedId && o?.doc === object!.doc)
          .map(([other]) => other);
        noteWithButton($("doc-note"), `${object!.doc}${shared.length ? `　也被 ${shared.join("、")} 引用` : ""}`);
        setTextarea(docText, ref.section === null ? file : section!);
      } else {
        docTarget = null;
        const id = selectedId;
        noteWithButton($("doc-note"), "这个控件还没有说明。", "创建说明", () => void createDocSection(id));
        setTextarea(docText, "", false);
      }
    }
  }

  // YAML 页签
  if (!yamlDirty) {
    setTextarea(yamlText, project.logicText);
    if (selectedId && !project.logic.objects?.[selectedId]) {
      const id = selectedId;
      noteWithButton($("yaml-note"), "这个控件还没有逻辑条目。", "添加逻辑条目", () => {
        void editLogic((doc) => ensureObject(doc, id)).then(() => scrollYamlTo(`  ${id}:`));
      });
    } else {
      noteWithButton($("yaml-note"), LOGIC_PATH);
    }
  }
}

/** 把 YAML 编辑器滚动到以 prefix 开头的那一行。 */
function scrollYamlTo(prefix: string): void {
  const lines = yamlText.value.split("\n");
  const index = lines.findIndex((line) => line.startsWith(prefix) || line.trim().startsWith(prefix.trim()));
  if (index < 0) return;
  yamlText.scrollTop = Math.max(0, index - 2) * 18;
}

async function saveDoc(): Promise<void> {
  window.clearTimeout(docTimer);
  if (!docDirty || !docTarget) return;
  const { path, section } = docTarget;
  const current = project.docs.get(path) ?? "";
  docDirty = false;
  await writeText(path, section === null ? docText.value : replaceSection(current, section, docText.value));
  await reload();
}

async function saveYaml(): Promise<void> {
  window.clearTimeout(yamlTimer);
  if (!yamlDirty) return;
  yamlDirty = false;
  await writeText(LOGIC_PATH, yamlText.value);
  await reload();
}

/** 切换选中对象之前，把还没保存的编辑先写入文件。 */
function flushEditors(): void {
  void saveDoc();
  void saveYaml();
}

docText.addEventListener("input", () => {
  docDirty = true;
  window.clearTimeout(docTimer);
  docTimer = window.setTimeout(() => void saveDoc(), 600);
});
docText.addEventListener("blur", () => void saveDoc());
yamlText.addEventListener("input", () => {
  yamlDirty = true;
  window.clearTimeout(yamlTimer);
  yamlTimer = window.setTimeout(() => void saveYaml(), 600);
});
yamlText.addEventListener("blur", () => void saveYaml());
// 在 YAML 中按 Tab 输入两个空格，而不是把焦点移走
yamlText.addEventListener("keydown", (e) => {
  if (e.key !== "Tab") return;
  e.preventDefault();
  yamlText.setRangeText("  ", yamlText.selectionStart, yamlText.selectionEnd, "end");
  yamlText.dispatchEvent(new Event("input"));
});

// “引用”：选中的控件；没有选中控件时引用整个项目
$("selection-quote").addEventListener("click", () => {
  void copyReference(selectedId ? controlReference(project, selectedId) : projectReference(project));
});

// 文档页签的“引用所选”：选中了文字就引用那几行，否则引用当前显示的整个小节或整份文档
$("doc-quote").addEventListener("click", async () => {
  if (!docTarget) return toast("这个控件还没有说明，先点“创建说明”");
  await saveDoc();
  const { path, section } = docTarget;
  const file = project.docs.get(path) ?? "";
  const offsets = section ? sectionOffsets(file, section) : null;
  const context: [string, string] | undefined = section ? ["section", section] : undefined;
  if (docText.selectionStart !== docText.selectionEnd) {
    const firstLine = offsets ? lineAt(file, offsets.contentStart) : 1;
    const range = selectionRange(docText.value, docText.selectionStart, docText.selectionEnd, firstLine);
    void copyReference(linesReference(project, path, range, context));
  } else if (section) {
    const range = docSectionRange(file, section);
    void copyReference(range ? linesReference(project, path, range, context) : fileReference(project, path));
  } else {
    void copyReference(fileReference(project, path));
  }
});

// YAML 页签的“引用所选”：选中了文字就引用那几行；否则引用当前控件的条目，再否则引用光标所在的条目
$("yaml-quote").addEventListener("click", async () => {
  await saveYaml();
  const text = project.logicText;
  const { selectionStart, selectionEnd } = yamlText;
  if (selectionStart !== selectionEnd) {
    const range = selectionRange(yamlText.value, selectionStart, selectionEnd);
    const path = logicPathAt(text, range.start);
    return void copyReference(linesReference(project, LOGIC_PATH, range, path ? ["entry", path.join(".")] : undefined));
  }
  const selectedPath = selectedId ? ["objects", selectedId] : null;
  const path =
    selectedPath && logicEntryRange(text, selectedPath)
      ? selectedPath
      : logicPathAt(text, selectionRange(yamlText.value, selectionStart, selectionStart).start);
  const range = path ? logicEntryRange(text, path) : null;
  void copyReference(
    range ? linesReference(project, LOGIC_PATH, range, ["entry", path!.join(".")]) : fileReference(project, LOGIC_PATH),
  );
});

$("tab-doc").addEventListener("click", () => showRightTab("doc"));
$("tab-yaml").addEventListener("click", () => showRightTab("yaml"));

const idInput = $<HTMLInputElement>("selection-id");
idInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") idInput.blur();
  if (e.key === "Escape") {
    idInput.value = selectedId ?? "";
    idInput.blur();
  }
});
idInput.addEventListener("change", () => {
  if (selectedId) void renameId(selectedId, idInput.value.trim()).then(renderRight);
});

// ---------- 底部：问题与事件记录 ----------

function showBottomTab(tab: "problems" | "log"): void {
  $("tab-problems").setAttribute("aria-selected", String(tab === "problems"));
  $("tab-log").setAttribute("aria-selected", String(tab === "log"));
  $("problems").hidden = tab !== "problems";
  $("log").hidden = tab !== "log";
}
$("tab-problems").addEventListener("click", () => showBottomTab("problems"));
$("tab-log").addEventListener("click", () => showBottomTab("log"));

function renderProblems(): void {
  const errors = project.problems.filter((p) => p.level === "error").length;
  const hints = project.problems.length - errors;
  $("tab-problems").textContent = `问题（${errors} 个错误，${hints} 个提示）`;
  const rows = project.problems.map((problem) => {
    const row = document.createElement("div");
    row.className = `problem ${problem.level}` + (problem.nodeId ? " clickable" : "");
    row.textContent = `${problem.level === "error" ? "错误" : "提示"}　${problem.message}`;
    const id = problem.nodeId;
    if (id) row.addEventListener("click", () => node(id) && select(id));
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      openMenu(e.clientX, e.clientY, [
        {
          label: "复制引用",
          action: () => void copyReference(problemReference(project, problem.level, problem.message, problem.nodeId)),
        },
      ]);
    });
    return row;
  });
  if (rows.length === 0) {
    const ok = document.createElement("div");
    ok.className = "muted";
    ok.textContent = "没有问题。";
    rows.push(ok);
  }
  $("problems").replaceChildren(...rows);
}

function renderLog(): void {
  const rows = log.map((entry) => {
    const row = document.createElement("div");
    row.className = "log-entry";
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = entry.title;
    const lines = document.createElement("div");
    lines.className = "lines";
    lines.textContent = entry.lines.join("\n");
    row.append(title, lines);
    return row;
  });
  const pane = $("log");
  pane.replaceChildren(...rows);
  pane.scrollTop = pane.scrollHeight;
  $("tab-log").textContent = `事件记录（${log.length}）`;
}

// ---------- 预览 ----------

function renderConditions(): void {
  const chips = (previewRuntime?.conditions() ?? []).map((condition) => {
    const isText = condition.kind === "text";
    const chip = document.createElement(isText ? "button" : "span");
    chip.className = "condition" + (condition.value ? " on" : "");
    chip.textContent = `${condition.text || condition.id}：${condition.value ? "是" : "否"}`;
    chip.title = isText ? `文字条件 ${condition.id}，点击切换` : `符号条件 ${condition.id}，由表达式计算`;
    if (isText) chip.addEventListener("click", () => previewRuntime?.toggleTextCondition(condition.id));
    return chip;
  });
  $("conditions").replaceChildren(...chips);
}

function startPreviewRuntime(): void {
  previewRuntime = new Runtime(project, {
    onChange: () => {
      applyViews();
      renderConditions();
    },
    onLog: (entry) => {
      log.push(entry);
      if (log.length > 300) log.shift();
      renderLog();
    },
  });
  previewRuntime.start();
}

function setMode(next: "edit" | "preview"): void {
  if (next === mode) return;
  flushEditors();
  hideMenu();
  mode = next;
  document.body.classList.toggle("preview", mode === "preview");
  $("mode-edit").setAttribute("aria-pressed", String(mode === "edit"));
  $("mode-preview").setAttribute("aria-pressed", String(mode === "preview"));
  $("preview-bar").hidden = mode !== "preview";
  if (mode === "preview") {
    // 第一次进入预览从初始状态开始；之后保持上次离开时的状态
    if (!previewRuntime) startPreviewRuntime();
    showBottomTab("log");
  } else {
    showBottomTab("problems");
  }
  renderStage();
  renderConditions();
}

$("mode-edit").addEventListener("click", () => setMode("edit"));
$("mode-preview").addEventListener("click", () => setMode("preview"));
$("restart").addEventListener("click", () => {
  log.length = 0;
  startPreviewRuntime();
  renderLog();
  renderStage();
  renderConditions();
});

// ---------- 启动 ----------

function renderAll(): void {
  $("project-name").textContent = project.name;
  $("project-root").textContent = project.root;
  renderPalette();
  renderLayers();
  renderStage();
  renderRight();
  renderProblems();
  renderConditions();
}

async function main(): Promise<void> {
  project = await loadProject(null);
  designRuntime = new Runtime(project);
  renderAll();
  renderLog();
  watchProject(() => void reload());
}

main().catch((e) => {
  document.body.textContent = `启动失败：${(e as Error).message}`;
});
