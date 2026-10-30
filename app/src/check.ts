// 检查设计项目：画布、逻辑、说明、函数、动作和效果之间能不能对上。结果显示在工具的问题栏里，导出前也会检查一遍。
import { parseAssignment, parseExpr, pathsIn } from "./expr.ts";
import {
  allStateLeaves,
  BUILTIN_TYPES,
  businessEvent,
  declFor,
  EFFECT_KINDS,
  findCondition,
  findMenuItem,
  findStateLeaf,
  getSection,
  isBusinessState,
  MOUSE_EVENTS,
  parseDocRef,
  requestEvent,
  STANDARD_COMPONENTS,
  type ConditionDef,
  type Problem,
  type Project,
  type Step,
} from "./model.ts";

/** 步骤出现在哪里：普通事件里，还是业务事件的模拟步骤里。两处的规则不同。 */
type StepPlace = "normal" | "simulate";

const FORBIDDEN_DOM_IDENTIFIERS = [
  "document",
  "window",
  "HTMLElement",
  "SVGElement",
  "Element",
  "Node",
  "navigator",
  "location",
  "localStorage",
  "sessionStorage",
  "XMLHttpRequest",
  "fetch",
  "querySelector",
  "querySelectorAll",
  "getElementById",
  "createElement",
  "innerHTML",
  "addEventListener",
  "requestAnimationFrame",
];

function findForbiddenDomUsage(source: string): string | null {
  // 去掉注释和字符串字面值后再检查标识符
  const stripped = source
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, "''");
  for (const word of FORBIDDEN_DOM_IDENTIFIERS) {
    const re = new RegExp(`\\b${word}\\b`);
    if (re.test(stripped)) return word;
  }
  return null;
}

export function check(project: Project): Problem[] {
  const problems: Problem[] = [];
  const { scene, logic } = project;
  const error = (message: string, nodeId?: string) => problems.push({ level: "error", message, nodeId });
  const hint = (message: string, nodeId?: string) => problems.push({ level: "hint", message, nodeId });

  const isKnownPath = (path: string, extraNames: Set<string>): boolean => {
    if (extraNames.has(path)) return true;
    for (const extra of extraNames) {
      if (path.startsWith(extra + ".")) return true;
    }
    if (findStateLeaf(logic, path) || findCondition(logic, path)) return true;
    if (path.endsWith(".length")) {
      const base = path.slice(0, -".length".length);
      const leaf = findStateLeaf(logic, base);
      if (leaf && (leaf.type === "array" || leaf.type === "string")) return true;
    }
    return false;
  };

  // 表达式里的名字必须是状态路径、条件代号或当前上下文允许的临时名字
  const checkExpr = (source: unknown, where: string, nodeId?: string, extraNames = new Set<string>()) => {
    try {
      for (const path of pathsIn(parseExpr(String(source)))) {
        if (!isKnownPath(path, extraNames)) {
          error(`${where}：未知的状态路径或条件代号“${path}”`, nodeId);
        }
      }
    } catch (e) {
      error(`${where}：${(e as Error).message}`, nodeId);
    }
  };

  const checkStructuredExpr = (raw: unknown, where: string, nodeId?: string, extraNames = new Set<string>()) => {
    if (raw === null || raw === undefined || typeof raw === "boolean" || typeof raw === "number") return;
    if (typeof raw === "string") {
      checkExpr(raw, where, nodeId, extraNames);
      return;
    }
    if (Array.isArray(raw)) {
      for (const item of raw) checkStructuredExpr(item, where, nodeId, extraNames);
      return;
    }
    if (typeof raw === "object") {
      for (const v of Object.values(raw as Record<string, unknown>)) {
        checkStructuredExpr(v, where, nodeId, extraNames);
      }
    }
  };

  const checkTargetOwnership = (target: string, where: string, place: StepPlace, nodeId?: string, requireArray = false) => {
    const leaf = findStateLeaf(logic, target);
    if (!leaf) {
      error(`${where}：目标“${target}”不是状态路径`, nodeId);
      return null;
    }
    if (requireArray && leaf.type !== "array") {
      error(`${where}：目标“${target}”不是数组状态（type: array）`, nodeId);
    }
    if (place === "normal" && isBusinessState(leaf)) {
      error(`${where}：状态“${target}”归业务管，不能在这里直接修改。请改成 emit 一个业务事件，把修改写在它的 simulate 里`, nodeId);
    } else if (place === "simulate" && !isBusinessState(leaf)) {
      error(`${where}：模拟步骤只能修改业务管的状态，“${target}”是界面自己管的。业务接上以后模拟步骤不再执行，写在这里的修改会丢`, nodeId);
    }
    return leaf;
  };

  const checkSteps = (steps: unknown, where: string, place: StepPlace, nodeId?: string, extraNames = new Set<string>()) => {
    if (!Array.isArray(steps)) return error(`${where}：这里应该是步骤列表`, nodeId);
    for (const step of steps as Step[]) {
      if ("set" in step) {
        try {
          const parsed = parseAssignment(step.set);
          checkTargetOwnership(parsed.target, `${where} 的 set`, place, nodeId, parsed.index !== undefined);
          if (parsed.index !== undefined) {
            for (const p of pathsIn(parsed.index)) {
              if (!isKnownPath(p, extraNames)) error(`${where}：未知的状态路径或条件代号“${p}”`, nodeId);
            }
          }
          for (const p of pathsIn(parsed.value)) {
            if (!isKnownPath(p, extraNames)) error(`${where}：未知的状态路径或条件代号“${p}”`, nodeId);
          }
        } catch (e) {
          error(`${where}：${(e as Error).message}`, nodeId);
        }
      } else if ("push" in step) {
        const spec: { to?: string; item?: unknown; index?: string | number } =
          typeof step.push === "string"
            ? { to: step.push, item: (step as { value?: unknown }).value, index: (step as { index?: string | number }).index }
            : step.push;
        if (!spec?.to) error(`${where}：push 缺少目标数组状态 to`, nodeId);
        else checkTargetOwnership(spec.to, `${where} 的 push`, place, nodeId, true);
        if (spec?.index !== undefined) checkExpr(spec.index, `${where} 的 push.index`, nodeId, extraNames);
        checkStructuredExpr(spec?.item, `${where} 的 push.item`, nodeId, extraNames);
      } else if ("remove" in step) {
        const spec = typeof step.remove === "string" ? { from: step.remove, index: (step as { index?: unknown }).index } : step.remove;
        if (!spec?.from) error(`${where}：remove 缺少目标数组状态 from`, nodeId);
        else checkTargetOwnership(spec.from, `${where} 的 remove`, place, nodeId, true);
        if (spec?.index === undefined) error(`${where}：remove 缺少下标 index`, nodeId);
        else checkExpr(spec.index, `${where} 的 remove.index`, nodeId, extraNames);
      } else if ("move" in step) {
        const spec =
          typeof step.move === "string"
            ? { in: step.move, from: (step as { from?: unknown }).from, to: (step as { to?: unknown }).to }
            : step.move;
        if (!spec?.in) error(`${where}：move 缺少目标数组状态 in`, nodeId);
        else checkTargetOwnership(spec.in, `${where} 的 move`, place, nodeId, true);
        if (spec?.from === undefined || spec?.to === undefined) error(`${where}：move 需要同时提供 from 和 to`, nodeId);
        else {
          checkExpr(spec.from, `${where} 的 move.from`, nodeId, extraNames);
          checkExpr(spec.to, `${where} 的 move.to`, nodeId, extraNames);
        }
      } else if ("fn" in step) {
        const spec = typeof step.fn === "string" ? { name: step.fn, args: (step as { args?: Record<string, unknown> }).args } : step.fn;
        if (!spec?.name) {
          error(`${where}：fn 缺少函数名`, nodeId);
        } else if (!project.functions?.[spec.name]) {
          error(`${where}：找不到 JS 函数“${spec.name}”（请放在 functions/${spec.name}.js）`, nodeId);
        }
        if (spec?.args) checkStructuredExpr(spec.args, `${where} 的 fn.args`, nodeId, extraNames);
      } else if ("openWindow" in step) {
        const winId = typeof step.openWindow === "string" ? step.openWindow : step.openWindow?.id;
        const winNode = winId ? scene.nodes[winId] : undefined;
        if (!winNode || (winNode.type !== "Dialog" && winNode.type !== "Window")) {
          error(`${where}：openWindow 的目标“${winId ?? ""}”不是画布中的窗口或对话框节点`, nodeId);
        }
      } else if ("closeWindow" in step) {
        const winId = step.closeWindow;
        const winNode = scene.nodes[winId];
        if (!winNode || (winNode.type !== "Dialog" && winNode.type !== "Window")) {
          error(`${where}：closeWindow 的目标“${winId}”不是画布中的窗口或对话框节点`, nodeId);
        }
      } else if ("call" in step) {
        if (!logic.actions?.[step.call]) {
          error(`${where}：call 的动作“${step.call}”没有在顶层 actions 中定义`, nodeId);
        }
      } else if ("emit" in step) {
        const spec = typeof step.emit === "string" ? { name: step.emit, args: (step as { args?: Record<string, unknown> }).args } : step.emit;
        const isBusiness = businessEvent(logic, spec.name) !== null;
        if (logic.events?.[spec.name] === undefined) {
          error(`${where}：emit 的全局事件“${spec.name}”没有在顶层 events 中定义`, nodeId);
        } else if (place === "simulate" && !isBusiness) {
          error(`${where}：模拟步骤里只能 emit 业务事件，“${spec.name}”是普通全局事件`, nodeId);
        }
        if (spec.args) checkStructuredExpr(spec.args, `${where} 的 emit.args`, nodeId, extraNames);
      } else if ("if" in step) {
        checkExpr(step.if, where, nodeId, extraNames);
        if (step.then) checkSteps(step.then, where, place, nodeId, extraNames);
        if (step.else) checkSteps(step.else, where, place, nodeId, extraNames);
      } else {
        error(`${where}：无法识别的步骤 ${JSON.stringify(step)}`, nodeId);
      }
    }
  };

  const checkConditions = (conditions: Record<string, ConditionDef> | undefined, prefix: string, nodeId?: string) => {
    for (const [name, def] of Object.entries(conditions ?? {})) {
      const id = prefix + name;
      if (def?.type === "symbol") {
        if (def.expr === undefined) error(`条件 ${id}：符号条件缺少 expr`, nodeId);
        else checkExpr(def.expr, `条件 ${id}`, nodeId);
      } else if (def?.type === "text") {
        hint(`文字条件 ${id}（“${def.text ?? ""}”）尚未改写为符号条件，预览时用开关切换`, nodeId);
      } else {
        error(`条件 ${id}：type 应为 text 或 symbol`, nodeId);
      }
    }
  };

  // 画布
  for (const [id, node] of Object.entries(scene.nodes)) {
    if (node.layout) {
      const validLayouts = ["vbox", "hbox", "grid", "form", "stack"];
      if (!validLayouts.includes(node.layout.kind)) {
        error(`节点 ${id}：layout.kind 应为 ${validLayouts.join("、")} 之一，现在是“${node.layout.kind}”`, id);
      }
    }
    if (node.dockArea && !["left", "right", "top", "bottom"].includes(node.dockArea)) {
      error(`停靠面板 ${id}：dockArea 应为 left、right、top、bottom 之一，现在是“${node.dockArea}”`, id);
    }
    if (node.type === "External") {
      if (node.children?.length) error(`外部容器 ${id} 不能包含子节点，里面的控件由业务提供`, id);
      continue;
    }
    if (node.type === "Shape" || node.type === "Line") {
      const decl = declFor(project, node.type)!;
      for (const key of Object.keys(node.props ?? {})) {
        if (!decl.props?.[key]) error(`${node.type === "Shape" ? "形状" : "线条"} ${id}：scene.json 中的属性“${key}”不在声明里`, id);
      }
      if (node.children?.length) error(`${id}：形状和线条不能包含子节点`, id);
      for (const end of ["startNode", "endNode"]) {
        const target = node.props?.[end];
        if (typeof target === "string" && target !== "" && !scene.nodes[target]) {
          hint(`线条 ${id}：${end === "startNode" ? "起点" : "终点"}挂着的节点“${target}”不存在，这一头停在原来的位置`, id);
        }
      }
      continue;
    }
    if (BUILTIN_TYPES.includes(node.type)) {
      const decl = declFor(project, node.type);
      for (const key of Object.keys(node.props ?? {})) {
        if (key === "visible" || key === "enabled" || key === "open" || key === "modal") continue;
        if (decl?.props && !decl.props[key]) {
          error(`节点 ${id}：scene.json 中的属性“${key}”不在 ${node.type} 的声明里`, id);
        }
      }
      continue;
    }
    const component = project.components.get(node.type) ?? STANDARD_COMPONENTS.get(node.type);
    if (!component) {
      error(`控件 ${id} 的类型“${node.type}”在 components/ 或标准控件中找不到`, id);
      continue;
    }
    for (const key of Object.keys(node.props ?? {})) {
      if (key === "visible") continue;
      if (!component.decl.props?.[key]) error(`控件 ${id}：scene.json 中的属性“${key}”不在 ${node.type} 的声明里`, id);
    }
  }

  // 逻辑 JS 函数：禁止使用网页元素
  for (const [fnName, source] of Object.entries(project.functions ?? {})) {
    const forbidden = findForbiddenDomUsage(source);
    if (forbidden) {
      error(`函数 ${fnName}：逻辑 JS 函数不能使用网页元素或浏览器对象“${forbidden}”`);
    }
  }

  // 效果
  for (const [name, effect] of project.effects) {
    if (effect.error) {
      error(`效果 ${name}：${effect.error}`);
      continue;
    }
    if (!EFFECT_KINDS.includes(effect.decl.kind)) {
      error(`效果 ${name}：kind 应为 ${EFFECT_KINDS.join("、")} 之一，现在是“${effect.decl.kind}”`);
    }
    hint(`效果 ${name} 需要翻译：导出成 Qt 后，要在界面效果层为它提供实现（当前哈希 ${effect.hash}）；没有提供时直接切到结束状态`);
  }

  // 状态
  const stateRoots = Object.keys(logic.state ?? {});
  for (const { path, leaf } of allStateLeaves(logic)) {
    if (leaf.owner !== undefined && leaf.owner !== "ui" && leaf.owner !== "business") {
      error(`状态 ${path}：owner 应为 ui（界面自己管）或 business（业务管），现在是“${leaf.owner}”`);
    }
  }
  for (const id of Object.keys(logic.conditions ?? {})) {
    if (stateRoots.includes(id) || scene.nodes[id]) error(`全局条件“${id}”与状态根名或控件 ID 重名`);
  }
  for (const root of stateRoots) {
    if (scene.nodes[root]) error(`状态根名“${root}”与控件 ID 重名`);
  }
  checkConditions(logic.conditions, "");

  // 全局事件、业务事件与请求事件
  for (const [name, def] of Object.entries(logic.events ?? {})) {
    if (Array.isArray(def)) {
      checkSteps(def, `全局事件 ${name}`, "normal");
    } else if (def && typeof def === "object" && def.owner === "business") {
      const bDef = businessEvent(logic, name)!;
      const paramNames = new Set<string>(["param"]);
      for (const k of Object.keys(bDef.params ?? {})) {
        paramNames.add(k);
        paramNames.add(`param.${k}`);
      }
      if (bDef.simulate === undefined) hint(`业务事件 ${name} 没有写 simulate，业务没有接上时它什么都不做`);
      else checkSteps(bDef.simulate, `业务事件 ${name} 的模拟步骤`, "simulate", undefined, paramNames);
    } else if (def && typeof def === "object" && def.owner === "ui") {
      const rDef = requestEvent(logic, name)!;
      const paramNames = new Set<string>(["param"]);
      for (const k of Object.keys(rDef.params ?? {})) {
        paramNames.add(k);
        paramNames.add(`param.${k}`);
      }
      if (!Array.isArray(rDef.steps)) error(`请求事件 ${name}：缺少 steps 步骤列表`);
      else checkSteps(rDef.steps, `请求事件 ${name} 的步骤`, "normal", undefined, paramNames);
    } else {
      error(`全局事件 ${name}：应该是步骤列表；如果是交给业务的事件，写 owner: business；如果是业务发给界面的请求事件，写 owner: ui`);
    }
  }

  // 动作 actions
  for (const [name, def] of Object.entries(logic.actions ?? {})) {
    if (!def || typeof def !== "object") {
      error(`动作 ${name}：定义应为对象`);
      continue;
    }
    for (const [inputKey, expr] of Object.entries(def.input ?? {})) {
      checkExpr(expr, `动作 ${name} 的 input.${inputKey}`);
    }
    if (def.onSuccess) {
      checkSteps(def.onSuccess, `动作 ${name} 的 onSuccess`, "normal", undefined, new Set(["result"]));
    }
    if (def.onError) {
      checkSteps(def.onError, `动作 ${name} 的 onError`, "normal", undefined, new Set(["error", "error.message"]));
    }
    if (!project.actionSources?.[name]) {
      hint(`动作 ${name} 没有实现文件（${def.handler ?? `actions/${name}.js`}），预览时默认按模拟成功处理`);
    }
  }

  // 控件与菜单项
  for (const [id, object] of Object.entries(logic.objects ?? {})) {
    if (!object) continue;
    const node = scene.nodes[id];
    const menuItem = !node ? findMenuItem(scene, id) : null;
    if (!node && !menuItem) {
      error(`逻辑中的对象“${id}”在画布中不存在`);
      continue;
    }
    if (menuItem && !node) {
      checkConditions(object.conditions, `${id}.`, id);
      for (const [key, source] of Object.entries(object.props ?? {})) {
        if (!["visible", "enabled", "text", "checked"].includes(key)) {
          error(`菜单项 ${id}：不支持由逻辑控制属性“${key}”`, id);
        }
        checkExpr(source, `菜单项 ${id} 的 props.${key}`, id);
      }
      for (const [event, steps] of Object.entries(object.events ?? {})) {
        if (event !== "click") error(`菜单项 ${id}：只支持 click 事件，不支持“${event}”`, id);
        checkSteps(steps, `菜单项 ${id} 的 ${event} 事件`, "normal", id, new Set(["value", "param"]));
      }
      continue;
    }

    const decl = declFor(project, node.type);
    const isExternal = node.type === "External";
    checkConditions(object.conditions, `${id}.`, id);
    for (const [key, source] of Object.entries(object.props ?? {})) {
      if (key !== "visible" && key !== "enabled" && !decl?.props?.[key]?.logic) {
        error(`控件 ${id}：当前类型 ${node.type} 不支持由逻辑控制属性“${key}”`, id);
      }
      checkExpr(source, `控件 ${id} 的 props.${key}`, id);
    }
    if (object.bind !== undefined) {
      if (!decl?.bind) error(`控件 ${id}：当前类型 ${node.type} 不支持 bind`, id);
      const leaf = findStateLeaf(logic, object.bind);
      if (!leaf) error(`控件 ${id}：bind 的目标“${object.bind}”不是状态路径`, id);
      else if (isBusinessState(leaf)) error(`控件 ${id}：bind 的目标“${object.bind}”归业务管，界面不能直接写入`, id);
    }
    for (const [event, steps] of Object.entries(object.events ?? {})) {
      if (isExternal) {
        error(`外部容器 ${id} 不支持事件：里面的控件由业务提供，界面收不到它上面的鼠标事件`, id);
      } else if (!MOUSE_EVENTS.includes(event) && !decl?.events?.includes(event)) {
        error(`控件 ${id}：当前类型 ${node.type} 不支持事件“${event}”`, id);
      }
      checkSteps(steps, `控件 ${id} 的 ${event} 事件`, "normal", id, new Set(["value", "param"]));
    }
    for (const [prop, effectName] of Object.entries(object.effects ?? {})) {
      if (prop !== "visible") {
        error(`控件 ${id}：effects 目前只支持 visible（显示和隐藏时的过渡），不支持“${prop}”`, id);
        continue;
      }
      const effect = project.effects.get(String(effectName));
      if (!effect) error(`控件 ${id}：效果“${effectName}”在 effects/ 中找不到`, id);
      else if (effect.decl.kind !== "visibility") error(`控件 ${id}：效果 ${effectName} 的种类是 ${effect.decl.kind}，不能用在 visible 上`, id);
      if (object.props?.visible === undefined) hint(`控件 ${id}：给 visible 指定了效果，但 visible 没有由逻辑控制，这个效果不会被播放`, id);
    }
    if (object.doc) {
      const { path, section } = parseDocRef(object.doc);
      const text = project.docs.get(path);
      if (text === undefined) hint(`控件 ${id}：找不到说明文档 ${path}`, id);
      else if (section && getSection(text, section) === null) hint(`控件 ${id}：${path} 中找不到小节 ${section}`, id);
    }
  }
  return problems;
}
