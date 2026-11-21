// 顶栏的菜单（文件、编辑、视图、窗口、帮助）和命令面板（Ctrl+K）。内容都来自 commands.ts 的命令表。
import { commands, matchesQuery, MENUS, onCommandsChanged, runCommand, shortcutLabel, type Command, type MenuId } from "./commands.ts";

let openMenuId: MenuId | null = null;
let dropdown: HTMLElement | null = null;
let bar: HTMLElement | null = null;

function closeMenu(): void {
  openMenuId = null;
  dropdown?.remove();
  dropdown = null;
  for (const button of bar?.querySelectorAll<HTMLElement>(".menubar-item") ?? []) button.setAttribute("aria-expanded", "false");
}

function itemRow(command: Command, onDone: () => void): HTMLElement {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "menu-row";
  row.dataset.command = command.id;
  const enabled = !command.enabled || command.enabled();
  row.disabled = !enabled;
  const check = document.createElement("span");
  check.className = "menu-check";
  check.textContent = command.checked?.() ? "✓" : "";
  const label = document.createElement("span");
  label.className = "menu-label";
  label.textContent = command.label;
  const keys = document.createElement("span");
  keys.className = "menu-keys";
  keys.textContent = shortcutLabel(command.shortcut);
  row.append(check, label, keys);
  row.addEventListener("click", () => {
    onDone();
    runCommand(command.id);
  });
  return row;
}

function openMenu(id: MenuId, anchor: HTMLElement): void {
  closeMenu();
  openMenuId = id;
  anchor.setAttribute("aria-expanded", "true");
  const list = commands().filter((c) => c.menu === id);
  const box = document.createElement("div");
  box.className = "menu-dropdown";
  box.setAttribute("role", "menu");
  let lastGroup: string | undefined;
  for (const command of list) {
    if (lastGroup !== undefined && command.group !== lastGroup) {
      const sep = document.createElement("div");
      sep.className = "menu-sep";
      box.append(sep);
    }
    lastGroup = command.group;
    box.append(itemRow(command, closeMenu));
  }
  const rect = anchor.getBoundingClientRect();
  box.style.left = `${rect.left}px`;
  box.style.top = `${rect.bottom + 2}px`;
  document.body.append(box);
  dropdown = box;
}

export function initMenuBar(host: HTMLElement): void {
  bar = host;
  const render = () => {
    host.replaceChildren(
      ...MENUS.filter((m) => commands().some((c) => c.menu === m.id)).map((m) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "menubar-item";
        button.dataset.menu = m.id;
        button.textContent = m.label;
        button.setAttribute("aria-haspopup", "menu");
        button.setAttribute("aria-expanded", "false");
        // 按下就开：和桌面软件一样，按住拖到菜单项上松开也能选
        button.addEventListener("pointerdown", (e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          if (openMenuId === m.id) closeMenu();
          else openMenu(m.id, button);
        });
        // 已经开着一个菜单时，指到别的菜单名就换过去
        button.addEventListener("pointerenter", () => {
          if (openMenuId && openMenuId !== m.id) openMenu(m.id, button);
        });
        return button;
      }),
    );
  };
  onCommandsChanged(render);
  render();
  document.addEventListener("pointerdown", (e) => {
    if (!dropdown) return;
    const target = e.target as Node;
    if (dropdown.contains(target) || host.contains(target)) return;
    closeMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && dropdown) closeMenu();
  });
  window.addEventListener("blur", closeMenu);
}

// ---------- 命令面板 ----------

let palette: HTMLElement | null = null;

export function openCommandPalette(extra: () => Command[] = () => []): void {
  if (palette) return;
  const backdrop = document.createElement("div");
  backdrop.className = "palette-backdrop";
  const box = document.createElement("div");
  box.className = "command-palette";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "命令面板");
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "输入命令或项目名……";
  input.spellcheck = false;
  const list = document.createElement("div");
  list.className = "command-list";
  list.setAttribute("role", "listbox");
  box.append(input, list);
  backdrop.append(box);
  document.body.append(backdrop);
  palette = backdrop;
  let active = 0;
  let shown: Command[] = [];
  const close = () => {
    backdrop.remove();
    palette = null;
  };
  const render = () => {
    const all = [...commands(), ...extra()].filter((c) => !c.enabled || c.enabled());
    shown = all.filter((c) => matchesQuery(c, input.value)).slice(0, 40);
    active = Math.min(active, Math.max(0, shown.length - 1));
    list.replaceChildren(
      ...shown.map((command, index) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "command-row" + (index === active ? " active" : "");
        row.dataset.command = command.id;
        const menu = MENUS.find((m) => m.id === command.menu)?.label;
        const label = document.createElement("span");
        label.textContent = menu ? `${menu} ▸ ${command.label}` : command.label;
        const keys = document.createElement("span");
        keys.className = "menu-keys";
        keys.textContent = shortcutLabel(command.shortcut);
        row.append(label, keys);
        row.addEventListener("pointermove", () => {
          if (active === index) return;
          active = index;
          render();
        });
        row.addEventListener("click", () => {
          close();
          void command.run();
        });
        return row;
      }),
    );
    if (shown.length === 0) {
      const empty = document.createElement("div");
      empty.className = "command-empty";
      empty.textContent = "没有匹配的命令";
      list.append(empty);
    }
  };
  input.addEventListener("input", () => {
    active = 0;
    render();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % Math.max(1, shown.length);
      render();
      list.querySelector(".active")?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const command = shown[active];
      close();
      if (command) void command.run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  });
  backdrop.addEventListener("pointerdown", (e) => {
    if (e.target === backdrop) close();
  });
  render();
  input.focus();
}

/** 快捷键一览：命令表里写了快捷键的，加上画布上的操作 */
export function openShortcutSheet(canvasKeys: ReadonlyArray<[string, string]>): void {
  const backdrop = document.createElement("div");
  backdrop.className = "palette-backdrop";
  const box = document.createElement("div");
  box.className = "shortcut-sheet";
  box.setAttribute("role", "dialog");
  const title = document.createElement("h3");
  title.textContent = "快捷键";
  const table = document.createElement("div");
  table.className = "shortcut-table";
  const rows: Array<[string, string]> = [
    ...commands()
      .filter((c) => c.shortcut)
      .map((c): [string, string] => [shortcutLabel(c.shortcut), c.label]),
    ...canvasKeys,
  ];
  for (const [keys, what] of rows) {
    const k = document.createElement("kbd");
    k.textContent = keys;
    const w = document.createElement("span");
    w.textContent = what;
    table.append(k, w);
  }
  const done = document.createElement("button");
  done.type = "button";
  done.className = "sheet-close";
  done.textContent = "关闭";
  const close = () => backdrop.remove();
  done.addEventListener("click", close);
  backdrop.addEventListener("pointerdown", (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener("keydown", function esc(e) {
    if (e.key !== "Escape") return;
    document.removeEventListener("keydown", esc);
    close();
  });
  box.append(title, table, done);
  backdrop.append(box);
  document.body.append(backdrop);
  done.focus();
}
