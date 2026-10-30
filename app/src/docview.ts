// 文档页签的“源码 | 预览”双模式与所见即所得 Markdown 编辑（设计文档第 3.4 节、第 8.13 节）：
// - 源码模式：直接编辑 Markdown 原文；
// - 文档预览模式：渲染标题、列表、表格、代码块、引用、图片与链接，支持原地所见即所得编辑；
// - 往返友好：按块拆分文档，未修改的块原样保留原文（连同空格和换行），只对改动过的块重新生成 Markdown；
// - 标记保护：<!-- ui-section: ... -->、<!-- /ui-section --> 和 <!-- 🔒 ... --> 显示为不可删除的标签或锁图标；
// - 原始 HTML 块显示为“请在源码模式中编辑”，保存时原样保留。

const DOC_MODE_KEY = "vf.docMode";

export type DocEditMode = "source" | "preview";

interface DocBlock {
  id: string;
  kind:
    | "section-open"
    | "section-close"
    | "lock-marker"
    | "raw-html"
    | "heading"
    | "list"
    | "table"
    | "code"
    | "blockquote"
    | "hr"
    | "paragraph"
    | "blank";
  /** 原始文本（含该块原本的末尾换行），未修改时原样输出 */
  raw: string;
  /** 该块末尾跟了多少个换行符，重新生成时保持一致 */
  trailingNewlines: string;
  /** 是否在预览模式中被用户改动过 */
  dirty: boolean;
  /** 该块是否处于锁定只读范围（由小节内或顶层 <!-- 🔒 ... --> 标记决定） */
  locked?: boolean;
  /** heading 级别 1..6 */
  level?: number;
  /** list 是否为有序列表 */
  ordered?: boolean;
  /** code 语言标记 */
  codeLang?: string;
  /** section-open 的小节标记名 */
  sectionName?: string;
  /** 渲染对应的 DOM 节点 */
  el?: HTMLElement;
}

let blockSeq = 0;
function nextBlockId(): string {
  return `doc-blk-${++blockSeq}`;
}

// ---------- Markdown 分块解析（保留每块原文，保证未改动的块逐字不变） ----------

const SECTION_OPEN_RE = /^<!--\s*ui-section:\s*([^\s-]+?)\s*-->[ \t]*$/;
const SECTION_CLOSE_RE = /^<!--\s*\/ui-section\s*-->[ \t]*$/;
const LOCK_MARKER_RE = /^<!--\s*🔒[\s\S]*?-->[ \t]*$/;
const HEADING_RE = /^(#{1,6})[ \t]+(.*)$/;
const UL_ITEM_RE = /^([ \t]*)[-*+][ \t]+(.*)$/;
const OL_ITEM_RE = /^([ \t]*)\d+\.[ \t]+(.*)$/;
const HR_RE = /^(?:---+|\*\*\*+|___+)[ \t]*$/;
const CODE_FENCE_RE = /^```([^\n`]*)$/;
const TABLE_ROW_RE = /^\|.*\|[ \t]*$/;
const TABLE_SEP_RE = /^\|[ \t:|-]+\|[ \t]*$/;
const RAW_HTML_LINE_RE = /^<(?:!--|[a-zA-Z][\w:-]*(?:\s|>|\/))/;

/**
 * 把整段 Markdown 拆成顺序块，所有块的 raw 拼接起来严格等于 input。
 */
export function parseMarkdownBlocks(input: string): DocBlock[] {
  if (input === "") return [];
  // 拆分为带结尾换行符的行：每行包含自己的 \n（最后一行可能没有 \n）
  const lines: string[] = [];
  let start = 0;
  for (let i = 0; i < input.length; i++) {
    if (input[i] === "\n") {
      lines.push(input.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < input.length) lines.push(input.slice(start));

  const blocks: DocBlock[] = [];
  let i = 0;

  const stripEol = (line: string) => line.replace(/\r?\n$/, "");
  const collectTrailingBlankLines = (): string => {
    let blanks = "";
    while (i < lines.length && stripEol(lines[i]).trim() === "") {
      blanks += lines[i];
      i++;
    }
    return blanks;
  };

  // 开头如果有空行，单独作为一个 blank 块保留
  if (i < lines.length && stripEol(lines[i]).trim() === "") {
    const raw = collectTrailingBlankLines();
    blocks.push({ id: nextBlockId(), kind: "blank", raw, trailingNewlines: "", dirty: false });
  }

  while (i < lines.length) {
    const firstLine = lines[i];
    const trimmed = stripEol(firstLine);

    // 1. ui-section 开始标记
    const secOpen = SECTION_OPEN_RE.exec(trimmed);
    if (secOpen) {
      i++;
      const blanks = collectTrailingBlankLines();
      const raw = firstLine + blanks;
      const eol = (firstLine.match(/\r?\n$/)?.[0] ?? "") + blanks;
      blocks.push({
        id: nextBlockId(),
        kind: "section-open",
        raw,
        trailingNewlines: eol,
        dirty: false,
        sectionName: secOpen[1],
      });
      continue;
    }

    // 2. ui-section 结束标记
    if (SECTION_CLOSE_RE.test(trimmed)) {
      i++;
      const blanks = collectTrailingBlankLines();
      const raw = firstLine + blanks;
      const eol = (firstLine.match(/\r?\n$/)?.[0] ?? "") + blanks;
      blocks.push({
        id: nextBlockId(),
        kind: "section-close",
        raw,
        trailingNewlines: eol,
        dirty: false,
      });
      continue;
    }

    // 3. 锁定标记
    if (LOCK_MARKER_RE.test(trimmed)) {
      i++;
      const blanks = collectTrailingBlankLines();
      const raw = firstLine + blanks;
      const eol = (firstLine.match(/\r?\n$/)?.[0] ?? "") + blanks;
      blocks.push({
        id: nextBlockId(),
        kind: "lock-marker",
        raw,
        trailingNewlines: eol,
        dirty: false,
      });
      continue;
    }

    // 4. 围栏代码块 ```
    const fence = CODE_FENCE_RE.exec(trimmed);
    if (fence) {
      let rawBody = firstLine;
      i++;
      while (i < lines.length) {
        const l = lines[i];
        rawBody += l;
        i++;
        if (/^```[ \t]*$/.test(stripEol(l))) break;
      }
      const blanks = collectTrailingBlankLines();
      const eol = (rawBody.match(/\r?\n$/)?.[0] ?? "") + blanks;
      blocks.push({
        id: nextBlockId(),
        kind: "code",
        raw: rawBody + blanks,
        trailingNewlines: eol,
        dirty: false,
        codeLang: fence[1].trim(),
      });
      continue;
    }

    // 5. 标题
    const heading = HEADING_RE.exec(trimmed);
    if (heading) {
      i++;
      const blanks = collectTrailingBlankLines();
      const eol = (firstLine.match(/\r?\n$/)?.[0] ?? "") + blanks;
      blocks.push({
        id: nextBlockId(),
        kind: "heading",
        raw: firstLine + blanks,
        trailingNewlines: eol,
        dirty: false,
        level: heading[1].length,
      });
      continue;
    }

    // 6. 分隔线
    if (HR_RE.test(trimmed)) {
      i++;
      const blanks = collectTrailingBlankLines();
      const eol = (firstLine.match(/\r?\n$/)?.[0] ?? "") + blanks;
      blocks.push({
        id: nextBlockId(),
        kind: "hr",
        raw: firstLine + blanks,
        trailingNewlines: eol,
        dirty: false,
      });
      continue;
    }

    // 7. 表格（至少两行：表头 + 分隔行）
    if (TABLE_ROW_RE.test(trimmed) && i + 1 < lines.length && TABLE_SEP_RE.test(stripEol(lines[i + 1]))) {
      let rawBody = "";
      while (i < lines.length && TABLE_ROW_RE.test(stripEol(lines[i]))) {
        rawBody += lines[i];
        i++;
      }
      const blanks = collectTrailingBlankLines();
      const eol = (rawBody.match(/\r?\n$/)?.[0] ?? "") + blanks;
      blocks.push({
        id: nextBlockId(),
        kind: "table",
        raw: rawBody + blanks,
        trailingNewlines: eol,
        dirty: false,
      });
      continue;
    }

    // 8. 列表（无序或有序）
    const isUl = UL_ITEM_RE.test(trimmed);
    const isOl = !isUl && OL_ITEM_RE.test(trimmed);
    if (isUl || isOl) {
      let rawBody = "";
      while (i < lines.length) {
        const t = stripEol(lines[i]);
        if (isUl ? UL_ITEM_RE.test(t) : OL_ITEM_RE.test(t)) {
          rawBody += lines[i];
          i++;
        } else {
          break;
        }
      }
      const blanks = collectTrailingBlankLines();
      const eol = (rawBody.match(/\r?\n$/)?.[0] ?? "") + blanks;
      blocks.push({
        id: nextBlockId(),
        kind: "list",
        raw: rawBody + blanks,
        trailingNewlines: eol,
        dirty: false,
        ordered: isOl,
      });
      continue;
    }

    // 9. 引用块 >
    if (/^>[ \t]?/.test(trimmed)) {
      let rawBody = "";
      while (i < lines.length && /^>[ \t]?/.test(stripEol(lines[i]))) {
        rawBody += lines[i];
        i++;
      }
      const blanks = collectTrailingBlankLines();
      const eol = (rawBody.match(/\r?\n$/)?.[0] ?? "") + blanks;
      blocks.push({
        id: nextBlockId(),
        kind: "blockquote",
        raw: rawBody + blanks,
        trailingNewlines: eol,
        dirty: false,
      });
      continue;
    }

    // 10. 原始 HTML 块（含无法可视化编辑的标签或普通 HTML 注释）
    if (RAW_HTML_LINE_RE.test(trimmed)) {
      let rawBody = "";
      while (i < lines.length && stripEol(lines[i]).trim() !== "") {
        const t = stripEol(lines[i]);
        if (SECTION_OPEN_RE.test(t) || SECTION_CLOSE_RE.test(t) || LOCK_MARKER_RE.test(t)) break;
        rawBody += lines[i];
        i++;
      }
      const blanks = collectTrailingBlankLines();
      const eol = (rawBody.match(/\r?\n$/)?.[0] ?? "") + blanks;
      blocks.push({
        id: nextBlockId(),
        kind: "raw-html",
        raw: rawBody + blanks,
        trailingNewlines: eol,
        dirty: false,
      });
      continue;
    }

    // 11. 普通段落（连续非特殊行合并为一个段落块）
    let rawBody = "";
    let containsRawHtml = false;
    while (i < lines.length) {
      const t = stripEol(lines[i]);
      if (t.trim() === "") break;
      if (
        SECTION_OPEN_RE.test(t) ||
        SECTION_CLOSE_RE.test(t) ||
        LOCK_MARKER_RE.test(t) ||
        CODE_FENCE_RE.test(t) ||
        HEADING_RE.test(t) ||
        HR_RE.test(t) ||
        UL_ITEM_RE.test(t) ||
        OL_ITEM_RE.test(t) ||
        /^>[ \t]?/.test(t) ||
        (TABLE_ROW_RE.test(t) && i + 1 < lines.length && TABLE_SEP_RE.test(stripEol(lines[i + 1])))
      ) {
        break;
      }
      if (/<[a-zA-Z][\w:-]*[\s>/]/.test(t)) containsRawHtml = true;
      rawBody += lines[i];
      i++;
    }
    const blanks = collectTrailingBlankLines();
    const eol = (rawBody.match(/\r?\n$/)?.[0] ?? "") + blanks;
    blocks.push({
      id: nextBlockId(),
      kind: containsRawHtml ? "raw-html" : "paragraph",
      raw: rawBody + blanks,
      trailingNewlines: eol,
      dirty: false,
    });
  }

  // 计算锁定状态：
  // - 若 lock-marker 出现在所有 ui-section 外部（顶层），整份文档所有块均为 locked；
  // - 若 lock-marker 出现在某个 ui-section 内部，仅锁定该小节内的所有块，不影响其他小节。
  let globalLocked = false;
  let inSection: string | null = null;
  const lockedSections = new Set<string>();
  for (const b of blocks) {
    if (b.kind === "section-open") {
      inSection = b.sectionName ?? "";
    } else if (b.kind === "section-close") {
      inSection = null;
    } else if (b.kind === "lock-marker") {
      if (inSection !== null) lockedSections.add(inSection);
      else globalLocked = true;
    }
  }
  inSection = null;
  for (const b of blocks) {
    if (b.kind === "section-open") {
      inSection = b.sectionName ?? "";
      b.locked = globalLocked || lockedSections.has(inSection);
    } else if (b.kind === "section-close") {
      b.locked = globalLocked || (inSection !== null && lockedSections.has(inSection));
      inSection = null;
    } else {
      b.locked = globalLocked || (inSection !== null && lockedSections.has(inSection));
    }
  }

  return blocks;
}

// ---------- 行内 Markdown 渲染与反序列化 ----------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function unescapeHtmlEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

/**
 * 过滤并校验链接或图片地址，拦截 javascript: / vbscript: / data:text/html 等危险协议。
 * 安全时返回去掉首尾空白的地址，不安全时返回空字符串。
 */
export function sanitizeUrl(rawUrl: string, isImage = false): string {
  const decoded = unescapeHtmlEntities(rawUrl).replace(/[\u0000-\u001f\u007f]+/g, "").trim();
  if (!decoded) return "";
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(decoded.replace(/\s+/g, ""));
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (scheme === "http" || scheme === "https" || scheme === "mailto") {
      return decoded;
    }
    if (isImage && scheme === "data") {
      if (/^data:image\/(?:png|jpe?g|gif|webp|bmp);base64,[a-z0-9+/=\s]+$/i.test(decoded)) {
        return decoded;
      }
      return "";
    }
    return "";
  }
  return decoded;
}

/**
 * 把相对于文档所在目录的图片路径解析为浏览器可加载的地址，
 * 同时在 data-md-src 中保留原始相对路径以便往返。
 */
export function resolveDocImageSrc(safeSrc: string, docPath?: string): string {
  if (!safeSrc) return "";
  if (/^(?:https?:|mailto:|data:|blob:|\/|#)/i.test(safeSrc)) return safeSrc;
  const effectiveDocPath = docPath ?? getCurrentDocPath();
  const baseParts = effectiveDocPath
    ? effectiveDocPath.replace(/\\/g, "/").split("/").slice(0, -1).filter(Boolean)
    : [];
  for (const part of safeSrc.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (baseParts.length === 0) return "";
      baseParts.pop();
    } else {
      baseParts.push(part);
    }
  }
  const relPath = baseParts.join("/");
  if (!relPath) return "";
  return `/__fs/read?path=${encodeURIComponent(relPath)}`;
}

/** 把行内 Markdown（图片、链接、行内代码、加粗、斜体）转为安全的 HTML。 */
export function inlineMarkdownToHtml(md: string, docPath?: string): string {
  // 用占位符隔离已生成的 HTML 片段，防止二次正则替换污染标签属性或破坏 URL 中的 *
  const cleanMd = md.replace(/\u0000/g, "");
  let html = escapeHtml(cleanMd);
  const tokens: string[] = [];
  const pushToken = (fragment: string): string => {
    const idx = tokens.push(fragment) - 1;
    return `\u0000TOK${idx}\u0000`;
  };
  const stripTokens = (s: string): string =>
    s.replace(/\u0000TOK(\d+)\u0000/g, (_m, idx: string) => {
      const tok = tokens[Number(idx)] ?? "";
      return tok.replace(/<[^>]*>/g, "");
    });

  // 1. 行内代码 `code`
  html = html.replace(/`([^`\n]+)`/g, (_m, code: string) => pushToken(`<code>${code}</code>`));

  // 2. 图片 ![alt](src)
  html = html.replace(/!\[([^\]]*)\]\(([^)\n]+)\)/g, (_m, alt: string, src: string) => {
    const rawAlt = unescapeHtmlEntities(stripTokens(alt));
    const rawSrc = unescapeHtmlEntities(stripTokens(src));
    const safeSrc = sanitizeUrl(rawSrc, true);
    const resolvedSrc = safeSrc ? resolveDocImageSrc(safeSrc, docPath) : "";
    return pushToken(
      `<img class="doc-img" alt="${escapeHtml(rawAlt)}" src="${escapeHtml(resolvedSrc)}" data-md-src="${escapeHtml(safeSrc)}" />`,
    );
  });

  // 3. 链接 [text](href)
  html = html.replace(/\[([^\]]+)\]\(([^)\n]+)\)/g, (_m, label: string, href: string) => {
    const rawHref = unescapeHtmlEntities(stripTokens(href));
    const safeHref = sanitizeUrl(rawHref, false);
    return pushToken(
      `<a href="${escapeHtml(safeHref)}" data-md-href="${escapeHtml(safeHref)}" target="_blank" rel="noreferrer">${label}</a>`,
    );
  });

  // 4. 加粗 **bold**
  html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  // 5. 斜体 *italic*
  html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
  // 6. 换行
  html = html.replace(/\n/g, "<br>");
  // 7. 还原占位符（可含链接 label 内的行内代码，最多展开两层，但绝不递归解析 Markdown）
  for (let pass = 0; pass < 2 && html.includes("\u0000TOK"); pass++) {
    html = html.replace(/\u0000TOK(\d+)\u0000/g, (_m, idx: string) => tokens[Number(idx)] ?? "");
  }
  return html;
}

/** 把编辑后的 DOM 节点还原为行内 Markdown。 */
export function domToInlineMarkdown(root: Node): string {
  if (root.nodeType === Node.TEXT_NODE) {
    return (root.textContent ?? "").replace(/\u00a0/g, " ");
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return "";
  const el = root as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === "br") return "\n";
  if (tag === "img") {
    const alt = el.getAttribute("alt") ?? "";
    const rawSrc = el.getAttribute("data-md-src") ?? el.getAttribute("src") ?? "";
    const src = sanitizeUrl(rawSrc, true);
    return `![${alt}](${src})`;
  }
  const inner = Array.from(el.childNodes).map(domToInlineMarkdown).join("");
  if (tag === "strong" || tag === "b") return inner ? `**${inner}**` : "";
  if (tag === "em" || tag === "i") return inner ? `*${inner}*` : "";
  if (tag === "code") return `\`${el.textContent ?? ""}\``;
  if (tag === "a") {
    const rawHref = el.getAttribute("data-md-href") ?? el.getAttribute("href") ?? "";
    const href = sanitizeUrl(rawHref, false);
    return `[${inner}](${href})`;
  }
  if (tag === "li") {
    return (el.previousElementSibling ? "\n" : "") + inner;
  }
  if (tag === "div" || tag === "p") {
    return (el.previousSibling ? "\n" : "") + inner;
  }
  return inner;
}

function trimTrailingNewlines(raw: string): string {
  return raw.replace(/(?:\r?\n)+$/, "");
}

/**
 * 拆分 Markdown 表格的一行单元格，识别转义竖线 `\|` 并将其还原为 `|`。
 */
export function parseTableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "");
  return trimmed.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}

/**
 * 把一个块序列化回 Markdown：
 * - 未修改过的块（!block.dirty）直接返回 block.raw，逐字不变；
 * - 修改过的块根据当前 DOM 生成 Markdown，并保留原本的块尾空行。
 */
export function serializeBlock(block: DocBlock): string {
  if (!block.dirty || !block.el) return block.raw;
  const tail = block.trailingNewlines;

  switch (block.kind) {
    case "section-open":
    case "section-close":
    case "lock-marker":
    case "raw-html":
    case "blank":
      return block.raw;
    case "hr":
      return `---${tail}`;
    case "heading": {
      const lvl = Math.max(1, Math.min(6, block.level ?? 2));
      const text = domToInlineMarkdown(block.el).replace(/\n+/g, " ").trim();
      return `${"#".repeat(lvl)} ${text}${tail}`;
    }
    case "paragraph": {
      const text = domToInlineMarkdown(block.el).replace(/\n+$/, "");
      return `${text}${tail}`;
    }
    case "blockquote": {
      const text = domToInlineMarkdown(block.el).replace(/\n+$/, "");
      const quoted = text
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n");
      return `${quoted}${tail}`;
    }
    case "list": {
      const items = Array.from(block.el.querySelectorAll<HTMLElement>(":scope > li"));
      const lines = items.map((li, idx) => {
        const indent = li.dataset.indent ?? "";
        const content = domToInlineMarkdown(li).replace(/\n+/g, " ").trim();
        return block.ordered ? `${indent}${idx + 1}. ${content}` : `${indent}- ${content}`;
      });
      return `${lines.join("\n")}${tail}`;
    }
    case "code": {
      const codeEl = block.el.querySelector("code");
      const codeText = (codeEl?.textContent ?? "").replace(/\n$/, "");
      const lang = block.codeLang ?? "";
      return `\`\`\`${lang}\n${codeText}\n\`\`\`${tail}`;
    }
    case "table": {
      const table = block.el.querySelector("table");
      if (!table) return block.raw;
      const thEls = Array.from(table.querySelectorAll<HTMLElement>("thead th"));
      const headerCells = thEls.map((th) =>
        domToInlineMarkdown(th).replace(/\n+/g, " ").replace(/\|/g, "\\|").trim(),
      );
      if (headerCells.length === 0) return block.raw;
      const trEls = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"));
      const colCount = Math.max(
        headerCells.length,
        ...trEls.map((tr) => tr.querySelectorAll("td").length),
      );
      while (headerCells.length < colCount) headerCells.push("");
      const sepCells = Array.from({ length: colCount }, (_, idx) => {
        const rawAlign = thEls[idx]?.dataset.align?.trim() ?? "";
        return /^:?-+:?$/.test(rawAlign) ? rawAlign : "---";
      });
      const sepLine = `| ${sepCells.join(" | ")} |`;
      const headLine = `| ${headerCells.join(" | ")} |`;
      const bodyRows = trEls.map((tr) => {
        const cells = Array.from(tr.querySelectorAll<HTMLElement>("td")).map((td) =>
          domToInlineMarkdown(td).replace(/\n+/g, " ").replace(/\|/g, "\\|").trim(),
        );
        while (cells.length < colCount) cells.push("");
        return `| ${cells.slice(0, colCount).join(" | ")} |`;
      });
      return `${[headLine, sepLine, ...bodyRows].join("\n")}${tail}`;
    }
  }
}

export function serializeBlocks(blocks: DocBlock[]): string {
  return blocks.map(serializeBlock).join("");
}

// ---------- 界面组件：源码 | 预览 切换 + 所见即所得视图 ----------

export interface DocViewHost {
  getProject(): {
    pageDoc: string;
    docs: Map<string, string>;
    logic: { objects?: Record<string, { doc?: string }> };
  };
  getSelectedId(): string | null;
  onViewFullDoc?: () => void;
}

let docHost: DocViewHost | null = null;
let currentMode: DocEditMode = "preview";
let currentBlocks: DocBlock[] = [];
let lastRenderedSource = "";
let lastRenderedDisabled = false;
let updatingTextareaFromPreview = false;
let activeEditableBlock: DocBlock | null = null;
let pendingScrollSection: string | null = null;

let previewContainer: HTMLElement | null = null;
let floatingBar: HTMLElement | null = null;
let modeBtnSource: HTMLButtonElement | null = null;
let modeBtnPreview: HTMLButtonElement | null = null;

function isPreviewWindowLocation(): boolean {
  try {
    return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "1";
  } catch {
    return false;
  }
}

function getCurrentDocPath(): string | undefined {
  if (!docHost) return undefined;
  const proj = docHost.getProject();
  const selId = docHost.getSelectedId();
  if (!selId) return proj.pageDoc;
  const rawRef = proj.logic.objects?.[selId]?.doc;
  if (!rawRef) return proj.pageDoc;
  const hashIdx = rawRef.indexOf("#");
  const filePath = (hashIdx >= 0 ? rawRef.slice(0, hashIdx) : rawRef).trim();
  return filePath || proj.pageDoc;
}

function loadSavedMode(): DocEditMode {
  try {
    const v = localStorage.getItem(DOC_MODE_KEY);
    if (v === "source" || v === "preview") return v;
  } catch {
    // 忽略
  }
  return "preview";
}

function saveMode(next: DocEditMode): void {
  try {
    localStorage.setItem(DOC_MODE_KEY, next);
  } catch {
    // 忽略
  }
}

function getDocTextarea(): HTMLTextAreaElement | null {
  return document.getElementById("doc-text") as HTMLTextAreaElement | null;
}

/** 从预览视图把改动同步回 #doc-text，并触发它的 input 事件以便自动保存。 */
function commitPreviewChanges(): void {
  const textarea = getDocTextarea();
  if (!textarea) return;
  const nextMarkdown = serializeBlocks(currentBlocks);
  lastRenderedSource = nextMarkdown;
  if (textarea.value === nextMarkdown) return;
  updatingTextareaFromPreview = true;
  textarea.value = nextMarkdown;
  textarea.dispatchEvent(new Event("input"));
  updatingTextareaFromPreview = false;
}

/** 在预览中选中某块时，把 #doc-text 的选区同步到该块对应的字符区间，使“引用所选”按钮准确算出该段行号。 */
function syncSelectionToTextarea(block: DocBlock): void {
  const textarea = getDocTextarea();
  if (!textarea) return;
  let offset = 0;
  for (const b of currentBlocks) {
    const serialized = serializeBlock(b);
    if (b === block) {
      textarea.selectionStart = offset;
      textarea.selectionEnd = offset + trimTrailingNewlines(serialized).length;
      return;
    }
    offset += serialized.length;
  }
}

function isDocumentLocked(blocks: DocBlock[], disabled: boolean): boolean {
  if (disabled) return true;
  const editableKinds = blocks.filter(
    (b) =>
      b.kind !== "blank" &&
      b.kind !== "section-open" &&
      b.kind !== "section-close" &&
      b.kind !== "lock-marker" &&
      b.kind !== "raw-html" &&
      b.kind !== "hr",
  );
  if (editableKinds.length > 0 && editableKinds.every((b) => Boolean(b.locked))) {
    return true;
  }
  return blocks.some((b) => b.kind === "lock-marker") && !blocks.some((b) => b.kind === "section-open");
}

/** 构建单个块在文档预览模式下的 DOM 元素。 */
function renderBlockElement(block: DocBlock, readOnly: boolean): HTMLElement {
  const blockReadOnly = readOnly || Boolean(block.locked);
  const bodyRaw = trimTrailingNewlines(block.raw);
  const docPath = getCurrentDocPath();

  if (block.kind === "blank") {
    const span = document.createElement("div");
    span.className = "doc-blank";
    block.el = span;
    return span;
  }

  if (block.kind === "section-open") {
    const bar = document.createElement("div");
    bar.className = "doc-marker doc-section-tag";
    bar.contentEditable = "false";
    const name = block.sectionName ?? "";
    // 查找引用该小节的控件
    const refs: string[] = [];
    const objects = docHost?.getProject().logic.objects ?? {};
    for (const [cid, obj] of Object.entries(objects)) {
      if (obj?.doc?.endsWith(`#${name}`)) refs.push(cid);
    }
    bar.textContent = `小节标记：${name}${refs.length ? ` · ${refs.join("、")}` : ""}`;
    bar.title = "小节标记受保护，在文档预览模式中不可删除";
    block.el = bar;
    return bar;
  }

  if (block.kind === "section-close") {
    const end = document.createElement("div");
    end.className = "doc-marker doc-section-end";
    end.contentEditable = "false";
    end.textContent = "/ui-section";
    end.title = "小节结束标记受保护，不可删除";
    block.el = end;
    return end;
  }

  if (block.kind === "lock-marker") {
    const lock = document.createElement("div");
    lock.className = "doc-marker doc-lock-tag";
    lock.contentEditable = "false";
    lock.textContent = "🔒 已锁定内容（只读，请勿修改）";
    block.el = lock;
    return lock;
  }

  if (block.kind === "raw-html") {
    const box = document.createElement("div");
    box.className = "doc-raw-html";
    box.contentEditable = "false";
    const badge = document.createElement("div");
    badge.className = "doc-raw-html-badge";
    badge.textContent = "请在源码模式中编辑（保存时原样保留）";
    const code = document.createElement("pre");
    code.textContent = bodyRaw;
    box.append(badge, code);
    block.el = box;
    return box;
  }

  if (block.kind === "hr") {
    const wrap = document.createElement("div");
    wrap.className = "doc-hr-wrap";
    wrap.contentEditable = "false";
    wrap.append(document.createElement("hr"));
    block.el = wrap;
    return wrap;
  }

  if (block.kind === "heading") {
    const level = Math.max(1, Math.min(6, block.level ?? 2));
    const tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
    const el = document.createElement(tag);
    el.className = `doc-heading doc-h${level}`;
    el.contentEditable = String(!blockReadOnly);
    const match = HEADING_RE.exec(bodyRaw);
    const contentMd = match ? match[2] : bodyRaw;
    el.innerHTML = inlineMarkdownToHtml(contentMd, docPath);
    bindEditableBlockEvents(block, el, blockReadOnly);
    block.el = el;
    return el;
  }

  if (block.kind === "blockquote") {
    const el = document.createElement("blockquote");
    el.className = "doc-blockquote";
    el.contentEditable = String(!blockReadOnly);
    const innerMd = bodyRaw
      .split(/\r?\n/)
      .map((l) => l.replace(/^>[ \t]?/, ""))
      .join("\n");
    el.innerHTML = inlineMarkdownToHtml(innerMd, docPath);
    bindEditableBlockEvents(block, el, blockReadOnly);
    block.el = el;
    return el;
  }

  if (block.kind === "code") {
    const wrap = document.createElement("div");
    wrap.className = "doc-code-wrap";
    const head = document.createElement("div");
    head.className = "doc-code-head";
    head.textContent = block.codeLang ? `代码（${block.codeLang}）` : "代码块";
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.contentEditable = String(!blockReadOnly);
    const codeLines = bodyRaw.split(/\r?\n/);
    const inner = codeLines.slice(1, codeLines[codeLines.length - 1]?.startsWith("```") ? -1 : undefined).join("\n");
    code.textContent = inner;
    code.addEventListener("focus", () => {
      activeEditableBlock = block;
      syncSelectionToTextarea(block);
    });
    code.addEventListener("input", () => {
      if (blockReadOnly) return;
      block.dirty = true;
      commitPreviewChanges();
    });
    pre.append(code);
    wrap.append(head, pre);
    block.el = wrap;
    return wrap;
  }

  if (block.kind === "list") {
    const listEl = document.createElement(block.ordered ? "ol" : "ul");
    listEl.className = "doc-list";
    const lines = bodyRaw.split(/\r?\n/);
    for (const line of lines) {
      const m = block.ordered ? OL_ITEM_RE.exec(line) : UL_ITEM_RE.exec(line);
      const indent = m?.[1] ?? "";
      const itemMd = m?.[2] ?? line;
      const li = createListItemElement(block, listEl, itemMd, blockReadOnly, indent);
      listEl.append(li);
    }
    block.el = listEl;
    return listEl;
  }

  if (block.kind === "table") {
    const wrap = document.createElement("div");
    wrap.className = "doc-table-wrap";
    const table = document.createElement("table");
    table.className = "doc-table";
    const lines = bodyRaw.split(/\r?\n/);
    const headers = parseTableCells(lines[0] ?? "| 列 1 | 列 2 |");
    const sepCells = parseTableCells(lines[1] ?? "");
    const rows = lines.slice(2).map(parseTableCells);
    const colCount = Math.max(headers.length, ...rows.map((r) => r.length));
    while (headers.length < colCount) headers.push(`列 ${headers.length + 1}`);

    const thead = document.createElement("thead");
    const headTr = document.createElement("tr");
    for (let c = 0; c < colCount; c++) {
      const th = createTableCellElement(block, table, "th", headers[c] ?? "", blockReadOnly);
      const rawAlign = sepCells[c]?.trim() ?? "";
      if (/^:?-+:?$/.test(rawAlign)) {
        th.dataset.align = rawAlign;
      }
      headTr.append(th);
    }
    thead.append(headTr);

    const tbody = document.createElement("tbody");
    for (const r of rows) {
      const tr = document.createElement("tr");
      for (let c = 0; c < colCount; c++) {
        tr.append(createTableCellElement(block, table, "td", r[c] ?? "", blockReadOnly));
      }
      tbody.append(tr);
    }
    table.append(thead, tbody);
    wrap.append(table);

    if (!blockReadOnly) {
      const actions = document.createElement("div");
      actions.className = "doc-table-actions";
      const addRowBtn = document.createElement("button");
      addRowBtn.type = "button";
      addRowBtn.textContent = "+ 添加行";
      addRowBtn.addEventListener("click", () => {
        addTableRow(block, table, blockReadOnly);
      });
      const addColBtn = document.createElement("button");
      addColBtn.type = "button";
      addColBtn.textContent = "+ 添加列";
      addColBtn.addEventListener("click", () => {
        addTableColumn(block, table, blockReadOnly);
      });
      actions.append(addRowBtn, addColBtn);
      wrap.append(actions);
    }

    block.el = wrap;
    return wrap;
  }

  // 默认：paragraph
  const p = document.createElement("p");
  p.className = "doc-p";
  p.contentEditable = String(!blockReadOnly);
  p.innerHTML = inlineMarkdownToHtml(bodyRaw, docPath);
  bindEditableBlockEvents(block, p, blockReadOnly);
  block.el = p;
  return p;
}

function createListItemElement(
  block: DocBlock,
  listEl: HTMLElement,
  itemMd: string,
  readOnly: boolean,
  indent = "",
): HTMLLIElement {
  const li = document.createElement("li");
  li.contentEditable = String(!readOnly);
  if (indent) {
    li.dataset.indent = indent;
    const spaces = indent.replace(/\t/g, "  ").length;
    li.style.marginLeft = `${Math.min(6, Math.floor(spaces / 2)) * 18}px`;
  }
  li.innerHTML = inlineMarkdownToHtml(itemMd, getCurrentDocPath());
  li.addEventListener("focus", () => {
    activeEditableBlock = block;
    syncSelectionToTextarea(block);
  });
  li.addEventListener("input", () => {
    if (readOnly) return;
    block.dirty = true;
    commitPreviewChanges();
  });
  li.addEventListener("keydown", (e) => {
    if (readOnly) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const nextLi = createListItemElement(block, listEl, "", readOnly, li.dataset.indent ?? "");
      li.after(nextLi);
      block.dirty = true;
      commitPreviewChanges();
      nextLi.focus();
    } else if (e.key === "Backspace" && (li.textContent ?? "") === "" && listEl.children.length > 1) {
      e.preventDefault();
      const prev = (li.previousElementSibling ?? li.nextElementSibling) as HTMLElement | null;
      li.remove();
      block.dirty = true;
      commitPreviewChanges();
      prev?.focus();
    }
  });
  return li;
}

function addTableRow(block: DocBlock, table: HTMLTableElement, readOnly: boolean): HTMLTableCellElement | null {
  if (readOnly || block.locked) return null;
  const colCount = table.querySelectorAll("thead th").length || 2;
  const tbody = table.querySelector("tbody") ?? table.appendChild(document.createElement("tbody"));
  const tr = document.createElement("tr");
  let firstTd: HTMLTableCellElement | null = null;
  for (let c = 0; c < colCount; c++) {
    const td = createTableCellElement(block, table, "td", "", readOnly);
    if (c === 0) firstTd = td;
    tr.append(td);
  }
  tbody.append(tr);
  block.dirty = true;
  commitPreviewChanges();
  firstTd?.focus();
  return firstTd;
}

function addTableColumn(block: DocBlock, table: HTMLTableElement, readOnly: boolean): void {
  if (readOnly || block.locked) return;
  const headTr = table.querySelector("thead tr");
  if (!headTr) return;
  const colIndex = headTr.children.length + 1;
  headTr.append(createTableCellElement(block, table, "th", `列 ${colIndex}`, readOnly));
  for (const tr of Array.from(table.querySelectorAll("tbody tr"))) {
    tr.append(createTableCellElement(block, table, "td", "", readOnly));
  }
  block.dirty = true;
  commitPreviewChanges();
}

function createTableCellElement(
  block: DocBlock,
  table: HTMLTableElement,
  tag: "th" | "td",
  cellMd: string,
  readOnly: boolean,
): HTMLTableCellElement {
  const cell = document.createElement(tag);
  cell.contentEditable = String(!readOnly);
  cell.innerHTML = inlineMarkdownToHtml(cellMd, getCurrentDocPath());
  cell.addEventListener("focus", () => {
    activeEditableBlock = block;
    syncSelectionToTextarea(block);
  });
  cell.addEventListener("input", () => {
    if (readOnly) return;
    block.dirty = true;
    commitPreviewChanges();
  });
  cell.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const cells = Array.from(table.querySelectorAll<HTMLTableCellElement>("th, td"));
      const idx = cells.indexOf(cell);
      if (e.shiftKey) {
        if (idx > 0) cells[idx - 1].focus();
      } else if (idx >= 0 && idx + 1 < cells.length) {
        cells[idx + 1].focus();
      } else if (!readOnly) {
        addTableRow(block, table, readOnly);
      }
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
    }
  });
  return cell;
}

/** 为可编辑段落/标题/引用绑定输入、当场 Markdown 转换（## 、- 、1. ）和回车分段。 */
function bindEditableBlockEvents(block: DocBlock, el: HTMLElement, readOnly: boolean): void {
  el.addEventListener("focus", () => {
    activeEditableBlock = block;
    syncSelectionToTextarea(block);
  });

  el.addEventListener("input", () => {
    if (readOnly || block.locked) return;
    const rawText = (el.textContent ?? "").replace(/\u00a0/g, " ");

    // 行首输入 Markdown 语法时当场转换：# ~ ###### 转为标题，- / * 转为无序列表，1. 转为有序列表
    const headingShortcut = /^(#{1,6})\s(.*)$/.exec(rawText);
    if (headingShortcut && (block.kind === "paragraph" || block.kind === "heading")) {
      const nextLevel = headingShortcut[1].length;
      const restText = headingShortcut[2];
      convertBlockToHeading(block, nextLevel, restText, readOnly);
      return;
    }
    const ulShortcut = /^[-*]\s(.*)$/.exec(rawText);
    if (ulShortcut && block.kind === "paragraph") {
      convertBlockToList(block, false, ulShortcut[1], readOnly);
      return;
    }
    const olShortcut = /^1\.\s(.*)$/.exec(rawText);
    if (olShortcut && block.kind === "paragraph") {
      convertBlockToList(block, true, olShortcut[1], readOnly);
      return;
    }

    block.dirty = true;
    commitPreviewChanges();
  });

  el.addEventListener("keydown", (e) => {
    if (readOnly || block.locked) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // 支持在光标处切分段落：提取光标之后的 DOM 内容到新段落中
      let afterMd = "";
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        if (!range.collapsed) range.deleteContents();
        const tailRange = document.createRange();
        tailRange.selectNodeContents(el);
        tailRange.setStart(range.endContainer, range.endOffset);
        const frag = tailRange.extractContents();
        const holder = document.createElement("div");
        holder.append(frag);
        afterMd = domToInlineMarkdown(holder).trim();
        block.dirty = true;
      }
      insertNewParagraphAfter(block, readOnly, afterMd);
    }
  });
}

function placeCaretAtEnd(el: HTMLElement): void {
  el.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function placeCaretAtStart(el: HTMLElement): void {
  el.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function replaceBlockInDOM(block: DocBlock, readOnly: boolean): HTMLElement {
  const oldEl = block.el;
  const newEl = renderBlockElement(block, readOnly);
  if (oldEl && oldEl.parentElement) {
    oldEl.replaceWith(newEl);
  }
  return newEl;
}

/** 把当前块切换成指定级别的标题（或恢复为普通段落）。 */
export function convertBlockToHeading(
  block: DocBlock,
  level: number | null,
  overrideText?: string,
  readOnly = false,
): void {
  if (readOnly || block.locked || lastRenderedDisabled) return;
  const currentText = overrideText !== undefined
    ? overrideText
    : block.el
      ? domToInlineMarkdown(block.el).replace(/\n+/g, level === null ? "\n" : " ").trim()
      : trimTrailingNewlines(block.raw).replace(/^#{1,6}\s+/, "");
  const tail = block.trailingNewlines;
  if (level === null || level <= 0) {
    block.kind = "paragraph";
    delete block.level;
    delete block.ordered;
    block.raw = `${currentText}${tail}`;
  } else {
    block.kind = "heading";
    block.level = level;
    delete block.ordered;
    block.raw = `${"#".repeat(level)} ${currentText}${tail}`;
  }
  block.dirty = true;
  const newEl = replaceBlockInDOM(block, readOnly);
  commitPreviewChanges();
  placeCaretAtEnd(newEl);
}

/** 把当前块转换成无序或有序列表。 */
export function convertBlockToList(
  block: DocBlock,
  ordered: boolean,
  overrideText?: string,
  readOnly = false,
): void {
  if (readOnly || block.locked || lastRenderedDisabled) return;
  let itemLines: Array<{ indent: string; text: string }>;
  if (overrideText !== undefined) {
    itemLines = [{ indent: "", text: overrideText }];
  } else if (block.kind === "list" && block.el) {
    const lis = Array.from(block.el.querySelectorAll<HTMLElement>(":scope > li"));
    itemLines = lis.map((li) => ({
      indent: li.dataset.indent ?? "",
      text: domToInlineMarkdown(li).replace(/\n+/g, " ").trim(),
    }));
  } else if (block.el) {
    const rawLines = domToInlineMarkdown(block.el).split("\n").map((l) => l.trim()).filter(Boolean);
    itemLines = (rawLines.length > 0 ? rawLines : [""]).map((text) => ({ indent: "", text }));
  } else {
    itemLines = [{ indent: "", text: trimTrailingNewlines(block.raw) }];
  }
  const tail = block.trailingNewlines;
  block.kind = "list";
  block.ordered = ordered;
  delete block.level;
  const formatted = itemLines
    .map((item, idx) => (ordered ? `${item.indent}${idx + 1}. ${item.text}` : `${item.indent}- ${item.text}`))
    .join("\n");
  block.raw = `${formatted}${tail}`;
  block.dirty = true;
  const newEl = replaceBlockInDOM(block, readOnly);
  commitPreviewChanges();
  const firstLi = newEl.querySelector<HTMLElement>("li");
  if (firstLi) placeCaretAtEnd(firstLi);
}

function insertNewParagraphAfter(target: DocBlock, readOnly: boolean, initialMd = ""): void {
  if (readOnly || target.locked || lastRenderedDisabled) return;
  const idx = currentBlocks.indexOf(target);
  if (idx < 0) return;
  const nextBlockAfterTarget = currentBlocks[idx + 1];
  const oldTail = target.trailingNewlines;
  // target 现在后面紧跟新段落，确保 target 块尾有两个换行（即空一行分段）
  target.trailingNewlines = "\n\n";
  target.raw = `${trimTrailingNewlines(target.raw)}\n\n`;
  target.dirty = true;
  // 新段落继承 target 原本的块尾换行（若后面还有普通内容块，确保至少空一行）
  const newTail =
    nextBlockAfterTarget && nextBlockAfterTarget.kind !== "section-close"
      ? (oldTail.length >= 2 ? oldTail : "\n\n")
      : oldTail;
  const newBlock: DocBlock = {
    id: nextBlockId(),
    kind: "paragraph",
    raw: `${initialMd}${newTail}`,
    trailingNewlines: newTail,
    dirty: true,
    locked: Boolean(target.locked),
  };
  currentBlocks.splice(idx + 1, 0, newBlock);
  const newEl = renderBlockElement(newBlock, readOnly);
  target.el?.after(newEl);
  commitPreviewChanges();
  if (initialMd) placeCaretAtStart(newEl);
  else newEl.focus();
}

function insertTableAfterActive(readOnly: boolean): void {
  if (readOnly || lastRenderedDisabled || activeEditableBlock?.locked) return;
  const tableBody = "| 列 1 | 列 2 |\n| --- | --- |\n| 内容 1 | 内容 2 |";
  const idx = activeEditableBlock ? currentBlocks.indexOf(activeEditableBlock) : -1;
  if (idx >= 0 && activeEditableBlock?.el) {
    const oldTail = activeEditableBlock.trailingNewlines;
    activeEditableBlock.trailingNewlines = "\n\n";
    activeEditableBlock.raw = `${trimTrailingNewlines(activeEditableBlock.raw)}\n\n`;
    activeEditableBlock.dirty = true;
    const nextBlk = currentBlocks[idx + 1];
    const newTail = nextBlk && nextBlk.kind !== "section-close" ? (oldTail.length >= 2 ? oldTail : "\n\n") : oldTail;
    const newBlock: DocBlock = {
      id: nextBlockId(),
      kind: "table",
      raw: `${tableBody}${newTail}`,
      trailingNewlines: newTail,
      dirty: true,
    };
    currentBlocks.splice(idx + 1, 0, newBlock);
    const newEl = renderBlockElement(newBlock, readOnly);
    activeEditableBlock.el.after(newEl);
  } else if (previewContainer) {
    const closeIdx = currentBlocks.findIndex((b) => b.kind === "section-close");
    const prevIdx = closeIdx >= 0 ? closeIdx - 1 : currentBlocks.length - 1;
    const prevBlk = prevIdx >= 0 ? currentBlocks[prevIdx] : undefined;
    let newTail = "\n\n";
    if (prevBlk) {
      newTail = prevBlk.trailingNewlines;
      prevBlk.trailingNewlines = "\n\n";
      prevBlk.raw = `${trimTrailingNewlines(prevBlk.raw)}\n\n`;
      prevBlk.dirty = true;
    }
    const newBlock: DocBlock = {
      id: nextBlockId(),
      kind: "table",
      raw: `${tableBody}${newTail}`,
      trailingNewlines: newTail,
      dirty: true,
    };
    if (closeIdx >= 0 && currentBlocks[closeIdx].el) {
      currentBlocks.splice(closeIdx, 0, newBlock);
      const newEl = renderBlockElement(newBlock, readOnly);
      currentBlocks[closeIdx + 1].el?.before(newEl);
    } else {
      currentBlocks.push(newBlock);
      const newEl = renderBlockElement(newBlock, readOnly);
      previewContainer.append(newEl);
    }
  }
  commitPreviewChanges();
}

/** 选中文字时浮出的小工具条：加粗、斜体、标题、列表、行内代码、链接、表格。 */
function applyInlineFormat(kind: "bold" | "italic" | "code" | "link"): void {
  const block = activeEditableBlock;
  if (!block || !block.el || block.locked || lastRenderedDisabled) return;
  if (kind === "bold") {
    document.execCommand("bold");
  } else if (kind === "italic") {
    document.execCommand("italic");
  } else if (kind === "code") {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      const text = range.toString();
      const codeNode = document.createElement("code");
      codeNode.textContent = text;
      range.deleteContents();
      range.insertNode(codeNode);
    }
  } else if (kind === "link") {
    const rawUrl = window.prompt("链接地址：", "https://") ?? "";
    const safeHref = sanitizeUrl(rawUrl, false);
    if (!safeHref) return;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      const text = range.toString();
      const a = document.createElement("a");
      a.href = safeHref;
      a.setAttribute("data-md-href", safeHref);
      a.target = "_blank";
      a.rel = "noreferrer";
      a.textContent = text;
      range.deleteContents();
      range.insertNode(a);
    }
  }
  block.dirty = true;
  commitPreviewChanges();
}

function buildFloatingToolbar(): HTMLElement {
  const bar = document.createElement("div");
  bar.id = "doc-format-bar";
  bar.className = "doc-format-bar";
  bar.hidden = true;
  bar.addEventListener("pointerdown", (e) => e.preventDefault());

  const addBtn = (label: string, title: string, onClick: () => void) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.title = title;
    btn.addEventListener("click", onClick);
    bar.append(btn);
  };

  addBtn("B", "加粗", () => applyInlineFormat("bold"));
  addBtn("I", "斜体", () => applyInlineFormat("italic"));
  addBtn("H2", "二级标题", () => {
    if (activeEditableBlock && !activeEditableBlock.locked) convertBlockToHeading(activeEditableBlock, 2);
  });
  addBtn("H3", "三级标题", () => {
    if (activeEditableBlock && !activeEditableBlock.locked) convertBlockToHeading(activeEditableBlock, 3);
  });
  addBtn("正文", "转为普通段落", () => {
    if (activeEditableBlock && !activeEditableBlock.locked) convertBlockToHeading(activeEditableBlock, null);
  });
  addBtn("• 列表", "转为无序列表", () => {
    if (activeEditableBlock && !activeEditableBlock.locked) convertBlockToList(activeEditableBlock, false);
  });
  addBtn("<>", "行内代码", () => applyInlineFormat("code"));
  addBtn("链接", "插入链接", () => applyInlineFormat("link"));
  addBtn("+ 表格", "在下方插入表格", () => insertTableAfterActive(false));

  document.body.append(bar);
  return bar;
}

function updateFloatingToolbarPosition(): void {
  if (
    !floatingBar ||
    !previewContainer ||
    currentMode !== "preview" ||
    lastRenderedDisabled ||
    previewContainer.classList.contains("readonly") ||
    activeEditableBlock?.locked
  ) {
    if (floatingBar) floatingBar.hidden = true;
    return;
  }
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
    floatingBar.hidden = true;
    return;
  }
  const anchor = sel.anchorNode;
  if (!anchor || !previewContainer.contains(anchor)) {
    floatingBar.hidden = true;
    return;
  }
  const anchorEl = anchor.nodeType === Node.ELEMENT_NODE ? (anchor as HTMLElement) : anchor.parentElement;
  if (!anchorEl || !anchorEl.closest('[contenteditable="true"]')) {
    floatingBar.hidden = true;
    return;
  }
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    floatingBar.hidden = true;
    return;
  }
  floatingBar.hidden = false;
  const barRect = floatingBar.getBoundingClientRect();
  const left = Math.max(8, Math.min(window.innerWidth - barRect.width - 8, rect.left + rect.width / 2 - barRect.width / 2));
  const top = Math.max(8, rect.top - barRect.height - 6);
  floatingBar.style.left = `${left}px`;
  floatingBar.style.top = `${top}px`;
}

function renderPreviewFromSource(markdown: string, disabled: boolean): void {
  if (!previewContainer) return;
  currentBlocks = parseMarkdownBlocks(markdown);
  lastRenderedSource = markdown;
  lastRenderedDisabled = disabled;
  activeEditableBlock = null;

  const readOnly = isDocumentLocked(currentBlocks, disabled);
  previewContainer.classList.toggle("readonly", readOnly);
  previewContainer.replaceChildren();
  if (readOnly && floatingBar) floatingBar.hidden = true;

  if (disabled && markdown.trim() === "") {
    const empty = document.createElement("div");
    empty.className = "doc-preview-empty muted";
    empty.textContent = "这个控件还没有说明，点击上方“创建说明”开始编写。";
    previewContainer.append(empty);
    return;
  }

  // 顶部快捷格式条（在可编辑状态下方便随时切换标题、列表、插入表格）
  if (!readOnly) {
    const quickBar = document.createElement("div");
    quickBar.className = "doc-quick-bar";
    quickBar.contentEditable = "false";
    const mkQuick = (label: string, title: string, fn: () => void) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.title = title;
      b.addEventListener("pointerdown", (e) => e.preventDefault());
      b.addEventListener("click", fn);
      quickBar.append(b);
    };
    const pickTarget = (kinds: Array<DocBlock["kind"]>): DocBlock | undefined => {
      if (activeEditableBlock && !activeEditableBlock.locked && kinds.includes(activeEditableBlock.kind)) {
        return activeEditableBlock;
      }
      return currentBlocks.find((b) => !b.locked && kinds.includes(b.kind));
    };
    mkQuick("H2", "把当前段设为二级标题", () => {
      const target = pickTarget(["paragraph", "heading"]);
      if (target) convertBlockToHeading(target, 2);
    });
    mkQuick("H3", "把当前段设为三级标题", () => {
      const target = pickTarget(["paragraph", "heading"]);
      if (target) convertBlockToHeading(target, 3);
    });
    mkQuick("正文", "把当前段恢复为普通段落", () => {
      const target = pickTarget(["heading", "list"]);
      if (target) convertBlockToHeading(target, null);
    });
    mkQuick("• 列表", "把当前段设为无序列表", () => {
      const target = pickTarget(["paragraph", "list"]);
      if (target) convertBlockToList(target, false);
    });
    mkQuick("+ 表格", "在下方插入表格", () => insertTableAfterActive(false));
    mkQuick("+ 段落", "在末尾添加新段落", () => {
      const lastEditable = [...currentBlocks]
        .reverse()
        .find((b) => !b.locked && b.kind !== "section-close" && b.kind !== "blank" && b.kind !== "lock-marker");
      if (lastEditable) insertNewParagraphAfter(lastEditable, false);
    });
    previewContainer.append(quickBar);
  }

  for (const block of currentBlocks) {
    previewContainer.append(renderBlockElement(block, readOnly));
  }
}

export function setDocEditMode(next: DocEditMode): void {
  const textarea = getDocTextarea();
  if (!textarea || !previewContainer) return;

  // 切换模式前记住滚动位置比例
  const fromEl = currentMode === "source" ? textarea : previewContainer;
  const maxScrollFrom = Math.max(1, fromEl.scrollHeight - fromEl.clientHeight);
  const scrollRatio = fromEl.scrollTop / maxScrollFrom;

  currentMode = next;
  saveMode(next);

  modeBtnSource?.setAttribute("aria-pressed", String(next === "source"));
  modeBtnPreview?.setAttribute("aria-pressed", String(next === "preview"));

  if (next === "preview") {
    renderPreviewFromSource(textarea.value, textarea.disabled);
    textarea.hidden = true;
    previewContainer.hidden = false;
    const maxScrollTo = Math.max(0, previewContainer.scrollHeight - previewContainer.clientHeight);
    previewContainer.scrollTop = scrollRatio * maxScrollTo;
  } else {
    if (floatingBar) floatingBar.hidden = true;
    previewContainer.hidden = true;
    textarea.hidden = false;
    const maxScrollTo = Math.max(0, textarea.scrollHeight - textarea.clientHeight);
    textarea.scrollTop = scrollRatio * maxScrollTo;
  }
}

export function getDocEditMode(): DocEditMode {
  return currentMode;
}

/**
 * 当右侧面板重新渲染或外部修改文件后，同步更新文档预览视图。
 */
export function syncDocView(): void {
  if (isPreviewWindowLocation() || updatingTextareaFromPreview) return;
  const textarea = getDocTextarea();
  if (!textarea || !previewContainer) return;

  // 选中控件并显示其说明小节时，在 #doc-note 旁提供“查看整份文档”按钮
  const docNote = document.getElementById("doc-note");
  const selectedId = docHost?.getSelectedId() ?? null;
  if (docNote && selectedId && !textarea.disabled && !docNote.querySelector("button") && docHost?.onViewFullDoc) {
    const rawDocRef = docHost.getProject().logic.objects?.[selectedId]?.doc ?? "";
    const hashIdx = rawDocRef.indexOf("#");
    const secName = hashIdx >= 0 ? rawDocRef.slice(hashIdx + 1).trim() : null;
    const fullBtn = document.createElement("button");
    fullBtn.type = "button";
    fullBtn.textContent = "查看整份文档";
    fullBtn.addEventListener("click", () => {
      pendingScrollSection = secName;
      docHost?.onViewFullDoc?.();
    });
    docNote.append(fullBtn);
  }

  if (currentMode === "preview") {
    textarea.hidden = true;
    previewContainer.hidden = false;
    if (textarea.value !== lastRenderedSource || textarea.disabled !== lastRenderedDisabled) {
      renderPreviewFromSource(textarea.value, textarea.disabled);
    }
    if (pendingScrollSection) {
      const secBlock = currentBlocks.find((b) => b.kind === "section-open" && b.sectionName === pendingScrollSection);
      secBlock?.el?.scrollIntoView({ block: "start" });
      pendingScrollSection = null;
    }
  } else {
    previewContainer.hidden = true;
    textarea.hidden = false;
    if (pendingScrollSection) {
      const lines = textarea.value.split("\n");
      const lineIdx = lines.findIndex((l) => l.includes(`ui-section: ${pendingScrollSection}`));
      if (lineIdx >= 0) textarea.scrollTop = Math.max(0, lineIdx - 1) * 18;
      pendingScrollSection = null;
    }
  }
}

/**
 * 初始化文档页签的“源码 | 预览”切换开关与所见即所得编辑器。
 */
export function initDocView(host: DocViewHost): void {
  if (isPreviewWindowLocation()) return;
  docHost = host;
  const paneDoc = document.getElementById("pane-doc");
  const textarea = getDocTextarea();
  const noteRow = paneDoc?.querySelector<HTMLElement>(".note-row");
  if (!paneDoc || !textarea || !noteRow) return;

  // 1. 在 .note-row 里加入“源码 | 预览”切换按钮组
  const modeSwitch = document.createElement("div");
  modeSwitch.className = "segmented doc-mode-switch";
  modeSwitch.setAttribute("role", "group");
  modeSwitch.setAttribute("aria-label", "文档编辑模式");

  modeBtnSource = document.createElement("button");
  modeBtnSource.id = "doc-mode-source";
  modeBtnSource.type = "button";
  modeBtnSource.textContent = "源码";
  modeBtnSource.addEventListener("click", () => setDocEditMode("source"));

  modeBtnPreview = document.createElement("button");
  modeBtnPreview.id = "doc-mode-preview";
  modeBtnPreview.type = "button";
  modeBtnPreview.textContent = "预览";
  modeBtnPreview.addEventListener("click", () => setDocEditMode("preview"));

  modeSwitch.append(modeBtnSource, modeBtnPreview);
  const quoteBtn = document.getElementById("doc-quote");
  if (quoteBtn) noteRow.insertBefore(modeSwitch, quoteBtn);
  else noteRow.append(modeSwitch);

  // 2. 创建所见即所得容器 #doc-preview
  previewContainer = document.createElement("div");
  previewContainer.id = "doc-preview";
  previewContainer.className = "doc-preview";
  textarea.after(previewContainer);

  // 3. 创建选中文字时的浮动格式条
  floatingBar = buildFloatingToolbar();
  document.addEventListener("selectionchange", () => {
    updateFloatingToolbarPosition();
  });

  // 4. 源码框输入变化时，若切回预览能拿到最新内容
  textarea.addEventListener("input", () => {
    if (!updatingTextareaFromPreview && currentMode === "preview") {
      renderPreviewFromSource(textarea.value, textarea.disabled);
    }
  });

  // 默认模式：设计文档第 3.4 节要求默认使用文档预览模式，并记住用户选择
  const initialMode = loadSavedMode();
  setDocEditMode(initialMode);
}
