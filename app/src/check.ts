// 检查设计项目：画布、逻辑、说明、效果之间能不能对上。结果显示在工具的问题栏里，导出前也会检查一遍。
import { parseAssignment, parseExpr, pathsIn } from "./expr.ts";
import {
  BUILTIN_TYPES,
  businessEvent,
  declFor,
  EFFECT_KINDS,
  findCondition,
  findStateLeaf,
  allStateLeaves,
  getSection,
  isBusinessState,
  MOUSE_EVENTS,
  parseDocRef,
  type ConditionDef,
  type Problem,
  type Project,
  type Step,
} from "./model.ts";

/** 步骤出现在哪里：普通事件里，还是业务事件的模拟步骤里。两处的规则不同。 */
type StepPlace = "normal" | "simulate";

export function check(project: Project): Problem[] {
  const problems: Problem[] = [];
  const { scene, logic } = project;
  const error = (message: string, nodeId?: string) => problems.push({ level: "error", message, nodeId });
  const hint = (message: string, nodeId?: string) => problems.push({ level: "hint", message, nodeId });

  // 表达式里的名字必须是状态路径或条件代号
  const checkExpr = (source: unknown, where: string, nodeId?: string) => {
    try {
      for (const path of pathsIn(parseExpr(String(source)))) {
        if (!findStateLeaf(logic, path) && !findCondition(logic, path)) {
          error(`${where}：未知的状态路径或条件代号“${path}”`, nodeId);
        }
      }
    } catch (e) {
      error(`${where}：${(e as Error).message}`, nodeId);
    }
  };
  const checkSteps = (steps: unknown, where: string, place: StepPlace, nodeId?: string) => {
    if (!Array.isArray(steps)) return error(`${where}：这里应该是步骤列表`, nodeId);
    for (const step of steps as Step[]) {
      if ("set" in step) {
        try {
          const { target } = parseAssignment(step.set);
          const leaf = findStateLeaf(logic, target);
          if (!leaf) {
            error(`${where}：set 的目标“${target}”不是状态路径`, nodeId);
          } else if (place === "normal" && isBusinessState(leaf)) {
            error(`${where}：状态“${target}”归业务管，不能在这里直接修改。请改成 emit 一个业务事件，把修改写在它的 simulate 里`, nodeId);
          } else if (place === "simulate" && !isBusinessState(leaf)) {
            error(`${where}：模拟步骤只能修改业务管的状态，“${target}”是界面自己管的。业务接上以后模拟步骤不再执行，写在这里的修改会丢`, nodeId);
          }
          checkExpr(step.set.slice(step.set.indexOf("=") + 1), where, nodeId);
        } catch (e) {
          error(`${where}：${(e as Error).message}`, nodeId);
        }
      } else if ("emit" in step) {
        const isBusiness = businessEvent(logic, step.emit) !== null;
        if (logic.events?.[step.emit] === undefined) {
          error(`${where}：emit 的全局事件“${step.emit}”没有在顶层 events 中定义`, nodeId);
        } else if (place === "simulate" && !isBusiness) {
          error(`${where}：模拟步骤里只能 emit 业务事件，“${step.emit}”是普通全局事件`, nodeId);
        }
      } else if ("if" in step) {
        checkExpr(step.if, where, nodeId);
        if (step.then) checkSteps(step.then, where, place, nodeId);
        if (step.else) checkSteps(step.else, where, place, nodeId);
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
    if (node.rotation) hint(`控件 ${id} 设置了旋转（${node.rotation}°），导出成 Qt 时暂不处理旋转`, id);
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
    if (BUILTIN_TYPES.includes(node.type)) continue;
    const component = project.components.get(node.type);
    if (!component) {
      error(`控件 ${id} 的类型“${node.type}”在 components/ 中找不到`, id);
      continue;
    }
    for (const key of Object.keys(node.props ?? {})) {
      if (!component.decl.props?.[key]) error(`控件 ${id}：scene.json 中的属性“${key}”不在 ${node.type} 的声明里`, id);
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

  // 全局事件和业务事件
  for (const [name, def] of Object.entries(logic.events ?? {})) {
    if (Array.isArray(def)) {
      checkSteps(def, `全局事件 ${name}`, "normal");
    } else if (def && typeof def === "object" && def.owner === "business") {
      if (def.simulate === undefined) hint(`业务事件 ${name} 没有写 simulate，业务没有接上时它什么都不做`);
      else checkSteps(def.simulate, `业务事件 ${name} 的模拟步骤`, "simulate");
    } else {
      error(`全局事件 ${name}：应该是步骤列表；如果是交给业务的事件，写成带 owner: business 和 simulate 的对象`);
    }
  }

  // 控件
  for (const [id, object] of Object.entries(logic.objects ?? {})) {
    if (!object) continue;
    const node = scene.nodes[id];
    if (!node) {
      error(`逻辑中的对象“${id}”在画布中不存在`);
      continue;
    }
    const decl = declFor(project, node.type);
    const isExternal = node.type === "External";
    checkConditions(object.conditions, `${id}.`, id);
    for (const [key, source] of Object.entries(object.props ?? {})) {
      if (key !== "visible" && !decl?.props?.[key]?.logic) {
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
      checkSteps(steps, `控件 ${id} 的 ${event} 事件`, "normal", id);
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
