// 标准按钮控件。支持普通点击以及可勾选（checkable）切换。
export default function create(el, { props, emit }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "vf-std-button";
  let current = props;

  button.addEventListener("click", () => {
    if (!current.enabled) return;
    if (current.checkable) emit("toggle", !current.checked);
  });
  el.append(button);

  function update(next) {
    current = next;
    button.textContent = String(next.text ?? "");
    button.dataset.variant = String(next.variant ?? "secondary");
    button.dataset.checked = String(Boolean(next.checked));
    button.disabled = next.enabled === false;
  }
  update(props);

  return { update, destroy: () => button.remove() };
}
