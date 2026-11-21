// 几个控件共用的计算放在 lib/ 里，控件用相对路径引用它（import … from "../../lib/wave.js"）。
// 这里只算数，不碰网页元素。

/** 一条正弦波的 SVG 路径。phase 是相位（0 到 1 走完一个周期）。 */
export function wavePath(width, height, waves, phase, amplitude) {
  const steps = 96;
  const mid = height / 2;
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = t * width;
    const y = mid - Math.sin((t * waves + phase) * Math.PI * 2) * amplitude;
    d += `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d;
}
