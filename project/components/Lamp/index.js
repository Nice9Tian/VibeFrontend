// 灯：一个圆形指示灯加名字。悬停放大、按下缩小、点亮发光都写在 style.css 里，
// 所以只有在预览模式下（控件能收到鼠标事件时）才会出现这些效果。
export default function create(el, { props }) {
  const lamp = document.createElement("div");
  lamp.className = "lamp";
  const bulb = document.createElement("div");
  bulb.className = "bulb";
  const name = document.createElement("div");
  name.className = "name";
  lamp.append(bulb, name);
  el.append(lamp);

  function update(props) {
    name.textContent = props.label;
    lamp.classList.toggle("on", props.on === true);
    lamp.classList.toggle("disabled", props.enabled === false);
  }
  update(props);

  return { update, destroy: () => lamp.remove() };
}
