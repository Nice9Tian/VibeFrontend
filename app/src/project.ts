// 工具界面里读取设计项目：在 loader.ts 读出的内容之上，把控件和效果的实现文件加载成可以运行的模块，
// 并把控件的样式注入页面。数据结构和查找函数在 model.ts 里，这里原样转出，界面代码只需要引用这一个文件。
import { mountStateImageControl, STANDARD_COMPONENT_LIST } from "../standard/index.ts";
import { check } from "./check.ts";
import { listDir, projectRoot, readText } from "./fs";
import { loadProjectFiles } from "./loader.ts";
import {
  isPaintEffect,
  STATE_IMAGE_KEYS,
  type ComponentCreate,
  type EffectPaint,
  type EffectPlay,
  type Project,
} from "./model.ts";

export * from "./model.ts";

const moduleCache = new Map<string, { source: string; module?: { default?: unknown }; error?: string }>();

/** 把一段源码当作 ES 模块加载。同样的源码只加载一次。 */
async function importSource(cacheKey: string, source: string): Promise<{ module?: { default?: unknown }; error?: string }> {
  let cached = moduleCache.get(cacheKey);
  if (!cached || cached.source !== source) {
    cached = { source };
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    try {
      cached.module = (await import(/* @vite-ignore */ url)) as { default?: unknown };
    } catch (e) {
      cached.error = `加载失败：${(e as Error).message}`;
    } finally {
      URL.revokeObjectURL(url);
    }
    moduleCache.set(cacheKey, cached);
  }
  return cached;
}

/** 把所有控件（含标准控件与项目控件）的 style.css 限定在各自的类型范围内，合并注入页面。 */
async function injectComponentStyles(project: Project): Promise<string> {
  let css = "";
  for (const std of STANDARD_COMPONENT_LIST) {
    if (project.components.has(std.decl.type)) continue;
    if (std.styleText) css += `@scope ([data-vf-type="${std.decl.type}"]) {\n${std.styleText}\n}\n`;
  }
  for (const [type, component] of project.components) {
    if (!component.folder) continue;
    const text = await readText(`components/${component.folder}/${component.decl.style ?? "style.css"}`);
    if (text) css += `@scope ([data-vf-type="${type}"]) {\n${text}\n}\n`;
  }
  let style = document.getElementById("vf-component-styles");
  if (!style) {
    style = document.createElement("style");
    style.id = "vf-component-styles";
    document.head.append(style);
  }
  if (style.textContent !== css) style.textContent = css;
  return css;
}

/** previous 用于在 YAML 写坏时沿用上一份有效的逻辑。 */
export async function loadProject(previous: Project | null): Promise<Project> {
  const project = await loadProjectFiles({ root: projectRoot, readText, listDir }, previous);
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

  // 重新运行静态检查（使浏览器模式下读取到的 SVG 文件也参与 SVG 兼容性检查）
  project.problems = check(project);

  for (const [type, component] of project.components) {
    if (component.source === undefined) continue;
    const entry = component.decl.entry ?? "index.js";
    const loaded = await importSource(`components/${component.folder}/${entry}`, component.source);
    if (loaded.error) component.error = `${entry} ${loaded.error}`;
    else if (typeof loaded.module?.default !== "function") component.error = `${entry} 没有默认导出一个创建函数`;
    else {
      const rawCreate = loaded.module.default as ComponentCreate;
      const stateImages = component.decl.stateImages;
      const svgFiles = component.svgFiles ?? {};
      if (stateImages) {
        component.create = (el, ctx) => {
          const stateInst = mountStateImageControl(el, {
            props: ctx.props,
            emit: ctx.emit,
            stateImages,
            svgFiles,
          });
          const userInst = rawCreate(el, { ...ctx, stateImages, svgFiles });
          return {
            update(next) {
              stateInst.update(next);
              userInst?.update?.(next);
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
    if (component.error) project.problems.push({ level: "error", message: `控件 ${type}：${component.error}` });
  }

  for (const [name, effect] of project.effects) {
    const entry = effect.decl.entry ?? "index.js";
    const source = effect.files[entry];
    if (effect.error || source === undefined) continue;
    const loaded = await importSource(`effects/${effect.folder}/${entry}`, source);
    if (loaded.error) effect.error = `${entry} ${loaded.error}`;
    else if (typeof loaded.module?.default !== "function") {
      effect.error = `${entry} 没有默认导出一个${isPaintEffect(effect.decl.kind) ? "绘制" : "播放"}函数`;
    } else if (isPaintEffect(effect.decl.kind)) {
      effect.paint = loaded.module.default as EffectPaint;
    } else {
      effect.play = loaded.module.default as EffectPlay;
    }
    if (effect.error) project.problems.push({ level: "error", message: `效果 ${name}：${effect.error}` });
  }

  const css = await injectComponentStyles(project);
  project.signature += svgSignature + css;
  return project;
}
