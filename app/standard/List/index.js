// 标准列表控件。支持数组行渲染、选中行、置灰行和拖动重排。

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
  container.className = "vf-std-list";
  el.append(container);
  let dragFrom = -1;
  let disabled = false;
  let rowCount = 0;
  let dropLine = null;

  /**
   * 光标纵坐标对应的插入位置：返回 { insertBefore, top }。光标在某一行的上半边就插在这一行
   * 之前，下半边就插在下一行之前；过了最后一行（含列表下方的空白）就是末尾。
   * top 是插入线相对容器内容的纵向位置。
   */
  function dropPosition(clientY) {
    const rows = [...container.querySelectorAll(".vf-std-list-row")];
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
    return { insertBefore: rowCount, top: toContent(rows[rows.length - 1].getBoundingClientRect().bottom + 1) };
  }

  function hideDropLine() {
    dropLine?.remove();
    dropLine = null;
  }

  function showDropLine(top) {
    if (!dropLine || !dropLine.isConnected) {
      dropLine = document.createElement("div");
      dropLine.className = "vf-std-list-dropline";
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

  function itemLabel(item) {
    if (item && typeof item === "object") {
      return String(item.name ?? item.label ?? item.title ?? item.text ?? item.id ?? "");
    }
    return String(item ?? "");
  }

  function update(next) {
    container.replaceChildren();
    dropLine = null;
    disabled = next.enabled === false;
    container.dataset.disabled = String(disabled);
    const items = Array.isArray(next.items) ? next.items : [];
    rowCount = items.length;
    const selected = typeof next.value === "number" ? next.value : 0;
    const draggable = Boolean(next.draggable);
    const mutedFrom = typeof next.mutedFrom === "number" ? next.mutedFrom : -1;
    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "vf-std-list-empty";
      empty.textContent = String(next.emptyText ?? "暂无内容");
      container.append(empty);
      return;
    }
    items.forEach((item, index) => {
      const isObj = item && typeof item === "object" && !Array.isArray(item);
      const muted = (isObj && Boolean(item.muted)) || (mutedFrom >= 0 && index >= mutedFrom);
      const row = document.createElement("div");
      row.dataset.vfRow = String(index);
      row.className = "vf-std-list-row" + (index === selected ? " selected" : "") + (muted ? " muted" : "");
      const text = document.createElement("span");
      text.className = "vf-std-list-text";
      text.textContent = itemLabel(item);
      row.append(text);
      if (isObj && item.badge !== undefined && item.badge !== "") {
        const badge = document.createElement("span");
        badge.className = "vf-std-list-badge";
        badge.textContent = String(item.badge);
        row.append(badge);
      }
      row.addEventListener("click", () => {
        if (disabled) return;
        emit("select", index);
        if (index !== selected) {
          emit("change", index);
        }
      });
      if (draggable) {
        row.draggable = true;
        row.addEventListener("dragstart", (ev) => {
          dragFrom = index;
          if (ev.dataTransfer) {
            ev.dataTransfer.effectAllowed = "move";
            ev.dataTransfer.setData("text/plain", String(index));
          }
        });
        // dragover / drop 由容器统一处理（见上面“拖动重排”）
      }
      container.append(row);
    });
  }
  update(props);

  return { update, destroy: () => container.remove() };
}
