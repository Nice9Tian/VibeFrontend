// 把控件的样式限定在这个控件里：给每条选择器加上 [data-vf-type="类型名"] 前缀，不依赖浏览器的 @scope。
// 只处理文字，不碰网页，编辑器的设计窗口、播放页和导出共用。

function splitSelectorList(selectorText: string): string[] {
  const parts: string[] = [];
  let current = "";
  let parenDepth = 0;
  let bracketDepth = 0;
  let quote: string | null = null;
  for (let i = 0; i < selectorText.length; i++) {
    const ch = selectorText[i];
    if (quote) {
      current += ch;
      if (ch === "\\" && i + 1 < selectorText.length) {
        current += selectorText[++i];
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "(") parenDepth++;
    else if (ch === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (ch === "[") bracketDepth++;
    else if (ch === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (ch === "," && parenDepth === 0 && bracketDepth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current) parts.push(current);
  return parts;
}

function prefixSingleSelector(prefix: string, rawSelector: string): string {
  const sel = rawSelector.trim();
  if (!sel) return "";
  if (sel === ":scope" || sel === ":root" || sel === "html" || sel === "body") {
    return prefix;
  }
  if (sel.startsWith(":scope")) {
    return `${prefix}${sel.slice(":scope".length)}`;
  }
  if (sel.startsWith(prefix)) {
    return sel;
  }
  return `${prefix} ${sel}`;
}

/** 把控件 CSS 的选择器加上 `[data-vf-type="..."]` 前缀，不依赖 @scope。 */
export function scopeComponentCss(type: string, cssText: string): string {
  const prefix = `[data-vf-type="${type}"]`;
  const stripped = cssText.replace(/\/\*[\s\S]*?\*\//g, "");
  let out = "";
  let i = 0;
  const n = stripped.length;

  while (i < n) {
    while (i < n && /\s/.test(stripped[i])) {
      out += stripped[i++];
    }
    if (i >= n) break;

    let headerStart = i;
    let quote: string | null = null;
    while (i < n && stripped[i] !== "{" && stripped[i] !== ";") {
      const ch = stripped[i];
      if (quote) {
        if (ch === "\\" && i + 1 < n) i++;
        else if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      }
      i++;
    }
    if (i >= n) {
      out += stripped.slice(headerStart);
      break;
    }
    if (stripped[i] === ";") {
      out += stripped.slice(headerStart, i + 1);
      i++;
      continue;
    }

    const header = stripped.slice(headerStart, i).trim();
    i++; // skip '{'
    const bodyStart = i;
    let depth = 1;
    quote = null;
    while (i < n && depth > 0) {
      const ch = stripped[i];
      if (quote) {
        if (ch === "\\" && i + 1 < n) i++;
        else if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
      }
      i++;
    }
    const body = stripped.slice(bodyStart, Math.max(bodyStart, i - 1));

    if (header.startsWith("@")) {
      const lower = header.toLowerCase();
      if (
        lower.startsWith("@media") ||
        lower.startsWith("@supports") ||
        lower.startsWith("@container") ||
        lower.startsWith("@layer")
      ) {
        out += `${header} {\n${scopeComponentCss(type, body)}\n}\n`;
      } else {
        out += `${header} {${body}}\n`;
      }
    } else {
      const prefixed = splitSelectorList(header)
        .map((s) => prefixSingleSelector(prefix, s))
        .filter(Boolean)
        .join(", ");
      if (prefixed) {
        out += `${prefixed} {${body}}\n`;
      }
    }
  }
  return out;
}
