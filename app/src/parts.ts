// 子项目：把总项目里的一部分拆出来单独做，总项目里放一个“子项目”节点（Part）显示它，子项目一改总项目就跟着变。
//
// 子项目是总项目文件夹里 parts/<名字>/ 下的一个完整项目：自己的 project.json、ui/scene.json、docs/、编辑历史；
// 样式表、控件、脚本、素材都用总项目的（不复制，路径也不用改）。
// 编辑器用 ?part=parts/<名字> 打开子项目：这时“属于项目自己的”文件（见 OWN）读写到子项目文件夹里，其余的照旧在总项目里。
// 路径以 @root/ 开头的永远指总项目文件夹（子项目里要读总项目的 project.json、或者别的子项目时用）。
//
// 这里只有计算和对画布数据的修改，不碰网页；编辑器、检查、播放页和命令行共用。
import type { Value } from "./expr.ts";
import { childrenOfNode, roundInScene, unitOf, type Scene, type SceneNode } from "./model.ts";
import { rotatedRectBounds, unionRectOf } from "./transform.ts";

export const PARTS_DIR = "parts";
export const ROOT_PREFIX = "@root/";
/** 子项目节点最多套几层（子项目里还可以放别的子项目） */
export const MAX_PART_DEPTH = 4;

/** 属于项目自己的文件：子项目打开时，这些路径读写到子项目文件夹里 */
const OWN = ["project.json", "ui/", "docs/", "logic/", ".designer/"];

/** 路径写法规整：反斜杠换成 /，去掉开头的 ./ 和 /（项目文件里手写的路径可能这样写） */
function clean(path: string): string {
  return path.replace(/\\/g, "/").replace(/^(?:\.\/|\/)+/, "");
}

export function isOwnPath(path: string): boolean {
  return OWN.some((own) => (own.endsWith("/") ? path === own.slice(0, -1) || path.startsWith(own) : path === own));
}

/** 编辑器里的相对路径 → 总项目文件夹里的路径。part 是子项目文件夹（如 "parts/x23"），没打开子项目时是 null */
export function mapPartPath(raw: string, part: string | null): string {
  const path = clean(raw);
  if (path.startsWith(ROOT_PREFIX)) return path.slice(ROOT_PREFIX.length);
  if (!part) return path;
  return isOwnPath(path) ? (path ? `${part}/${path}` : part) : path;
}

/**
 * 文件监听报来的路径（相对总项目文件夹）→ 编辑器眼里的路径。和这个子项目无关的（总项目自己的画布、别的子项目）返回 null。
 * 子项目里放了别的子项目时，那些子项目的文件变了也要重读，所以 parts/ 下的路径照原样交出去（加 @root/）；
 * 总项目的 project.json 和 ui/presets.json 子项目也在用，同样加 @root/ 交出去。
 */
export function unmapChangedPath(raw: string, part: string | null): string | null {
  const path = clean(raw);
  if (!part) return path;
  if (path === part || path.startsWith(`${part}/`)) return path.slice(part.length + 1);
  if (path.startsWith(`${PARTS_DIR}/`)) return `${ROOT_PREFIX}${path}`;
  // 子项目也读总项目的这两个：设计类型和样式表清单、共用的预设
  if (path === "project.json" || path === "ui/presets.json") return `${ROOT_PREFIX}${path}`;
  return isOwnPath(path) ? null : path;
}

/** 子项目节点指向的子项目文件夹和页面 */
export function partRefOf(node: SceneNode | undefined): { part: string; board: string } | null {
  if (!node || node.type !== "Part") return null;
  const part = typeof node.props?.part === "string" ? node.props.part.replace(/\\/g, "/").replace(/\/+$/, "") : "";
  const board = typeof node.props?.board === "string" ? node.props.board : "";
  return part ? { part, board } : null;
}

/** 子项目文件夹的路径写得对不对：只能是 parts/<名字>，名字只用字母、数字、- 和 _ */
export function isValidPartPath(part: string): boolean {
  return new RegExp(`^${PARTS_DIR}/[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`).test(part);
}

/** 子项目里要显示的那一页：写了就用写的，没写用第一页 */
export function partBoard(scene: Scene, board: string): string | null {
  if (board && scene.nodes[board]?.type === "Page") return board;
  const first = (scene.boards ?? [scene.root]).find((id) => scene.nodes[id]?.type === "Page");
  return first ?? null;
}

/** 画布里所有子项目节点指向的子项目（去重） */
export function referencedParts(scene: Scene): string[] {
  const out = new Set<string>();
  for (const node of Object.values(scene.nodes)) {
    const ref = partRefOf(node);
    if (ref) out.add(ref.part);
  }
  return [...out];
}

/** 名字 → 文件夹名：保留字母数字，其余换成 -；全是中文时用 part-<时间> */
export function partFolderName(name: string, taken: ReadonlySet<string>): string {
  let base = name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 40);
  if (!base) base = `part-${Date.now().toString(36)}`;
  let folder = base;
  for (let n = 2; taken.has(folder); n++) folder = `${base}-${n}`;
  return folder;
}

export interface CarveOutResult {
  /** 子项目的 ui/scene.json */
  partScene: Scene;
  /** 子项目的 project.json */
  partConfig: Record<string, Value>;
  /** 子项目的说明文档 */
  partDoc: string;
}

/**
 * 把总项目画布里的一样或几样东西（连同它们里面的东西）拆成子项目。直接改 master。
 *
 * 一样东西：它和它的子孙从总项目里拿走，原地换成一个同 ID、同位置大小的子项目节点（旋转留在子项目节点上）；
 * 子项目里是一个和它一样大的页面，它放在页面左上角。
 *
 * 几样东西（必须在同一个父节点里）：子项目节点的方框是它们合起来的外包框（转过的按转过以后的样子算），
 * ID 用 options.partNodeId；子项目的页面就是这个外包框那么大，它们在页面里的位置和在总项目里相对外包框的位置一样，
 * 叠放顺序不变；子项目节点放在它们里面最靠下的那一个原来的位置（层次上）。
 *
 * 页面的样式类照抄总项目里这一页的，这样总项目样式表里“某页下面的某个类”这类写法在两边都对得上。
 *
 * options.box：编辑器量出来的“实际画出来的范围”（父节点坐标）。描边、::after 画的框常常超出方框一点，
 * 子项目的页面会把这一圈也包进去，不然在子项目里会被页面边裁掉。只会比方框大，不会小；单个转过的东西不用它。
 */
export function carveOutPart(
  master: Scene,
  nodeIds: string | string[],
  options: { part: string; name: string; boardClass?: string; id: string; partNodeId?: string; box?: { x: number; y: number; width: number; height: number } },
): CarveOutResult {
  const roots = typeof nodeIds === "string" ? [nodeIds] : [...new Set(nodeIds)];
  if (roots.length === 0) throw new Error("没有选中要拆的东西");
  for (const id of roots) {
    const node = master.nodes[id];
    if (!node) throw new Error(`找不到节点 ${id}`);
    if (node.type === "Page") throw new Error("整个页面不能拆成子项目，选页面里的一组东西");
    if (node.type === "Part") throw new Error(`${id} 已经是子项目了`);
  }
  const parentOf = (id: string) => Object.keys(master.nodes).find((pid) => childrenOfNode(master.nodes[pid]).includes(id)) ?? null;
  const parent = parentOf(roots[0]);
  if (roots.length > 1 && roots.some((id) => parentOf(id) !== parent)) throw new Error("选中的东西要在同一个页面或同一个组里，才能一起拆成子项目");

  const subtree: string[] = [];
  const visit = (id: string) => {
    if (subtree.includes(id) || !master.nodes[id]) return;
    subtree.push(id);
    for (const child of childrenOfNode(master.nodes[id])) visit(child);
  };
  // 按它们在父节点里的叠放顺序排（从下到上）
  const siblings = parent ? childrenOfNode(master.nodes[parent]) : [];
  roots.sort((a, b) => siblings.indexOf(a) - siblings.indexOf(b));
  for (const id of roots) visit(id);
  const inside = new Set(subtree);

  const single = roots.length === 1;
  const round = (v: number) => roundInScene(master, v);
  // 子项目节点在总项目里的方框
  const first = master.nodes[roots[0]];
  // 单个转过的东西：子项目节点照它的方框、带着它的旋转，东西在子项目里摆正
  const turned = single && Boolean(first.rotation);
  const box = turned
    ? { x: first.x ?? 0, y: first.y ?? 0, width: first.width, height: first.height }
    : (() => {
        const rects = roots.map((id) => {
          const n = master.nodes[id];
          return rotatedRectBounds({ x: n.x ?? 0, y: n.y ?? 0, width: n.width, height: n.height }, n.rotation ?? 0);
        });
        if (options.box) rects.push(options.box);
        const union = unionRectOf(rects)!;
        // 往外取整到画布的步长（毫米画布是 0.01）：画出来的那一圈不会因为取整又被裁掉一点
        const step = unitOf(master).step;
        const x = round(Math.floor(union.x / step + 1e-6) * step);
        const y = round(Math.floor(union.y / step + 1e-6) * step);
        const right = round(Math.ceil((union.x + union.width) / step - 1e-6) * step);
        const bottom = round(Math.ceil((union.y + union.height) / step - 1e-6) * step);
        return { x, y, width: round(right - x), height: round(bottom - y) };
      })();
  let partNodeId = single ? roots[0] : (options.partNodeId ?? "part1");
  if (!single && (master.nodes[partNodeId] && !inside.has(partNodeId))) throw new Error(`总项目里已经有叫 ${partNodeId} 的东西`);

  // 子项目的页面叫 part；拆出来的东西里已经有叫 part 的，就往后编号
  let board = "part";
  for (let n = 2; inside.has(board); n++) board = `part${n}`;
  const nodes: Record<string, SceneNode> = {};
  const props: Record<string, Value> = { sheets: 1, marginTop: 0, marginBottom: 0, marginOuter: 0, marginInner: 0 };
  if (options.boardClass) props.class = options.boardClass;
  nodes[board] = { type: "Page", width: box.width, height: box.height, props, children: [...roots] };
  for (const id of subtree) nodes[id] = JSON.parse(JSON.stringify(master.nodes[id])) as SceneNode;
  if (turned) {
    nodes[partNodeId] = { ...nodes[partNodeId], x: 0, y: 0 };
    delete nodes[partNodeId].rotation;
  } else {
    for (const id of roots) nodes[id] = { ...nodes[id], x: round((nodes[id].x ?? 0) - box.x), y: round((nodes[id].y ?? 0) - box.y) };
  }

  // 连线挂在另一边的东西上（像素画布才有连线）：两边不在同一个画布里了，挂接拿掉，线停在原来的位置
  const unhook = (target: SceneNode, keep: (other: string) => boolean) => {
    for (const end of ["startNode", "endNode"]) {
      const other = target.props?.[end];
      if (typeof other === "string" && other && !keep(other)) {
        const next = { ...target.props };
        delete next[end];
        target.props = next;
      }
    }
  };
  for (const id of subtree) unhook(nodes[id], (other) => inside.has(other));
  // 总项目里挂在被拆的那一样东西本身上的照旧（它原地换成了同 ID 的子项目节点），挂在它里面的拿掉
  for (const [id, other] of Object.entries(master.nodes)) {
    if (!inside.has(id)) unhook(other, (target) => (single && target === partNodeId) || !inside.has(target));
  }

  // 总项目里：拆走的都拿掉，原地放子项目节点
  const partNode: SceneNode = {
    type: "Part",
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    ...(turned ? { rotation: first.rotation } : {}),
    ...(single && first.locked ? { locked: first.locked } : {}),
    props: { part: options.part, board },
  };
  for (const id of subtree) delete master.nodes[id];
  master.nodes[partNodeId] = partNode;
  if (parent && master.nodes[parent]) {
    const kids = childrenOfNode(master.nodes[parent]);
    const at = kids.indexOf(roots[0]);
    const rest = kids.filter((id) => !roots.includes(id));
    rest.splice(Math.max(0, kids.slice(0, at).filter((id) => !roots.includes(id)).length), 0, partNodeId);
    master.nodes[parent] = { ...master.nodes[parent], children: rest };
  }

  const what = single ? `“${partNodeId}”` : `子项目节点“${partNodeId}”`;
  return {
    partScene: { version: master.version ?? 1, ...(master.unit ? { unit: master.unit } : {}), root: board, boards: [board], nodes },
    partConfig: { version: 1, id: options.id, name: options.name, kind: "graphic", part: { of: "../.." }, boards: [{ id: board, doc: "docs/part.md" }] as unknown as Value },
    partDoc: `# ${options.name}\n\n从总项目拆出来的子项目。在这里改，总项目里的${what}跟着变。\n`,
  };
}
