// 编辑器的命令：菜单栏、命令面板（Ctrl+K）和快捷键列表都从这一张表来。
// 一个命令写一次：名字、在哪个菜单、快捷键（只用来显示，按键本身由各自的模块处理，除非 bind 为 true）、能不能用、有没有勾。

export type MenuId = "file" | "edit" | "view" | "window" | "help";

export const MENUS: ReadonlyArray<{ id: MenuId; label: string }> = [
  { id: "file", label: "文件" },
  { id: "edit", label: "编辑" },
  { id: "view", label: "视图" },
  { id: "window", label: "窗口" },
  { id: "help", label: "帮助" },
];

export interface Command {
  id: string;
  label: string;
  /** 放在哪个菜单里；不写就只在命令面板里 */
  menu?: MenuId;
  /** 同一个菜单里按 group 分段，段与段之间画分隔线 */
  group?: string;
  /** 快捷键的写法，例如 "Ctrl+Shift+Z"；Mac 上显示时 Ctrl 换成 ⌘ */
  shortcut?: string;
  /** 由这里绑定快捷键（已有模块自己处理按键的命令不要设） */
  bind?: boolean;
  /** 命令面板里搜索时额外匹配的词 */
  keywords?: string;
  run(): void | Promise<void>;
  enabled?(): boolean;
  checked?(): boolean;
}

const table = new Map<string, Command>();
const listeners: Array<() => void> = [];

export function registerCommand(command: Command): void {
  table.set(command.id, command);
  for (const listener of listeners) listener();
}

export function unregisterCommand(id: string): void {
  if (table.delete(id)) for (const listener of listeners) listener();
}

export function commands(): Command[] {
  return [...table.values()];
}

export function onCommandsChanged(listener: () => void): void {
  listeners.push(listener);
}

export function runCommand(id: string): void {
  const command = table.get(id);
  if (!command || (command.enabled && !command.enabled())) return;
  void command.run();
}

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

/** 显示用的快捷键 */
export function shortcutLabel(shortcut: string | undefined): string {
  if (!shortcut) return "";
  return isMac ? shortcut.replace(/Ctrl\+/g, "⌘").replace(/Shift\+/g, "⇧").replace(/Alt\+/g, "⌥") : shortcut;
}

/** 这个按键是不是这条快捷键（只认 Ctrl / Shift / Alt + 一个键） */
export function matchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.split("+");
  const key = parts.pop()!.toLowerCase();
  const want = new Set(parts.map((p) => p.toLowerCase()));
  const ctrl = e.ctrlKey || e.metaKey;
  if (want.has("ctrl") !== ctrl || want.has("shift") !== e.shiftKey || want.has("alt") !== e.altKey) return false;
  return e.key.toLowerCase() === key || e.code.toLowerCase() === `key${key}`;
}

/** 搜索：每个词都要出现在名字、菜单名或关键词里，不分大小写 */
export function matchesQuery(command: Command, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const menu = MENUS.find((m) => m.id === command.menu)?.label ?? "";
  const hay = `${command.label} ${menu} ${command.keywords ?? ""} ${command.id}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

document.addEventListener("keydown", (e) => {
  const target = e.target as HTMLElement | null;
  const typing = target && (target.matches("input, textarea, select") || target.isContentEditable);
  for (const command of table.values()) {
    if (!command.bind || !command.shortcut || !matchesShortcut(e, command.shortcut)) continue;
    // 文字框里只放行带 Ctrl 的（例如 Ctrl+K 命令面板）
    if (typing && !(e.ctrlKey || e.metaKey)) continue;
    e.preventDefault();
    runCommand(command.id);
    return;
  }
});
