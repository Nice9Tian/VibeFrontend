// 把平面设计的节点按画布数据画成网页元素，不带编辑功能。播放页（也就是导出的网页、PDF 和图片）和
// 编辑器里“子项目”节点的内容都用它，所以子项目在哪里看都一样。
import type { Value } from "./expr.ts";
import { toPx } from "./kinds.ts";
import { childrenOfNode, unitOf, type ComponentCreate, type ComponentDecl, type ComponentInstance, type Scene, type SceneNode, type StageServices } from "./model.ts";
import { paintShape } from "./paint.ts";
import { MAX_PART_DEPTH, partBoard, partRefOf } from "./parts.ts";
import { applyGroupClass, applyNodeBox } from "./stage.ts";

export interface RenderType {
  decl: ComponentDecl;
  create?: ComponentCreate;
  error?: string;
}

export interface RenderContext {
  /** 控件类型 → 声明和创建函数 */
  types: (type: string) => RenderType | undefined;
  services: StageServices;
  /** 画出来的控件实例，调用方负责在重画前 destroy */
  instances: ComponentInstance[];
  /** 子项目文件夹（parts/<名字>）→ 它的画布；还没读到时为 undefined */
  parts: (part: string) => Scene | undefined;
  /** 出错时记一笔（播放页会在导出报告里列出来） */
  onError: (message: string) => void;
  /** 正在画的子项目，一层套一层：防止子项目里又放了自己 */
  stack?: string[];
}

/** 控件声明里的默认值和 scene.json 里写的值合起来，就是控件拿到的属性。 */
export function propsOf(decl: ComponentDecl | undefined, node: SceneNode): Record<string, Value> {
  const props: Record<string, Value> = {};
  for (const [key, spec] of Object.entries(decl?.props ?? {})) {
    if (spec.default !== undefined) props[key] = spec.default;
  }
  return { ...props, ...(node.props ?? {}) };
}

export function showRenderError(body: HTMLElement, message: string): void {
  const doc = body.ownerDocument;
  const box = doc.createElement("div");
  box.className = "vf-error";
  box.textContent = message;
  body.replaceChildren(box);
}

/**
 * 网页元素 → 它属于画布里的哪个节点的元素。子项目里画出来的东西不是这个画布的节点（ID 还可能和这里的重名），
 * 算作外面那个子项目节点。
 */
export function partNodeElement(target: Element | null): HTMLElement | null {
  const inner = target?.closest<HTMLElement>(".vf-node") ?? null;
  const part = inner?.closest<HTMLElement>(".vf-part");
  return part ? (part.closest<HTMLElement>(".vf-node") ?? inner) : inner;
}

/** 画一个节点（连同它里面的东西），放进 parentEl。 */
export function renderNode(scene: Scene, id: string, parentEl: HTMLElement, ctx: RenderContext): void {
  const node = scene.nodes[id];
  if (!node) return;
  const doc = parentEl.ownerDocument;
  const unit = unitOf(scene);
  const wrapper = doc.createElement("div");
  wrapper.className = "vf-node";
  wrapper.dataset.vfId = id;
  wrapper.dataset.vfType = node.type;
  applyNodeBox(wrapper, unit, { x: node.x ?? 0, y: node.y ?? 0, width: node.width, height: node.height }, node.rotation);
  const body = doc.createElement("div");
  body.className = "vf-body";
  wrapper.append(body);
  parentEl.append(wrapper);

  if (node.type === "Shape") {
    // 形状的线宽、字号是按像素定的，把方框换成像素来画，和编辑器里一样
    paintShape(body, toPx(unit, node.width), toPx(unit, node.height), propsOf(undefined, node));
    const opacity = node.props?.opacity;
    if (typeof opacity === "number") wrapper.style.opacity = String(Math.max(0, Math.min(1, opacity)));
  } else if (node.type === "Line") {
    ctx.onError(`线条 ${id}：平面设计里还不支持线条，没有画出来`);
  } else if (node.type === "Group") {
    applyGroupClass(wrapper, node);
  } else if (node.type === "Part") {
    renderPartContent(body, node, id, ctx);
  } else if (node.type !== "Container") {
    const type = ctx.types(node.type);
    if (!type?.create) {
      showRenderError(body, type?.error ?? `找不到控件 ${node.type}`);
      if (!type?.error) ctx.onError(`控件 ${id} 的类型 ${node.type} 找不到`);
    } else {
      try {
        const instance = type.create(body, { props: propsOf(type.decl, node), emit: () => undefined, mode: "preview", stage: ctx.services });
        if (instance) ctx.instances.push(instance);
      } catch (e) {
        showRenderError(body, `${node.type} 运行出错：${(e as Error).message}`);
        ctx.onError(`控件 ${id}（${node.type}）运行出错：${(e as Error).message}`);
      }
    }
  }
  for (const child of childrenOfNode(node)) renderNode(scene, child, wrapper, ctx);
}

/**
 * 子项目节点的内容：子项目那一页里的东西，按它们在页面里的位置画进节点的方框。
 * 页面本身的样式类不加：子项目节点在总项目的页面里，总项目页面的样式类已经在外面了（拆出来时两边是同一个）。
 */
export function renderPartContent(body: HTMLElement, node: SceneNode, id: string, ctx: RenderContext): void {
  const ref = partRefOf(node);
  if (!ref) return showRenderError(body, `子项目 ${id} 没写是哪个子项目（props.part）`);
  const stack = ctx.stack ?? [];
  if (stack.includes(ref.part) || stack.length >= MAX_PART_DEPTH) {
    ctx.onError(`子项目 ${ref.part} 套了自己，或者套得太深（最多 ${MAX_PART_DEPTH} 层）`);
    return showRenderError(body, `子项目 ${ref.part} 套了自己`);
  }
  const scene = ctx.parts(ref.part);
  if (!scene) {
    ctx.onError(`找不到子项目 ${ref.part}`);
    return showRenderError(body, `找不到子项目 ${ref.part}`);
  }
  const board = partBoard(scene, ref.board);
  if (!board) return showRenderError(body, `子项目 ${ref.part} 里没有页面`);
  body.classList.add("vf-part");
  body.dataset.vfPart = ref.part;
  const inner = { ...ctx, stack: [...stack, ref.part] };
  for (const child of childrenOfNode(scene.nodes[board])) renderNode(scene, child, body, inner);
}
