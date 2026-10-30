// 收藏的素材、来源记录与素材复制（设计文档第 3.2 节）：
// - 用户素材库（VibeFrontend/library/）保存跨项目复用的收藏控件；
// - 项目内 .designer/origins.json 记录每个控件来自哪个收藏，以及双方的基准哈希；
// - 比较本项目哈希、收藏当前哈希与基准哈希，得出一致、已修改、有新版本、两边都改过四种状态；
// - 把收藏拖进项目时按四条规则依次判断：来源记录匹配 → 结构哈希匹配 → 同名不存在直接复制 → 同名不同结构改名复制。
import { invoke } from "@tauri-apps/api/core";
import {
  BUILTIN_TYPES,
  CONTAINER_DECL,
  declFor,
  type ComponentDecl,
  type Problem,
  type Project,
} from "./model.ts";
import { normalizeLf, structHashFromFiles } from "./structhash.ts";

export const ORIGINS_PATH = ".designer/origins.json";
const LIBRARY_INDEX_FILE = "library.json";
const LOCAL_STORAGE_LIB_KEY = "vf.userLibrary.v1";

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

/** 从控件文件表中解析 component.json。 */
export function parseComponentDecl(files: Record<string, string>, fallbackType: string): ComponentDecl {
  try {
    const parsed = JSON.parse(files["component.json"] ?? "{}") as ComponentDecl;
    return { ...parsed, type: parsed.type || fallbackType };
  } catch {
    return { type: fallbackType };
  }
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

  // 第二步：处理文件夹或类型被改名的来源记录
  for (const [type, rec] of Object.entries({ ...nextOrigins })) {
    if (localHashes.has(type)) continue;
    const fav = libById.get(rec.libraryId);
    if (!fav) continue;
    let renamedTo: string | null = null;
    // 优先按结构哈希或保留的原声明 type 精确匹配
    for (const [candidateType, candidateHash] of localHashes) {
      if (usedLocalTypes.has(candidateType)) continue;
      const candidateFiles = projectComponents[candidateType];
      const declaredType = candidateFiles ? parseComponentDecl(candidateFiles, candidateType).type : candidateType;
      if (candidateHash === rec.baseHash || candidateHash === fav.hash || declaredType === type) {
        renamedTo = candidateType;
        break;
      }
    }
    // 次选：若用户既改了控件实现（哈希已变）又改了文件夹/type 名，按 component.json 的接口签名匹配
    if (!renamedTo) {
      const favSig = componentInterfaceSignature(fav.files);
      if (favSig) {
        for (const [candidateType] of localHashes) {
          if (usedLocalTypes.has(candidateType)) continue;
          const candidateSig = componentInterfaceSignature(projectComponents[candidateType] ?? {});
          if (candidateSig === favSig) {
            renamedTo = candidateType;
            break;
          }
        }
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
      orphaned.push({ missingType: type, libraryItem: fav, baseHash: rec.baseHash });
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
  if (!rec || !isSafePathSegment(targetLocalType)) return origins;
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
 */
export function prepareLibraryComponentForProject(
  fav: LibraryItem,
  projectComponents: Record<string, Record<string, string>>,
  origins: OriginsFile,
): PrepareDragResult {
  const safeFavType = isSafePathSegment(fav.type.trim()) ? fav.type.trim() : "Component";
  const nextComponents: Record<string, Record<string, string>> = { ...projectComponents };
  const nextOrigins: Record<string, OriginRecord> = {};
  for (const [k, v] of Object.entries(origins.origins ?? {})) {
    nextOrigins[k] = { ...v };
  }

  // 规则 1：检查是否有来源记录指向 fav.id（含文件夹改名后按基准哈希或接口签名找回的情况）
  for (const [type, rec] of Object.entries(nextOrigins)) {
    if (rec.libraryId !== fav.id) continue;
    if (nextComponents[type]) {
      const localHash = structHashFromFiles(nextComponents[type]);
      if (localHash === fav.hash && rec.baseHash !== fav.hash) {
        nextOrigins[type] = { libraryId: fav.id, baseHash: fav.hash };
      }
      return {
        action: "reuse-origin",
        localType: type,
        copiedFiles: null,
        origins: { version: 1, origins: nextOrigins },
        projectComponents: nextComponents,
        hint: null,
      };
    }
    // 来源记录中的类型已被改名，尝试按基准哈希、收藏哈希或原声明 type 找回
    for (const [candidateType, files] of Object.entries(nextComponents)) {
      if (nextOrigins[candidateType]) continue;
      const h = structHashFromFiles(files);
      const declType = parseComponentDecl(files, candidateType).type;
      if (h === rec.baseHash || h === fav.hash || declType === type) {
        delete nextOrigins[type];
        nextOrigins[candidateType] = { libraryId: fav.id, baseHash: h === fav.hash ? fav.hash : rec.baseHash };
        return {
          action: "reuse-origin",
          localType: candidateType,
          copiedFiles: null,
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
    if (nextOrigins[candidateType]) continue;
    const h = structHashFromFiles(files);
    if (h === fav.hash) {
      nextOrigins[candidateType] = { libraryId: fav.id, baseHash: fav.hash };
      return {
        action: "reuse-hash",
        localType: candidateType,
        copiedFiles: null,
        origins: { version: 1, origins: nextOrigins },
        projectComponents: nextComponents,
        hint: null,
      };
    }
  }

  // 规则 3：本项目中没有同名控件
  if (!nextComponents[safeFavType]) {
    const copiedFiles = rewriteComponentIdentity(fav.files, safeFavType, fav.label);
    nextComponents[safeFavType] = copiedFiles;
    nextOrigins[safeFavType] = { libraryId: fav.id, baseHash: fav.hash };
    return {
      action: "copy",
      localType: safeFavType,
      copiedFiles,
      origins: { version: 1, origins: nextOrigins },
      projectComponents: nextComponents,
      hint: null,
    };
  }

  // 规则 4：本项目中有同名控件，但结构不同且无对应来源记录 → 以新名字（如 Button_2）复制进来
  let index = 2;
  while (nextComponents[`${safeFavType}_${index}`]) index++;
  const newType = `${safeFavType}_${index}`;
  const copiedFiles = rewriteComponentIdentity(fav.files, newType, `${fav.label}（收藏）`);
  nextComponents[newType] = copiedFiles;
  nextOrigins[newType] = { libraryId: fav.id, baseHash: fav.hash };
  const hint = `收藏的控件“${fav.label}”与本项目中已有的 ${safeFavType} 不是同一个控件，已以新名字 ${newType} 复制进 components/${newType}/，可右键重命名`;
  return {
    action: "copy-renamed",
    localType: newType,
    copiedFiles,
    origins: { version: 1, origins: nextOrigins },
    projectComponents: nextComponents,
    hint,
  };
}

/**
 * 把本项目中的一个控件收藏到素材库（设计文档第 3.2 节）：
 * 复制控件文件到素材库，分配收藏 ID，并在本项目的 origins.json 中记录来源。
 */
export function collectComponentInLibrary(
  type: string,
  files: Record<string, string>,
  sourceProjectId: string,
  library: LibraryItem[],
  origins: OriginsFile,
  makeId: () => string = () => `fav-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
): { item: LibraryItem; library: LibraryItem[]; origins: OriginsFile } {
  const safeType = isSafePathSegment(type.trim()) ? type.trim() : "Component";
  const decl = parseComponentDecl(files, safeType);
  const normalizedFiles = rewriteComponentIdentity(files, safeType, decl.label ?? safeType);
  const hash = structHashFromFiles(normalizedFiles);
  const existingOrigin = origins.origins[safeType] ?? origins.origins[type];
  const existingIdx = existingOrigin ? library.findIndex((i) => i.id === existingOrigin.libraryId) : -1;

  const rawId = existingIdx >= 0 ? library[existingIdx].id : makeId();
  const id = isSafePathSegment(rawId) ? rawId : `fav-${Date.now().toString(36)}`;
  const item: LibraryItem = {
    id,
    type: safeType,
    label: decl.label ?? safeType,
    description: decl.description ?? "",
    hash,
    sourceProjectId,
    files: normalizedFiles,
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
): { item: LibraryItem; library: LibraryItem[]; origins: OriginsFile } | null {
  const rec = origins.origins[localType];
  if (!rec) return null;
  const idx = library.findIndex((i) => i.id === rec.libraryId);
  if (idx < 0) return null;
  const prev = library[idx];
  const updatedFiles = rewriteComponentIdentity(localFiles, prev.type, prev.label);
  const hash = structHashFromFiles(updatedFiles);
  const item: LibraryItem = {
    ...prev,
    hash,
    files: updatedFiles,
  };
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
): { writtenFiles: Record<string, string>; removedFiles: string[]; origins: OriginsFile } {
  const label = localType === fav.type ? fav.label : `${fav.label}（收藏）`;
  const writtenFiles = rewriteComponentIdentity(fav.files, localType, label);
  const removedFiles = Object.keys(localFiles).filter((name) => isSafePathSegment(name) && !(name in writtenFiles));
  const nextOrigins: OriginsFile = {
    version: 1,
    origins: {
      ...origins.origins,
      [localType]: { libraryId: fav.id, baseHash: fav.hash },
    },
  };
  return { writtenFiles, removedFiles, origins: nextOrigins };
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
}

async function loadUserLibrary(): Promise<LibraryItem[]> {
  if (!isTauriEnv()) {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_LIB_KEY);
      const parsed = raw ? (JSON.parse(raw) as LibraryItem[]) : [];
      return Array.isArray(parsed)
        ? parsed.filter((item) => item && isSafePathSegment(item.id) && isSafePathSegment(item.type))
        : [];
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
      items.push({
        id: entry.id,
        type: entry.type,
        label: entry.label,
        description: entry.description,
        hash: entry.hash || structHashFromFiles(files),
        sourceProjectId: entry.sourceProjectId ?? "",
        files,
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
    if (isTauriEnv()) {
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
  if (!isSafePathSegment(rawNext) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(rawNext) || BUILTIN_TYPES.includes(rawNext)) {
    host.toast("控件类型名不合法，只能使用字母、数字和下划线且不能与内置类型重名");
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

  // 同步更新 scene.json 中使用该控件类型的节点
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

/**
 * 确保某个收藏素材已存在于当前项目的 components/ 中；
 * 如果还没有，先按四条规则复制或关联，并重新加载项目，返回在本项目中应使用的类型名。
 */
async function ensureFavoriteInProject(fav: LibraryItem): Promise<string | null> {
  if (!host) return null;
  const project = host.getProject();
  const projectComponents = await readAllProjectComponentFiles(project);
  const origins = await readOrigins();
  const prepared = prepareLibraryComponentForProject(fav, projectComponents, origins);

  if (prepared.copiedFiles) {
    await writeComponentFolder(prepared.localType, prepared.copiedFiles);
  }
  await writeOrigins(prepared.origins);
  if (prepared.hint) {
    renameHints.push({ level: "hint", message: prepared.hint });
  }
  if (prepared.copiedFiles) {
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
  const [library, origins, projectComponents, projectId] = await Promise.all([
    loadUserLibrary(),
    readOrigins(),
    readAllProjectComponentFiles(project),
    readProjectId(),
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
    project.problems.push({
      level: "hint",
      message: `${prefix}收藏控件“${orphan.libraryItem.label}”的来源记录（${orphan.missingType}）在本项目中找不到对应控件（可在收藏素材右键菜单中重新关联或清理）`,
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

    if (matched && matched.status !== "clean") {
      const badge = document.createElement("span");
      badge.className = `library-badge status-${matched.status}`;
      badge.textContent = statusBadgeText(matched.status);
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
              const res = updateLibraryItemFromProject(matched.localType, localFiles, library, reconciled.origins);
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
                  const res = updateLibraryItemFromProject(matched.localType, localFiles, library, reconciled.origins);
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
        const unlinkedCandidates = Object.keys(projectComponents).filter((k) => !reconciled.linkedLocalTypes.has(k));
        for (const cand of unlinkedCandidates) {
          menuItems.push({
            label: `关联来源记录到“${cand}”`,
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

  // 2. 更新“项目素材”：过滤掉已经在“收藏的素材”中显示的控件，并增强右键菜单（收藏素材、重命名控件、复制引用、查看使用位置）
  const projElements: HTMLElement[] = [];
  for (const component of project.components.values()) {
    if (component.error) continue;
    const type = component.decl.type;
    const folder = component.folder ?? type;
    if (
      BUILTIN_TYPES.includes(type) ||
      reconciled.linkedLocalTypes.has(type) ||
      reconciled.linkedLocalTypes.has(folder)
    ) {
      continue;
    }

    const el = document.createElement("div");
    el.className = "palette-item";
    el.dataset.type = type;
    el.textContent = component.decl.label ?? type;
    const title = component.decl.description ?? "";
    el.title = `${title}${title ? "\n" : ""}拖进设计窗口；或者点一下，再在设计窗口里拖出大小`;

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
              const res = collectComponentInLibrary(folderKey, files, projectId, library, reconciled.origins);
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
