// 窗口顶部菜单栏（menuBar）与菜单项（MenuItemSpec）的可视化编辑：
// 1) 增删改查与排序顶层菜单（id、title）；
// 2) 增删改查与排序菜单项（id、text、shortcut、checkable、checked、关联停靠面板 dock、触发全局事件 emit）；
// 3) 一键为停靠面板（Dock）生成或绑定“视图”菜单中的开关菜单项；
// 4) 所有操作受窗口锁定状态保护并记录进撤销/重做历史。
import { isMap, parseDocument } from "yaml";
import {
  allMenuItems,
  isNameTakenAcrossTables,
  isSceneNodeLocked,
  isValidIdentifier,
  type Logic,
  type MenuBarSpec,
  type MenuItemSpec,
  type MenuSpec,
  type Project,
  type Scene,
} from "./model.ts";

const YAML_OUTPUT = { lineWidth: 0 };

function uniqueMenuId(scene: Scene, base: string, logic?: Logic): string {
  const clean = isValidIdentifier(base) ? base.trim() : "menu";
  if (!isNameTakenAcrossTables(clean, { scene, logic })) return clean;
  for (let i = 1; ; i++) {
    const candidate = `${clean}${i}`;
    if (!isNameTakenAcrossTables(candidate, { scene, logic })) return candidate;
  }
}

/**
 * 在 YAML 文本中将 objects.<oldId> 条目及其内部局部条件引用重命名为 nextId。
 */
export function renameObjectIdInYaml(yamlText: string, oldId: string, nextId: string): string {
  if (!yamlText.trim() || oldId === nextId) return yamlText;
  const doc = parseDocument(yamlText);
  if (doc.errors.length > 0) return yamlText;
  let changed = false;
  const objects = doc.get("objects");
  if (isMap(objects)) {
    for (const pair of objects.items) {
      const key = pair.key as { value?: unknown };
      if (key.value === oldId) {
        key.value = nextId;
        changed = true;
      }
    }
  }
  if (!changed) return yamlText;
  const escaped = oldId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return doc.toString(YAML_OUTPUT).replace(new RegExp(`(?<![\\w.])${escaped}\\.(?=[A-Za-z_])`, "g"), `${nextId}.`);
}

// ---------- 纯数据操作函数（供界面与自动化测试共用） ----------

export function ensureWindowMenuBar(scene: Scene, windowId = scene.root): MenuBarSpec | null {
  const win = scene.nodes[windowId];
  if (!win || isSceneNodeLocked(scene, windowId) || win.locked) return null;
  if (!win.menuBar) {
    win.menuBar = { height: 28, menus: [] };
  } else {
    win.menuBar.menus ??= [];
  }
  return win.menuBar;
}

export function setMenuBarHeight(scene: Scene, height: number | undefined, windowId = scene.root): boolean {
  const bar = ensureWindowMenuBar(scene, windowId);
  if (!bar) return false;
  if (height === undefined || !Number.isFinite(height)) {
    delete bar.height;
  } else {
    bar.height = Math.max(20, Math.round(height));
  }
  return true;
}

export function addMenuToWindow(
  scene: Scene,
  menu: { id?: string; title: string },
  windowId = scene.root,
  logic?: Logic,
): string | null {
  const bar = ensureWindowMenuBar(scene, windowId);
  if (!bar) return null;
  const rawId = menu.id?.trim() ?? "";
  if (rawId) {
    if (!isValidIdentifier(rawId) || isNameTakenAcrossTables(rawId, { scene, logic })) return null;
  }
  const id = rawId || uniqueMenuId(scene, "menu", logic);
  const created: MenuSpec = {
    id,
    title: menu.title.trim() || id,
    items: [],
  };
  bar.menus.push(created);
  return id;
}

export function updateMenuInWindow(
  scene: Scene,
  menuId: string,
  patch: { id?: string; title?: string },
  windowId = scene.root,
  logic?: Logic,
): boolean {
  const win = scene.nodes[windowId];
  if (!win?.menuBar?.menus || isSceneNodeLocked(scene, windowId) || win.locked) return false;
  const target = win.menuBar.menus.find((m) => m.id === menuId);
  if (!target) return false;
  if (patch.id !== undefined) {
    const nextId = patch.id.trim();
    if (!isValidIdentifier(nextId)) return false;
    if (nextId !== menuId) {
      if (isNameTakenAcrossTables(nextId, { scene, logic, ignoreId: menuId })) return false;
      target.id = nextId;
    }
  }
  if (patch.title !== undefined && patch.title.trim()) {
    target.title = patch.title.trim();
  }
  return true;
}

export function removeMenuFromWindow(scene: Scene, menuId: string, windowId = scene.root): boolean {
  const win = scene.nodes[windowId];
  if (!win?.menuBar?.menus || isSceneNodeLocked(scene, windowId) || win.locked) return false;
  const before = win.menuBar.menus.length;
  win.menuBar.menus = win.menuBar.menus.filter((m) => m.id !== menuId);
  if (win.menuBar.menus.length === before) return false;
  if (win.menuBar.menus.length === 0) delete win.menuBar;
  return true;
}

export function reorderMenuInWindow(scene: Scene, menuId: string, delta: number, windowId = scene.root): boolean {
  const win = scene.nodes[windowId];
  if (!win?.menuBar?.menus || isSceneNodeLocked(scene, windowId) || win.locked) return false;
  const menus = win.menuBar.menus;
  const idx = menus.findIndex((m) => m.id === menuId);
  if (idx < 0) return false;
  const nextIdx = Math.max(0, Math.min(menus.length - 1, idx + delta));
  if (nextIdx === idx) return false;
  const [moved] = menus.splice(idx, 1);
  menus.splice(nextIdx, 0, moved);
  return true;
}

export function addMenuItemToMenu(
  scene: Scene,
  menuId: string,
  item: Partial<MenuItemSpec> & { text: string },
  windowId = scene.root,
  logic?: Logic,
): string | null {
  const bar = ensureWindowMenuBar(scene, windowId);
  if (!bar) return null;
  const menu = bar.menus.find((m) => m.id === menuId);
  if (!menu) return null;
  const rawId = item.id?.trim() ?? "";
  if (rawId) {
    if (!isValidIdentifier(rawId) || isNameTakenAcrossTables(rawId, { scene, logic })) return null;
  }
  const id = rawId || uniqueMenuId(scene, "menuItem", logic);
  const created: MenuItemSpec = {
    id,
    text: item.text.trim() || id,
  };
  if (item.shortcut?.trim()) created.shortcut = item.shortcut.trim();
  if (item.dock?.trim()) {
    created.dock = item.dock.trim();
    created.checkable = item.checkable ?? true;
    created.checked = item.checked ?? true;
  } else {
    if (item.checkable !== undefined) created.checkable = Boolean(item.checkable);
    if (item.checked !== undefined) created.checked = Boolean(item.checked);
  }
  if (item.emit?.trim()) created.emit = item.emit.trim();
  menu.items ??= [];
  menu.items.push(created);
  return id;
}

export function updateMenuItemInMenu(
  scene: Scene,
  itemId: string,
  patch: Partial<MenuItemSpec>,
  windowId = scene.root,
  logic?: Logic,
): boolean {
  const win = scene.nodes[windowId];
  if (!win?.menuBar?.menus || isSceneNodeLocked(scene, windowId) || win.locked) return false;
  let target: MenuItemSpec | null = null;
  for (const menu of win.menuBar.menus) {
    const found = (menu.items ?? []).find((it) => it.id === itemId);
    if (found) {
      target = found;
      break;
    }
  }
  if (!target) return false;

  if (patch.id !== undefined) {
    const nextId = patch.id.trim();
    if (!isValidIdentifier(nextId)) return false;
    if (nextId !== itemId) {
      if (isNameTakenAcrossTables(nextId, { scene, logic, ignoreId: itemId })) return false;
      target.id = nextId;
      if (logic?.objects && itemId in logic.objects) {
        logic.objects[nextId] = logic.objects[itemId];
        delete logic.objects[itemId];
      }
    }
  }
  if (patch.text !== undefined && patch.text.trim()) {
    target.text = patch.text.trim();
  }
  if ("shortcut" in patch) {
    if (patch.shortcut?.trim()) target.shortcut = patch.shortcut.trim();
    else delete target.shortcut;
  }
  if ("dock" in patch) {
    if (patch.dock?.trim()) {
      target.dock = patch.dock.trim();
      if (target.checkable === undefined) target.checkable = true;
      if (target.checked === undefined) target.checked = true;
    } else {
      delete target.dock;
    }
  }
  if ("checkable" in patch) {
    if (patch.checkable) target.checkable = true;
    else {
      delete target.checkable;
      delete target.checked;
    }
  }
  if ("checked" in patch) {
    if (patch.checked !== undefined) target.checked = Boolean(patch.checked);
    else delete target.checked;
  }
  if ("emit" in patch) {
    if (patch.emit?.trim()) target.emit = patch.emit.trim();
    else delete target.emit;
  }
  return true;
}

export function removeMenuItemFromMenu(scene: Scene, itemId: string, windowId = scene.root): boolean {
  const win = scene.nodes[windowId];
  if (!win?.menuBar?.menus || isSceneNodeLocked(scene, windowId) || win.locked) return false;
  for (const menu of win.menuBar.menus) {
    const before = menu.items?.length ?? 0;
    menu.items = (menu.items ?? []).filter((it) => it.id !== itemId);
    if (menu.items.length !== before) return true;
  }
  return false;
}

export function reorderMenuItemInMenu(scene: Scene, itemId: string, delta: number, windowId = scene.root): boolean {
  const win = scene.nodes[windowId];
  if (!win?.menuBar?.menus || isSceneNodeLocked(scene, windowId) || win.locked) return false;
  for (const menu of win.menuBar.menus) {
    const items = menu.items ?? [];
    const idx = items.findIndex((it) => it.id === itemId);
    if (idx < 0) continue;
    const nextIdx = Math.max(0, Math.min(items.length - 1, idx + delta));
    if (nextIdx === idx) return false;
    const [moved] = items.splice(idx, 1);
    items.splice(nextIdx, 0, moved);
    return true;
  }
  return false;
}

/**
 * 为停靠面板 dockId 在主窗口菜单栏（默认 viewMenu“视图”）中生成或更新对应的显隐切换菜单项。
 */
export function bindDockToggleMenuItem(
  scene: Scene,
  dockId: string,
  options: { menuId?: string; menuTitle?: string; itemId?: string; text?: string } = {},
  windowId = scene.root,
  logic?: Logic,
): string | null {
  const dockNode = scene.nodes[dockId];
  if (!dockNode || dockNode.type !== "Dock") return null;
  const bar = ensureWindowMenuBar(scene, windowId);
  if (!bar) return null;

  const rawMenuId = options.menuId?.trim() || "viewMenu";
  const menuTitle = options.menuTitle?.trim() || "视图";
  let menu = bar.menus.find((m) => m.id === rawMenuId || m.title === menuTitle);
  if (!menu) {
    const safeMenuId = isNameTakenAcrossTables(rawMenuId, { scene, logic })
      ? uniqueMenuId(scene, rawMenuId, logic)
      : rawMenuId;
    menu = { id: safeMenuId, title: menuTitle, items: [] };
    bar.menus.push(menu);
  }

  const existing = (menu.items ?? []).find((it) => it.dock === dockId);
  const itemText = options.text?.trim() || `${dockNode.title ?? dockId}面板`;
  if (existing) {
    existing.text = itemText;
    existing.checkable = true;
    existing.checked = true;
    return existing.id;
  }

  const cap = dockId.replace(/Dock$/, "");
  const baseItemId =
    options.itemId?.trim() ||
    `menuToggle${cap.charAt(0).toUpperCase()}${cap.slice(1)}`;
  const defaultItemId = isNameTakenAcrossTables(baseItemId, { scene, logic })
    ? uniqueMenuId(scene, baseItemId, logic)
    : baseItemId;
  return addMenuItemToMenu(
    scene,
    menu.id,
    {
      id: defaultItemId,
      text: itemText,
      dock: dockId,
      checkable: true,
      checked: true,
    },
    windowId,
    logic,
  );
}

// ---------- 右侧“菜单”页签界面 ----------

export interface MenuEditDeps {
  getProject: () => Project;
  getMode: () => "edit" | "preview";
  saveScene: (options?: { history?: boolean; nextLogicText?: string; label?: string }) => Promise<void>;
  toast: (msg: string) => void;
  activateRightTab: (tabId: string) => void;
}

let deps: MenuEditDeps | null = null;
let highlightedItemId: string | null = null;

export function initMenuEdit(options: MenuEditDeps): void {
  deps = options;
  const right = document.getElementById("right");
  const tabs = right?.querySelector(".tabs") ?? document.getElementById("tabs");
  if (!tabs || !right) return;

  if (!document.getElementById("tab-menu")) {
    const tabBtn = document.createElement("button");
    tabBtn.id = "tab-menu";
    tabBtn.type = "button";
    tabBtn.setAttribute("role", "tab");
    tabBtn.setAttribute("aria-selected", "false");
    tabBtn.textContent = "菜单";
    tabBtn.title = "编辑主窗口顶部菜单栏、菜单项、关联停靠面板与全局事件";
    const tabDoc = document.getElementById("tab-doc");
    if (tabDoc) tabs.insertBefore(tabBtn, tabDoc);
    else tabs.append(tabBtn);
    tabBtn.addEventListener("click", () => deps?.activateRightTab("menu"));
  }

  if (!document.getElementById("pane-menu")) {
    const pane = document.createElement("div");
    pane.id = "pane-menu";
    pane.className = "pane vf-custom-pane";
    pane.hidden = true;
    right.append(pane);
  }
}

export function focusMenuItemInEditor(itemId: string): void {
  highlightedItemId = itemId;
  deps?.activateRightTab("menu");
  renderMenuEditPane();
}

export function renderMenuEditPane(): void {
  if (!deps) return;
  const pane = document.getElementById("pane-menu");
  if (!pane) return;
  pane.replaceChildren();

  const project = deps.getProject();
  const scene = project.scene;
  const winId = scene.root;
  const winNode = scene.nodes[winId];
  if (!winNode) return;

  const locked = Boolean(winNode.locked) || isSceneNodeLocked(scene, winId);
  if (locked) {
    const warn = document.createElement("div");
    warn.className = "vf-lock-banner";
    warn.dataset.menuLocked = "true";
    warn.textContent = "🔒 主窗口已锁定，解锁后才能编辑顶部菜单。";
    pane.append(warn);
  }

  const dockIds = Object.entries(scene.nodes)
    .filter(([, n]) => n.type === "Dock")
    .map(([id]) => id);
  const eventNames = Object.keys(project.logic.events ?? {});

  // 1. 顶部菜单栏概览与停靠面板快捷绑定
  const topSec = document.createElement("section");
  topSec.className = "vf-edit-section";
  const topTitle = document.createElement("div");
  topTitle.className = "vf-sec-title";
  topTitle.textContent = "主窗口菜单栏 (menuBar)";
  topSec.append(topTitle);

  const barRow = document.createElement("div");
  barRow.className = "vf-row-between";
  const hLabel = document.createElement("label");
  hLabel.className = "vf-field";
  hLabel.innerHTML = "<span>菜单栏高度</span>";
  const hInput = document.createElement("input");
  hInput.type = "number";
  hInput.min = "20";
  hInput.dataset.menuBarHeight = "true";
  hInput.value = String(winNode.menuBar?.height ?? 28);
  hInput.disabled = locked;
  hInput.addEventListener("change", () => {
    if (setMenuBarHeight(scene, Number(hInput.value), winId)) {
      void deps?.saveScene({ label: "修改菜单栏高度" });
    }
  });
  hLabel.append(hInput);
  barRow.append(hLabel);
  topSec.append(barRow);

  if (dockIds.length > 0) {
    const dockQuick = document.createElement("div");
    dockQuick.className = "vf-dock-quick";
    const qLabel = document.createElement("div");
    qLabel.className = "vf-sub-header";
    qLabel.textContent = "快捷绑定停靠面板到“视图”菜单：";
    dockQuick.append(qLabel);

    const btnWrap = document.createElement("div");
    btnWrap.className = "vf-btn-group";
    for (const did of dockIds) {
      const dNode = scene.nodes[did]!;
      const bound = allMenuItems(scene).find((entry) => entry.item.dock === did);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "vf-mini-btn" + (bound ? " active" : "");
      b.dataset.menuBindDock = did;
      b.disabled = locked;
      b.textContent = bound ? `✓ ${dNode.title ?? did} (${bound.item.id})` : `+ 绑定 ${dNode.title ?? did}`;
      b.addEventListener("click", () => {
        const itemId = bindDockToggleMenuItem(scene, did, {}, winId, project.logic);
        if (itemId) {
          void deps?.saveScene({ label: `绑定停靠面板 ${did} 菜单项` });
        }
      });
      btnWrap.append(b);
    }
    dockQuick.append(btnWrap);
    topSec.append(dockQuick);
  }

  // 新增顶层菜单表单
  const addMenuForm = document.createElement("div");
  addMenuForm.className = "vf-inline-form";
  const newMenuIdInput = document.createElement("input");
  newMenuIdInput.type = "text";
  newMenuIdInput.placeholder = "菜单 ID（如 viewMenu）";
  newMenuIdInput.dataset.newMenuId = "true";
  newMenuIdInput.disabled = locked;

  const newMenuTitleInput = document.createElement("input");
  newMenuTitleInput.type = "text";
  newMenuTitleInput.placeholder = "菜单标题（如 视图）";
  newMenuTitleInput.dataset.newMenuTitle = "true";
  newMenuTitleInput.disabled = locked;

  const addMenuBtn = document.createElement("button");
  addMenuBtn.type = "button";
  addMenuBtn.className = "vf-primary-btn";
  addMenuBtn.dataset.menuAction = "add-menu";
  addMenuBtn.disabled = locked;
  addMenuBtn.textContent = "+ 添加菜单";
  addMenuBtn.addEventListener("click", () => {
    const title = newMenuTitleInput.value.trim() || "新菜单";
    const id = newMenuIdInput.value.trim() || undefined;
    const createdId = addMenuToWindow(scene, { id, title }, winId, project.logic);
    if (!createdId) {
      deps?.toast("菜单 ID 不合法、已被占用或窗口已锁定");
      return;
    }
    newMenuIdInput.value = "";
    newMenuTitleInput.value = "";
    void deps?.saveScene({ label: `添加菜单 ${title}` });
  });
  addMenuForm.append(newMenuIdInput, newMenuTitleInput, addMenuBtn);
  topSec.append(addMenuForm);
  pane.append(topSec);

  // 2. 各菜单及菜单项卡片
  const menus = winNode.menuBar?.menus ?? [];
  if (menus.length === 0) {
    const empty = document.createElement("div");
    empty.className = "vf-pane-empty";
    empty.textContent = "当前窗口还没有菜单，在上方输入标题并点击“+ 添加菜单”，或点击停靠面板快捷绑定按钮。";
    pane.append(empty);
    return;
  }

  menus.forEach((menu, mIdx) => {
    const card = document.createElement("section");
    card.className = "vf-edit-section vf-menu-card";
    card.dataset.menuCard = menu.id;

    const mHead = document.createElement("div");
    mHead.className = "vf-row-between";

    const idIn = document.createElement("input");
    idIn.type = "text";
    idIn.className = "vf-compact-input";
    idIn.dataset.menuId = menu.id;
    idIn.value = menu.id;
    idIn.disabled = locked;
    idIn.title = "菜单 ID";
    idIn.addEventListener("change", () => {
      if (updateMenuInWindow(scene, menu.id, { id: idIn.value }, winId, project.logic)) {
        void deps?.saveScene({ label: `重命名菜单 ${menu.id}` });
      } else {
        deps?.toast("菜单 ID 无效或已被占用");
        renderMenuEditPane();
      }
    });

    const titleIn = document.createElement("input");
    titleIn.type = "text";
    titleIn.className = "vf-compact-input";
    titleIn.dataset.menuTitle = menu.id;
    titleIn.value = menu.title;
    titleIn.disabled = locked;
    titleIn.title = "菜单显示标题";
    titleIn.addEventListener("change", () => {
      if (updateMenuInWindow(scene, menu.id, { title: titleIn.value }, winId, project.logic)) {
        void deps?.saveScene({ label: `修改菜单标题 ${titleIn.value}` });
      }
    });

    const mBtns = document.createElement("div");
    mBtns.className = "vf-btn-group";
    const mUp = document.createElement("button");
    mUp.type = "button";
    mUp.className = "vf-mini-btn";
    mUp.dataset.menuUp = menu.id;
    mUp.disabled = locked || mIdx === 0;
    mUp.textContent = "←";
    mUp.title = "左移菜单";
    mUp.addEventListener("click", () => {
      if (reorderMenuInWindow(scene, menu.id, -1, winId)) {
        void deps?.saveScene({ label: `左移菜单 ${menu.title}` });
      }
    });

    const mDown = document.createElement("button");
    mDown.type = "button";
    mDown.className = "vf-mini-btn";
    mDown.dataset.menuDown = menu.id;
    mDown.disabled = locked || mIdx === menus.length - 1;
    mDown.textContent = "→";
    mDown.title = "右移菜单";
    mDown.addEventListener("click", () => {
      if (reorderMenuInWindow(scene, menu.id, 1, winId)) {
        void deps?.saveScene({ label: `右移菜单 ${menu.title}` });
      }
    });

    const mDel = document.createElement("button");
    mDel.type = "button";
    mDel.className = "vf-mini-btn danger";
    mDel.dataset.menuDelete = menu.id;
    mDel.disabled = locked;
    mDel.textContent = "删除菜单";
    mDel.addEventListener("click", () => {
      if (removeMenuFromWindow(scene, menu.id, winId)) {
        void deps?.saveScene({ label: `删除菜单 ${menu.title}` });
      }
    });

    mBtns.append(mUp, mDown, mDel);
    mHead.append(idIn, titleIn, mBtns);
    card.append(mHead);

    // 菜单项列表
    const items = menu.items ?? [];
    const itemList = document.createElement("div");
    itemList.className = "vf-menu-item-list";

    items.forEach((item, iIdx) => {
      const itemBox = document.createElement("div");
      itemBox.className = "vf-menu-item-box" + (highlightedItemId === item.id ? " highlight" : "");
      itemBox.dataset.menuItemRow = item.id;

      const row1 = document.createElement("div");
      row1.className = "vf-row-between";

      const itIdIn = document.createElement("input");
      itIdIn.type = "text";
      itIdIn.className = "vf-compact-input";
      itIdIn.dataset.itemId = item.id;
      itIdIn.value = item.id;
      itIdIn.disabled = locked;
      itIdIn.title = "菜单项 ID";
      itIdIn.addEventListener("change", () => {
        const oldItemId = item.id;
        const nextItemId = itIdIn.value.trim();
        if (updateMenuItemInMenu(scene, oldItemId, { id: nextItemId }, winId, project.logic)) {
          const nextLogicText = renameObjectIdInYaml(project.logicText, oldItemId, nextItemId);
          void deps?.saveScene({ nextLogicText, label: `重命名菜单项 ${oldItemId} -> ${nextItemId}` });
        } else {
          deps?.toast("菜单项 ID 无效或已被占用");
          renderMenuEditPane();
        }
      });

      const itTextIn = document.createElement("input");
      itTextIn.type = "text";
      itTextIn.className = "vf-compact-input";
      itTextIn.dataset.itemText = item.id;
      itTextIn.value = item.text;
      itTextIn.disabled = locked;
      itTextIn.title = "菜单项文字";
      itTextIn.addEventListener("change", () => {
        if (updateMenuItemInMenu(scene, item.id, { text: itTextIn.value }, winId, project.logic)) {
          void deps?.saveScene({ label: `修改菜单项文字 ${itTextIn.value}` });
        }
      });

      const itBtns = document.createElement("div");
      itBtns.className = "vf-btn-group";
      const iUp = document.createElement("button");
      iUp.type = "button";
      iUp.className = "vf-mini-btn";
      iUp.dataset.itemUp = item.id;
      iUp.disabled = locked || iIdx === 0;
      iUp.textContent = "↑";
      iUp.addEventListener("click", () => {
        if (reorderMenuItemInMenu(scene, item.id, -1, winId)) {
          void deps?.saveScene({ label: `上移菜单项 ${item.text}` });
        }
      });

      const iDown = document.createElement("button");
      iDown.type = "button";
      iDown.className = "vf-mini-btn";
      iDown.dataset.itemDown = item.id;
      iDown.disabled = locked || iIdx === items.length - 1;
      iDown.textContent = "↓";
      iDown.addEventListener("click", () => {
        if (reorderMenuItemInMenu(scene, item.id, 1, winId)) {
          void deps?.saveScene({ label: `下移菜单项 ${item.text}` });
        }
      });

      const iDel = document.createElement("button");
      iDel.type = "button";
      iDel.className = "vf-mini-btn danger";
      iDel.dataset.itemDelete = item.id;
      iDel.disabled = locked;
      iDel.textContent = "×";
      iDel.title = "删除菜单项";
      iDel.addEventListener("click", () => {
        if (removeMenuItemFromMenu(scene, item.id, winId)) {
          void deps?.saveScene({ label: `删除菜单项 ${item.text}` });
        }
      });
      itBtns.append(iUp, iDown, iDel);
      row1.append(itIdIn, itTextIn, itBtns);

      const row2 = document.createElement("div");
      row2.className = "vf-form-grid";

      // 关联停靠面板下拉框
      const dockField = document.createElement("label");
      dockField.className = "vf-field";
      dockField.innerHTML = "<span>关联停靠面板 (dock)</span>";
      const dockSel = document.createElement("select");
      dockSel.dataset.itemDock = item.id;
      dockSel.disabled = locked;
      const noneOpt = document.createElement("option");
      noneOpt.value = "";
      noneOpt.textContent = "（无）";
      dockSel.append(noneOpt);
      for (const did of dockIds) {
        const opt = document.createElement("option");
        opt.value = did;
        opt.textContent = `${did} (${scene.nodes[did]?.title ?? did})`;
        opt.selected = item.dock === did;
        dockSel.append(opt);
      }
      dockSel.addEventListener("change", () => {
        if (updateMenuItemInMenu(scene, item.id, { dock: dockSel.value || undefined }, winId, project.logic)) {
          void deps?.saveScene({ label: `设置菜单项 ${item.id} 关联停靠面板` });
        }
      });
      dockField.append(dockSel);

      // 触发全局事件 emit
      const emitField = document.createElement("label");
      emitField.className = "vf-field";
      emitField.innerHTML = "<span>触发事件 (emit)</span>";
      const emitIn = document.createElement("input");
      emitIn.type = "text";
      emitIn.dataset.itemEmit = item.id;
      emitIn.placeholder = eventNames[0] ?? "事件名";
      emitIn.value = item.emit ?? "";
      emitIn.disabled = locked;
      emitIn.addEventListener("change", () => {
        if (updateMenuItemInMenu(scene, item.id, { emit: emitIn.value }, winId, project.logic)) {
          void deps?.saveScene({ label: `设置菜单项 ${item.id} 触发事件` });
        }
      });
      emitField.append(emitIn);

      // 快捷键 shortcut
      const scField = document.createElement("label");
      scField.className = "vf-field";
      scField.innerHTML = "<span>快捷键 (shortcut)</span>";
      const scIn = document.createElement("input");
      scIn.type = "text";
      scIn.dataset.itemShortcut = item.id;
      scIn.placeholder = "如 Ctrl+N";
      scIn.value = item.shortcut ?? "";
      scIn.disabled = locked;
      scIn.addEventListener("change", () => {
        if (updateMenuItemInMenu(scene, item.id, { shortcut: scIn.value }, winId, project.logic)) {
          void deps?.saveScene({ label: `修改菜单项 ${item.id} 快捷键` });
        }
      });
      scField.append(scIn);

      // 可勾选 checkable & 默认勾选 checked
      const chkWrap = document.createElement("div");
      chkWrap.className = "vf-check-group";
      const lblCheckable = document.createElement("label");
      lblCheckable.className = "vf-check-field";
      const inCheckable = document.createElement("input");
      inCheckable.type = "checkbox";
      inCheckable.dataset.itemCheckable = item.id;
      inCheckable.checked = Boolean(item.checkable);
      inCheckable.disabled = locked;
      inCheckable.addEventListener("change", () => {
        if (updateMenuItemInMenu(scene, item.id, { checkable: inCheckable.checked }, winId, project.logic)) {
          void deps?.saveScene({ label: `修改菜单项 ${item.id} 可勾选状态` });
        }
      });
      lblCheckable.append(inCheckable, document.createTextNode("可勾选"));

      const lblChecked = document.createElement("label");
      lblChecked.className = "vf-check-field";
      const inChecked = document.createElement("input");
      inChecked.type = "checkbox";
      inChecked.dataset.itemChecked = item.id;
      inChecked.checked = Boolean(item.checked);
      inChecked.disabled = locked || !item.checkable;
      inChecked.addEventListener("change", () => {
        if (updateMenuItemInMenu(scene, item.id, { checked: inChecked.checked }, winId, project.logic)) {
          void deps?.saveScene({ label: `修改菜单项 ${item.id} 默认勾选` });
        }
      });
      lblChecked.append(inChecked, document.createTextNode("默认勾选"));
      chkWrap.append(lblCheckable, lblChecked);

      row2.append(dockField, emitField, scField, chkWrap);
      itemBox.append(row1, row2);
      itemList.append(itemBox);
    });
    card.append(itemList);

    // 在该菜单内添加新菜单项
    const addItemRow = document.createElement("div");
    addItemRow.className = "vf-inline-form";

    const addIdIn = document.createElement("input");
    addIdIn.type = "text";
    addIdIn.placeholder = "菜单项 ID";
    addIdIn.dataset.addItemId = menu.id;
    addIdIn.disabled = locked;

    const addTextIn = document.createElement("input");
    addTextIn.type = "text";
    addTextIn.placeholder = "菜单项名称";
    addTextIn.dataset.addItemText = menu.id;
    addTextIn.disabled = locked;

    const addDockSel = document.createElement("select");
    addDockSel.dataset.addItemDock = menu.id;
    addDockSel.disabled = locked;
    const dOpt0 = document.createElement("option");
    dOpt0.value = "";
    dOpt0.textContent = "关联停靠面板（可选）";
    addDockSel.append(dOpt0);
    for (const did of dockIds) {
      const opt = document.createElement("option");
      opt.value = did;
      opt.textContent = did;
      addDockSel.append(opt);
    }

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "vf-mini-btn";
    addBtn.dataset.addItemBtn = menu.id;
    addBtn.disabled = locked;
    addBtn.textContent = "+ 添加菜单项";
    addBtn.addEventListener("click", () => {
      const text = addTextIn.value.trim() || "新菜单项";
      const id = addIdIn.value.trim() || undefined;
      const dock = addDockSel.value || undefined;
      const createdId = addMenuItemToMenu(scene, menu.id, { id, text, dock }, winId, project.logic);
      if (!createdId) {
        deps?.toast("菜单项 ID 无效、已被占用或窗口已锁定");
        return;
      }
      addIdIn.value = "";
      addTextIn.value = "";
      addDockSel.value = "";
      void deps?.saveScene({ label: `添加菜单项 ${text}` });
    });

    addItemRow.append(addIdIn, addTextIn, addDockSel, addBtn);
    card.append(addItemRow);
    pane.append(card);
  });
}
