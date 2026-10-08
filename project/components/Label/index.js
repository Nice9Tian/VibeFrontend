// 文字标签。
export default function create(el, { props }) {
  const label = document.createElement("div");
  label.className = "label";
  el.append(label);

  function update(props) {
    label.textContent = props.text;
    label.dataset.tone = props.tone;
  }
  update(props);

  return { update, destroy: () => label.remove() };
}
