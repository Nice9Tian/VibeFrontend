// 收藏的素材、来源记录与素材复制（设计文档第 3.2 节）：
// - 用户素材库（VibeFrontend/library/）保存跨项目复用的收藏控件；
// - 项目内 .designer/origins.json 记录每个控件来自哪个收藏，以及双方的基准哈希；
// - 比较本项目哈希、收藏当前哈希与基准哈希，得出一致、已修改、有新版本、两边都改过四种状态；
// - 把收藏拖进项目时按四条规则依次判断：来源记录匹配 → 结构哈希匹配 → 同名不存在直接复制 → 同名不同结构改名复制。
import { invoke } from "@tauri-apps/api/core";
import { md5 } from "./md5.ts";
import {
  BUILTIN_TYPES,
  CONTAINER_DECL,
  declFor,
  effectsForComponent,
  isPaintEffect,
  STANDARD_COMPONENTS,
  type ComponentDecl,
  type EffectDecl,
  type Problem,
  type Project,
} from "./model.ts";
import { canonicalJson, normalizeLf, structHashFromFiles } from "./structhash.ts";

export const ORIGINS_PATH = ".designer/origins.json";
export const PAIRED_EFFECTS_PATH = ".designer/paired-effects.json";
const LIBRARY_INDEX_FILE = "library.json";
const LOCAL_STORAGE_LIB_KEY = "vf.userLibrary.v1";

/**
 * 成对收藏的效果：把工具端实现（effects/<name>/）和已翻译的 Qt 端实现（ui_effects/ 下的 .h/.cpp）作为一对一起保存，
 * 跨控件或跨项目复用时成对带过去，只要效果未改（哈希不变）就无需重新翻译。
 */
export interface PairedEffect {
  name: string;
  label?: string;
  description?: string;
  kind?: string;
  /** 效果文件夹内文件的 8 位十六进制哈希（与 UiEffects.h 中的 Hash 一致） */
  hash: string;
  /** 工具端实现（effects/<name>/ 下的全部文件：文件名 → 原文） */
  files: Record<string, string>;
  /** 已翻译的 Qt 端实现（ui_effects/ 下的对应文件：文件名 → 原文，如 PanelExpandEffect.h / .cpp） */
  qtFiles: Record<string, string>;
}

export interface LibraryItem {
  /** 收藏 ID，与控件名字无关 */
  id: string;
  /** 收藏时的控件类型名 */
  type: string;
  /** 素材栏显示名 */
  label: string;
  /** 说明文字 */
  description: string;
  /** 当前结构哈希 */
  hash: string;
  /** 收藏自哪个项目（project.json 中的 id） */
  sourceProjectId: string;
  /** 控件文件夹内的全部文件：文件名 → 原文 */
  files: Record<string, string>;
  /** 成对收藏的效果（工具端实现 + Qt 端实现）：效果名 → PairedEffect */
  pairedEffects?: Record<string, PairedEffect>;
}

export interface OriginRecord {
  libraryId: string;
  baseHash: string;
}

export interface OriginsFile {
  version: 1;
  origins: Record<string, OriginRecord>;
}

/**
 * 收藏副本与素材库版本之间的状态：
 * - clean: 两边一致
 * - modified: 已修改（本项目改过，收藏没变）
 * - outdated: 有新版本（收藏被别的项目更新过，本项目没改）
 * - diverged: 两边都改过
 */
export type LibraryStatus = "clean" | "modified" | "outdated" | "diverged";

// ---------- 纯函数：状态比较、来源对账、拖入复制、更新与取消收藏 ----------

export function emptyOrigins(): OriginsFile {
  return { version: 1, origins: {} };
}

/**
 * 用本项目的哈希、收藏的当前哈希和基准哈希比较出副本状态（设计文档第 3.2 节表）。
 * 两边哈希恰好相同时，不论基准是什么，都视为一致。
 */
export function compareLibraryStatus(localHash: string, libHash: string, baseHash?: string): LibraryStatus {
  if (localHash === libHash) return "clean";
  if (!baseHash) return "diverged";
  if (localHash !== baseHash && libHash === baseHash) return "modified";
  if (localHash === baseHash && libHash !== baseHash) return "outdated";
  return "diverged";
}

export function statusBadgeText(status: LibraryStatus): string {
  switch (status) {
    case "clean":
      return "";
    case "modified":
      return "已修改";
    case "outdated":
      return "有新版本";
    case "diverged":
      return "两边都改过";
  }
}

/** 校验单个路径段（控件类型名、收藏 ID、文件名）是否安全，拒绝 `.`、`..`、斜杠、冒号及控制字符。 */
export function isSafePathSegment(seg: string): boolean {
  if (!seg || typeof seg !== "string") return false;
  const trimmed = seg.trim();
  if (!trimmed || trimmed !== seg) return false;
  if (seg === "." || seg === "..") return false;
  if (/[/\\:\u0000-\u001f<>|?*]/.test(seg)) return false;
  return true;
}

/** 判断一个名字是否为保留的内置节点类型或标准控件名（收藏与改名均不可占用）。 */
export function isReservedComponentName(name: string): boolean {
  return BUILTIN_TYPES.includes(name) || STANDARD_COMPONENTS.has(name);
}

/** 从控件文件表中解析 component.json。 */
export function parseComponentDecl(files: Record<string, string>, fallbackType: string): ComponentDecl {
  try {
    const parsed = JSON.parse(files["component.json"] ?? "{}") as ComponentDecl;
    return { ...parsed, type: parsed.type || fallbackType };
  } catch {
    return { type: fallbackType };
  }
}

/** 计算效果文件夹内文件的 8 位十六进制 MD5 哈希（与 loader.ts 保持完全一致）。 */
export function computeEffectHash(files: Record<string, string>, fallbackName = "Effect"): string {
  let decl: EffectDecl = { name: fallbackName, kind: "visibility" };
  try {
    const parsed = JSON.parse(normalizeLf(files["effect.json"] ?? "{}")) as Partial<EffectDecl>;
    decl = {
      ...parsed,
      name: parsed.name || fallbackName,
      kind: parsed.kind || "visibility",
    };
  } catch {
    // ignore
  }
  const { label: _label, description: _description, ...rest } = decl;
  const body = Object.keys(files)
    .filter((name) => name !== "effect.json" && isSafePathSegment(name))
    .sort()
    .map((name) => [name, normalizeLf(files[name])]);
  const canonical = JSON.stringify([canonicalJson(rest), body]);
  return md5(canonical).slice(0, 8);
}

/** 过滤并清洗 pairedEffects 表，剔除任何不安全的效果名或文件名，并可选按控件实际引用的效果名集合过滤。 */
export function sanitizePairedEffects(
  raw: Record<string, PairedEffect> | undefined | null,
  allowedEffectNames?: Set<string>,
): Record<string, PairedEffect> {
  const out: Record<string, PairedEffect> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [effKey, paired] of Object.entries(raw)) {
    if (!isSafePathSegment(effKey) || !paired || typeof paired !== "object") continue;
    if (allowedEffectNames && !allowedEffectNames.has(effKey)) continue;
    const safeFiles: Record<string, string> = {};
    for (const [k, v] of Object.entries(paired.files ?? {})) {
      if (isSafePathSegment(k) && typeof v === "string") safeFiles[k] = normalizeLf(v);
    }
    const safeQtFiles: Record<string, string> = {};
    for (const [k, v] of Object.entries(paired.qtFiles ?? {})) {
      if (isSafePathSegment(k) && typeof v === "string") safeQtFiles[k] = normalizeLf(v);
    }
    const safeName =
      typeof paired.name === "string" && isSafePathSegment(paired.name.trim()) ? paired.name.trim() : effKey;
    out[effKey] = collectPairedEffect(safeName, safeFiles, safeQtFiles);
  }
  return out;
}

/**
 * 把一个需要翻译的效果（工具端实现 files + Qt 端实现 qtFiles）打包成成对收藏项，
 * 并自动将 Qt 实现中的模板哈希同步为当前工具端效果哈希。
 */
export function collectPairedEffect(
  name: string,
  files: Record<string, string>,
  qtFiles: Record<string, string>,
): PairedEffect {
  const safeName = isSafePathSegment(name.trim()) ? name.trim() : "Effect";
  const normalizedFiles: Record<string, string> = {};
  for (const [k, v] of Object.entries(files ?? {})) {
    if (isSafePathSegment(k) && typeof v === "string") normalizedFiles[k] = normalizeLf(v);
  }
  let decl: Partial<EffectDecl> = {};
  try {
    decl = JSON.parse(normalizedFiles["effect.json"] ?? "{}") as Partial<EffectDecl>;
  } catch {
    decl = {};
  }
  if (!normalizedFiles["effect.json"]) {
    normalizedFiles["effect.json"] =
      JSON.stringify({ name: safeName, kind: decl.kind ?? "visibility", entry: "index.js" }, null, 2) + "\n";
  }
  const hash = computeEffectHash(normalizedFiles, safeName);
  const normalizedQtFiles: Record<string, string> = {};
  const hashRe = new RegExp(`(\\b${safeName}Effect\\s*<\\s*0x)[0-9a-fA-F]+(u?\\s*>)`, "g");
  for (const [k, v] of Object.entries(qtFiles ?? {})) {
    if (!isSafePathSegment(k) || typeof v !== "string") continue;
    normalizedQtFiles[k] = normalizeLf(v).replace(hashRe, `$1${hash}u>`);
  }
  return {
    name: decl.name && isSafePathSegment(decl.name) ? decl.name : safeName,
    label: decl.label ?? safeName,
    description: decl.description ?? "",
    kind: decl.kind ?? "visibility",
    hash,
    files: normalizedFiles,
    qtFiles: normalizedQtFiles,
  };
}

export interface PreparePairedEffectResult {
  action: "reuse" | "copy" | "copy-renamed";
  localEffectName: string;
  hash: string;
  copiedEffectFiles: Record<string, string> | null;
  copiedQtFiles: Record<string, string>;
}

/**
 * 将成对收藏的效果（工具端实现 + Qt 端实现）带入目标项目：
 * - 若目标项目已有相同哈希的效果，直接复用其名字并补齐 Qt 实现文件；
 * - 若目标项目没有同名效果，原名复制工具端文件和 Qt 实现文件；
 * - 若目标项目已有同名但哈希不同的效果，改名为 <Name>_2 并同步更新 effect.json 和 Qt 类名与哈希。
 */
export function preparePairedEffectForProject(
  paired: PairedEffect,
  projectEffects: Record<string, Record<string, string>> = {},
  projectQtEffects: Record<string, string> = {},
): PreparePairedEffectResult {
  const safeName = isSafePathSegment(paired.name.trim()) ? paired.name.trim() : "Effect";
  const targetHash = computeEffectHash(paired.files);

  for (const [existingName, existingFiles] of Object.entries(projectEffects)) {
    if (computeEffectHash(existingFiles) === targetHash) {
      const qtOut: Record<string, string> = {};
      for (const [qf, qcontent] of Object.entries(paired.qtFiles)) {
        if (!isSafePathSegment(qf)) continue;
        if (!(qf in projectQtEffects)) qtOut[qf] = normalizeLf(qcontent);
      }
      return {
        action: "reuse",
        localEffectName: existingName,
        hash: targetHash,
        copiedEffectFiles: null,
        copiedQtFiles: qtOut,
      };
    }
  }

  if (!projectEffects[safeName]) {
    const copiedEffectFiles: Record<string, string> = {};
    for (const [k, v] of Object.entries(paired.files)) {
      if (isSafePathSegment(k)) copiedEffectFiles[k] = normalizeLf(v);
    }
    const copiedQtFiles: Record<string, string> = {};
    const hashRe = new RegExp(`(\\b${safeName}Effect\\s*<\\s*0x)[0-9a-fA-F]+(u?\\s*>)`, "g");
    for (const [k, v] of Object.entries(paired.qtFiles)) {
      if (isSafePathSegment(k)) copiedQtFiles[k] = normalizeLf(v).replace(hashRe, `$1${targetHash}u>`);
    }
    return {
      action: "copy",
      localEffectName: safeName,
      hash: targetHash,
      copiedEffectFiles,
      copiedQtFiles,
    };
  }

  let idx = 2;
  while (projectEffects[`${safeName}_${idx}`]) idx++;
  const nextName = `${safeName}_${idx}`;
  const copiedEffectFiles: Record<string, string> = {};
  for (const [k, v] of Object.entries(paired.files)) {
    if (isSafePathSegment(k)) copiedEffectFiles[k] = normalizeLf(v);
  }
  try {
    const raw = JSON.parse(copiedEffectFiles["effect.json"] ?? "{}") as Record<string, unknown>;
    raw.name = nextName;
    copiedEffectFiles["effect.json"] = JSON.stringify(raw, null, 2) + "\n";
  } catch {
    copiedEffectFiles["effect.json"] = JSON.stringify({ name: nextName, kind: paired.kind ?? "visibility" }, null, 2) + "\n";
  }
  const nextHash = computeEffectHash(copiedEffectFiles);
  const copiedQtFiles: Record<string, string> = {};
  const classRe = new RegExp(`\\b${safeName}Effect\\b`, "g");
  const hashRe = new RegExp(`(\\b${nextName}Effect\\s*<\\s*0x)[0-9a-fA-F]+(u?\\s*>)`, "g");
  for (const [k, v] of Object.entries(paired.qtFiles)) {
    if (!isSafePathSegment(k)) continue;
    const renamedFile = k.replace(new RegExp(`^${safeName}`), nextName);
    copiedQtFiles[renamedFile] = normalizeLf(v).replace(classRe, `${nextName}Effect`).replace(hashRe, `$1${nextHash}u>`);
  }
  return {
    action: "copy-renamed",
    localEffectName: nextName,
    hash: nextHash,
    copiedEffectFiles,
    copiedQtFiles,
  };
}

/** 计算控件声明的接口签名（忽略 type/label/description，仅保留 props/events/children/entry/defaultSize），用于改名且改实现后找回来源。 */
function componentInterfaceSignature(files: Record<string, string>): string | null {
  const raw = files["component.json"];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const filtered: Record<string, unknown> = {};
    for (const key of Object.keys(parsed).sort()) {
      if (key === "type" || key === "label" || key === "description") continue;
      filtered[key] = parsed[key];
    }
    return JSON.stringify(filtered);
  } catch {
    return null;
  }
}

/**
 * 复制控件文件时修改其 component.json 中的 type（以及可选的 label），并过滤掉非法文件名。
 * 因为结构哈希忽略 type、label、description，改名后结构哈希保持不变。
 */
export function rewriteComponentIdentity(
  files: Record<string, string>,
  nextType: string,
  nextLabel?: string,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, content] of Object.entries(files)) {
    if (!isSafePathSegment(name)) continue;
    result[name] = normalizeLf(content);
  }
  try {
    const raw = JSON.parse(result["component.json"] ?? "{}") as Record<string, unknown>;
    raw.type = nextType;
    if (nextLabel !== undefined) raw.label = nextLabel;
    result["component.json"] = JSON.stringify(raw, null, 2) + "\n";
  } catch {
    result["component.json"] = JSON.stringify({ type: nextType, ...(nextLabel ? { label: nextLabel } : {}) }, null, 2) + "\n";
  }
  return result;
}

export interface MatchedLibraryComponent {
  libraryId: string;
  localType: string;
  localHash: string;
  status: LibraryStatus;
}

export interface OrphanedOrigin {
  missingType: string;
  libraryItem: LibraryItem;
  baseHash: string;
  /** 接口签名相同、待用户确认是否关联的候选本地控件类型 */
  candidateTypes: string[];
}

export interface ReconcileResult {
  origins: OriginsFile;
  originsChanged: boolean;
  /** 收藏 ID → 本项目中对应的控件与状态 */
  matchedByLibraryId: Map<string, MatchedLibraryComponent>;
  /** 本项目中已被认定为某个收藏的控件类型集合（不在“项目素材”中重复显示） */
  linkedLocalTypes: Set<string>;
  /** 来源记录中记着、但本项目找不到且无法按哈希匹配到的记录 */
  orphaned: OrphanedOrigin[];
}

/**
 * 对账本项目的控件、收藏列表与来源记录：
 * 0. 若收藏库当前为空（例如在浏览器开发模式或另一台机器尚未同步素材库），保留已有 origins.json 不清空；
 * 1. 已取消收藏的来源记录自动失效；
 * 2. 如果 Agent 在工具外把控件文件夹改了名，按结构哈希、原声明 type 或接口签名重新关联；
 * 3. 两边哈希恰好相同时，把基准哈希同步为当前哈希；
 * 4. 没有来源记录但结构哈希与某个收藏当前哈希相同的控件（第 2 条规则），认定为该收藏并补写来源记录。
 */
export function reconcileProjectLibrary(
  projectComponents: Record<string, Record<string, string>>,
  library: LibraryItem[],
  origins: OriginsFile,
): ReconcileResult {
  const nextOrigins: Record<string, OriginRecord> = {};
  for (const [type, rec] of Object.entries(origins.origins ?? {})) {
    if (rec && typeof rec.libraryId === "string" && typeof rec.baseHash === "string") {
      nextOrigins[type] = { libraryId: rec.libraryId, baseHash: rec.baseHash };
    }
  }

  // 当素材库为空时，绝不抹掉项目中已有的 .designer/origins.json
  if (library.length === 0) {
    return {
      origins: { version: 1, origins: nextOrigins },
      originsChanged: false,
      matchedByLibraryId: new Map(),
      linkedLocalTypes: new Set(),
      orphaned: [],
    };
  }

  const libById = new Map<string, LibraryItem>(library.map((item) => [item.id, item]));
  const localHashes = new Map<string, string>();
  for (const [type, files] of Object.entries(projectComponents)) {
    if (isReservedComponentName(type)) continue;
    localHashes.set(type, structHashFromFiles(files));
  }

  let originsChanged = false;
  const usedLocalTypes = new Set<string>();
  const usedLibIds = new Set<string>();
  const orphaned: OrphanedOrigin[] = [];

  // 第一步：保留本项目中仍存在的来源记录，移除已取消收藏的条目
  for (const [type, rec] of Object.entries({ ...nextOrigins })) {
    const fav = libById.get(rec.libraryId);
    if (!fav) {
      delete nextOrigins[type];
      originsChanged = true;
      continue;
    }
    if (localHashes.has(type)) {
      usedLocalTypes.add(type);
      usedLibIds.add(fav.id);
      const localHash = localHashes.get(type)!;
      if (localHash === fav.hash && rec.baseHash !== fav.hash) {
        nextOrigins[type] = { libraryId: fav.id, baseHash: fav.hash };
        originsChanged = true;
      }
    }
  }

  // 第二步：处理文件夹或类型被改名的来源记录（仅按结构哈希或保留的原声明 type 自动关联；接口签名相同的仅归入待用户确认）
  const unresolvedOrigins: Array<{ missingType: string; fav: LibraryItem; baseHash: string }> = [];
  for (const [type, rec] of Object.entries({ ...nextOrigins })) {
    if (localHashes.has(type)) continue;
    const fav = libById.get(rec.libraryId);
    if (!fav) continue;
    let renamedTo: string | null = null;
    for (const [candidateType, candidateHash] of localHashes) {
      if (usedLocalTypes.has(candidateType)) continue;
      const candidateFiles = projectComponents[candidateType];
      const declaredType = candidateFiles ? parseComponentDecl(candidateFiles, candidateType).type : candidateType;
      if (candidateHash === rec.baseHash || candidateHash === fav.hash || declaredType === type) {
        renamedTo = candidateType;
        break;
      }
    }
    if (renamedTo) {
      delete nextOrigins[type];
      const candidateHash = localHashes.get(renamedTo)!;
      nextOrigins[renamedTo] = {
        libraryId: fav.id,
        baseHash: candidateHash === fav.hash ? fav.hash : rec.baseHash,
      };
      usedLocalTypes.add(renamedTo);
      usedLibIds.add(fav.id);
      originsChanged = true;
    } else {
      unresolvedOrigins.push({ missingType: type, fav, baseHash: rec.baseHash });
    }
  }

  // 第三步：按设计文档第 3.2 节第 2 条，无来源记录但结构哈希与收藏当前哈希相同的控件，认定为该收藏并补写来源记录
  for (const fav of library) {
    if (usedLibIds.has(fav.id)) continue;
    for (const [candidateType, candidateHash] of localHashes) {
      if (usedLocalTypes.has(candidateType)) continue;
      if (candidateHash === fav.hash) {
        nextOrigins[candidateType] = { libraryId: fav.id, baseHash: fav.hash };
        usedLocalTypes.add(candidateType);
        usedLibIds.add(fav.id);
        originsChanged = true;
        break;
      }
    }
  }

  // 第四步：把未能按结构哈希或原声明 type 自动找回的来源记录归入 orphaned，收集接口签名相同的待用户确认候选控件
  for (const item of unresolvedOrigins) {
    if (usedLibIds.has(item.fav.id)) continue;
    const favSig = componentInterfaceSignature(item.fav.files);
    const candidateTypes: string[] = [];
    if (favSig) {
      for (const [candidateType] of localHashes) {
        if (usedLocalTypes.has(candidateType)) continue;
        const candidateSig = componentInterfaceSignature(projectComponents[candidateType] ?? {});
        if (candidateSig === favSig) {
          candidateTypes.push(candidateType);
        }
      }
    }
    orphaned.push({
      missingType: item.missingType,
      libraryItem: item.fav,
      baseHash: item.baseHash,
      candidateTypes,
    });
  }

  const matchedByLibraryId = new Map<string, MatchedLibraryComponent>();
  const linkedLocalTypes = new Set<string>();
  for (const [type, rec] of Object.entries(nextOrigins)) {
    const fav = libById.get(rec.libraryId);
    const localHash = localHashes.get(type);
    if (!fav || localHash === undefined) continue;
    const status = compareLibraryStatus(localHash, fav.hash, rec.baseHash);
    matchedByLibraryId.set(fav.id, {
      libraryId: fav.id,
      localType: type,
      localHash,
      status,
    });
    linkedLocalTypes.add(type);
    const declType = parseComponentDecl(projectComponents[type] ?? {}, type).type;
    if (declType) linkedLocalTypes.add(declType);
  }

  return {
    origins: { version: 1, origins: nextOrigins },
    originsChanged,
    matchedByLibraryId,
    linkedLocalTypes,
    orphaned,
  };
}

/** 手动把找不到控件的孤儿来源记录重新关联到本项目中的某个控件。 */
export function relinkOrphanedOrigin(
  origins: OriginsFile,
  missingType: string,
  targetLocalType: string,
): OriginsFile {
  const next: Record<string, OriginRecord> = { ...origins.origins };
  const rec = next[missingType];
  if (!rec || !isSafePathSegment(targetLocalType) || isReservedComponentName(targetLocalType)) return origins;
  delete next[missingType];
  next[targetLocalType] = { ...rec };
  return { version: 1, origins: next };
}

/** 删除一条失效的孤儿来源记录。 */
export function removeOrphanedOrigin(origins: OriginsFile, missingType: string): OriginsFile {
  const next: Record<string, OriginRecord> = { ...origins.origins };
  delete next[missingType];
  return { version: 1, origins: next };
}

export interface PrepareDragResult {
  /**
   * - reuse-origin: 规则 1，按来源记录直接复用本项目已有控件
   * - reuse-hash: 规则 2，按结构哈希直接复用本项目已有控件并补写来源记录
   * - copy: 规则 3，本项目中没有同名控件，原名复制进 components/
   * - copy-renamed: 规则 4，本项目中已有同名但不同的控件，改名（如 Button_2）复制进 components/
   */
  action: "reuse-origin" | "reuse-hash" | "copy" | "copy-renamed";
  /** 在本项目中使用的控件类型名 */
  localType: string;
  /** 需要写入 components/<localType>/ 的文件；复用已有控件时为 null */
  copiedFiles: Record<string, string> | null;
  /** 成对带入本项目的效果工具端文件：效果名 → (文件名 → 原文) */
  copiedEffects: Record<string, Record<string, string>>;
  /** 成对带入本项目的效果 Qt 实现文件：文件名 → 原文 */
  copiedQtEffects: Record<string, string>;
  /** 成对带入本项目的效果配对记录：效果名 → PairedEffect */
  pairedEffects: Record<string, PairedEffect>;
  /** 更新后的来源记录 */
  origins: OriginsFile;
  /** 更新后的项目控件文件表（含新复制进去的控件） */
  projectComponents: Record<string, Record<string, string>>;
  /** 规则 4 时在问题栏显示的说明 */
  hint: string | null;
}

/**
 * 把收藏的素材拖进项目时的四条判断规则（设计文档第 3.2 节）：
 * 1. 本项目中有控件的来源记录指向这个收藏（名字可以不同）→ 直接使用它；
 * 2. 本项目中有没有来源记录、但结构哈希与收藏当前哈希相同的控件（名字可以不同）→ 直接使用它，并补写来源记录；
 * 3. 本项目中没有同名控件 → 把收藏复制进本项目的 components/，名字不变，写入来源记录；
 * 4. 本项目中有同名控件，但以上都不符合 → 把收藏以新名字复制进来（如 Button_2），写入来源记录，并在问题栏给出说明。
 * 若收藏项带有成对收藏的效果（pairedEffects），一并按规则带入目标项目。
 */
export function prepareLibraryComponentForProject(
  fav: LibraryItem,
  projectComponents: Record<string, Record<string, string>>,
  origins: OriginsFile,
  projectEffects: Record<string, Record<string, string>> = {},
  projectQtEffects: Record<string, string> = {},
): PrepareDragResult {
  const safeFavType = isSafePathSegment(fav.type.trim()) ? fav.type.trim() : "Component";
  const nextComponents: Record<string, Record<string, string>> = { ...projectComponents };
  const nextOrigins: Record<string, OriginRecord> = {};
  for (const [k, v] of Object.entries(origins.origins ?? {})) {
    nextOrigins[k] = { ...v };
  }

  const copiedEffects: Record<string, Record<string, string>> = {};
  const copiedQtEffects: Record<string, string> = {};
  const pairedOut: Record<string, PairedEffect> = {};
  const effectRenameMap = new Map<string, string>();
  const workingEffects: Record<string, Record<string, string>> = { ...projectEffects };
  const workingQt: Record<string, string> = { ...projectQtEffects };

  const favDecl = parseComponentDecl(fav.files, safeFavType);
  const favAllowedEffects = new Set(effectsForComponent(favDecl));
  const sanitizedFavPaired = sanitizePairedEffects(
    fav.pairedEffects,
    favAllowedEffects.size > 0 ? favAllowedEffects : undefined,
  );
  for (const [effName, paired] of Object.entries(sanitizedFavPaired)) {
    if (!paired || typeof paired !== "object") continue;
    const effRes = preparePairedEffectForProject(paired, workingEffects, workingQt);
    if (effRes.copiedEffectFiles) {
      copiedEffects[effRes.localEffectName] = effRes.copiedEffectFiles;
      workingEffects[effRes.localEffectName] = effRes.copiedEffectFiles;
    }
    for (const [qf, qc] of Object.entries(effRes.copiedQtFiles)) {
      copiedQtEffects[qf] = qc;
      workingQt[qf] = qc;
    }
    const safeOrigQtFiles: Record<string, string> = {};
    for (const [qf, qc] of Object.entries(paired.qtFiles ?? {})) {
      if (isSafePathSegment(qf) && typeof qc === "string") safeOrigQtFiles[qf] = normalizeLf(qc);
    }
    pairedOut[effRes.localEffectName] = {
      ...paired,
      name: effRes.localEffectName,
      hash: effRes.hash,
      files: effRes.copiedEffectFiles ?? workingEffects[effRes.localEffectName] ?? paired.files,
      qtFiles: effRes.action === "reuse" ? { ...safeOrigQtFiles, ...effRes.copiedQtFiles } : { ...effRes.copiedQtFiles },
    };
    if (effRes.localEffectName !== effName) {
      effectRenameMap.set(effName, effRes.localEffectName);
    }
  }

  const applyEffectRenameToComponent = (compFiles: Record<string, string>): Record<string, string> => {
    if (effectRenameMap.size === 0 || !compFiles["component.json"]) return compFiles;
    try {
      const parsed = JSON.parse(compFiles["component.json"]) as ComponentDecl;
      if (parsed.effects) {
        if (parsed.effects.visible && effectRenameMap.has(parsed.effects.visible)) {
          parsed.effects.visible = effectRenameMap.get(parsed.effects.visible);
        }
        if (parsed.effects.paint && effectRenameMap.has(parsed.effects.paint)) {
          parsed.effects.paint = effectRenameMap.get(parsed.effects.paint);
        }
        return {
          ...compFiles,
          "component.json": JSON.stringify(parsed, null, 2) + "\n",
        };
      }
    } catch {
      // ignore
    }
    return compFiles;
  };

  // 规则 1：检查是否有来源记录指向 fav.id（含文件夹改名后按基准哈希或接口签名找回的情况）
  for (const [type, rec] of Object.entries(nextOrigins)) {
    if (rec.libraryId !== fav.id) continue;
    if (nextComponents[type] && !isReservedComponentName(type)) {
      const localHash = structHashFromFiles(nextComponents[type]);
      if (localHash === fav.hash && rec.baseHash !== fav.hash) {
        nextOrigins[type] = { libraryId: fav.id, baseHash: fav.hash };
      }
      return {
        action: "reuse-origin",
        localType: type,
        copiedFiles: null,
        copiedEffects,
        copiedQtEffects,
        pairedEffects: pairedOut,
        origins: { version: 1, origins: nextOrigins },
        projectComponents: nextComponents,
        hint: null,
      };
    }
    // 来源记录中的类型已被改名，尝试按基准哈希、收藏哈希或原声明 type 找回
    for (const [candidateType, files] of Object.entries(nextComponents)) {
      if (nextOrigins[candidateType] || isReservedComponentName(candidateType)) continue;
      const h = structHashFromFiles(files);
      const declType = parseComponentDecl(files, candidateType).type;
      if (h === rec.baseHash || h === fav.hash || declType === type) {
        delete nextOrigins[type];
        nextOrigins[candidateType] = { libraryId: fav.id, baseHash: h === fav.hash ? fav.hash : rec.baseHash };
        return {
          action: "reuse-origin",
          localType: candidateType,
          copiedFiles: null,
          copiedEffects,
          copiedQtEffects,
          pairedEffects: pairedOut,
          origins: { version: 1, origins: nextOrigins },
          projectComponents: nextComponents,
          hint: null,
        };
      }
    }
    // 原控件已被删掉，清理失效的旧记录后继续走后续规则
    delete nextOrigins[type];
  }

  // 规则 2：本项目中没有来源记录、但结构哈希与收藏当前哈希相同的控件（名字可以不同）
  for (const [candidateType, files] of Object.entries(nextComponents)) {
    if (nextOrigins[candidateType] || isReservedComponentName(candidateType)) continue;
    const h = structHashFromFiles(files);
    if (h === fav.hash) {
      nextOrigins[candidateType] = { libraryId: fav.id, baseHash: fav.hash };
      return {
        action: "reuse-hash",
        localType: candidateType,
        copiedFiles: null,
        copiedEffects,
        copiedQtEffects,
        pairedEffects: pairedOut,
        origins: { version: 1, origins: nextOrigins },
        projectComponents: nextComponents,
        hint: null,
      };
    }
  }

  // 规则 3：本项目中没有同名控件（且名字不是保留的内置类型或标准控件名）
  if (!nextComponents[safeFavType] && !isReservedComponentName(safeFavType)) {
    const copiedFiles = applyEffectRenameToComponent(rewriteComponentIdentity(fav.files, safeFavType, fav.label));
    nextComponents[safeFavType] = copiedFiles;
    nextOrigins[safeFavType] = { libraryId: fav.id, baseHash: structHashFromFiles(copiedFiles) };
    return {
      action: "copy",
      localType: safeFavType,
      copiedFiles,
      copiedEffects,
      copiedQtEffects,
      pairedEffects: pairedOut,
      origins: { version: 1, origins: nextOrigins },
      projectComponents: nextComponents,
      hint: null,
    };
  }

  // 规则 4：本项目中有同名控件（或与内置/标准控件重名），但结构不同且无对应来源记录 → 以新名字（如 Button_2）复制进来
  let index = 2;
  while (nextComponents[`${safeFavType}_${index}`] || isReservedComponentName(`${safeFavType}_${index}`)) index++;
  const newType = `${safeFavType}_${index}`;
  const copiedFiles = applyEffectRenameToComponent(rewriteComponentIdentity(fav.files, newType, `${fav.label}（收藏）`));
  nextComponents[newType] = copiedFiles;
  nextOrigins[newType] = { libraryId: fav.id, baseHash: structHashFromFiles(copiedFiles) };
  const hint = `收藏的控件“${fav.label}”与本项目中已有的 ${safeFavType} 不是同一个控件，已以新名字 ${newType} 复制进 components/${newType}/，可右键重命名`;
  return {
    action: "copy-renamed",
    localType: newType,
    copiedFiles,
    copiedEffects,
    copiedQtEffects,
    pairedEffects: pairedOut,
    origins: { version: 1, origins: nextOrigins },
    projectComponents: nextComponents,
    hint,
  };
}

/**
 * 把本项目中的一个控件收藏到素材库（设计文档第 3.2 节）：
 * 复制控件文件到素材库（若带需要翻译的效果，可连同其工具端实现和已翻译的 Qt 实现作为 pairedEffects 成对保存），
 * 分配收藏 ID，并在本项目的 origins.json 中记录来源。
 */
export function collectComponentInLibrary(
  type: string,
  files: Record<string, string>,
  sourceProjectId: string,
  library: LibraryItem[],
  origins: OriginsFile,
  makeId: () => string = () => `fav-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
  pairedEffects?: Record<string, PairedEffect>,
): { item: LibraryItem; library: LibraryItem[]; origins: OriginsFile } {
  const safeType = isSafePathSegment(type.trim()) ? type.trim() : "Component";
  const decl = parseComponentDecl(files, safeType);
  const normalizedFiles = rewriteComponentIdentity(files, safeType, decl.label ?? safeType);
  const hash = structHashFromFiles(normalizedFiles);
  const existingOrigin = origins.origins[safeType] ?? origins.origins[type];
  const existingIdx = existingOrigin ? library.findIndex((i) => i.id === existingOrigin.libraryId) : -1;

  const rawId = existingIdx >= 0 ? library[existingIdx].id : makeId();
  const id = isSafePathSegment(rawId) ? rawId : `fav-${Date.now().toString(36)}`;
  const neededEffects = new Set(effectsForComponent(decl));
  const rawPaired =
    pairedEffects && Object.keys(pairedEffects).length > 0
      ? pairedEffects
      : existingIdx >= 0
        ? library[existingIdx].pairedEffects
        : undefined;
  const mergedPaired = neededEffects.size > 0 ? sanitizePairedEffects(rawPaired, neededEffects) : {};
  const item: LibraryItem = {
    id,
    type: safeType,
    label: decl.label ?? safeType,
    description: decl.description ?? "",
    hash,
    sourceProjectId,
    files: normalizedFiles,
    ...(Object.keys(mergedPaired).length > 0 ? { pairedEffects: mergedPaired } : {}),
  };
  const nextLibrary = [...library];
  if (existingIdx >= 0) nextLibrary[existingIdx] = item;
  else nextLibrary.push(item);

  const nextOrigins: OriginsFile = {
    version: 1,
    origins: {
      ...origins.origins,
      [safeType]: { libraryId: id, baseHash: hash },
    },
  };
  return { item, library: nextLibrary, origins: nextOrigins };
}

/**
 * “更新收藏”：用本项目的副本覆盖收藏，并把双方的基准哈希更新为新哈希。
 */
export function updateLibraryItemFromProject(
  localType: string,
  localFiles: Record<string, string>,
  library: LibraryItem[],
  origins: OriginsFile,
  pairedEffects?: Record<string, PairedEffect>,
): { item: LibraryItem; library: LibraryItem[]; origins: OriginsFile } | null {
  const rec = origins.origins[localType];
  if (!rec) return null;
  const idx = library.findIndex((i) => i.id === rec.libraryId);
  if (idx < 0) return null;
  const prev = library[idx];
  const updatedFiles = rewriteComponentIdentity(localFiles, prev.type, prev.label);
  const hash = structHashFromFiles(updatedFiles);
  const decl = parseComponentDecl(updatedFiles, prev.type);
  const neededEffects = new Set(effectsForComponent(decl));
  const mergedPaired =
    neededEffects.size > 0 ? sanitizePairedEffects(pairedEffects ?? prev.pairedEffects, neededEffects) : {};
  const item: LibraryItem = {
    ...prev,
    hash,
    files: updatedFiles,
    ...(Object.keys(mergedPaired).length > 0 ? { pairedEffects: mergedPaired } : {}),
  };
  if (Object.keys(mergedPaired).length === 0) {
    delete item.pairedEffects;
  }
  const nextLibrary = [...library];
  nextLibrary[idx] = item;
  const nextOrigins: OriginsFile = {
    version: 1,
    origins: {
      ...origins.origins,
      [localType]: { libraryId: prev.id, baseHash: hash },
    },
  };
  return { item, library: nextLibrary, origins: nextOrigins };
}

/**
 * “更新为收藏版本”：用收藏的当前版本替换本项目中的副本，清理本地多出的额外文件，并把基准哈希更新为收藏当前哈希。
 */
export function replaceProjectComponentWithLibrary(
  localType: string,
  fav: LibraryItem,
  origins: OriginsFile,
  localFiles: Record<string, string> = {},
): {
  writtenFiles: Record<string, string>;
  removedFiles: string[];
  writtenEffects: Record<string, Record<string, string>>;
  writtenQtEffects: Record<string, string>;
  origins: OriginsFile;
} {
  const label = localType === fav.type ? fav.label : `${fav.label}（收藏）`;
  const writtenFiles = rewriteComponentIdentity(fav.files, localType, label);
  const removedFiles = Object.keys(localFiles).filter((name) => isSafePathSegment(name) && !(name in writtenFiles));
  const writtenEffects: Record<string, Record<string, string>> = {};
  const writtenQtEffects: Record<string, string> = {};
  const sanitizedPaired = sanitizePairedEffects(fav.pairedEffects);
  for (const [effName, paired] of Object.entries(sanitizedPaired)) {
    writtenEffects[effName] = { ...paired.files };
    for (const [qf, qc] of Object.entries(paired.qtFiles ?? {})) {
      if (isSafePathSegment(qf) && typeof qc === "string") {
        writtenQtEffects[qf] = qc;
      }
    }
  }
  const nextOrigins: OriginsFile = {
    version: 1,
    origins: {
      ...origins.origins,
      [localType]: { libraryId: fav.id, baseHash: fav.hash },
    },
  };
  return { writtenFiles, removedFiles, writtenEffects, writtenQtEffects, origins: nextOrigins };
}

/**
 * “取消收藏”：从素材库移除该收藏，并清除指向它的来源记录。
 */
export function unfavoriteFromLibrary(
  libraryId: string,
  library: LibraryItem[],
  origins: OriginsFile,
): { library: LibraryItem[]; origins: OriginsFile } {
  const nextLibrary = library.filter((item) => item.id !== libraryId);
  const nextOrigins: Record<string, OriginRecord> = {};
  for (const [type, rec] of Object.entries(origins.origins)) {
    if (rec.libraryId !== libraryId) nextOrigins[type] = { ...rec };
  }
  return { library: nextLibrary, origins: { version: 1, origins: nextOrigins } };
}

// ---------- 文件读写（Tauri 桌面窗口写到 VibeFrontend/library/，浏览器开发模式回退到 localStorage） ----------

function isTauriEnv(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function isPreviewWindowLocation(): boolean {
  try {
    return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "1";
  } catch {
    return false;
  }
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(cmd, args);
}

interface LibraryIndexEntry {
  id: string;
  type: string;
  label: string;
  description: string;
  hash: string;
  sourceProjectId: string;
  fileNames: string[];
  pairedEffects?: Record<string, PairedEffect>;
}

async function loadUserLibrary(): Promise<LibraryItem[]> {
  if (!isTauriEnv()) {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_LIB_KEY);
      const parsed = raw ? (JSON.parse(raw) as LibraryItem[]) : [];
      if (!Array.isArray(parsed)) return [];
      const out: LibraryItem[] = [];
      for (const item of parsed) {
        if (!item || !isSafePathSegment(item.id) || !isSafePathSegment(item.type)) continue;
        const safeFiles: Record<string, string> = {};
        for (const [k, v] of Object.entries(item.files ?? {})) {
          if (isSafePathSegment(k) && typeof v === "string") safeFiles[k] = normalizeLf(v);
        }
        if (!safeFiles["component.json"]) continue;
        const decl = parseComponentDecl(safeFiles, item.type);
        const neededEffects = new Set(effectsForComponent(decl));
        const safePaired =
          neededEffects.size > 0
            ? sanitizePairedEffects(item.pairedEffects, neededEffects)
            : sanitizePairedEffects(item.pairedEffects);
        out.push({
          ...item,
          files: safeFiles,
          ...(Object.keys(safePaired).length > 0 ? { pairedEffects: safePaired } : {}),
        });
        if (Object.keys(safePaired).length === 0) {
          delete out[out.length - 1].pairedEffects;
        }
      }
      return out;
    } catch {
      return [];
    }
  }
  try {
    const indexText = await tauriInvoke<string | null>("library_read_text", { path: LIBRARY_INDEX_FILE });
    if (!indexText) return [];
    const parsed = JSON.parse(indexText) as { items?: LibraryIndexEntry[] };
    const items: LibraryItem[] = [];
    for (const entry of parsed.items ?? []) {
      if (!entry || !isSafePathSegment(entry.id) || !isSafePathSegment(entry.type)) continue;
      const files: Record<string, string> = {};
      const names = entry.fileNames?.length ? entry.fileNames : ["component.json", "index.js", "style.css"];
      for (const name of names) {
        if (!isSafePathSegment(name)) continue;
        const content = await tauriInvoke<string | null>("library_read_text", { path: `${entry.id}/${name}` });
        if (content !== null) files[name] = normalizeLf(content);
      }
      if (!files["component.json"]) continue;
      const decl = parseComponentDecl(files, entry.type);
      const neededEffects = new Set(effectsForComponent(decl));
      const safePaired =
        neededEffects.size > 0
          ? sanitizePairedEffects(entry.pairedEffects, neededEffects)
          : sanitizePairedEffects(entry.pairedEffects);
      items.push({
        id: entry.id,
        type: entry.type,
        label: entry.label,
        description: entry.description,
        hash: entry.hash || structHashFromFiles(files),
        sourceProjectId: entry.sourceProjectId ?? "",
        files,
        ...(Object.keys(safePaired).length > 0 ? { pairedEffects: safePaired } : {}),
      });
    }
    return items;
  } catch {
    return [];
  }
}

async function saveUserLibrary(items: LibraryItem[], removedIds: string[] = []): Promise<void> {
  if (!isTauriEnv()) {
    try {
      localStorage.setItem(LOCAL_STORAGE_LIB_KEY, JSON.stringify(items));
    } catch {
      // 忽略
    }
    return;
  }
  for (const id of removedIds) {
    if (!isSafePathSegment(id)) continue;
    try {
      await tauriInvoke("library_remove_dir", { path: id });
    } catch {
      // 忽略
    }
  }
  const indexEntries: LibraryIndexEntry[] = [];
  for (const item of items) {
    if (!isSafePathSegment(item.id) || !isSafePathSegment(item.type)) continue;
    const fileNames = Object.keys(item.files).filter(isSafePathSegment).sort();
    for (const name of fileNames) {
      await tauriInvoke("library_write_text", { path: `${item.id}/${name}`, content: item.files[name] });
    }
    indexEntries.push({
      id: item.id,
      type: item.type,
      label: item.label,
      description: item.description,
      hash: item.hash,
      sourceProjectId: item.sourceProjectId,
      fileNames,
      ...(item.pairedEffects && Object.keys(item.pairedEffects).length > 0
        ? { pairedEffects: item.pairedEffects }
        : {}),
    });
  }
  await tauriInvoke("library_write_text", {
    path: LIBRARY_INDEX_FILE,
    content: JSON.stringify({ version: 1, items: indexEntries }, null, 2) + "\n",
  });
}

// ---------- 编辑器界面接线 ----------

export interface LibraryHost {
  getProject(): Project;
  getMode(): "edit" | "preview";
  getZoom(): number;
  readText(path: string): Promise<string | null>;
  writeText(path: string, content: string): Promise<void>;
  removeFile?(path: string): Promise<void>;
  onComponentRenamed?(oldTypes: string[], nextType: string): Promise<void>;
  listDir(path: string): Promise<Array<{ name: string; isDir: boolean }>>;
  reload(): Promise<void>;
  toast(message: string): void;
  openMenu(x: number, y: number, items: Array<{ label: string; action: () => void } | "separator">): void;
  copyComponentRef(type: string): void;
  setSelection(ids: string[]): void;
  setNodeTool(type: string): void;
  getActiveNodeTool?: () => string | null;
  addNodeAt(type: string, px: number, py: number): Promise<void>;
  renderProblems(): void;
}

let host: LibraryHost | null = null;
/** 拖入同名不同结构控件时产生的提示，保留在当前项目的提示列表中 */
const renameHints: Problem[] = [];
/** 浏览器开发模式下标记已删除的额外文件，避免无 remove_file 接口时残留空文件影响哈希 */
const deletedProjectFiles = new Set<string>();
let renderVersion = 0;

async function readOrigins(): Promise<OriginsFile> {
  if (!host) return emptyOrigins();
  const text = await host.readText(ORIGINS_PATH);
  if (!text) return emptyOrigins();
  try {
    const parsed = JSON.parse(text) as Partial<OriginsFile>;
    return {
      version: 1,
      origins: parsed.origins && typeof parsed.origins === "object" ? parsed.origins : {},
    };
  } catch {
    return emptyOrigins();
  }
}

async function writeOrigins(origins: OriginsFile): Promise<void> {
  if (!host || isPreviewWindowLocation()) return;
  await host.writeText(ORIGINS_PATH, JSON.stringify(origins, null, 2) + "\n");
}

async function readProjectId(): Promise<string> {
  if (!host) return "unknown-project";
  const text = await host.readText("project.json");
  if (!text) return "unknown-project";
  try {
    const parsed = JSON.parse(text) as { id?: string; name?: string };
    return parsed.id ?? parsed.name ?? "unknown-project";
  } catch {
    return "unknown-project";
  }
}

function resolveComponentFolder(project: Project, typeOrFolder: string): string {
  const byType = project.components.get(typeOrFolder);
  if (byType?.folder && isSafePathSegment(byType.folder)) return byType.folder;
  for (const comp of project.components.values()) {
    if ((comp.folder === typeOrFolder || comp.decl.type === typeOrFolder) && comp.folder && isSafePathSegment(comp.folder)) {
      return comp.folder;
    }
  }
  return typeOrFolder;
}

async function readAllProjectComponentFiles(project: Project): Promise<Record<string, Record<string, string>>> {
  const result: Record<string, Record<string, string>> = {};
  if (!host) return result;
  // 注意：即使 comp.error 存在（如 Agent 改坏了 index.js），也必须读取其文件，避免当作不存在而覆盖！
  // 同时以实际文件夹名 comp.folder 为主键（当文件夹改名而 component.json 尚未改时能准确写入原目录）。
  for (const [_type, comp] of project.components) {
    if (!comp.folder || !isSafePathSegment(comp.folder)) continue;
    const folder = comp.folder;
    const entries = await host.listDir(`components/${folder}`);
    const files: Record<string, string> = {};
    for (const entry of entries) {
      if (entry.isDir || !isSafePathSegment(entry.name)) continue;
      const relPath = `components/${folder}/${entry.name}`;
      if (deletedProjectFiles.has(relPath)) continue;
      const text = await host.readText(relPath);
      if (text !== null) files[entry.name] = text;
    }
    if (files["component.json"]) {
      result[folder] = files;
    }
  }
  return result;
}

async function writeComponentFolder(
  folderOrType: string,
  files: Record<string, string>,
  removedFiles: string[] = [],
): Promise<void> {
  if (!host || isPreviewWindowLocation()) return;
  const folder = resolveComponentFolder(host.getProject(), folderOrType);
  if (!isSafePathSegment(folder)) {
    throw new Error(`非法的控件目录名：${folder}`);
  }
  for (const [name, content] of Object.entries(files)) {
    if (!isSafePathSegment(name)) continue;
    const relPath = `components/${folder}/${name}`;
    deletedProjectFiles.delete(relPath);
    await host.writeText(relPath, content);
  }
  for (const rmName of removedFiles) {
    if (!isSafePathSegment(rmName) || rmName in files) continue;
    const relPath = `components/${folder}/${rmName}`;
    deletedProjectFiles.add(relPath);
    if (host.removeFile) {
      try {
        await host.removeFile(relPath);
      } catch {
        // 忽略
      }
    } else if (isTauriEnv()) {
      try {
        await tauriInvoke("remove_file", { path: relPath });
      } catch {
        // 忽略
      }
    }
  }
}

/** 重命名项目中的控件类型（修改控件目录、component.json、scene.json 中的节点 type 以及 origins.json）。 */
async function promptRenameProjectComponent(
  oldKey: string,
  projectComponents: Record<string, Record<string, string>>,
  origins: OriginsFile,
): Promise<void> {
  if (!host) return;
  const rawNext = window.prompt("重命名控件类型（字母、数字、下划线）：", oldKey)?.trim() ?? "";
  if (!rawNext || rawNext === oldKey) return;
  if (!isSafePathSegment(rawNext) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(rawNext) || isReservedComponentName(rawNext)) {
    host.toast("控件类型名不合法，只能使用字母、数字和下划线且不能与内置类型或标准控件重名");
    return;
  }
  const project = host.getProject();
  if (projectComponents[rawNext] || project.components.has(rawNext)) {
    host.toast(`控件类型“${rawNext}”已存在`);
    return;
  }
  const files = projectComponents[oldKey];
  if (!files) return;
  const decl = parseComponentDecl(files, oldKey);
  const oldType = decl.type || oldKey;
  const nextLabel = decl.label && decl.label !== oldKey ? decl.label.replace(/（收藏）$/, "") : rawNext;
  const rewritten = rewriteComponentIdentity(files, rawNext, nextLabel);

  await writeComponentFolder(rawNext, rewritten);
  // 清理旧目录中的文件
  await writeComponentFolder(oldKey, {}, Object.keys(files));

  // 同步更新 scene.json 中使用该控件类型的节点，并更新历史栈中的组件类型引用
  if (host.onComponentRenamed) {
    await host.onComponentRenamed([oldKey, oldType], rawNext);
  } else {
    let sceneChanged = false;
    for (const n of Object.values(project.scene.nodes)) {
      if (n.type === oldKey || n.type === oldType) {
        n.type = rawNext;
        sceneChanged = true;
      }
    }
    if (sceneChanged) {
      await host.writeText("ui/scene.json", JSON.stringify(project.scene, null, 2) + "\n");
    }
  }

  // 同步更新 origins.json
  const nextOriginsMap: Record<string, OriginRecord> = { ...origins.origins };
  const oldRec = nextOriginsMap[oldKey] ?? nextOriginsMap[oldType];
  if (oldRec) {
    delete nextOriginsMap[oldKey];
    delete nextOriginsMap[oldType];
    nextOriginsMap[rawNext] = { ...oldRec };
    await writeOrigins({ version: 1, origins: nextOriginsMap });
  }

  host.toast(`已将控件“${oldKey}”重命名为“${rawNext}”`);
  await host.reload();
}

function ensureLibrarySectionDOM(): HTMLElement | null {
  let container = document.getElementById("palette-library");
  if (container) return container;
  const projectPalette = document.getElementById("palette-project");
  const projectHeading = projectPalette?.previousElementSibling;
  if (!projectHeading || !projectHeading.parentElement) return null;
  const heading = document.createElement("h3");
  heading.textContent = "收藏的素材";
  container = document.createElement("div");
  container.id = "palette-library";
  container.className = "palette";
  projectHeading.parentElement.insertBefore(heading, projectHeading);
  projectHeading.parentElement.insertBefore(container, projectHeading);
  return container;
}

/** 查看使用位置：在画布和图层中选中所有使用该控件类型的节点。 */
function highlightComponentUsages(type: string): void {
  if (!host) return;
  const project = host.getProject();
  const comp = project.components.get(type);
  const matchTypes = new Set<string>([type]);
  if (comp) {
    matchTypes.add(comp.decl.type);
    if (comp.folder) matchTypes.add(comp.folder);
  }
  for (const c of project.components.values()) {
    if (c.folder === type || c.decl.type === type) {
      matchTypes.add(c.decl.type);
      if (c.folder) matchTypes.add(c.folder);
    }
  }
  const ids = Object.entries(project.scene.nodes)
    .filter(([id, n]) => id !== project.scene.root && matchTypes.has(n.type))
    .map(([id]) => id);
  if (ids.length === 0) {
    host.toast(`本项目中还没有使用 ${type} 的节点`);
    return;
  }
  host.setSelection(ids);
  host.toast(`已选中 ${ids.length} 个使用 ${type} 的节点`);
}

/** 并排对比本项目的版本和收藏的当前版本。 */
function openCompareModal(
  localType: string,
  localFiles: Record<string, string>,
  fav: LibraryItem,
  status: LibraryStatus,
  onUpdateLibrary: () => void,
  onReplaceLocal: () => void,
): void {
  document.getElementById("vf-library-compare")?.remove();
  const backdrop = document.createElement("div");
  backdrop.id = "vf-library-compare";
  backdrop.className = "vf-modal-backdrop";

  const dialog = document.createElement("div");
  dialog.className = "vf-modal";

  const header = document.createElement("div");
  header.className = "vf-modal-header";
  const title = document.createElement("strong");
  title.textContent = `与收藏对比：${fav.label}（${statusBadgeText(status)}）`;
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "关闭";
  closeBtn.addEventListener("click", () => backdrop.remove());
  header.append(title, closeBtn);

  const allFileNames = [...new Set([...Object.keys(localFiles), ...Object.keys(fav.files)])].sort();
  const body = document.createElement("div");
  body.className = "vf-compare-body";

  for (const fileName of allFileNames) {
    const localContent = localFiles[fileName] ?? "（无此文件）";
    const libContent = fav.files[fileName] ?? "（无此文件）";
    const same = normalizeLf(localContent) === normalizeLf(libContent);

    const section = document.createElement("div");
    section.className = "vf-compare-section";
    const fileTitle = document.createElement("div");
    fileTitle.className = "vf-compare-file";
    fileTitle.textContent = `${fileName}${same ? "（相同）" : "（有差异）"}`;
    section.append(fileTitle);

    const grid = document.createElement("div");
    grid.className = "vf-compare-grid";

    const leftCol = document.createElement("div");
    const leftHead = document.createElement("div");
    leftHead.className = "vf-compare-col-head";
    leftHead.textContent = `本项目版本（components/${localType}/${fileName}）`;
    const leftPre = document.createElement("pre");
    leftPre.textContent = localContent;
    leftCol.append(leftHead, leftPre);

    const rightCol = document.createElement("div");
    const rightHead = document.createElement("div");
    rightHead.className = "vf-compare-col-head";
    rightHead.textContent = `收藏当前版本（${fav.type}/${fileName}）`;
    const rightPre = document.createElement("pre");
    rightPre.textContent = libContent;
    rightCol.append(rightHead, rightPre);

    grid.append(leftCol, rightCol);
    section.append(grid);
    body.append(section);
  }

  const footer = document.createElement("div");
  footer.className = "vf-modal-footer";
  const btnToLib = document.createElement("button");
  btnToLib.type = "button";
  btnToLib.textContent = "更新收藏（用本项目覆盖收藏）";
  btnToLib.addEventListener("click", () => {
    backdrop.remove();
    onUpdateLibrary();
  });
  const btnToLocal = document.createElement("button");
  btnToLocal.type = "button";
  btnToLocal.textContent = "更新为收藏版本（替换本项目副本）";
  btnToLocal.addEventListener("click", () => {
    backdrop.remove();
    onReplaceLocal();
  });
  footer.append(btnToLib, btnToLocal);

  dialog.append(header, body, footer);
  backdrop.append(dialog);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.remove();
  });
  document.body.append(backdrop);
}

async function readAllUiEffectFilesFromProject(project: Project): Promise<Record<string, string>> {
  const allQtFiles: Record<string, string> = {};
  if (!host) return allQtFiles;
  const candidateDirs: string[] = [];
  if (project.qtExportDir) {
    candidateDirs.push(`${project.qtExportDir.replace(/[\\/]+$/, "")}/ui_effects`);
  }
  candidateDirs.push("ui_effects");

  for (const dir of candidateDirs) {
    try {
      const entries = await host.listDir(dir);
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (entry.isDir || !isSafePathSegment(entry.name)) continue;
        if (!entry.name.endsWith(".h") && !entry.name.endsWith(".cpp")) continue;
        if (entry.name === "EffectsSetup.h" || entry.name === "EffectsSetup.cpp") continue;
        const text = await host.readText(`${dir}/${entry.name}`);
        if (typeof text === "string") allQtFiles[entry.name] = normalizeLf(text);
      }
    } catch {
      // 忽略不在项目目录内或不存在的路径
    }
  }

  const g = globalThis as {
    process?: { versions?: { node?: string }; getBuiltinModule?: (id: string) => unknown };
  };
  if (project.root && g.process?.versions?.node && typeof g.process.getBuiltinModule === "function") {
    try {
      const fs = g.process.getBuiltinModule("node:fs") as {
        existsSync(p: string): boolean;
        readdirSync(p: string, opts: { withFileTypes: true }): Array<{ name: string; isFile(): boolean }>;
        readFileSync(p: string, enc: "utf8"): string;
      };
      const pathMod = g.process.getBuiltinModule("node:path") as { resolve(...parts: string[]): string; join(...parts: string[]): string };
      const fsDirs = [
        project.qtExportDir ? pathMod.resolve(project.root, project.qtExportDir, "ui_effects") : "",
        pathMod.resolve(project.root, "../qt/ui/ui_effects"),
        pathMod.resolve(project.root, "ui_effects"),
      ].filter(Boolean);
      for (const fsDir of fsDirs) {
        if (!fs.existsSync(fsDir)) continue;
        for (const entry of fs.readdirSync(fsDir, { withFileTypes: true })) {
          if (!entry.isFile() || !isSafePathSegment(entry.name)) continue;
          if (!entry.name.endsWith(".h") && !entry.name.endsWith(".cpp")) continue;
          if (entry.name === "EffectsSetup.h" || entry.name === "EffectsSetup.cpp") continue;
          if (!(entry.name in allQtFiles)) {
            allQtFiles[entry.name] = normalizeLf(fs.readFileSync(pathMod.join(fsDir, entry.name), "utf8"));
          }
        }
      }
    } catch {
      // 忽略
    }
  }

  return allQtFiles;
}

function matchQtFilesForEffect(name: string, allQtFiles: Record<string, string>): Record<string, string> {
  const matched: Record<string, string> = {};
  const matchedStems = new Set<string>([`${name}Effect`, name]);
  for (const [fileName, content] of Object.entries(allQtFiles)) {
    if (!isSafePathSegment(fileName) || typeof content !== "string") continue;
    if (content.includes(`${name}Effect<`)) {
      const dot = fileName.lastIndexOf(".");
      if (dot > 0) matchedStems.add(fileName.slice(0, dot));
      matched[fileName] = content;
    }
  }
  for (const [fileName, content] of Object.entries(allQtFiles)) {
    if (!isSafePathSegment(fileName) || typeof content !== "string") continue;
    const dot = fileName.lastIndexOf(".");
    const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
    if (matchedStems.has(stem)) {
      matched[fileName] = content;
    }
  }
  return matched;
}

async function readAllProjectEffectFiles(project: Project): Promise<Record<string, Record<string, string>>> {
  const out: Record<string, Record<string, string>> = {};
  for (const [name, eff] of project.effects) {
    if (!isSafePathSegment(name)) continue;
    const copy: Record<string, string> = {};
    for (const [k, v] of Object.entries(eff.files ?? {})) {
      if (isSafePathSegment(k) && typeof v === "string") copy[k] = normalizeLf(v);
    }
    if (Object.keys(copy).length > 0) out[name] = copy;
  }
  if (!host) return out;
  try {
    const dirEntries = await host.listDir("effects");
    for (const dirEntry of dirEntries) {
      if (!dirEntry.isDir || !isSafePathSegment(dirEntry.name)) continue;
      const files = await host.listDir(`effects/${dirEntry.name}`);
      const fileMap: Record<string, string> = { ...(out[dirEntry.name] ?? {}) };
      for (const f of files) {
        if (f.isDir || !isSafePathSegment(f.name)) continue;
        const text = await host.readText(`effects/${dirEntry.name}/${f.name}`);
        if (typeof text === "string") fileMap[f.name] = normalizeLf(text);
      }
      if (fileMap["effect.json"]) out[dirEntry.name] = fileMap;
    }
  } catch {
    // 忽略
  }
  return out;
}

async function readPairedEffectsFromProject(project: Project): Promise<Record<string, PairedEffect>> {
  const result: Record<string, PairedEffect> = {};
  if (!host) return result;
  try {
    const raw = await host.readText(PAIRED_EFFECTS_PATH);
    if (raw) {
      const parsed = JSON.parse(raw) as { effects?: Record<string, PairedEffect> };
      Object.assign(result, sanitizePairedEffects(parsed.effects));
    }
  } catch {
    // 忽略
  }
  const allUiEffectFiles = await readAllUiEffectFilesFromProject(project);
  const projectEffectFiles = await readAllProjectEffectFiles(project);
  for (const [name, designFiles] of Object.entries(projectEffectFiles)) {
    if (!isSafePathSegment(name) || !designFiles["effect.json"]) continue;
    const existing = result[name];
    const fromUiEffects = matchQtFilesForEffect(name, allUiEffectFiles);
    const mergedQtFiles: Record<string, string> = {
      ...(existing?.qtFiles ?? {}),
      ...fromUiEffects,
    };
    result[name] = collectPairedEffect(name, designFiles, mergedQtFiles);
  }
  return result;
}

async function writePairedEffectsToProject(
  copiedEffects: Record<string, Record<string, string>>,
  pairedEffects: Record<string, PairedEffect>,
): Promise<void> {
  if (!host || isPreviewWindowLocation()) return;
  for (const [effName, files] of Object.entries(copiedEffects)) {
    if (!isSafePathSegment(effName)) continue;
    for (const [fileName, content] of Object.entries(files)) {
      if (!isSafePathSegment(fileName) || typeof content !== "string") continue;
      await host.writeText(`effects/${effName}/${fileName}`, content);
    }
  }
  const sanitizedIncoming = sanitizePairedEffects(pairedEffects);
  if (Object.keys(sanitizedIncoming).length > 0) {
    let existing: Record<string, PairedEffect> = {};
    try {
      const raw = await host.readText(PAIRED_EFFECTS_PATH);
      if (raw) {
        const parsed = JSON.parse(raw) as { effects?: Record<string, PairedEffect> };
        existing = sanitizePairedEffects(parsed.effects);
      }
    } catch {
      // 忽略
    }
    const merged = { ...existing, ...sanitizedIncoming };
    await host.writeText(PAIRED_EFFECTS_PATH, JSON.stringify({ version: 1, effects: merged }, null, 2) + "\n");
  }
}

/**
 * 确保某个收藏素材已存在于当前项目的 components/ 中；
 * 如果还没有，先按四条规则复制或关联，并重新加载项目，返回在本项目中应使用的类型名。
 */
async function ensureFavoriteInProject(fav: LibraryItem): Promise<string | null> {
  if (!host) return null;
  const project = host.getProject();
  const [projectComponents, origins, projectEffects, projectPaired] = await Promise.all([
    readAllProjectComponentFiles(project),
    readOrigins(),
    readAllProjectEffectFiles(project),
    readPairedEffectsFromProject(project),
  ]);
  const projectQtEffects: Record<string, string> = {};
  for (const p of Object.values(projectPaired)) {
    for (const [qf, qc] of Object.entries(p.qtFiles ?? {})) {
      if (isSafePathSegment(qf) && typeof qc === "string") projectQtEffects[qf] = qc;
    }
  }
  const prepared = prepareLibraryComponentForProject(
    fav,
    projectComponents,
    origins,
    projectEffects,
    projectQtEffects,
  );

  if (prepared.copiedFiles) {
    await writeComponentFolder(prepared.localType, prepared.copiedFiles);
  }
  if (prepared.copiedEffects || prepared.pairedEffects) {
    await writePairedEffectsToProject(prepared.copiedEffects ?? {}, prepared.pairedEffects ?? {});
  }
  await writeOrigins(prepared.origins);
  if (prepared.hint) {
    renameHints.push({ level: "hint", message: prepared.hint });
  }
  if (prepared.copiedFiles || prepared.copiedEffects) {
    await host.reload();
  } else {
    await renderLibraryPalette();
  }
  const actualDecl = parseComponentDecl(
    prepared.copiedFiles ?? projectComponents[prepared.localType] ?? fav.files,
    prepared.localType,
  );
  return project.components.has(prepared.localType) ? prepared.localType : (actualDecl.type || prepared.localType);
}

/** 从“收藏的素材”拖出一项或点选为工具。 */
function startLibraryDrag(down: PointerEvent, fav: LibraryItem, matchedLocalType?: string): void {
  if (!host || down.button !== 0) return;
  if (host.getMode() !== "edit") {
    host.toast("预览模式下不能添加控件，请先切回编辑模式");
    return;
  }
  down.preventDefault();
  const project = host.getProject();
  const decl = (matchedLocalType ? declFor(project, matchedLocalType) : null) ?? parseComponentDecl(fav.files, fav.type);
  const size = decl.defaultSize ?? CONTAINER_DECL.defaultSize!;
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

  const up = async (e: PointerEvent) => {
    document.removeEventListener("pointermove", place);
    document.removeEventListener("pointerup", up);
    ghost.remove();
    if (!host) return;
    const moved = Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) > 4;
    if (!moved) {
      const localType = await ensureFavoriteInProject(fav);
      if (localType) {
        host.setNodeTool(localType);
        syncActivePaletteHighlight();
      }
      return;
    }
    const stage = document.getElementById("stage");
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!inside) return;
    const zoom = host.getZoom();
    const px = (e.clientX - rect.left) / zoom;
    const py = (e.clientY - rect.top) / zoom;
    const localType = await ensureFavoriteInProject(fav);
    if (localType) await host.addNodeAt(localType, px, py);
  };
  document.addEventListener("pointermove", place);
  document.addEventListener("pointerup", up);
}

function syncActivePaletteHighlight(): void {
  if (!host?.getActiveNodeTool) return;
  const activeType = host.getActiveNodeTool();
  for (const item of document.querySelectorAll<HTMLElement>(".palette-item")) {
    item.classList.toggle("active", Boolean(activeType) && item.dataset.type === activeType);
  }
}

/** 刷新素材栏中的“收藏的素材”和“项目素材”，并同步问题栏中的来源提示。 */
export async function renderLibraryPalette(): Promise<void> {
  if (!host || isPreviewWindowLocation()) return;
  const libContainer = ensureLibrarySectionDOM();
  const projContainer = document.getElementById("palette-project");
  if (!libContainer || !projContainer) return;

  const myVersion = ++renderVersion;
  const project = host.getProject();
  const [library, origins, projectComponents, projectId, projectPairedEffects] = await Promise.all([
    loadUserLibrary(),
    readOrigins(),
    readAllProjectComponentFiles(project),
    readProjectId(),
    readPairedEffectsFromProject(project),
  ]);
  if (myVersion !== renderVersion || !host) return;

  const reconciled = reconcileProjectLibrary(projectComponents, library, origins);
  if (reconciled.originsChanged) {
    await writeOrigins(reconciled.origins);
  }

  // 同步来源记录与改名复制相关的提示到 project.problems
  const prefix = "[收藏素材] ";
  project.problems = project.problems.filter((p) => !p.message.startsWith(prefix));
  for (const h of renameHints) {
    project.problems.push({ level: "hint", message: `${prefix}${h.message}` });
  }
  for (const orphan of reconciled.orphaned) {
    const candidateHint =
      orphan.candidateTypes.length > 0
        ? `（发现同接口控件 ${orphan.candidateTypes.join("、")}，可在收藏素材右键菜单中确认关联或清理）`
        : "（可在收藏素材右键菜单中重新关联或清理）";
    project.problems.push({
      level: "hint",
      message: `${prefix}收藏控件“${orphan.libraryItem.label}”的来源记录（${orphan.missingType}）在本项目中找不到对应控件${candidateHint}`,
    });
  }
  host.renderProblems();

  // 1. 渲染“收藏的素材”
  const libElements: HTMLElement[] = [];
  for (const fav of library) {
    const matched = reconciled.matchedByLibraryId.get(fav.id);
    const orphanForFav = reconciled.orphaned.find((o) => o.libraryItem.id === fav.id);
    const el = document.createElement("div");
    el.className = "palette-item library-item";
    const matchedDeclType = matched
      ? parseComponentDecl(projectComponents[matched.localType] ?? {}, matched.localType).type
      : fav.type;
    el.dataset.type = matchedDeclType;
    el.dataset.libraryId = fav.id;

    const nameSpan = document.createElement("span");
    const compEntry = matched
      ? (project.components.get(matched.localType) ?? project.components.get(matchedDeclType))
      : undefined;
    const displayLabel = compEntry?.decl.label ?? fav.label;
    nameSpan.textContent = `★ ${displayLabel}`;
    el.append(nameSpan);

    const favDecl = compEntry?.decl ?? parseComponentDecl(fav.files, fav.type);
    const favEffNames = effectsForComponent(favDecl);
    if (favEffNames.length > 0) {
      const effBadge = document.createElement("span");
      effBadge.className = "badge";
      effBadge.textContent = "需翻译";
      effBadge.title = `包含效果（${favEffNames.join("、")}），在客户端需要在 ui_effects/ 中实现`;
      el.append(effBadge);
    }

    if (matched && matched.status !== "clean") {
      const badge = document.createElement("span");
      badge.className = `library-badge status-${matched.status}`;
      badge.textContent = statusBadgeText(matched.status);
      el.append(badge);
    } else if (!matched && orphanForFav && orphanForFav.candidateTypes.length > 0) {
      const badge = document.createElement("span");
      badge.className = "library-badge status-diverged";
      badge.textContent = "待确认关联";
      el.append(badge);
    }

    const desc = fav.description ? `${fav.description}\n` : "";
    el.title = `${desc}拖进设计窗口；或者点一下，再在设计窗口里拖出大小`;
    el.addEventListener("pointerdown", (e) => startLibraryDrag(e, fav, matchedDeclType));

    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (!host) return;
      const menuItems: Array<{ label: string; action: () => void } | "separator"> = [];

      if (matched && (matched.status === "modified" || matched.status === "diverged")) {
        menuItems.push({
          label: "更新收藏",
          action: () => {
            void (async () => {
              const localFiles = projectComponents[matched.localType];
              if (!localFiles) return;
              const res = updateLibraryItemFromProject(
                matched.localType,
                localFiles,
                library,
                reconciled.origins,
                projectPairedEffects,
              );
              if (!res) return;
              await saveUserLibrary(res.library);
              await writeOrigins(res.origins);
              host?.toast(`已用本项目的版本更新收藏“${fav.label}”`);
              await renderLibraryPalette();
            })();
          },
        });
      }

      if (matched && (matched.status === "outdated" || matched.status === "diverged")) {
        menuItems.push({
          label: "更新为收藏版本",
          action: () => {
            void (async () => {
              const localFiles = projectComponents[matched.localType] ?? {};
              const targetDeclType = parseComponentDecl(localFiles, matched.localType).type || matched.localType;
              const res = replaceProjectComponentWithLibrary(matched.localType, fav, reconciled.origins, localFiles);
              const filesToWrite =
                targetDeclType !== matched.localType
                  ? rewriteComponentIdentity(res.writtenFiles, targetDeclType, displayLabel)
                  : res.writtenFiles;
              await writeComponentFolder(matched.localType, filesToWrite, res.removedFiles);
              if (Object.keys(res.writtenEffects).length > 0 || fav.pairedEffects) {
                await writePairedEffectsToProject(res.writtenEffects, fav.pairedEffects ?? {});
              }
              await writeOrigins(res.origins);
              host?.toast(`已将“${matched.localType}”更新为收藏版本`);
              await host?.reload();
            })();
          },
        });
      }

      if (matched && matched.status !== "clean") {
        menuItems.push({
          label: "与收藏对比",
          action: () => {
            const localFiles = projectComponents[matched.localType] ?? {};
            openCompareModal(
              matched.localType,
              localFiles,
              fav,
              matched.status,
              () => {
                void (async () => {
                  const res = updateLibraryItemFromProject(
                    matched.localType,
                    localFiles,
                    library,
                    reconciled.origins,
                    projectPairedEffects,
                  );
                  if (!res) return;
                  await saveUserLibrary(res.library);
                  await writeOrigins(res.origins);
                  host?.toast(`已用本项目的版本更新收藏“${fav.label}”`);
                  await renderLibraryPalette();
                })();
              },
              () => {
                void (async () => {
                  const targetDeclType = parseComponentDecl(localFiles, matched.localType).type || matched.localType;
                  const res = replaceProjectComponentWithLibrary(matched.localType, fav, reconciled.origins, localFiles);
                  const filesToWrite =
                    targetDeclType !== matched.localType
                      ? rewriteComponentIdentity(res.writtenFiles, targetDeclType, displayLabel)
                      : res.writtenFiles;
                  await writeComponentFolder(matched.localType, filesToWrite, res.removedFiles);
                  if (Object.keys(res.writtenEffects).length > 0 || fav.pairedEffects) {
                    await writePairedEffectsToProject(res.writtenEffects, fav.pairedEffects ?? {});
                  }
                  await writeOrigins(res.origins);
                  host?.toast(`已将“${matched.localType}”更新为收藏版本`);
                  await host?.reload();
                })();
              },
            );
          },
        });
      }

      if (orphanForFav) {
        const sigCandidates = new Set(orphanForFav.candidateTypes);
        const orderedCandidates = [
          ...orphanForFav.candidateTypes,
          ...Object.keys(projectComponents).filter((k) => !reconciled.linkedLocalTypes.has(k) && !sigCandidates.has(k)),
        ];
        for (const cand of orderedCandidates) {
          const isSigMatch = sigCandidates.has(cand);
          menuItems.push({
            label: isSigMatch ? `确认关联到同接口控件“${cand}”` : `关联来源记录到“${cand}”`,
            action: () => {
              void (async () => {
                const updated = relinkOrphanedOrigin(reconciled.origins, orphanForFav.missingType, cand);
                await writeOrigins(updated);
                host?.toast(`已将“${fav.label}”重新关联到 ${cand}`);
                await renderLibraryPalette();
              })();
            },
          });
        }
        menuItems.push({
          label: `清理失效来源记录（${orphanForFav.missingType}）`,
          action: () => {
            void (async () => {
              const updated = removeOrphanedOrigin(reconciled.origins, orphanForFav.missingType);
              await writeOrigins(updated);
              host?.toast(`已清理失效来源记录 ${orphanForFav.missingType}`);
              await renderLibraryPalette();
            })();
          },
        });
      }

      menuItems.push({
        label: "取消收藏",
        action: () => {
          void (async () => {
            const res = unfavoriteFromLibrary(fav.id, library, reconciled.origins);
            await saveUserLibrary(res.library, [fav.id]);
            await writeOrigins(res.origins);
            host?.toast(`已取消收藏“${fav.label}”`);
            await renderLibraryPalette();
          })();
        },
      });

      if (matched) {
        menuItems.push(
          "separator",
          {
            label: "重命名控件",
            action: () => void promptRenameProjectComponent(matched.localType, projectComponents, reconciled.origins),
          },
          {
            label: "复制引用",
            action: () => host?.copyComponentRef(matchedDeclType),
          },
          {
            label: "查看使用位置",
            action: () => highlightComponentUsages(matched.localType),
          },
        );
      }

      host.openMenu(e.clientX, e.clientY, menuItems);
    });

    libElements.push(el);
  }

  if (libElements.length === 0) {
    const empty = document.createElement("div");
    empty.className = "palette-empty";
    empty.textContent = "右键项目素材可加入收藏，跨项目使用";
    libElements.push(empty);
  }
  libContainer.replaceChildren(...libElements);

  // 2. 更新“项目素材”：标准控件常驻在最前，其后是未在“收藏的素材”中显示的本项目自定义控件
  const projElements: HTMLElement[] = [];

  const bindPaletteDrag = (el: HTMLElement, type: string) => {
    el.addEventListener("pointerdown", (down) => {
      if (!host || down.button !== 0) return;
      if (host.getMode() !== "edit") {
        host.toast("预览模式下不能添加控件，请先切回编辑模式");
        return;
      }
      down.preventDefault();
      const size = (declFor(host.getProject(), type) ?? CONTAINER_DECL).defaultSize ?? CONTAINER_DECL.defaultSize!;
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
        if (!host) return;
        if (Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) <= 4) {
          host.setNodeTool(type);
          syncActivePaletteHighlight();
          return;
        }
        const stage = document.getElementById("stage");
        if (!stage) return;
        const rect = stage.getBoundingClientRect();
        const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
        const zoom = host.getZoom();
        if (inside) void host.addNodeAt(type, (e.clientX - rect.left) / zoom, (e.clientY - rect.top) / zoom);
      };
      document.addEventListener("pointermove", place);
      document.addEventListener("pointerup", up);
    });
  };

  for (const stdComp of STANDARD_COMPONENTS.values()) {
    const type = stdComp.decl.type;
    const el = document.createElement("div");
    el.className = "palette-item";
    el.dataset.type = type;
    el.textContent = `${stdComp.decl.label ?? type}（标准）`;
    const title = stdComp.decl.description ?? "";
    el.title = `${title}${title ? "\n" : ""}拖进设计窗口；或者点一下，再在设计窗口里拖出大小`;
    bindPaletteDrag(el, type);
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (!host) return;
      host.openMenu(e.clientX, e.clientY, [
        {
          label: "复制引用",
          action: () => host?.copyComponentRef(type),
        },
        {
          label: "查看使用位置",
          action: () => highlightComponentUsages(type),
        },
      ]);
    });
    projElements.push(el);
  }

  for (const component of project.components.values()) {
    if (component.error) continue;
    const type = component.decl.type;
    const folder = component.folder ?? type;
    if (
      isReservedComponentName(type) ||
      isReservedComponentName(folder) ||
      reconciled.linkedLocalTypes.has(type) ||
      reconciled.linkedLocalTypes.has(folder)
    ) {
      continue;
    }

    const el = document.createElement("div");
    el.className = "palette-item";
    el.dataset.type = type;
    const compEffNames = effectsForComponent(component.decl);
    if (compEffNames.length > 0) {
      const nameSpan = document.createElement("span");
      nameSpan.textContent = component.decl.label ?? type;
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "需翻译";
      badge.title = `包含效果（${compEffNames.join("、")}），在客户端需要在 ui_effects/ 中实现`;
      el.append(nameSpan, badge);
    } else {
      el.textContent = component.decl.label ?? type;
    }
    const title = component.decl.description ?? "";
    el.title = `${title}${title ? "\n" : ""}拖进设计窗口；或者点一下，再在设计窗口里拖出大小`;

    bindPaletteDrag(el, type);

    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (!host) return;
      const folderKey = projectComponents[folder] ? folder : type;
      host.openMenu(e.clientX, e.clientY, [
        {
          label: "收藏素材",
          action: () => {
            void (async () => {
              const files = projectComponents[folderKey];
              if (!files) return;
              const res = collectComponentInLibrary(
                folderKey,
                files,
                projectId,
                library,
                reconciled.origins,
                undefined,
                projectPairedEffects,
              );
              await saveUserLibrary(res.library);
              await writeOrigins(res.origins);
              host?.toast(`已收藏“${res.item.label}”`);
              await renderLibraryPalette();
            })();
          },
        },
        "separator",
        {
          label: "重命名控件",
          action: () => void promptRenameProjectComponent(folderKey, projectComponents, reconciled.origins),
        },
        {
          label: "复制引用",
          action: () => host?.copyComponentRef(type),
        },
        {
          label: "查看使用位置",
          action: () => highlightComponentUsages(type),
        },
      ]);
    });

    projElements.push(el);
  }

  for (const effect of project.effects.values()) {
    if (effect.error) continue;
    const name = effect.decl.name;
    const el = document.createElement("div");
    el.className = "palette-effect-item";
    el.dataset.effect = name;
    const nameSpan = document.createElement("span");
    nameSpan.textContent = `✦ ${effect.decl.label ?? name}`;
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = "需翻译";
    badge.title = isPaintEffect(effect.decl.kind)
      ? `绘制效果（${name}），在客户端需要在 ui_effects/ 中实现绘制`
      : `过渡效果（${name}），在客户端需要在 ui_effects/ 中实现动画`;
    el.append(nameSpan, badge);
    el.title = `${effect.decl.description ?? name}\n在客户端需要在 ui_effects/ 中实现`;
    projElements.push(el);
  }

  if (projElements.length === 0) {
    const empty = document.createElement("div");
    empty.className = "palette-empty";
    empty.textContent = "Agent 做好的控件会出现在这里";
    projElements.push(empty);
  }
  projContainer.replaceChildren(...projElements);
  syncActivePaletteHighlight();
}

export function initLibrary(libraryHost: LibraryHost): void {
  if (isPreviewWindowLocation()) return;
  host = libraryHost;
  ensureLibrarySectionDOM();
}
