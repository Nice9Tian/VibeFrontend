// 文本框的内容怎么写回文件。
// 内容是一段 HTML，存在 scene.json 的 props.html 里。浏览器自己吐出来的 HTML 属性用双引号，
// 放进 JSON 里每个引号前都要加反斜杠，人和 Agent 都不好读。这里自己把 DOM 写成 HTML：属性用单引号，
// 写法固定，同样的内容每次得到同样的文字，差异比较才干净。

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

/** 编辑时浏览器会自己加上的属性，不属于内容。 */
const EDITING_ATTRIBUTES = new Set(["contenteditable", "spellcheck", "data-vf-editing"]);

function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/'/g, "&#39;").replace(/</g, "&lt;");
}

function serializeNode(node: Node, out: string[]): void {
  if (node.nodeType === 3) {
    // 不间断空格写成实体，免得和普通空格分不清
    out.push(escapeText(node.nodeValue ?? "").replace(/ /g, "&nbsp;"));
    return;
  }
  if (node.nodeType !== 1) return;
  const el = node as Element;
  const tag = el.localName;
  // 脚本不属于内容：控件的行为写在 components/ 里
  if (tag === "script") return;
  out.push(`<${tag}`);
  for (const attr of Array.from(el.attributes)) {
    if (EDITING_ATTRIBUTES.has(attr.name) || attr.name.startsWith("on")) continue;
    out.push(attr.value === "" ? ` ${attr.name}` : ` ${attr.name}='${escapeAttribute(attr.value)}'`);
  }
  out.push(">");
  if (VOID_TAGS.has(tag)) return;
  for (const child of Array.from(el.childNodes)) serializeNode(child, out);
  out.push(`</${tag}>`);
}

/** 把一个元素里面的内容写成 HTML（不含它自己）。 */
export function serializeChildren(root: Element): string {
  const out: string[] = [];
  for (const child of Array.from(root.childNodes)) serializeNode(child, out);
  return out.join("");
}

/**
 * 在画布上直接改完字之后，整理浏览器留下的痕迹再存：
 * - 整段只剩一个换行符（内容删光了）时，当成空的；
 * - 没有任何标签的内容，末尾多出来的换行符去掉。
 */
export function serializeEdited(root: Element): string {
  const html = serializeChildren(root);
  if (html === "<br>" || html === "<div><br></div>") return "";
  return html;
}

/** 把一段纯文字变成能放进 props.html 的内容：换行变成 <br>。 */
export function textToHtml(text: string): string {
  return escapeText(text).replace(/\r?\n/g, "<br>");
}
