// 平面设计项目的检查：页面、单位、样式类、压中缝的文字。结果和别的检查一起显示在问题栏里。
// 只看文件里的数据，不量网页上的实际排版（文字放不放得下要在设计窗口里量，那在编辑器里做）。
import { classNamesIn, splitClasses } from "./classstyles.ts";
import { formatLength } from "./kinds.ts";
import { allWindowIds, childrenOfNode, LAYOUT_TYPE_KINDS, unitOf, type Problem, type Project } from "./model.ts";
import { coverWrapId, pageGeometry, pageLabel, sheetCount } from "./pages.ts";

/** 只有界面设计才有的节点类型，放进平面设计里没有意义。 */
const UI_ONLY_TYPES = new Set(["Window", "Dialog", "Dock", "External", ...Object.keys(LAYOUT_TYPE_KINDS)]);

export function checkGraphic(project: Project): Problem[] {
  const problems: Problem[] = [];
  const error = (message: string, nodeId?: string) => problems.push({ level: "error", message, nodeId });
  const hint = (message: string, nodeId?: string) => problems.push({ level: "hint", message, nodeId });
  const { scene } = project;
  const unit = unitOf(scene);

  if (scene.unit !== undefined && scene.unit !== "px" && scene.unit !== "mm") {
    error(`ui/scene.json 的 unit 写的是 ${JSON.stringify(scene.unit)}，只能是 "mm" 或 "px"；现在按像素处理`);
  }

  const boards = allWindowIds(scene);
  const pages = boards.filter((id) => scene.nodes[id]?.type === "Page");
  if (pages.length === 0) error("平面设计项目至少要有一个页面（类型为 Page 的顶层节点，并列在 ui/scene.json 的 boards 里）");
  for (const id of scene.boards ?? []) {
    if (!scene.nodes[id]) error(`ui/scene.json 的 boards 里写了“${id}”，画布里没有这个节点`);
    else if (scene.nodes[id].type !== "Page") error(`ui/scene.json 的 boards 里的“${id}”不是页面（类型是 ${scene.nodes[id].type}）`, id);
  }
  for (const id of pages) {
    if (scene.boards && !scene.boards.includes(id)) hint(`页面 ${id} 没有列在 ui/scene.json 的 boards 里，页序按它在文件里出现的先后排`, id);
  }
  const cover: unknown = scene.cover;
  if (cover !== undefined && cover !== "wrap") {
    error(`ui/scene.json 的 cover 写的是 ${JSON.stringify(cover)}，只能是 "wrap"（第一个页面是包封）或者不写`);
  } else if (cover === "wrap" && pages.length > 0 && !coverWrapId(scene)) {
    hint(
      `ui/scene.json 写了 cover: "wrap"，但第一个页面 ${pages[0]} 不是两张纸拼成的跨页（左封底、右封面），页码现在照顺序排`,
      pages[0],
    );
  }

  const knownClasses = classNamesIn(project.styles ?? []);
  const hasStyles = (project.styles ?? []).length > 0;

  for (const [id, node] of Object.entries(scene.nodes)) {
    if (UI_ONLY_TYPES.has(node.type)) {
      error(`节点 ${id} 的类型 ${node.type} 只在界面设计里有；平面设计里用页面（Page）、容器、文本框、图片、图形和项目自己的控件`, id);
      continue;
    }
    if (node.type === "Page") {
      const raw = node.props?.sheets;
      if (raw !== undefined && (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1)) {
        error(`页面 ${id} 的拼页数（sheets）要是不小于 1 的整数，现在是 ${JSON.stringify(raw)}`, id);
      }
      if (!(node.width > 0) || !(node.height > 0)) error(`页面 ${id} 的尺寸要大于 0`, id);
    }
    // 样式类写了，但项目的样式表里找不到：多半是写错了名字
    if (hasStyles) {
      for (const name of splitClasses(node.props?.class)) {
        if (!knownClasses.has(name)) hint(`${id} 用的样式类“${name}”在项目的样式表里找不到`, id);
      }
    }
  }

  // 压在中缝上的文字：跨页从中间裁开或装订后，这一行字会被切断或吃进订口
  for (const pageId of pages) {
    const page = scene.nodes[pageId];
    if (sheetCount(page) < 2) continue;
    const { folds } = pageGeometry(page);
    for (const childId of childrenOfNode(page)) {
      const child = scene.nodes[childId];
      if (!child || child.type !== "Text" || child.rotation) continue;
      const left = child.x ?? 0;
      const right = left + child.width;
      for (const fold of folds) {
        if (left < fold - 1e-6 && right > fold + 1e-6) {
          hint(
            `文本框 ${childId} 压在${pageLabel(scene, pageId)}的中缝上（中缝在 ${formatLength(unit, fold)}${unit.css}，文本框从 ${formatLength(unit, left)} 到 ${formatLength(unit, right)}）`,
            childId,
          );
        }
      }
    }
  }
  return problems;
}

/** 界面设计项目里出现了页面：提醒一下，免得误以为能用。 */
export function checkUiKind(project: Project): Problem[] {
  const problems: Problem[] = [];
  for (const [id, node] of Object.entries(project.scene.nodes)) {
    if (node.type === "Page") {
      problems.push({ level: "error", message: `节点 ${id} 的类型 Page 只在平面设计里有；要做平面设计，把 project.json 的 kind 写成 "graphic"`, nodeId: id });
    }
  }
  if (project.scene.unit === "mm") {
    problems.push({ level: "error", message: `界面设计的画布按像素算，ui/scene.json 的 unit 不能是 "mm"` });
  }
  return problems;
}
