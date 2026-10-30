// 标准列表控件。支持数组行渲染、选中、勾选和拖动重排。
export default function create(el, { props, emit }) {
  const container = document.createElement("div");
  container.className = "vf-std-list";
  el.append(container);
  let dragFrom = -1;

  function itemLabel(item) {
    if (item && typeof item === "object") {
      return String(item.name ?? item.label ?? item.title ?? item.text ?? item.id ?? "");
    }
    return String(item ?? "");
  }

  function itemVisible(item) {
    if (item && typeof item === "object" && "visible" in item) return Boolean(item.visible);
    if (item && typeof item === "object" && "checked" in item) return Boolean(item.checked);
    return true;
  }

  function update(next) {
    container.replaceChildren();
    const disabled = next.enabled === false;
    container.dataset.disabled = String(disabled);
    const items = Array.isArray(next.items) ? next.items : [];
    const selected = typeof next.value === "number" ? next.value : 0;
    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "vf-std-list-empty";
      empty.textContent = String(next.emptyText ?? "暂无内容");
      container.append(empty);
      return;
    }
    items.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "vf-std-list-row" + (index === selected ? " selected" : "");
      if (next.checkable) {
        const check = document.createElement("span");
        const vis = itemVisible(item);
        check.className = "vf-std-list-check" + (vis ? " on" : "");
        check.textContent = vis ? "●" : "○";
        check.title = vis ? "可见" : "隐藏";
        check.addEventListener("click", (e) => {
          e.stopPropagation();
          if (disabled) return;
          emit("change", index);
          emit("select", index);
          emit("toggleItem", index);
        });
        row.append(check);
      }
      const text = document.createElement("span");
      text.className = "vf-std-list-text";
      text.textContent = itemLabel(item);
      row.append(text);
      if (next.checkable && !itemVisible(item)) {
        const tag = document.createElement("span");
        tag.className = "vf-std-list-badge";
        tag.textContent = "隐藏";
        row.append(tag);
      }
      row.addEventListener("click", () => {
        if (disabled) return;
        emit("change", index);
        emit("select", index);
      });
      if (next.reorderable && !disabled) {
        row.draggable = true;
        row.addEventListener("dragstart", () => {
          dragFrom = index;
        });
        row.addEventListener("dragover", (e) => e.preventDefault());
        row.addEventListener("drop", (e) => {
          e.preventDefault();
          if (dragFrom >= 0 && dragFrom !== index) {
            emit("moveItem", `${dragFrom},${index}`);
          }
          dragFrom = -1;
        });
      }
      container.append(row);
    });
  }
  update(props);

  return { update, destroy: () => container.remove() };
}
