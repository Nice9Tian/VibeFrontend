// 标准数字框。
export default function create(el, { props, emit }) {
  const wrap = document.createElement("div");
  wrap.className = "vf-std-spinbox";
  const input = document.createElement("input");
  input.type = "number";
  input.className = "vf-std-spinbox-input";
  const suffix = document.createElement("span");
  suffix.className = "vf-std-spinbox-suffix";
  wrap.append(input, suffix);
  el.append(wrap);

  input.addEventListener("input", () => {
    const n = Number(input.value);
    if (Number.isFinite(n)) emit("change", n);
  });

  function update(next) {
    input.min = String(next.min ?? 0);
    input.max = String(next.max ?? 9999);
    input.step = String(next.step ?? 1);
    input.disabled = next.enabled === false;
    const val = String(next.value ?? 0);
    if (input.value !== val) input.value = val;
    const sfx = String(next.suffix ?? "");
    suffix.textContent = sfx;
    suffix.hidden = !sfx;
  }
  update(props);

  return { update, destroy: () => wrap.remove() };
}
