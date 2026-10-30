// 标准列表控件。支持数组行渲染和选中行。
export default function create(el, { props, emit }) {
  const container = document.createElement("div");
  container.className = "vf-std-list";
  el.append(container);

  function itemLabel(item) {
    if (item && typeof item === "object") {
      return String(item.name ?? item.label ?? item.title ?? item.text ?? item.id ?? "");
    }
    return String(item ?? "");
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
      const text = document.createElement("span");
      text.className = "vf-std-list-text";
      text.textContent = itemLabel(item);
      row.append(text);
      row.addEventListener("click", () => {
        if (disabled) return;
        if (index !== selected) {
          emit("change", index);
          emit("select", index);
        }
      });
      container.append(row);
    });
  }
  update(props);

  return { update, destroy: () => container.remove() };
}
