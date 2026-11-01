// “引用”：把界面上选中的东西变成一段可以贴给 Agent 的文字，精确到文件和行号。
import { isMap, isScalar, parseDocument, type Node } from "yaml";
import { childrenOfNode, LOGIC_PATH, parseDocRef, SCENE_PATH, sectionOffsets, STANDARD_COMPONENTS, type Project } from "./model.ts";

/** 行号从 1 开始，首尾都包含。 */
export interface LineRange {
  start: number;
  end: number;
}

export function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") line++;
  }
  return line;
}

function rangeOf(text: string, startOffset: number, endOffset: number): LineRange {
  // 结束位置如果正好落在换行符后面，就退回到上一行
  const last = Math.max(startOffset, endOffset - 1);
  return { start: lineAt(text, startOffset), end: lineAt(text, last) };
}

/** scene.json 中某个节点从 `"id": {` 到对应的 `}` 所在的行。 */
export function sceneNodeRange(sceneText: string, id: string): LineRange | null {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`"${escaped}"\\s*:\\s*\\{`).exec(sceneText);
  if (!match) return null;
  let depth = 0;
  let inString = false;
  for (let i = match.index + match[0].length - 1; i < sceneText.length; i++) {
    const ch = sceneText[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}" && --depth === 0) {
      return rangeOf(sceneText, match.index, i + 1);
    }
  }
  return null;
}

/** YAML 中某个条目所在的行，path 例如 ["objects", "lampA"]、["events", "allOff"]。 */
export function logicEntryRange(logicText: string, path: string[]): LineRange | null {
  const doc = parseDocument(logicText);
  if (doc.errors.length > 0) return null;
  let cursor: unknown = doc.contents;
  let found: { key: Node; value: Node | null } | null = null;
  for (const part of path) {
    if (!isMap(cursor)) return null;
    const pair = cursor.items.find((item) => isScalar(item.key) && item.key.value === part);
    if (!pair) return null;
    found = { key: pair.key as Node, value: pair.value as Node | null };
    cursor = pair.value;
  }
  if (!found?.key.range) return null;
  const end = found.value?.range?.[1] ?? found.key.range[1];
  return rangeOf(logicText, found.key.range[0], end);
}

/** 某一行落在 YAML 的哪个条目里，例如 ["objects", "lampA"]；不在任何条目里时返回 null。 */
export function logicPathAt(logicText: string, line: number): string[] | null {
  const doc = parseDocument(logicText);
  if (doc.errors.length > 0 || !isMap(doc.contents)) return null;
  for (const top of doc.contents.items) {
    if (!isScalar(top.key) || !isMap(top.value)) continue;
    for (const child of top.value.items) {
      if (!isScalar(child.key)) continue;
      const path = [String(top.key.value), String(child.key.value)];
      const range = logicEntryRange(logicText, path);
      if (range && line >= range.start && line <= range.end) return path;
    }
  }
  return null;
}

export function docSectionRange(docText: string, section: string): LineRange | null {
  const offsets = sectionOffsets(docText, section);
  return offsets ? rangeOf(docText, offsets.start, offsets.end) : null;
}

/** 文本框里的选区对应文件中的哪几行。firstLine 是文本框第一行在文件中的行号。 */
export function selectionRange(value: string, selectionStart: number, selectionEnd: number, firstLine = 1): LineRange {
  const range = rangeOf(value, selectionStart, Math.max(selectionStart, selectionEnd));
  return { start: range.start + firstLine - 1, end: range.end + firstLine - 1 };
}

// ---------- 引用的文字 ----------
//
// 引用是一行英文：User referenced "键=值; 键=值; ..."
// 只求信息密度，不求好读：路径相对于 root，行号写成 #起始行-结束行（从 1 开始，首尾都包含）。
// 一次引用多个控件时，第一行放它们共同的信息，后面每个控件一行，只写和别的控件不同的部分。

/** 文件位置：相对路径加行号，例如 ui/scene.json#89-96。 */
function at(relativePath: string, range?: LineRange | null): string {
  if (!range) return relativePath;
  return `${relativePath}#${range.start}${range.end > range.start ? `-${range.end}` : ""}`;
}

function joinFields(fields: Array<[string, string]>): string {
  return (
    fields
      .map(([key, value]) => `${key}=${value}`)
      .join("; ")
      // 整条引用用双引号括起来，内容里的双引号和换行要处理掉
      .replace(/"/g, "'")
      .replace(/\s*\n\s*/g, " ")
  );
}

/** 项目根目录和规则文件，每条引用都带。 */
function projectFields(project: Project): Array<[string, string]> {
  return [
    ["root", project.root.replace(/\\/g, "/").replace(/\/$/, "")],
    ["rules", "README.md"],
  ];
}

/** 把若干“键=值”拼成一条引用，末尾统一带上项目根目录和规则文件。 */
function reference(project: Project, fields: Array<[string, string]>): string {
  return `User referenced "${joinFields([...fields, ...projectFields(project)])}"`;
}

function parentChain(project: Project, id: string): string[] {
  const chain = [id];
  const visited = new Set<string>([id]);
  for (;;) {
    const parent = Object.entries(project.scene.nodes).find(([, n]) => childrenOfNode(n).includes(chain[0]));
    if (!parent || visited.has(parent[0])) return chain;
    visited.add(parent[0]);
    chain.unshift(parent[0]);
  }
}

/** 一个控件在画布、逻辑、说明三处各自的位置。 */
function controlFields(project: Project, id: string): Array<[string, string]> {
  const n = project.scene.nodes[id];
  const object = project.logic.objects?.[id];
  const fields: Array<[string, string]> = [
    ["control", id],
    ["type", n.type === "Container" ? "Container (unconverted)" : n.type],
    ["path", parentChain(project, id).join("/")],
    ["scene", at(SCENE_PATH, sceneNodeRange(project.sceneText, id))],
  ];

  const logicRange = logicEntryRange(project.logicText, ["objects", id]);
  fields.push(["logic", logicRange ? at(LOGIC_PATH, logicRange) : `none (add under objects.${id} in ${LOGIC_PATH})`]);

  if (object?.doc) {
    const { path, section } = parseDocRef(object.doc);
    const text = project.docs.get(path);
    fields.push(["doc", at(path, text !== undefined && section ? docSectionRange(text, section) : null)]);
  } else {
    fields.push(["doc", "none"]);
  }
  return fields;
}

export function controlReference(project: Project, id: string): string {
  return reference(project, controlFields(project, id));
}

/** 多个路径共同的开头。 */
function sharedPrefix(chains: string[][]): string[] {
  const [first, ...rest] = chains;
  let length = first.length;
  for (const chain of rest) {
    let same = 0;
    while (same < length && same < chain.length && chain[same] === first[same]) same++;
    length = same;
  }
  return first.slice(0, length);
}

/**
 * 同时引用多个控件。第一行是共同的信息：parent 是共同的上级，scene、logic、doc 全在同一个文件时写文件名；
 * 后面每个控件一行，只写不同的部分：行号写成 #起始行-结束行，path 只在不是 parent 的直接子节点时才写。
 */
export function controlsReference(project: Project, ids: string[]): string {
  if (ids.length === 1) return controlReference(project, ids[0]);
  const chains = ids.map((id) => parentChain(project, id));
  const parent = sharedPrefix(chains.map((chain) => chain.slice(0, -1)));
  const rows = ids.map((id, index) => {
    const row = new Map(controlFields(project, id));
    const below = chains[index].slice(parent.length);
    if (below.length > 1) row.set("path", below.join("/"));
    else row.delete("path");
    // 控件名换掉之后，还没有逻辑条目的控件这一项就相同了
    row.set("logic", row.get("logic")!.replace(`objects.${id} `, "objects.<control> "));
    return row;
  });

  const head: Array<[string, string]> = parent.length > 0 ? [["parent", parent.join("/")]] : [];
  for (const key of ["type", "scene", "logic", "doc"]) {
    const values = rows.map((row) => row.get(key)!);
    if (new Set(values).size === 1) {
      head.push([key, values[0]]);
      for (const row of rows) row.delete(key);
      continue;
    }
    const files = new Set(values.filter((value) => value.includes("#")).map((value) => value.split("#")[0]));
    if (files.size !== 1) continue;
    head.push([key, [...files][0]]);
    rows.forEach((row, index) => {
      const value = values[index];
      row.set(key, value.includes("#") ? value.slice(value.indexOf("#")) : value.split(" ")[0]);
    });
  }

  const lines = rows.map((row) => `- ${joinFields([...row])}`);
  return [`User referenced ${ids.length} controls "${joinFields([...head, ...projectFields(project)])}"`, ...lines].join("\n");
}

/** 引用素材栏里的一种控件：它的声明、实现和样式文件。 */
export function componentReference(project: Project, type: string): string {
  const decl = project.components.get(type)?.decl ?? STANDARD_COMPONENTS.get(type)?.decl;
  const folder = project.components.has(type) ? `components/${type}` : `app/standard/${type}`;
  return reference(project, [
    ["component", type],
    ["decl", `${folder}/component.json`],
    ["impl", `${folder}/${decl?.entry ?? "index.js"}`],
    ["style", `${folder}/${decl?.style ?? "style.css"}`],
  ]);
}

/** 引用某个文件中的几行（来自文档或 YAML 页签中的选区）。context 例如 ["entry", "objects.lampA"]。 */
export function linesReference(
  project: Project,
  relativePath: string,
  range: LineRange,
  context?: [string, string],
): string {
  return reference(project, [["lines", at(relativePath, range)], ...(context ? [context] : [])]);
}

/** 引用整个文件。 */
export function fileReference(project: Project, relativePath: string): string {
  return reference(project, [["file", relativePath]]);
}

/** 引用问题栏里的一条问题，带上相关控件的位置。 */
export function problemReference(project: Project, level: "error" | "hint", message: string, nodeId?: string): string {
  const fields: Array<[string, string]> = [["problem", `${level}: ${message}`]];
  if (nodeId && project.scene.nodes[nodeId]) fields.push(...controlFields(project, nodeId));
  else fields.push(["logic", LOGIC_PATH]);
  return reference(project, fields);
}

/** 没有选中任何控件时，引用整个设计项目。 */
export function projectReference(project: Project): string {
  return reference(project, [
    ["project", project.name],
    ["scene", SCENE_PATH],
    ["logic", LOGIC_PATH],
    ["doc", project.pageDoc],
  ]);
}
