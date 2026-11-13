// 把设计项目的文件读成一个 Project。不碰网页：文件怎么读由调用方提供，
// 工具界面里走 fs.ts，命令行里走 Node 的文件接口。
import { parse as parseYaml } from "yaml";
import { check } from "./check.ts";
import { DEFAULT_KIND, isKindId, KINDS, type KindId } from "./kinds.ts";
import { md5 } from "./md5.ts";
import {
  LOGIC_PATH,
  parseDocRef,
  SCENE_PATH,
  type ComponentDecl,
  type EffectDecl,
  type LoadedComponent,
  type LoadedEffect,
  type LoadedPart,
  type Logic,
  type Problem,
  type Project,
  type Scene,
} from "./model.ts";
import { isValidPartPath, MAX_PART_DEPTH, PARTS_DIR, referencedParts, ROOT_PREFIX } from "./parts.ts";
import type { ShapePreset } from "./shapes.ts";
import { canonicalJson, normalizeLf } from "./structhash.ts";

export const PRESETS_PATH = "ui/presets.json";

/** 用户存下来的图形预设放在哪：子项目和总项目共用一份（素材是整个项目的） */
export function presetsPath(partOf: Project["partOf"] | undefined): string {
  return partOf ? `${ROOT_PREFIX}${PRESETS_PATH}` : PRESETS_PATH;
}

/** 一个还什么都没放的画布：界面设计是一个空窗口，平面设计是一张 A4。 */
export function emptyScene(kind: KindId): Scene {
  if (kind === "graphic") {
    return { version: 1, unit: "mm", root: "page1", boards: ["page1"], nodes: { page1: { type: "Page", width: 210, height: 297, children: [] } } };
  }
  return { version: 1, root: "window", nodes: { window: { type: "Window", width: 480, height: 320, children: [] } } };
}

export interface ProjectIO {
  /** 设计项目文件夹的绝对路径 */
  root(): Promise<string>;
  /**
   * 路径相对于项目文件夹；文件不存在时返回 null。
   * 打开子项目时，项目自己的文件（project.json、ui/、docs/ 等）读的是子项目文件夹里的，路径以 @root/ 开头的读总项目的
   * （见 parts.ts 的 mapPartPath）。
   */
  readText(path: string): Promise<string | null>;
  listDir(path: string): Promise<Array<{ name: string; isDir: boolean }>>;
  /** 打开的子项目文件夹（parts/<名字>），打开的是总项目时为 null 或不提供 */
  part?(): string | null;
}

type ProjectConfig = {
  name?: string;
  kind?: unknown;
  part?: unknown;
  windows?: Array<{ id?: string; doc?: string }>;
  boards?: Array<{ id?: string; doc?: string }>;
  styles?: unknown;
  export?: { qt?: string; web?: string };
};

/**
 * 画布里子项目节点用到的子项目，连同它们里面又用到的，一层一层读进来（最多 MAX_PART_DEPTH 层）。
 * texts 是读到的原文，算进项目指纹：子项目一改，总项目就重新加载、重新画。
 */
async function loadParts(io: ProjectIO, scene: Scene, texts: string[]): Promise<Map<string, LoadedPart>> {
  const parts = new Map<string, LoadedPart>();
  let frontier = referencedParts(scene);
  for (let depth = 0; depth < MAX_PART_DEPTH && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const part of frontier) {
      if (parts.has(part)) continue;
      if (!isValidPartPath(part)) {
        parts.set(part, { name: part, scene: null, error: `子项目的路径 ${JSON.stringify(part)} 写得不对` });
        continue;
      }
      const configText = await io.readText(`${ROOT_PREFIX}${part}/project.json`);
      const sceneText = await io.readText(`${ROOT_PREFIX}${part}/ui/scene.json`);
      texts.push(part, configText ?? "", sceneText ?? "");
      let name = part.slice(PARTS_DIR.length + 1);
      try {
        const config = configText ? (JSON.parse(configText) as ProjectConfig) : {};
        if (typeof config.name === "string" && config.name) name = config.name;
      } catch {
        // 名字读不出来就用文件夹名；画布还能用
      }
      if (sceneText === null) {
        parts.set(part, { name, scene: null, error: `找不到 ${part}/ui/scene.json` });
        continue;
      }
      try {
        const partScene = JSON.parse(sceneText) as Scene;
        parts.set(part, { name, scene: partScene });
        next.push(...referencedParts(partScene));
      } catch (e) {
        parts.set(part, { name, scene: null, error: `${part}/ui/scene.json 不是有效的 JSON：${(e as Error).message}` });
      }
    }
    frontier = next;
  }
  return parts;
}

/** 总项目 parts/ 下的全部子项目（有 project.json 的文件夹） */
async function listParts(io: ProjectIO, texts: string[]): Promise<Array<{ part: string; name: string }>> {
  const list: Array<{ part: string; name: string }> = [];
  for (const entry of await io.listDir(`${ROOT_PREFIX}${PARTS_DIR}`)) {
    const part = `${PARTS_DIR}/${entry.name}`;
    if (!entry.isDir || !isValidPartPath(part)) continue;
    const configText = await io.readText(`${ROOT_PREFIX}${part}/project.json`);
    if (configText === null) continue;
    texts.push(part, configText);
    let name = entry.name;
    try {
      const config = JSON.parse(configText) as ProjectConfig;
      if (typeof config.name === "string" && config.name) name = config.name;
    } catch {
      // 写坏了也列出来，打开以后问题栏会说
    }
    list.push({ part, name });
  }
  return list;
}

/**
 * 效果的哈希：对名字、种类和文件夹里全部文件的内容计算 MD5，取前 8 位。
 * label 和 description 是给人看的，不参与计算；换行符统一成 LF、嵌套对象按键名递归排序后再算。
 */
export function effectHash(decl: EffectDecl, files: Record<string, string>): string {
  const { label: _label, description: _description, ...rest } = decl;
  const body = Object.keys(files)
    .filter((name) => name !== "effect.json")
    .sort()
    .map((name) => [name, normalizeLf(files[name])]);
  const canonical = JSON.stringify([canonicalJson(rest), body]);
  return md5(canonical).slice(0, 8);
}

async function loadComponent(io: ProjectIO, folder: string): Promise<LoadedComponent | null> {
  const declText = await io.readText(`components/${folder}/component.json`);
  if (declText === null) return null;
  let decl: ComponentDecl;
  try {
    decl = JSON.parse(declText) as ComponentDecl;
  } catch (e) {
    return { decl: { type: folder }, folder, error: `component.json 不是有效的 JSON：${(e as Error).message}` };
  }
  if (!decl.type) decl.type = folder;
  const svgFiles: Record<string, string> = {};
  for (const entry of await io.listDir(`components/${folder}`)) {
    if (!entry.isDir && entry.name.toLowerCase().endsWith(".svg")) {
      const svgText = await io.readText(`components/${folder}/${entry.name}`);
      if (svgText !== null) svgFiles[entry.name] = svgText;
    }
  }
  const entry = decl.entry ?? "index.js";
  const source = await io.readText(`components/${folder}/${entry}`);
  if (source === null) return { decl, folder, svgFiles, error: `找不到实现文件 ${entry}` };
  return { decl, folder, source, svgFiles };
}

async function loadEffect(io: ProjectIO, folder: string): Promise<LoadedEffect | null> {
  const declText = await io.readText(`effects/${folder}/effect.json`);
  if (declText === null) return null;
  const files: Record<string, string> = {};
  for (const entry of await io.listDir(`effects/${folder}`)) {
    if (entry.isDir) continue;
    const text = await io.readText(`effects/${folder}/${entry.name}`);
    if (text !== null) files[entry.name] = text;
  }
  let decl: EffectDecl;
  try {
    decl = JSON.parse(declText) as EffectDecl;
  } catch (e) {
    return { decl: { name: folder, kind: "" }, folder, files, hash: "", error: `effect.json 不是有效的 JSON：${(e as Error).message}` };
  }
  if (!decl.name) decl.name = folder;
  const effect: LoadedEffect = { decl, folder, files, hash: effectHash(decl, files) };
  if (files[decl.entry ?? "index.js"] === undefined) effect.error = `找不到实现文件 ${decl.entry ?? "index.js"}`;
  return effect;
}

/** previous 用于在 scene.json 或 YAML 写坏时沿用上一份有效的内容。 */
export async function loadProjectFiles(io: ProjectIO, previous: Project | null): Promise<Project> {
  const problems: Problem[] = [];
  const root = await io.root();

  let name = "未命名项目";
  let pageDoc = "docs/page.md";
  let qtExportDir: string | null = null;
  let webExportDir: string | null = null;
  let kind: KindId = DEFAULT_KIND;
  let stylePaths: string[] = [];
  const extraWindowDocs: string[] = [];
  const boardDocs: Record<string, string> = {};
  const configText = (await io.readText("project.json")) ?? "{}";
  // 子项目：设计类型、样式表、导出位置跟着总项目（子项目自己写了的除外）
  let partOf: Project["partOf"] = null;
  let masterConfigText = "";
  try {
    const config = JSON.parse(configText) as ProjectConfig;
    if (config.part !== undefined) {
      masterConfigText = (await io.readText(`${ROOT_PREFIX}project.json`)) ?? "";
      let master: ProjectConfig = {};
      try {
        master = masterConfigText ? (JSON.parse(masterConfigText) as ProjectConfig) : {};
      } catch (e) {
        problems.push({ level: "error", message: `总项目的 project.json 不是有效的 JSON：${(e as Error).message}` });
      }
      partOf = { name: typeof master.name === "string" && master.name ? master.name : "总项目", part: io.part?.() ?? null };
      if (config.kind === undefined && master.kind !== undefined) config.kind = master.kind;
      if (config.styles === undefined && master.styles !== undefined) config.styles = master.styles;
      if (config.export === undefined && master.export !== undefined) config.export = master.export;
    }
    name = config.name ?? name;
    if (config.kind !== undefined) {
      if (isKindId(config.kind)) kind = config.kind;
      else problems.push({ level: "error", message: `project.json 的 kind 写的是 ${JSON.stringify(config.kind)}，只能是 ${Object.keys(KINDS).map((k) => `"${k}"`).join(" 或 ")}；先按界面设计打开` });
    }
    // 画板和说明文档的对应：界面设计写 windows，平面设计写 boards，两个是一回事
    const boardList = config.boards ?? config.windows ?? [];
    pageDoc = boardList[0]?.doc ?? pageDoc;
    for (const win of boardList) {
      if (win?.doc) extraWindowDocs.push(win.doc);
      if (win?.id && win.doc) boardDocs[win.id] = win.doc;
    }
    if (Array.isArray(config.styles)) stylePaths = config.styles.filter((item): item is string => typeof item === "string" && item !== "");
    else if (config.styles !== undefined) problems.push({ level: "error", message: "project.json 的 styles 要写成样式表路径的数组，例如 [\"styles/text.css\"]" });
    qtExportDir = config.export?.qt ?? null;
    webExportDir = config.export?.web ?? null;
  } catch (e) {
    problems.push({ level: "error", message: `project.json 不是有效的 JSON：${(e as Error).message}` });
  }

  let scene: Scene = previous?.scene ?? emptyScene(kind);
  const sceneText = await io.readText(SCENE_PATH);
  if (sceneText === null) {
    problems.push({ level: "error", message: `找不到 ${SCENE_PATH}` });
  } else {
    try {
      scene = JSON.parse(sceneText) as Scene;
    } catch (e) {
      problems.push({ level: "error", message: `${SCENE_PATH} 不是有效的 JSON，画布沿用上一份有效内容：${(e as Error).message}` });
    }
  }

  // 项目级的样式表：读出来才能算进指纹（改了要重新挂），文字样式的清单也从这里来
  const styles: Array<{ path: string; text: string }> = [];
  for (const path of stylePaths) {
    const text = await io.readText(path);
    if (text === null) problems.push({ level: "error", message: `找不到样式表 ${path}（project.json 的 styles 里写了它）` });
    else styles.push({ path, text });
  }

  const partTexts: string[] = [];
  const parts = kind === "graphic" ? await loadParts(io, scene, partTexts) : new Map<string, LoadedPart>();
  const partList = kind === "graphic" ? await listParts(io, partTexts) : [];

  const logicText = (await io.readText(LOGIC_PATH)) ?? "";
  let logic: Logic = previous?.logic ?? {};
  try {
    logic = (parseYaml(logicText) as Logic | null) ?? {};
  } catch (e) {
    problems.push({ level: "error", message: `${LOGIC_PATH} 有语法错误，预览沿用上一份有效逻辑：${(e as Error).message}` });
  }

  const components = new Map<string, LoadedComponent>();
  const fingerprints: string[] = [];
  for (const entry of await io.listDir("components")) {
    if (!entry.isDir) continue;
    const component = await loadComponent(io, entry.name);
    if (!component) continue;
    components.set(component.decl.type, component);
    fingerprints.push(JSON.stringify(component.decl), component.source ?? "");
  }

  const effects = new Map<string, LoadedEffect>();
  for (const entry of await io.listDir("effects")) {
    if (!entry.isDir) continue;
    const effect = await loadEffect(io, entry.name);
    if (!effect) continue;
    effects.set(effect.decl.name, effect);
    fingerprints.push(JSON.stringify(effect.files));
  }

  // 纯计算 JS 函数（functions/*.js）
  const functions: Record<string, string> = {};
  for (const entry of await io.listDir("functions")) {
    if (entry.isDir || !entry.name.endsWith(".js")) continue;
    const fnName = entry.name.slice(0, -3);
    const text = await io.readText(`functions/${entry.name}`);
    if (text !== null) {
      functions[fnName] = text;
      fingerprints.push(`fn:${fnName}:${text}`);
    }
  }
  for (const [fnName, def] of Object.entries(logic.functions ?? {})) {
    if (functions[fnName] !== undefined) continue;
    const handlerPath = def?.handler ?? `functions/${fnName}.js`;
    const text = await io.readText(handlerPath);
    if (text !== null) {
      functions[fnName] = text;
      fingerprints.push(`fn:${fnName}:${text}`);
    }
  }

  // 动作实现文件（actions/*.js）
  const actionSources: Record<string, string> = {};
  for (const entry of await io.listDir("actions")) {
    if (entry.isDir || !entry.name.endsWith(".js")) continue;
    const actName = entry.name.slice(0, -3);
    const text = await io.readText(`actions/${entry.name}`);
    if (text !== null) {
      actionSources[actName] = text;
      fingerprints.push(`act:${actName}:${text}`);
    }
  }
  for (const [actName, def] of Object.entries(logic.actions ?? {})) {
    if (actionSources[actName] !== undefined) continue;
    const handlerPath = def?.handler ?? `actions/${actName}.js`;
    const text = await io.readText(handlerPath);
    if (text !== null) {
      actionSources[actName] = text;
      fingerprints.push(`act:${actName}:${text}`);
    }
  }

  // 用户存下来的图形预设
  let presets: ShapePreset[] = [];
  const presetsText = await io.readText(presetsPath(partOf));
  if (presetsText !== null) {
    try {
      const parsed = JSON.parse(presetsText) as { presets?: ShapePreset[] };
      presets = (parsed.presets ?? []).filter((preset) => preset && (preset.type === "Shape" || preset.type === "Line"));
    } catch (e) {
      problems.push({ level: "error", message: `${PRESETS_PATH} 不是有效的 JSON：${(e as Error).message}` });
    }
  }

  const docs = new Map<string, string>();
  const docPaths = new Set<string>([pageDoc, ...extraWindowDocs]);
  for (const object of Object.values(logic.objects ?? {})) {
    if (object?.doc) docPaths.add(parseDocRef(object.doc).path);
  }
  for (const path of docPaths) {
    const text = await io.readText(path);
    if (text !== null) docs.set(path, text);
  }

  const signature = JSON.stringify([sceneText, logicText, [...docs], fingerprints, configText, masterConfigText, presetsText, styles, partTexts]);
  const project: Project = {
    kind,
    root,
    name,
    pageDoc,
    boardDocs,
    qtExportDir,
    webExportDir,
    styles,
    partOf,
    parts,
    partList,
    presets,
    scene,
    sceneText: sceneText ?? "",
    logic,
    logicText,
    docs,
    components,
    effects,
    functions,
    actionSources,
    problems,
    signature,
  };
  problems.push(...check(project));
  return project;
}
