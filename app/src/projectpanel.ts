// 项目面板：在几个项目之间跳，在总项目和它的子项目之间跳。
// 上面是当前的总项目和它的子项目（parts/ 下的），子项目画在总项目的哪一页也写出来；
// 下面是清单里别的项目（开发服务器记在 workspace.json 里），按最近打开排。
// 点一行在本标签页打开，点 ↗ 或按住 Ctrl 点在新标签页打开，几个项目可以同时开着。
import { askFields } from "./dialogs.ts";
import {
  addWorkspaceProject,
  createWorkspaceProject,
  currentPart,
  currentRootId,
  listWorkspaceProjects,
  projectPageUrl,
  removeWorkspaceProject,
  touchWorkspaceProject,
  type WorkspaceProject,
} from "./fs.ts";
import { boardOfNode, type Project } from "./model.ts";
import { pageLabel } from "./pages.ts";
import { partRefOf } from "./parts.ts";

export interface ProjectPanelDeps {
  getProject(): Project;
  /** 离开这个项目之前把没存的东西存上；存不上返回 false，就不走 */
  flush(): Promise<boolean>;
  /** 选中画布里的一个节点（定位子项目节点用） */
  select(id: string): void;
  toast(message: string): void;
}

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// 行首的小图：平面设计是折了角的一张纸，界面设计是一个窗口，子项目是纸上用虚线框出的一块
const ICONS: Record<string, string> = {
  graphic: `<svg viewBox="0 0 18 22" width="16" height="20"><path d="M2.5 1.5h9l4 4v15h-13z" fill="#fff" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M11.5 1.5v4h4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M5.5 10h7M5.5 13h7M5.5 16h4.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" opacity=".55"/></svg>`,
  ui: `<svg viewBox="0 0 22 18" width="20" height="16"><rect x="1.5" y="1.5" width="19" height="15" rx="2.5" fill="#fff" stroke="currentColor" stroke-width="1.3"/><path d="M1.5 5.5h19" stroke="currentColor" stroke-width="1.3"/><circle cx="4.5" cy="3.5" r=".8" fill="currentColor"/><circle cx="7" cy="3.5" r=".8" fill="currentColor"/></svg>`,
  part: `<svg viewBox="0 0 18 18" width="16" height="16"><rect x="1.5" y="1.5" width="15" height="15" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2.4 1.8"/><rect x="5" y="5" width="8" height="8" rx="1" fill="currentColor" opacity=".45"/></svg>`,
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function iconButton(text: string, title: string, onClick: (e: MouseEvent) => void): HTMLButtonElement {
  const button = el("button", "project-icon-btn", text);
  button.type = "button";
  button.title = title;
  button.setAttribute("aria-label", title);
  button.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick(e);
  });
  return button;
}

/** “3 天前”这样的说法 */
function ago(iso: string | undefined): string {
  if (!iso) return "";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days} 天前`;
  return new Date(then).toLocaleDateString();
}

export function initProjectPanel(host: HTMLElement, deps: ProjectPanelDeps): { refresh(): void } {
  host.classList.add("project-panel");
  const search = el("input", "project-search");
  search.type = "search";
  search.placeholder = "搜索项目……";
  search.spellcheck = false;
  const list = el("div", "project-list");
  const actions = el("div", "project-actions");
  host.append(search, list, actions);

  let others: WorkspaceProject[] = [];
  let othersError = "";
  const root = currentRootId();
  const part = currentPart();

  const go = async (url: string, newTab: boolean) => {
    if (newTab) {
      window.open(url, "_blank", "noopener");
      return;
    }
    if (!(await deps.flush())) {
      deps.toast("有内容还没存上，先没有离开");
      return;
    }
    location.assign(url);
  };

  const matches = (...texts: string[]) => {
    const words = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const hay = texts.join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  };

  function row(options: {
    title: string;
    meta?: string;
    current?: boolean;
    depth?: number;
    kind?: string;
    url: string;
    extra?: HTMLElement[];
    missing?: boolean;
  }): HTMLElement {
    const item = el("div", "project-row");
    item.setAttribute("role", "button");
    item.tabIndex = 0;
    item.dataset.depth = String(options.depth ?? 0);
    if (options.current) item.setAttribute("aria-current", "true");
    if (options.missing) item.classList.add("missing");
    const icon = el("span", "project-row-icon");
    icon.innerHTML = ICONS[options.kind ?? "graphic"] ?? ICONS.graphic;
    icon.setAttribute("aria-hidden", "true");
    const text = el("span", "project-row-text");
    text.append(el("span", "project-row-title", options.title));
    if (options.meta) text.append(el("span", "project-row-meta", options.meta));
    item.append(icon, text);
    if (options.current) item.append(el("span", "project-row-badge", "正在编辑"));
    const tail = el("span", "project-row-actions");
    tail.append(...(options.extra ?? []));
    if (!options.current && !options.missing) tail.append(iconButton("↗", "在新标签页打开", () => void go(options.url, true)));
    item.append(tail);
    const open = (e: MouseEvent | KeyboardEvent) => {
      if (options.current || options.missing) return;
      void go(options.url, e.ctrlKey || e.metaKey || ("button" in e && e.button === 1));
    };
    item.addEventListener("click", open);
    item.addEventListener("auxclick", (e) => {
      if (e.button === 1) open(e);
    });
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter") open(e);
    });
    return item;
  }

  function heading(text: string): HTMLElement {
    return el("div", "project-heading", text);
  }

  function render(): void {
    const project = deps.getProject();
    const rows: HTMLElement[] = [];
    // 总项目和它的子项目
    const masterName = project.partOf ? project.partOf.name : project.name;
    const partList = project.partList ?? [];
    rows.push(heading("当前项目"));
    if (matches(masterName, ...partList.map((p) => `${p.name} ${p.part}`))) {
      rows.push(row({ title: masterName, meta: project.partOf ? "总项目" : project.kind === "graphic" ? "平面设计" : "界面设计", current: !part, kind: project.kind, url: projectPageUrl(root, null) }));
    }
    // 子项目画在当前画布的哪里（只看得到当前打开的这一个画布里的）
    const placed = new Map<string, string[]>();
    for (const [id, node] of Object.entries(project.scene.nodes)) {
      const ref = partRefOf(node);
      if (ref) placed.set(ref.part, [...(placed.get(ref.part) ?? []), id]);
    }
    for (const entry of partList) {
      if (!matches(entry.name, entry.part, masterName)) continue;
      const ids = placed.get(entry.part) ?? [];
      const where = ids.map((id) => {
        const board = boardOfNode(project.scene, id);
        return board ? pageLabel(project.scene, board) : id;
      });
      const extra: HTMLElement[] = [];
      if (ids.length > 0) extra.push(iconButton("◎", "在画布上找到它", () => deps.select(ids[0])));
      rows.push(
        row({
          title: entry.name,
          meta: where.length ? `子项目 · 在${[...new Set(where)].join("、")}` : `子项目 · ${entry.part}`,
          current: part === entry.part,
          depth: 1,
          kind: "part",
          url: projectPageUrl(root, entry.part),
          extra,
        }),
      );
    }
    if (partList.length === 0 && project.kind === "graphic" && !search.value.trim()) {
      rows.push(el("div", "project-note muted", "在画布上右键一组东西 ▸ 拆成子项目，就能单独施工，改完总项目自动跟着变。"));
    }

    // 清单里的别的项目
    const rest = others.filter((p) => !(p.id === root || (!root && p.isDefault)));
    const shown = rest.filter((p) => matches(p.name, p.path));
    if (shown.length > 0 || othersError) rows.push(heading("其他项目"));
    // 同名的项目（例如同一个项目的副本）后面带上文件夹名，免得分不清
    const names = new Map<string, number>();
    for (const item of [...rest, { name: masterName }]) names.set(item.name, (names.get(item.name) ?? 0) + 1);
    for (const item of shown) {
      const extra: HTMLElement[] = [];
      const folder = item.path.replace(/[\/]+$/, "").split(/[\/]/).slice(-2).join("/");
      if (!item.isDefault) {
        extra.push(
          iconButton("×", "从清单里移除（不删文件夹）", () => {
            void removeWorkspaceProject(item.id)
              .then(load)
              .catch((e: Error) => deps.toast(`移除失败：${e.message}`));
          }),
        );
      }
      rows.push(
        row({
          title: item.name,
          meta: item.exists
            ? [(names.get(item.name) ?? 0) > 1 ? folder : item.kind === "graphic" ? "平面设计" : "界面设计", ago(item.lastOpened)].filter(Boolean).join(" · ")
            : `找不到了：${item.path}`,
          kind: item.kind,
          url: projectPageUrl(item.id, null),
          extra,
          missing: !item.exists,
        }),
      );
      rows[rows.length - 1].title = item.path;
    }
    if (othersError) rows.push(el("div", "project-note muted", othersError));
    if (search.value.trim() && rows.every((r) => r.classList.contains("project-heading"))) {
      rows.length = 0;
      rows.push(el("div", "project-note muted", "没有匹配的项目"));
    }
    list.replaceChildren(...rows);
  }

  async function load(): Promise<void> {
    try {
      others = await listWorkspaceProjects();
      othersError = inTauri ? "桌面版现在只开一个项目；多个项目在浏览器版（npm run dev）里切换。" : "";
    } catch (e) {
      others = [];
      othersError = `读不到项目清单：${(e as Error).message}`;
    }
    render();
  }

  const add = el("button", "project-action", "＋ 添加已有项目");
  add.type = "button";
  add.addEventListener("click", async () => {
    const values = await askFields({
      title: "添加已有项目",
      message: "把一个设计项目（有 project.json 的文件夹）加进清单，以后在这里一点就能打开。",
      fields: [{ key: "path", label: "项目文件夹", placeholder: "C:\\Users\\…\\design", hint: "写完整路径" }],
      ok: "添加",
      validate: (v) => (v.path.trim() ? null : "写一下文件夹的路径"),
    });
    if (!values) return;
    try {
      await addWorkspaceProject(values.path.trim());
      await load();
    } catch (e) {
      deps.toast(`添加失败：${(e as Error).message}`);
    }
  });
  const create = el("button", "project-action", "＋ 新建项目");
  create.type = "button";
  create.addEventListener("click", async () => {
    const project = deps.getProject();
    const values = await askFields({
      title: "新建项目",
      fields: [
        { key: "name", label: "名字", value: "" },
        { key: "kind", label: "类型", value: project.kind, options: [{ value: "graphic", label: "平面设计（页面、海报、作品集）" }, { value: "ui", label: "界面设计（窗口、对话框）" }] },
        { key: "path", label: "放在哪个文件夹", placeholder: "C:\\Users\\…\\新项目", hint: "完整路径；文件夹要么不存在，要么是空的" },
      ],
      ok: "新建",
      validate: (v) => (!v.name.trim() ? "起个名字" : !v.path.trim() ? "写一下放在哪个文件夹" : null),
    });
    if (!values) return;
    try {
      const made = await createWorkspaceProject({ name: values.name.trim(), kind: values.kind === "ui" ? "ui" : "graphic", path: values.path.trim() });
      await load();
      await go(projectPageUrl(made.id, null), true);
    } catch (e) {
      deps.toast(`新建失败：${(e as Error).message}`);
    }
  });
  add.disabled = create.disabled = inTauri;
  actions.append(add, create);
  search.addEventListener("input", render);
  search.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && search.value) {
      e.preventDefault();
      search.value = "";
      render();
    }
  });

  // 打开一个项目就把它排到清单最前面
  void listWorkspaceProjects()
    .then((projects) => {
      const here = root ? projects.find((p) => p.id === root) : projects.find((p) => p.isDefault);
      if (here && !inTauri) return touchWorkspaceProject(here.id);
    })
    .catch(() => undefined)
    .finally(() => void load());
  // 别的标签页里加了、删了项目：切回来时刷新一下
  window.addEventListener("focus", () => void load());
  render();
  return { refresh: render };
}
