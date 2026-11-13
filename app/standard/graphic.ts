// 平面设计自带的标准控件：文本框（Text）和图片（Image）。
// 写法和界面设计的标准控件（index.ts）一样：声明、网页实现、样式。它们不导出成 Qt。
//
// 这两个控件在编辑器、独立的播放页和导出的网页里是同一份代码，所以只用 el.ownerDocument 建元素，
// 不碰全局的 document：编辑器里控件画在设计窗口的 iframe 里，全局 document 是编辑器自己的页面。
import type { Value } from "../src/expr.ts";
import type { ComponentCreate, ComponentDecl, LoadedComponent } from "../src/model.ts";

export interface GraphicStandardComponent extends LoadedComponent {
  styleText: string;
}

const text = (value: Value | undefined): string => (typeof value === "string" ? value : value === undefined || value === null ? "" : String(value));

/**
 * 文本框。内容是一段 HTML（props.html），长什么样由样式类（props.class）决定，
 * 样式类写在项目的样式表里（project.json 的 styles）。
 * 一段话可以只有文字，也可以带行内标签（<b>、<i>、<span class>、<br>），或者是几个段落、一张表。
 */
const createText: ComponentCreate = (el, { props }) => {
  const box = el.ownerDocument.createElement("div");
  el.append(box);
  let shown: string | null = null;
  const update = (next: Record<string, Value>) => {
    const cls = text(next.class).trim();
    box.className = cls ? `vf-text vf-fill ${cls}` : "vf-text vf-fill";
    const html = text(next.html);
    // 正在画布上直接改字时不重写内容，光标才不会跳
    if (html !== shown && !box.isContentEditable) {
      box.innerHTML = html;
      shown = html;
    }
  };
  update(props);
  return { update, destroy: () => box.remove() };
};

const TEXT_DECL: ComponentDecl = {
  type: "Text",
  label: "文本框",
  description: "一段文字。双击直接改字；样式用项目样式表里的样式类",
  defaultSize: { width: 240, height: 72 },
  props: {
    html: { type: "string", default: "文字", label: "内容（HTML）", multiline: true },
    class: { type: "string", default: "", label: "样式类" },
  },
  children: false,
};

/**
 * 图片。props.src 是项目里的文件路径；fit 决定图片怎样放进框里，position 决定裁切时留哪一部分。
 */
const createImage: ComponentCreate = (el, { props, stage }) => {
  const doc = el.ownerDocument;
  const box = doc.createElement("div");
  const img = doc.createElement("img");
  img.draggable = false;
  box.append(img);
  el.append(box);
  let shownSrc: string | null = null;
  let done: (() => void) | null = null;
  const settle = () => {
    done?.();
    done = null;
  };
  img.addEventListener("load", settle);
  img.addEventListener("error", () => {
    box.dataset.missing = "true";
    settle();
  });
  const update = (next: Record<string, Value>) => {
    const cls = text(next.class).trim();
    box.className = cls ? `vf-image vf-fill ${cls}` : "vf-image vf-fill";
    const src = text(next.src).trim();
    if (src !== shownSrc) {
      shownSrc = src;
      settle();
      delete box.dataset.missing;
      box.dataset.empty = String(!src);
      if (src) {
        done = stage?.wait(`图片 ${src}`) ?? null;
        img.src = stage ? stage.url(src) : src;
      } else {
        img.removeAttribute("src");
      }
    }
    img.alt = text(next.alt);
    img.style.objectFit = text(next.fit) || "contain";
    img.style.objectPosition = text(next.position) || "50% 50%";
  };
  update(props);
  return {
    update,
    destroy: () => {
      settle();
      box.remove();
    },
  };
};

const IMAGE_DECL: ComponentDecl = {
  type: "Image",
  label: "图片",
  description: "项目里的一张图片（位图或 SVG）",
  defaultSize: { width: 240, height: 160 },
  props: {
    src: { type: "string", default: "", label: "文件", asset: true },
    fit: { type: "string", default: "contain", label: "放进框里的方式", options: ["contain", "cover", "fill", "none"] },
    position: { type: "string", default: "50% 50%", label: "裁切时留哪里" },
    alt: { type: "string", default: "", label: "替代文字" },
    class: { type: "string", default: "", label: "样式类" },
  },
  children: false,
};

export const GRAPHIC_COMPONENT_LIST: GraphicStandardComponent[] = [
  {
    decl: TEXT_DECL,
    folder: "Text",
    create: createText,
    // 文本框的根元素铺满节点的方框（vf-fill，见 stage.ts）：竖排、对齐、分栏都以这个方框为准
    styleText: `.vf-text[contenteditable="true"] { outline: none; cursor: text; user-select: text; }`,
  },
  {
    decl: IMAGE_DECL,
    folder: "Image",
    create: createImage,
    styleText: `.vf-image { overflow: hidden; }
.vf-image > img { display: block; width: 100%; height: 100%; }
.vf-image[data-empty="true"], .vf-image[data-missing="true"] { background: repeating-linear-gradient(45deg, rgba(120,120,120,0.10) 0 6px, rgba(120,120,120,0.18) 6px 12px); outline: 1px dashed rgba(90,90,90,0.6); outline-offset: -1px; }
.vf-image[data-empty="true"] > img, .vf-image[data-missing="true"] > img { visibility: hidden; }`,
  },
];

export const GRAPHIC_COMPONENTS = new Map<string, GraphicStandardComponent>(GRAPHIC_COMPONENT_LIST.map((item) => [item.decl.type, item]));
