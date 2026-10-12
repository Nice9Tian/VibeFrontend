// 按钮。点击由运行层自动提供的 click 事件处理，这里只负责画出来。
export default function create(el, { props }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button";
  el.append(button);

  function update(props) {
    button.textContent = props.text;
    button.dataset.variant = props.variant;
    button.disabled = !props.enabled;
  }
  update(props);

  return { update, destroy: () => button.remove() };
}
