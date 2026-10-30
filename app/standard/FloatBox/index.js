// 浮动嵌入框标准容器：支持嵌入父布局或浮出为窗口内可拖动面板。
export default function create(el, { props, emit, mode }) {
  const root = document.createElement("div");
  root.className = "vf-std-floatbox";
  const header = document.createElement("div");
  header.className = "vf-std-floatbox-header";
  const title = document.createElement("span");
  title.className = "vf-std-floatbox-title";
  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "vf-std-floatbox-toggle";
  header.append(title, toggleBtn);
  const body = document.createElement("div");
  body.className = "vf-std-floatbox-body";
  root.append(header, body);
  el.append(root);

  let current = props;

  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (current.enabled === false) return;
    const next = !Boolean(current.floating);
    emit("toggle", next);
    emit("change", next);
  });

  header.addEventListener("pointerdown", (e) => {
    if (mode !== "preview" || current.enabled === false) return;
    if (e.button !== 0 || e.target === toggleBtn) return;
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const baseX = Number(current.floatX ?? 60);
    const baseY = Number(current.floatY ?? 80);
    let moved = false;
    const onMove = (me) => {
      const dx = Math.round(me.clientX - startX);
      const dy = Math.round(me.clientY - startY);
      if (!moved && Math.hypot(dx, dy) >= 4) {
        moved = true;
        if (!current.floating) {
          emit("toggle", true);
          emit("change", true);
        }
      }
      if (moved) {
        emit("move", { x: Math.max(0, baseX + dx), y: Math.max(0, baseY + dy) });
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });

  function update(next) {
    current = next;
    const floating = Boolean(next.floating);
    const hdrH = Number(next.headerHeight ?? 24);
    header.style.height = `${hdrH}px`;
    root.dataset.floating = String(floating);
    root.dataset.disabled = String(next.enabled === false);
    title.textContent = String(next.title ?? "浮动嵌入框");
    toggleBtn.textContent = floating ? "嵌入" : "浮动";
    toggleBtn.title = floating ? "嵌入回原布局" : "脱离布局浮动";
    toggleBtn.disabled = next.enabled === false;
  }
  update(props);

  return { update, destroy: () => root.remove() };
}
