// 项目样式表里有哪些“样式类”可以选。右侧“属性”页签据此列出能点选的样式，检查据此判断写的样式类存不存在。
// 不碰网页，只读样式表的文字。

export interface ClassStyle {
  /** 类名，写进节点的 props.class */
  name: string;
  /** 给人看的名字；样式表里没标就和类名一样 */
  label: string;
  /** 写在哪个样式表里 */
  path: string;
  /** 是不是样式表里用 @style 明确标出来的 */
  declared: boolean;
}

const CLASS_NAME = "[A-Za-z_][A-Za-z0-9_-]*";

/**
 * 样式表里可以这样标出一个给人选的样式：
 *
 *   /* @style 正文 *\/
 *   .body { font-size: 8.5pt; line-height: 15pt; }
 *
 * 有这种标记时只列标了的；一个都没标时，退而列出所有单独成一条规则的类（`.name { … }`）。
 */
export function classStylesOf(styles: ReadonlyArray<{ path: string; text: string }>): ClassStyle[] {
  const declared: ClassStyle[] = [];
  const plain: ClassStyle[] = [];
  const seen = new Set<string>();
  for (const { path, text } of styles) {
    const marker = new RegExp(`/\\*\\s*@style\\s+([^*]+?)\\s*\\*/\\s*\\.(${CLASS_NAME})`, "g");
    for (const match of text.matchAll(marker)) {
      if (seen.has(match[2])) continue;
      seen.add(match[2]);
      declared.push({ name: match[2], label: match[1].trim(), path, declared: true });
    }
  }
  if (declared.length > 0) return declared;
  for (const { path, text } of styles) {
    const stripped = text.replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = new RegExp(`(^|[}\\n;])\\s*\\.(${CLASS_NAME})\\s*\\{`, "g");
    for (const match of stripped.matchAll(rule)) {
      if (seen.has(match[2])) continue;
      seen.add(match[2]);
      plain.push({ name: match[2], label: match[2], path, declared: false });
    }
  }
  return plain;
}

/** 样式表里出现过的全部类名（不管是不是单独成规则），用来判断节点上写的类有没有着落。 */
export function classNamesIn(styles: ReadonlyArray<{ path: string; text: string }>): Set<string> {
  const names = new Set<string>();
  for (const { text } of styles) {
    const stripped = text.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const match of stripped.matchAll(new RegExp(`\\.(${CLASS_NAME})`, "g"))) names.add(match[1]);
  }
  return names;
}

/** "a  b c" → ["a", "b", "c"] */
export function splitClasses(value: unknown): string[] {
  return typeof value === "string" ? value.split(/\s+/).filter(Boolean) : [];
}

/** 在一串类名里加上或去掉一个，别的保持原来的顺序。 */
export function toggleClass(value: unknown, name: string): string {
  const list = splitClasses(value);
  const at = list.indexOf(name);
  if (at >= 0) list.splice(at, 1);
  else list.push(name);
  return list.join(" ");
}
