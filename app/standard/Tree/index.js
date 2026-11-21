// 标准树控件。支持层级缩进、分组折叠、勾选框、选中行和拖动重排。
function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  const flat = [];
  const walk = (list, depthOffset) => {
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (typeof item !== "object" || item === null) {
        flat.push({
          index: flat.length,
          id: String(flat.length),
          label: String(item),
          kind: "",
          isGroup: false,
          depth: depthOffset,
          collapsed: false,
          checked: true,
        });
        continue;
      }
      const hasChildren = Array.isArray(item.children) && item.children.length > 0;
      const depth = typeof item.depth === "number" ? item.depth : depthOffset;
      const idx = flat.length;
      flat.push({
        index: idx,
        id: String(item.id ?? item.name ?? idx),
        label: String(item.label ?? item.name ?? item.text ?? idx),
        kind: String(item.kind ?? ""),
        isGroup: Boolean(item.isGroup || hasChildren),
        depth,
        collapsed: Boolean(item.collapsed),
        checked: item.checked !== undefined ? Boolean(item.checked) : item.visible !== undefined ? Boolean(item.visible) : true,
      });
      if (hasChildren) walk(item.children, depth + 1);
    }
  };
  walk(rawItems, 0);
  return flat;
}

// ---- 拖动重排：整个列表都接受放下 ----
//
// 以前 dragover / drop 只绑在每一行上，行间的缝隙和列表下方的空白都放不下去（浏览器在没有
// 处理 dragover 的位置不允许放下），拖动很容易失败。现在由容器统一处理：按光标的纵向位置算出
// “插在哪一行之前”，并在那里画一条插入线。
//
// reorder 事件的含义没有变：{ from, to }，to 是这一项移动之后所在的下标（也就是 move 的 to）。
// 插入线画在第 p 行之前时：from 在 p 之前，移走后后面的行前移一位，to = p - 1；否则 to = p。
// 这样线画在哪，放下之后这一项就落在哪。

/** 插在数据下标 insertBefore 之前，对应 reorder 的 to */
export function reorderTarget(from, insertBefore) {
  return from < insertBefore ? insertBefore - 1 : insertBefore;
}

export default function create(el, { props, emit }) {
  const container = document.createElement("div");
  container.className = "vf-std-tree";
  el.append(container);
  let dragFrom = -1;
  let disabled = false;
  let rowCount = 0;
  let dropLine = null;

  /** 当前画出来的行（折叠的组里的行不渲染，所以不在其中） */
  const visibleRows = () => [...container.querySelectorAll(".vf-std-tree-row")];

  /**
   * 光标纵坐标对应的插入位置：返回 { insertBefore, top }。
   * insertBefore 是数据下标：光标在某一行的上半边就插在这一行之前，下半边就插在下一行之前；
   * 过了最后一行（含列表下方的空白）就是末尾。折叠的组后面隐藏着它的子行，“下一行之前”取的是
   * 下一条可见行的下标，所以不会落到折叠的组里面去。
   * top 是插入线相对容器内容的纵向位置。
   */
  function dropPosition(clientY) {
    const rows = visibleRows();
    if (rows.length === 0) return null;
    const box = container.getBoundingClientRect();
    const toContent = (y) => y - box.top + container.scrollTop;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) {
        const prevBottom = i > 0 ? rows[i - 1].getBoundingClientRect().bottom : r.top - 2;
        return { insertBefore: Number(rows[i].dataset.vfRow), top: toContent((prevBottom + r.top) / 2) };
      }
    }
    const last = rows[rows.length - 1].getBoundingClientRect();
    return { insertBefore: rowCount, top: toContent(last.bottom + 1) };
  }

  function hideDropLine() {
    dropLine?.remove();
    dropLine = null;
  }

  function showDropLine(top) {
    if (!dropLine || !dropLine.isConnected) {
      dropLine = document.createElement("div");
      dropLine.className = "vf-std-tree-dropline";
      container.append(dropLine);
    }
    dropLine.style.top = `${Math.round(top) - 1}px`;
  }

  // 只接自己这个列表里拖起来的行；别处拖来的东西不处理，浏览器照旧显示“不能放”。
  // dragenter 和 dragover 都要接：光标刚进到一个新位置（比如行间的缝隙）时浏览器先发 dragenter，
  // 这时就松手的话，只看 dragenter 有没有被接受；只接 dragover 会让快速拖放落空。
  const accept = (ev) => {
    if (dragFrom < 0 || disabled) return;
    const pos = dropPosition(ev.clientY);
    if (!pos) return;
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
    showDropLine(pos.top);
  };
  container.addEventListener("dragenter", accept);
  container.addEventListener("dragover", accept);
  // 在行和缝隙之间移动时也会收到 dragleave（而且浏览器常常不给 relatedTarget），所以按光标是否
  // 真的出了容器来判断，免得插入线一闪一闪。
  container.addEventListener("dragleave", (ev) => {
    const box = container.getBoundingClientRect();
    if (ev.clientX < box.left || ev.clientX >= box.right || ev.clientY < box.top || ev.clientY >= box.bottom) hideDropLine();
  });
  container.addEventListener("drop", (ev) => {
    const from = dragFrom;
    dragFrom = -1;
    hideDropLine();
    if (from < 0 || disabled) return;
    ev.preventDefault();
    const pos = dropPosition(ev.clientY);
    if (!pos) return;
    const to = reorderTarget(from, pos.insertBefore);
    if (to !== from) emit("reorder", { from, to });
  });
  container.addEventListener("dragend", () => {
    dragFrom = -1;
    hideDropLine();
  });

  function update(next) {
    container.replaceChildren();
    dropLine = null;
    disabled = next.enabled === false;
    container.dataset.disabled = String(disabled);
    const rows = normalizeItems(next.items);
    rowCount = rows.length;
    const selected = typeof next.value === "number" ? next.value : Number(next.selectedIndex ?? 0);
    const checkable = next.checkable !== false;
    const draggable = next.draggable !== false;
    if (rows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "vf-std-tree-empty";
      empty.textContent = String(next.emptyText ?? "暂无内容");
      container.append(empty);
      return;
    }
    let collapsedDepth = null;
    for (const r of rows) {
      if (collapsedDepth !== null) {
        if (r.depth > collapsedDepth) continue;
        collapsedDepth = null;
      }
      if (r.isGroup && r.collapsed) collapsedDepth = r.depth;
      const row = document.createElement("div");
      row.dataset.vfRow = String(r.index);
      row.dataset.vfItemId = r.id;
      row.className = "vf-std-tree-row" + (r.index === selected ? " selected" : "") + (!r.checked ? " unchecked" : "");
      row.style.paddingLeft = `${6 + r.depth * 14}px`;

      const caret = document.createElement("span");
      caret.className = "vf-std-tree-caret";
      if (r.isGroup) {
        caret.dataset.vfAction = "collapse";
        caret.textContent = r.collapsed ? "▸" : "▾";
        caret.addEventListener("click", (ev) => {
          ev.stopPropagation();
          if (disabled) return;
          emit("toggleCollapse", { index: r.index, id: r.id, collapsed: !r.collapsed });
        });
      }
      row.append(caret);

      if (checkable) {
        const chk = document.createElement("input");
        chk.type = "checkbox";
        chk.dataset.vfAction = "check";
        chk.className = "vf-std-tree-check";
        chk.checked = r.checked;
        chk.addEventListener("click", (ev) => ev.stopPropagation());
        chk.addEventListener("change", (ev) => {
          ev.stopPropagation();
          if (disabled) return;
          emit("toggleCheck", { index: r.index, id: r.id, checked: chk.checked });
        });
        row.append(chk);
      }

      const label = document.createElement("span");
      label.className = "vf-std-tree-text" + (r.isGroup ? " group" : "");
      label.textContent = r.label;
      row.append(label);

      if (r.kind) {
        const badge = document.createElement("span");
        badge.className = "vf-std-tree-badge";
        badge.textContent = r.kind;
        row.append(badge);
      }

      row.addEventListener("click", () => {
        if (disabled) return;
        if (r.index !== selected) emit("change", r.index);
        emit("select", r.index);
      });

      if (draggable) {
        row.draggable = true;
        row.addEventListener("dragstart", (ev) => {
          dragFrom = r.index;
          if (ev.dataTransfer) {
            ev.dataTransfer.effectAllowed = "move";
            ev.dataTransfer.setData("text/plain", String(r.index));
          }
        });
        // dragover / drop 由容器统一处理（见上面“拖动重排”）
      }
      container.append(row);
    }
  }
  update(props);

  return { update, destroy: () => container.remove() };
}
