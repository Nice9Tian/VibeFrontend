// 编辑模式下层叠容器（Stack）的显示：一次只看一页，别的页不画也点不到。
// 这里只有纯函数，看哪一页由调用方决定。
import { childrenOfNode, layoutOf, parentOfNode, type Scene } from "./model.ts";

/** 层叠容器当前页，判定规则和运行层一样：写了 currentPage 看它，否则看 currentIndex。 */
export function activePage(children: string[], props: Record<string, unknown>): string | null {
  const page = String(props.currentPage ?? "");
  if (page) return children.includes(page) ? page : null;
  return children[Number(props.currentIndex ?? 0)] ?? null;
}

/** 场景里所有没在显示的层叠页。页里的子节点随页一起隐藏，不用逐个列出。 */
export function hiddenPages(scene: Scene, shownPage: (stackId: string) => string | null): Set<string> {
  const hidden = new Set<string>();
  for (const [id, node] of Object.entries(scene.nodes)) {
    if (layoutOf(node)?.kind !== "stack") continue;
    const shown = shownPage(id);
    for (const child of childrenOfNode(node)) if (child !== shown) hidden.add(child);
  }
  return hidden;
}

/** 要看到这个节点，每一层层叠容器得切到哪一页。 */
export function pagesToReveal(scene: Scene, id: string): Array<{ stack: string; page: string }> {
  const pages: Array<{ stack: string; page: string }> = [];
  let child = id;
  for (let parent = parentOfNode(scene, child); parent; parent = parentOfNode(scene, child)) {
    if (layoutOf(scene.nodes[parent])?.kind === "stack") pages.push({ stack: parent, page: child });
    child = parent;
  }
  return pages;
}
