// 根据当前激活的工具类型，返回工具选项面板（DataForm）的表单结构 schema 与默认参数值 values。
// 对照 animean/childrenpanel/tool_controls/*.json 与 business::optionsForToolJson。

const SCHEMAS = {
  brush: {
    row_spacing: 6,
    column_spacing: 8,
    controls: [
      { name: "brushSize", type: "slider", title: "笔刷半径", hook: "setBrushSize", min: 1, max: 200, value: 18, row: 0, start_column: 0, end_column: 1 },
      { name: "brushHardness", type: "slider", title: "笔尖硬度", hook: "setBrushHardness", min: 0, max: 100, value: 85, row: 1, start_column: 0, end_column: 1 },
      { name: "strokeMode", type: "list", title: "笔触模式", hook: "setStrokeMode", options: ["Freehand", "Bezier", "Calligraphy"], value: "Freehand", row: 2, start_column: 0, end_column: 1 },
      { name: "smoothLevel", type: "slider", title: "曲线平滑", hook: "setSmoothLevel", min: 0, max: 20, value: 8, row: 3, start_column: 0, end_column: 1, visible_when: "strokeMode != 'Freehand'" },
      { name: "pressureSize", type: "check", title: "压感半径", hook: "setPressureSize", value: true, row: 4, column: 0 },
      { name: "openAdvBrush", type: "subwindow", title: "压感曲线...", hook: "openDrawSettings", row: 4, column: 1 },
    ],
  },
  eraser: {
    row_spacing: 6,
    column_spacing: 8,
    controls: [
      { name: "eraserSize", type: "slider", title: "橡皮半径", hook: "setEraserSize", min: 1, max: 200, value: 32, row: 0, start_column: 0, end_column: 1 },
      { name: "eraserMode", type: "list", title: "擦除方式", hook: "setEraserMode", options: ["Pixel", "VectorStroke", "SoftEdge"], value: "Pixel", row: 1, start_column: 0, end_column: 1 },
      { name: "keepAlpha", type: "check", title: "保护透明锁定", hook: "setKeepAlpha", value: false, row: 2, start_column: 0, end_column: 1 },
    ],
  },
  fill: {
    row_spacing: 6,
    column_spacing: 8,
    controls: [
      { name: "tolerance", type: "slider", title: "容差阈值", hook: "setFillTolerance", min: 0, max: 255, value: 24, row: 0, start_column: 0, end_column: 1 },
      { name: "expandPx", type: "slider", title: "扩边像素", hook: "setFillExpand", min: -10, max: 20, value: 2, row: 1, start_column: 0, end_column: 1 },
      { name: "closeGap", type: "check", title: "自动闭合缺口", hook: "setCloseGap", value: true, row: 2, column: 0 },
      { name: "gapSize", type: "slider", title: "缺口上限", hook: "setGapSize", min: 1, max: 30, value: 6, row: 3, start_column: 0, end_column: 1, visible_when: "closeGap == true" },
    ],
  },
  shape: {
    row_spacing: 6,
    column_spacing: 8,
    controls: [
      { name: "shapeKind", type: "list", title: "几何图元", hook: "setShapeKind", options: ["Rectangle", "Ellipse", "Polygon", "Line"], value: "Rectangle", row: 0, start_column: 0, end_column: 1 },
      { name: "strokeWidth", type: "slider", title: "线宽像素", hook: "setShapeStroke", min: 1, max: 64, value: 4, row: 1, start_column: 0, end_column: 1 },
      { name: "filledShape", type: "check", title: "填充内部", hook: "setFilledShape", value: false, row: 2, start_column: 0, end_column: 1 },
    ],
  },
  select: {
    row_spacing: 6,
    column_spacing: 8,
    controls: [
      { name: "selectMode", type: "list", title: "选区模式", hook: "setSelectMode", options: ["FreeLasso", "PolyLasso", "RectSelect"], value: "FreeLasso", row: 0, start_column: 0, end_column: 1 },
      { name: "featherPx", type: "slider", title: "羽化半径", hook: "setFeatherPx", min: 0, max: 50, value: 0, row: 1, start_column: 0, end_column: 1 },
      { name: "antiAliasSel", type: "check", title: "消除锯齿", hook: "setAntiAliasSel", value: true, row: 2, start_column: 0, end_column: 1 },
    ],
  },
  move: {
    row_spacing: 6,
    column_spacing: 8,
    controls: [
      { name: "transformMode", type: "list", title: "变换方式", hook: "setTransformMode", options: ["Translate", "ScaleRotate", "MeshDeform"], value: "Translate", row: 0, start_column: 0, end_column: 1 },
      { name: "bilinearFilter", type: "check", title: "双线性插值", hook: "setBilinear", value: true, row: 1, column: 0 },
      { name: "resetTransformBtn", type: "button", title: "重置变换", hook: "resetTransform", row: 1, column: 1 },
    ],
  },
  eyedropper: {
    row_spacing: 6,
    column_spacing: 8,
    controls: [
      { name: "sampleRadius", type: "slider", title: "取样范围", hook: "setSampleRadius", min: 1, max: 15, value: 3, row: 0, start_column: 0, end_column: 1 },
      { name: "sampleSource", type: "list", title: "取样来源", hook: "setSampleSource", options: ["AllLayers", "CurrentLayer"], value: "AllLayers", row: 1, start_column: 0, end_column: 1 },
      { name: "pickAlpha", type: "check", title: "包含透明度", hook: "setPickAlpha", value: true, row: 2, start_column: 0, end_column: 1 },
    ],
  },
};

export default function syncToolOptions(state) {
  const tool = state.project?.activeTool ?? "brush";
  const schema = SCHEMAS[tool] ?? SCHEMAS.brush;
  const values = {};
  for (const ctrl of schema.controls) {
    if (ctrl.value !== undefined) {
      values[ctrl.name] = ctrl.value;
    }
  }
  return {
    "toolOptions.schema": schema,
    "toolOptions.values": values,
    "toolOptions.lastHook": "switch:" + tool,
  };
}
