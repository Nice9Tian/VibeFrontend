// 波形图：项目自己的控件的例子。
// - 元素用 el.ownerDocument 建；
// - 共用的计算从 lib/ 引用；
// - stage.still 为真时（编辑、打印）只画一帧，否则按时间流动。
import { wavePath } from "../../lib/wave.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const VIEW_W = 352;
const VIEW_H = 180;

export default function create(el, { props, stage }) {
  const doc = el.ownerDocument;
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${VIEW_W} ${VIEW_H}`);
  svg.setAttribute("preserveAspectRatio", "none");
  // 根元素铺满节点的方框（见 README 第 5 节）
  svg.setAttribute("class", "vf-fill");
  const lines = [0, 1, 2].map((k) => {
    const path = doc.createElementNS(SVG_NS, "path");
    path.setAttribute("class", `wave-line wave-line-${k}`);
    svg.append(path);
    return path;
  });
  el.append(svg);

  let current = props;
  let frame = 0;
  const still = stage ? stage.still : true;

  function draw(phase) {
    const waves = Number(current.waves) > 0 ? Number(current.waves) : 3;
    lines.forEach((path, k) => {
      path.setAttribute("d", wavePath(VIEW_W, VIEW_H, waves, phase + k * 0.12, VIEW_H * (0.34 - k * 0.07)));
    });
  }

  function tick(time) {
    draw((time / 4000) % 1);
    frame = doc.defaultView.requestAnimationFrame(tick);
  }

  function update(next) {
    current = next;
    if (still) draw(Number(current.still) || 0);
  }

  update(props);
  if (!still) frame = doc.defaultView.requestAnimationFrame(tick);

  return {
    update,
    destroy() {
      if (frame) doc.defaultView.cancelAnimationFrame(frame);
      svg.remove();
    },
  };
}
