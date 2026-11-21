// 工具界面里读取设计项目：在 loader.ts 读出的内容之上，把控件和效果的实现文件加载成可以运行的模块，
// 并把控件的样式注入设计窗口 iframe。数据结构和查找函数在 model.ts 里，这里原样转出，界面代码只需要引用这一个文件。
import { mountStateImageControl } from "../standard/index.ts";
import { check } from "./check.ts";
import { scopeComponentCss } from "./cssscope.ts";
import { currentPart, listDir, projectBaseUrl, projectRoot, projectUrl, readText } from "./fs";
import { loadProjectFiles } from "./loader.ts";
import { md5 } from "./md5.ts";
import {
  isPaintEffect,
  standardComponentsOf,
  STATE_IMAGE_KEYS,
  type ComponentCreate,
  type EffectPaint,
  type EffectPlay,
  type Project,
} from "./model.ts";

export * from "./model.ts";
export { scopeComponentCss };

interface CachedModule {
  source: string;
  /** 在哪个设计窗口文档里加载的；设计窗口换了文档，脚本要在新的环境里重新加载 */
  realm: Document | null;
  module?: { default?: unknown };
  error?: string;
}

const moduleCache = new Map<string, CachedModule>();
let stageStyleTarget: Document | null = null;
let lastComponentCss = "";
let lastProjectStyles: Array<{ path: string; text: string }> = [];

type StageImporter = (url: string) => Promise<{ default?: unknown }>;

/**
 * 让设计窗口成为“项目的网页”：
 * - 基准地址指向项目文件夹，项目里的脚本、样式表、图片、字体用相对路径互相引用；
 * - 装一个导入函数，项目的脚本在设计窗口自己的环境里加载和运行（document 就是设计窗口的文档），
 *   和导出成网页之后一样。换一个新的设计窗口文档，就得到一个干净的环境，改过的脚本全部重新加载。
 */
function prepareStageRealm(doc: Document): void {
  if (!doc.getElementById("vf-project-base")) {
    const base = doc.createElement("base");
    base.id = "vf-project-base";
    base.href = projectBaseUrl();
    doc.head.prepend(base);
  }
  const win = doc.defaultView as (Window & { __vfImport?: StageImporter }) | null;
  if (win && !win.__vfImport) {
    // 普通脚本元素属于设计窗口的文档，它里面的 import() 用的是设计窗口自己的模块表
    const script = doc.createElement("script");
    script.textContent = "window.__vfImport = (url) => import(url);";
    doc.head.append(script);
    script.remove();
  }
}

function stageImporter(): { importer: StageImporter; realm: Document } | null {
  const doc = stageStyleTarget;
  const importer = (doc?.defaultView as (Window & { __vfImport?: StageImporter }) | null | undefined)?.__vfImport;
  return doc && importer ? { importer, realm: doc } : null;
}

/**
 * 加载项目里的一个脚本（控件或效果的实现）。path 相对于项目文件夹。
 * 有设计窗口时在设计窗口的环境里按网址加载，脚本里可以用相对路径引用项目里别的脚本；
 * 没有设计窗口时（还没建好）退回到把源码当模块加载，这时脚本不能引用别的文件。
 * 源码没变、还是同一个设计窗口文档时不重复加载。
 */
async function importProjectModule(path: string, source: string): Promise<{ module?: { default?: unknown }; error?: string }> {
  const stage = stageImporter();
  const realm = stage?.realm ?? null;
  let cached = moduleCache.get(path);
  if (!cached || cached.source !== source || cached.realm !== realm) {
    cached = { source, realm };
    try {
      if (stage) {
        cached.module = await stage.importer(`${projectUrl(path)}?v=${md5(source).slice(0, 8)}`);
      } else {
        const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
        try {
          cached.module = (await import(/* @vite-ignore */ url)) as { default?: unknown };
        } finally {
          URL.revokeObjectURL(url);
        }
      }
    } catch (e) {
      cached.error = `加载失败：${(e as Error).message}`;
    }
    moduleCache.set(path, cached);
  }
  return cached;
}

function applyComponentStylesToDoc(doc: Document, css: string): void {
  let style = doc.getElementById("vf-component-styles") as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement("style");
    style.id = "vf-component-styles";
    doc.head.append(style);
  }
  if (style.textContent !== css) style.textContent = css;
}

/**
 * 把项目级的样式表（project.json 的 styles）按顺序挂进设计窗口。
 * 用 <link> 挂，样式表里的 url() 才是相对于样式表自己的位置；内容变了就换一个带新版本号的地址。
 */
function applyProjectStylesToDoc(doc: Document, styles: Array<{ path: string; text: string }>): void {
  const wanted = styles.map((style) => `${projectUrl(style.path)}?v=${md5(style.text).slice(0, 8)}`);
  const existing = [...doc.head.querySelectorAll<HTMLLinkElement>("link[data-vf-project-style]")];
  if (existing.length === wanted.length && existing.every((link, i) => link.dataset.vfProjectStyle === wanted[i])) return;
  const anchor = doc.getElementById("vf-component-styles");
  const fresh = wanted.map((href) => {
    const link = doc.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.vfProjectStyle = href;
    return link;
  });
  // 先挂新的再撤旧的，换样式表时页面不会有一瞬间没有样式
  for (const link of fresh) {
    if (anchor) anchor.before(link);
    else doc.head.append(link);
  }
  for (const link of existing) link.remove();
}

/** 指定设计窗口 iframe 的 Document，使控件样式只注入 iframe 内。 */
export function setStageStyleTarget(doc: Document | null): void {
  stageStyleTarget = doc;
  if (typeof document !== "undefined" && doc && doc !== document) {
    document.getElementById("vf-component-styles")?.remove();
  }
  if (doc) {
    if (doc !== document) prepareStageRealm(doc);
    applyComponentStylesToDoc(doc, lastComponentCss);
    if (doc !== document) applyProjectStylesToDoc(doc, lastProjectStyles);
  }
}

/** 把所有控件（含标准控件与项目控件）的 style.css 加上类型前缀，合并注入设计窗口 iframe。 */
async function injectComponentStyles(project: Project): Promise<string> {
  let css = "";
  for (const std of standardComponentsOf(project.kind).values()) {
    if (project.components.has(std.decl.type)) continue;
    if (std.styleText) css += `${scopeComponentCss(std.decl.type, std.styleText)}\n`;
  }
  for (const [type, component] of project.components) {
    if (!component.folder) continue;
    const text = await readText(`components/${component.folder}/${component.decl.style ?? "style.css"}`);
    if (text) css += `${scopeComponentCss(type, text)}\n`;
  }
  lastComponentCss = css;
  lastProjectStyles = project.styles ?? [];
  if (stageStyleTarget) {
    applyComponentStylesToDoc(stageStyleTarget, css);
    if (stageStyleTarget !== document) applyProjectStylesToDoc(stageStyleTarget, lastProjectStyles);
  }
  return css;
}

/** previous 用于在 YAML 写坏时沿用上一份有效的逻辑。 */
export async function loadProject(previous: Project | null): Promise<Project> {
  const project = await loadProjectFiles({ root: projectRoot, readText, listDir, part: currentPart }, previous);
  const preCheckSet = new Set(check(project).map((p) => `${p.level}\0${p.message}`));
  const loaderProblems = project.problems.filter((p) => !preCheckSet.has(`${p.level}\0${p.message}`));
  let svgSignature = "";

  for (const [, component] of project.components) {
    if (!component.folder) continue;
    const svgFiles: Record<string, string> = { ...(component.svgFiles ?? {}) };
    const entries = await listDir(`components/${component.folder}`);
    const svgNames = new Set<string>(
      entries.filter((e) => !e.isDir && e.name.toLowerCase().endsWith(".svg")).map((e) => e.name),
    );
    if (component.decl.stateImages) {
      for (const key of STATE_IMAGE_KEYS) {
        const fname = component.decl.stateImages[key];
        if (typeof fname === "string" && fname) svgNames.add(fname);
      }
    }
    for (const name of [...svgNames].sort()) {
      const text = await readText(`components/${component.folder}/${name}`);
      if (text !== null) {
        svgFiles[name] = text;
        svgSignature += `\ncomponents/${component.folder}/${name}\n${text}`;
      }
    }
    component.svgFiles = svgFiles;
  }

  for (const [, component] of project.components) {
    if (component.source === undefined) continue;
    const entry = component.decl.entry ?? "index.js";
    const loaded = await importProjectModule(`components/${component.folder}/${entry}`, component.source);
    if (loaded.error) component.error = `${entry} ${loaded.error}`;
    else if (typeof loaded.module?.default !== "function") component.error = `${entry} 没有默认导出一个创建函数`;
    else {
      const rawCreate = loaded.module.default as ComponentCreate;
      const stateImages = component.decl.stateImages;
      const svgFiles = component.svgFiles ?? {};
      if (stateImages) {
        component.create = (el, ctx) => {
          const userInst = rawCreate(el, { ...ctx, stateImages, svgFiles });
          const stateInst = mountStateImageControl(el, {
            props: ctx.props,
            emit: ctx.emit,
            mode: ctx.mode,
            stateImages,
            svgFiles,
          });
          return {
            update(next) {
              userInst?.update?.(next);
              stateInst.update(next);
            },
            destroy() {
              userInst?.destroy?.();
              stateInst.destroy();
            },
          };
        };
      } else {
        component.create = rawCreate;
      }
    }
  }

  for (const [, effect] of project.effects) {
    const entry = effect.decl.entry ?? "index.js";
    const source = effect.files[entry];
    if (effect.error || source === undefined) continue;
    const loaded = await importProjectModule(`effects/${effect.folder}/${entry}`, source);
    if (loaded.error) effect.error = `${entry} ${loaded.error}`;
    else if (typeof loaded.module?.default !== "function") {
      effect.error = `${entry} 没有默认导出一个${isPaintEffect(effect.decl.kind) ? "绘制" : "播放"}函数`;
    } else if (isPaintEffect(effect.decl.kind)) {
      effect.paint = loaded.module.default as EffectPaint;
    } else {
      effect.play = loaded.module.default as EffectPlay;
    }
  }

  // 重新运行静态检查（保留加载阶段的语法/缺失报错，并合并浏览器模式下读取到的 SVG 检查与模块导出检查）
  project.problems = [...loaderProblems, ...check(project)];

  const css = await injectComponentStyles(project);
  project.signature += svgSignature + css;
  return project;
}
