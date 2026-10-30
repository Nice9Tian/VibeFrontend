// 状态图片按钮：由工具内置的 mountStateImageControl 按 component.json 的 stateImages 自动挂载 5 状态九宫格 SVG 与文字层。
export function create(container, { props }) {
  container.textContent = props.text ?? "";
  return {
    update(next) {
      container.textContent = next.text ?? "";
    },
  };
}
