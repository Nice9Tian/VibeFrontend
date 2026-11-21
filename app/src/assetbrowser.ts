// 素材面板：搜索框、分类筛选、按组进入（参考 PromptCut 的素材库）。
// 总览里每组一张卡片：组名、条数、›、前几样的缩略；点卡片进入这一组，看全部；搜索在总览里只留下有结果的组，
// 进了组就只在这一组里筛。素材本身（能拖进设计窗口、右键菜单）还是 main.ts 和 library.ts 画在各组容器里的那些，
// 这里只是把容器挪进来、按搜索词显示或隐藏，所以它们自己的事件都还在。

export type AssetCategory = "controls" | "graphics";

export interface AssetGroup {
  id: string;
  title: string;
  category: AssetCategory;
  /** main.ts / library.ts 往里画素材的容器；hidden 为 true 时这一组在当前设计类型里没有 */
  container: HTMLElement;
  /** 总览卡片里的缩略：图块（grid）还是名字（list） */
  preview: "grid" | "list";
  /** 这一组还没有东西时卡片上的说明；不写就不显示这一组 */
  emptyHint?: string;
}

const CATEGORIES: ReadonlyArray<{ id: AssetCategory; label: string }> = [
  { id: "controls", label: "控件" },
  { id: "graphics", label: "图形" },
];
const STORAGE_KEY = "vf.assets";
const PREVIEW_COUNT = { grid: 8, list: 4 };

interface State {
  open: string | null;
  category: AssetCategory | null;
}

function loadState(): State {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<State>;
    return { open: typeof raw.open === "string" ? raw.open : null, category: raw.category === "controls" || raw.category === "graphics" ? raw.category : null };
  } catch {
    return { open: null, category: null };
  }
}

/** 一样素材的可搜索文字：显示的名字、类型名、说明 */
function itemText(item: HTMLElement): string {
  return `${item.textContent ?? ""} ${item.dataset.type ?? ""} ${item.dataset.preset ?? ""} ${item.title ?? ""}`.toLowerCase();
}

export function initAssetBrowser(host: HTMLElement, groups: AssetGroup[]): { refresh(): void; open(id: string | null): void } {
  let state = loadState();
  host.classList.add("asset-browser");

  const search = document.createElement("input");
  search.type = "search";
  search.className = "asset-search";
  search.placeholder = "搜索素材……";
  search.spellcheck = false;
  const chips = document.createElement("div");
  chips.className = "asset-chips";
  chips.setAttribute("role", "toolbar");
  const overview = document.createElement("div");
  overview.className = "asset-overview";
  const detail = document.createElement("div");
  detail.className = "asset-detail";
  // 没打开的组的容器放在这里：不显示，但还在文档里，别的模块按 ID 找得到它们、往里画
  const store = document.createElement("div");
  store.className = "asset-store";
  store.hidden = true;
  for (const group of groups) {
    // 容器上记着自己是哪一组：别处（右键菜单、测试）从一样素材找到它在哪个文件夹里
    group.container.dataset.assetGroup = group.id;
    store.append(group.container);
  }
  host.append(search, chips, overview, detail, store);

  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 存不下只是下次打开回到总览
    }
  };
  const query = () => search.value.trim().toLowerCase();
  const words = () => query().split(/\s+/).filter(Boolean);
  const matches = (item: HTMLElement) => {
    const hay = itemText(item);
    return words().every((w) => hay.includes(w));
  };
  const items = (group: AssetGroup) => [...group.container.querySelectorAll<HTMLElement>(":scope > .palette-item")];
  const available = (group: AssetGroup) => !group.container.hidden;

  let menu: HTMLElement | null = null;
  const closeMenu = () => {
    menu?.remove();
    menu = null;
  };

  const open = (id: string | null) => {
    state = { ...state, open: id };
    save();
    render();
    (id ? detail : overview).scrollTop = 0;
  };

  function chip(text: string, pressed: boolean, onClick: (e: MouseEvent) => void, extra = ""): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `asset-chip${extra}`;
    button.setAttribute("aria-pressed", String(pressed));
    button.textContent = text;
    button.addEventListener("click", onClick);
    return button;
  }

  function renderChips(openGroup: AssetGroup | null): void {
    if (openGroup) {
      chips.replaceChildren(
        chip("‹ 全部", false, () => open(null), " back"),
        chip(`${openGroup.title} ×`, true, () => open(null)),
      );
      return;
    }
    const list: HTMLElement[] = [
      chip("全部", state.category === null, () => {
        state = { ...state, category: null };
        save();
        render();
      }),
    ];
    for (const cat of CATEGORIES) {
      const inCat = groups.filter((g) => g.category === cat.id && available(g));
      if (inCat.length === 0) continue;
      const button = chip(`${cat.label} ▾`, state.category === cat.id, (e) => {
        // 点名字是筛选；点 ▾ 那一小块是直接打开其中一组
        const rect = button.getBoundingClientRect();
        if (e.clientX > rect.right - 16) {
          closeMenu();
          menu = document.createElement("div");
          menu.className = "menu-dropdown asset-chip-menu";
          for (const g of inCat) {
            const row = document.createElement("button");
            row.type = "button";
            row.className = "menu-row";
            row.textContent = g.title;
            row.addEventListener("click", () => {
              closeMenu();
              open(g.id);
            });
            menu.append(row);
          }
          menu.style.left = `${rect.left}px`;
          menu.style.top = `${rect.bottom + 2}px`;
          document.body.append(menu);
          return;
        }
        state = { ...state, category: state.category === cat.id ? null : cat.id };
        save();
        render();
      });
      list.push(button);
    }
    chips.replaceChildren(...list);
  }

  function groupBox(group: AssetGroup, hits: HTMLElement[]): HTMLElement {
    const box = document.createElement("button");
    box.type = "button";
    box.className = "asset-group";
    box.dataset.group = group.id;
    const head = document.createElement("div");
    head.className = "asset-group-head";
    const name = document.createElement("span");
    name.className = "asset-group-title";
    name.textContent = group.title;
    const count = document.createElement("span");
    count.className = "asset-group-count";
    count.textContent = `${hits.length} 项`;
    const arrow = document.createElement("span");
    arrow.className = "asset-group-arrow";
    arrow.textContent = "›";
    head.append(name, count, arrow);
    box.append(head);
    if (hits.length === 0 && group.emptyHint) {
      const empty = document.createElement("div");
      empty.className = "asset-group-empty";
      empty.textContent = group.emptyHint;
      box.append(empty);
    } else {
      // 缩略只是看的，点哪里都是进入这一组
      const preview = document.createElement("div");
      preview.className = `asset-preview ${group.preview}`;
      preview.setAttribute("aria-hidden", "true");
      for (const item of hits.slice(0, PREVIEW_COUNT[group.preview])) {
        const clone = item.cloneNode(true) as HTMLElement;
        clone.removeAttribute("id");
        clone.classList.add("asset-preview-item");
        preview.append(clone);
      }
      box.append(preview);
    }
    box.addEventListener("click", () => open(group.id));
    return box;
  }

  function render(): void {
    closeMenu();
    const searching = words().length > 0;
    const openGroup = state.open ? (groups.find((g) => g.id === state.open && available(g)) ?? null) : null;
    renderChips(openGroup);
    overview.hidden = Boolean(openGroup);
    detail.hidden = !openGroup;
    // 每组的容器只在打开的那一组里显示
    for (const group of groups) {
      if (group === openGroup) {
        if (group.container.parentElement !== detail) detail.replaceChildren(group.container);
      } else if (group.container.parentElement !== store) {
        store.append(group.container);
      }
      for (const item of items(group)) item.hidden = group === openGroup ? !matches(item) : false;
    }
    if (openGroup) {
      const hits = items(openGroup).filter(matches);
      detail.querySelector(".asset-none")?.remove();
      if (hits.length === 0 && searching) {
        const none = document.createElement("div");
        none.className = "asset-none muted";
        none.textContent = "这一组里没有匹配的素材";
        detail.append(none);
      }
      return;
    }
    const boxes: HTMLElement[] = [];
    for (const group of groups) {
      if (!available(group)) continue;
      if (state.category && group.category !== state.category) continue;
      const hits = items(group).filter(matches);
      if (searching && hits.length === 0) continue;
      if (!searching && hits.length === 0 && !group.emptyHint) continue;
      boxes.push(groupBox(group, hits));
    }
    if (boxes.length === 0) {
      const none = document.createElement("div");
      none.className = "asset-none muted";
      none.textContent = searching ? "没有匹配的素材" : "这里还没有素材";
      boxes.push(none);
    }
    overview.replaceChildren(...boxes);
  }

  // 各组的容器由别的模块重画：内容一变就重新数、重新筛
  let pending = 0;
  const schedule = () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(render);
  };
  const observer = new MutationObserver(schedule);
  for (const group of groups) observer.observe(group.container, { childList: true, attributes: true, attributeFilter: ["hidden"] });

  search.addEventListener("input", render);
  search.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && search.value) {
      e.preventDefault();
      search.value = "";
      render();
    }
  });
  document.addEventListener("pointerdown", (e) => {
    if (menu && !menu.contains(e.target as Node)) closeMenu();
  });
  render();
  return { refresh: render, open };
}
