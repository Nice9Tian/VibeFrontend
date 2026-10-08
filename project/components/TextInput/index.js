// 单行输入框。用户输入时发出 change 事件并带上新的值；
// 运行层把值写入 bind 指向的状态，再通过 props.value 传回来。
export default function create(el, { props, emit }) {
  const input = document.createElement("input");
  input.className = "input";
  input.addEventListener("input", () => emit("change", input.value));
  el.append(input);

  function update(props) {
    input.placeholder = props.placeholder;
    input.disabled = !props.enabled;
    const value = props.value ?? "";
    if (input.value !== value) input.value = value;
  }
  update(props);

  return { update, destroy: () => input.remove() };
}
