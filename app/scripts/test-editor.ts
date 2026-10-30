// 编辑器新增能力的纯函数测试：
// 覆盖 1) 锁定；2) 版本的恢复与重做（含移动、缩放、旋转、属性修改、节点增删、YAML 条目清理与版本跳转）；
// 3) 旋转与导出提示；4) 多选整体缩放；5) 对齐与等距分布；6) 直线和曲线加拐点、移拐点、删拐点；
// 7) 删除控件时检测并清理 YAML 条目。
import assert from "node:assert/strict";
import { check } from "../src/check.ts";
import {
  applyAddNodeToScene,
  applyDeleteFromScene,
  applyMoveToScene,
  applyPropsToScene,
  applyResizeToScene,
  canRedo,
  canUndo,
  collectSubtreeIds,
  createHistory,
  nodesWithYamlEntries,
  parseScene,
  pushHistory,
  redoHistory,
  removeYamlObjects,
  restoreHistoryVersion,
  snapshotOf,
  undoHistory,
} from "../src/history.ts";
import type { Scene } from "../src/model.ts";
import {
  formatBends,
  insertLineBend,
  lineGeometry,
  lineSegmentMidpoints,
  parseBends,
  removeLineBend,
  updateLineBend,
} from "../src/shapes.ts";
import {
  addBendToLine,
  alignRects,
  alignSceneNodes,
  applyGroupResize,
  computeResizeBox,
  computeRotationAngle,
  deleteBendFromLine,
  distributeRects,
  distributeSceneNodes,
  filterUnlocked,
  isNodeLocked,
  moveBendOnLine,
  normalizeRotation,
  pointInRotatedRect,
  rotatePoint,
  scaleGroupItems,
  setNodeRotation,
  setNodesLocked,
  toggleNodesLocked,
} from "../src/transform.ts";

function makeBaseScene(): Scene {
  return {
    version: 1,
    root: "window",
    nodes: {
      window: {
        type: "Window",
        width: 800,
        height: 600,
        children: ["box1", "box2", "box3", "line1"],
      },
      box1: {
        type: "Shape",
        x: 40,
        y: 50,
        width: 100,
        height: 60,
        props: { shape: "rectangle", fill: "#ffffff", stroke: "#1f2430" },
        children: ["child1"],
      },
      child1: {
        type: "Shape",
        x: 10,
        y: 10,
        width: 30,
        height: 20,
        props: { shape: "ellipse" },
      },
      box2: {
        type: "Shape",
        x: 200,
        y: 120,
        width: 80,
        height: 40,
        props: { shape: "rectangle", fill: "#dbeafe" },
      },
      box3: {
        type: "Shape",
        x: 420,
        y: 220,
        width: 120,
        height: 80,
        props: { shape: "diamond" },
      },
      line1: {
        type: "Line",
        x: 50,
        y: 300,
        width: 200,
        height: 100,
        props: { route: "straight", x1: 50, y1: 300, x2: 250, y2: 400 },
      },
    },
  };
}

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed++;
  console.log(`PASS ${name}`);
}

// 1. 锁定与祖先继承锁定
test("锁定与解锁：节点自身及父节点锁定、过滤未锁定节点", () => {
  const scene = makeBaseScene();
  assert.equal(isNodeLocked(scene, "box1"), false);
  assert.equal(isNodeLocked(scene, "child1"), false);

  const locked = toggleNodesLocked(scene, ["box1"]);
  assert.equal(locked, true);
  assert.equal(scene.nodes.box1.locked, true);
  assert.equal(isNodeLocked(scene, "box1"), true);
  // 子节点继承父节点的锁定状态
  assert.equal(isNodeLocked(scene, "child1"), true);
  // 根窗口不可被锁定
  assert.equal(setNodesLocked(scene, ["window"], true), false);
  assert.equal(isNodeLocked(scene, "window"), false);

  assert.deepEqual(filterUnlocked(scene, ["window", "box1", "child1", "box2"]), ["box2"]);

  // 已锁定节点不能被 applyMoveToScene / applyResizeToScene / applyPropsToScene 修改
  const moved = applyMoveToScene(scene, ["box1", "box2"], 15, 25);
  assert.equal(moved.nodes.box1.x, 40);
  assert.equal(moved.nodes.box1.y, 50);
  assert.equal(moved.nodes.box2.x, 215);
  assert.equal(moved.nodes.box2.y, 145);

  const resized = applyResizeToScene(scene, "box1", "se", 30, 30);
  assert.equal(resized.nodes.box1.width, 100);
  assert.equal(resized.nodes.box1.height, 60);

  // 再次切换解锁
  const unlocked = toggleNodesLocked(scene, ["box1"]);
  assert.equal(unlocked, false);
  assert.equal(scene.nodes.box1.locked, undefined);
  assert.equal(isNodeLocked(scene, "child1"), false);
});

// 2. 版本的恢复与重做（移动、缩放、旋转、属性、增删、YAML 同步与版本跳转）
test("版本的恢复与重做：覆盖移动、缩放、旋转、改属性、增删节点与历史版本跳转", () => {
  let scene: Scene = makeBaseScene();
  let logic = `version: 1\nobjects:\n  box1:\n    props:\n      visible: true\n`;
  let history = createHistory(50);
  assert.equal(canUndo(history), false);
  assert.equal(canRedo(history), false);

  const nodeOf = (id: string) => scene.nodes[id];

  const commit = (nextScene: Scene, nextLogic = logic, label = "编辑") => {
    const before = snapshotOf(scene, logic);
    const after = snapshotOf(nextScene, nextLogic);
    history = pushHistory(history, before, after, label);
    scene = nextScene;
    logic = nextLogic;
  };

  // (a) 移动
  commit(applyMoveToScene(scene, ["box1"], 20, 10), logic, "移动 box1");
  assert.equal(nodeOf("box1").x, 60);
  assert.equal(nodeOf("box1").y, 60);
  assert.equal(canUndo(history), true);

  // (b) 缩放
  commit(applyResizeToScene(scene, "box1", "se", 40, 20), logic, "缩放 box1");
  assert.equal(nodeOf("box1").width, 140);
  assert.equal(nodeOf("box1").height, 80);

  // (c) 旋转
  const rotatedScene = parseScene(snapshotOf(scene).sceneText);
  setNodeRotation(rotatedScene.nodes.box1, 30);
  commit(rotatedScene, logic, "旋转 box1");
  assert.equal(nodeOf("box1").rotation, 30);

  // (d) 改属性
  commit(applyPropsToScene(scene, ["box1"], { fill: "#fde68a" }), logic, "改色 box1");
  assert.equal(nodeOf("box1").props?.fill, "#fde68a");

  // (e) 添加节点
  commit(
    applyAddNodeToScene(scene, "window", "box4", { type: "Shape", x: 10, y: 10, width: 50, height: 50 }),
    logic,
    "新增 box4",
  );
  assert.ok(nodeOf("box4"));

  // (f) 删除节点并一并清理 YAML
  const delRes = applyDeleteFromScene(scene, ["box1"], logic, true);
  commit(delRes.scene, delRes.logicText, "删除 box1");
  assert.equal(nodeOf("box1"), undefined);
  assert.equal(nodeOf("child1"), undefined);
  assert.equal(logic.includes("box1:"), false);

  // 逐步撤销全部 6 步操作
  const stepUndo = () => {
    const u = undoHistory(history, snapshotOf(scene, logic));
    assert.ok(u.snapshot);
    history = u.stack;
    scene = parseScene(u.snapshot.sceneText);
    logic = u.snapshot.logicText;
  };

  stepUndo(); // 撤销删除 box1 -> box1 与 YAML 条目同时恢复
  assert.ok(nodeOf("box1"));
  assert.ok(nodeOf("child1"));
  assert.equal(logic.includes("box1:"), true);

  stepUndo(); // 撤销新增 box4
  assert.equal(nodeOf("box4"), undefined);

  stepUndo(); // 撤销改属性
  assert.equal(nodeOf("box1").props?.fill, "#ffffff");

  stepUndo(); // 撤销旋转
  assert.equal(nodeOf("box1").rotation, undefined);

  stepUndo(); // 撤销缩放
  assert.equal(nodeOf("box1").width, 100);
  assert.equal(nodeOf("box1").height, 60);

  stepUndo(); // 撤销移动
  assert.equal(nodeOf("box1").x, 40);
  assert.equal(nodeOf("box1").y, 50);
  assert.equal(canUndo(history), false);
  assert.equal(canRedo(history), true);

  // 重做 2 步（移动 + 缩放）
  for (let i = 0; i < 2; i++) {
    const r = redoHistory(history, snapshotOf(scene, logic));
    assert.ok(r.snapshot);
    history = r.stack;
    scene = parseScene(r.snapshot.sceneText);
    logic = r.snapshot.logicText;
  }
  assert.equal(nodeOf("box1").x, 60);
  assert.equal(nodeOf("box1").width, 140);

  // 版本跳转：直接跳到版本 #4（改属性之后）
  const jumped = restoreHistoryVersion(history, 4, snapshotOf(scene, logic));
  assert.ok(jumped.snapshot);
  history = jumped.stack;
  scene = parseScene(jumped.snapshot.sceneText);
  assert.equal(nodeOf("box1").rotation, 30);
  assert.equal(nodeOf("box1").props?.fill, "#fde68a");
});

// 3. 旋转与命中测试及 check.ts 导出提示
test("旋转角度计算、15 度吸附、旋转后点选命中与 check.ts 提示", () => {
  assert.equal(normalizeRotation(0), 0);
  assert.equal(normalizeRotation(360), 0);
  assert.equal(normalizeRotation(195), -165);
  assert.equal(normalizeRotation(-195), 165);

  const center = { x: 100, y: 100 };
  const startPt = { x: 100, y: 40 }; // 正上方 (-90°)
  const rightPt = { x: 160, y: 100 }; // 正右方 (0°)，顺时针转了 90°
  assert.equal(computeRotationAngle(center, rightPt, startPt, 0, false), 90);

  // 按住 Shift 按 15° 对齐
  const near30 = rotatePoint(startPt, center, 28);
  assert.equal(computeRotationAngle(center, near30, startPt, 0, true), 30);

  // 旋转矩形点选命中：宽 100 高 20 的扁矩形绕中心 (100, 100) 旋转 90° 后变成竖条
  const rect = { x: 50, y: 90, width: 100, height: 20 };
  assert.equal(pointInRotatedRect({ x: 100, y: 60 }, rect, 0), false);
  assert.equal(pointInRotatedRect({ x: 100, y: 60 }, rect, 90), true);

  // check.ts 对设置了旋转的控件给出提示（不报错）
  const scene = makeBaseScene();
  setNodeRotation(scene.nodes.box1, 45);
  const problems = check({
    root: "/tmp/test",
    name: "test",
    pageDoc: "docs/page.md",
    qtExportDir: "",
    scene,
    sceneText: "",
    logic: {},
    logicText: "",
    docs: new Map([["docs/page.md", "# Page\n"]]),
    components: new Map(),
    effects: new Map(),
    presets: [],
    problems: [],
    signature: "",
  });
  const rotHint = problems.find((p) => p.nodeId === "box1" && p.message.includes("旋转"));
  assert.ok(rotHint, "check.ts 应当为设置了 rotation 的节点生成提示");
  assert.equal(rotHint.level, "hint");
});

// 4. 多选后的整体缩放
test("多选整体缩放：按比例缩放盒型节点与线条端点及拐点", () => {
  const resizedSingle = computeResizeBox({ x: 10, y: 20, width: 100, height: 50 }, "se", 100, 10, true);
  assert.equal(resizedSingle.width, 200);
  assert.equal(resizedSingle.height, 100);

  const scene = makeBaseScene();
  scene.nodes.line1.x = 40;
  scene.nodes.line1.y = 50;
  scene.nodes.line1.width = 240;
  scene.nodes.line1.height = 110;
  scene.nodes.line1.props = {
    route: "straight",
    x1: 40,
    y1: 50,
    x2: 280,
    y2: 160,
    bends: "160,100",
  };
  // 选中 box1 (40,50,100x60)、box2 (200,120,80x40) 和 line1 (40,50,240x110)
  // 合围外框：x=40, y=50, right=280(w=240), bottom=160(h=110)
  const nextBounds = applyGroupResize(scene, ["box1", "box2", "line1"], "se", 240, 110);
  assert.ok(nextBounds);
  assert.equal(nextBounds.width, 480);
  assert.equal(nextBounds.height, 220);

  // 宽高放大为原来的 2 倍，左上角 (40, 50) 不动
  assert.equal(scene.nodes.box1.x, 40);
  assert.equal(scene.nodes.box1.y, 50);
  assert.equal(scene.nodes.box1.width, 200);
  assert.equal(scene.nodes.box1.height, 120);

  assert.equal(scene.nodes.box2.x, 40 + (200 - 40) * 2);
  assert.equal(scene.nodes.box2.y, 50 + (120 - 50) * 2);
  assert.equal(scene.nodes.box2.width, 160);
  assert.equal(scene.nodes.box2.height, 80);

  // 线条未挂接端点与拐点也按 2 倍比例缩放
  assert.equal(scene.nodes.line1.props?.x1, 40);
  assert.equal(scene.nodes.line1.props?.y1, 50);
  assert.equal(scene.nodes.line1.props?.x2, 40 + (280 - 40) * 2);
  assert.equal(scene.nodes.line1.props?.y2, 50 + (160 - 50) * 2);
  assert.deepEqual(parseBends(scene.nodes.line1.props?.bends), [{ x: 40 + (160 - 40) * 2, y: 50 + (100 - 50) * 2 }]);

  // 直接测试 scaleGroupItems 最小尺寸保护
  const tiny = scaleGroupItems(
    [{ id: "a", abs: { x: 0, y: 0, width: 20, height: 20 }, parentOrigin: { x: 0, y: 0 } }],
    { x: 0, y: 0, width: 100, height: 100 },
    { x: 0, y: 0, width: 10, height: 10 },
  );
  assert.equal(tiny.get("a")?.width, 8);
  assert.equal(tiny.get("a")?.height, 8);
});

// 5. 对齐与等距分布
test("对齐与等距分布：6 种对齐与水平/垂直等距分布", () => {
  const items = [
    { id: "a", rect: { x: 20, y: 30, width: 40, height: 20 } },
    { id: "b", rect: { x: 100, y: 80, width: 60, height: 40 } },
    { id: "c", rect: { x: 240, y: 150, width: 80, height: 60 } },
  ];
  // 合围外框：x=20..320 (w=300), y=30..210 (h=180)
  const leftAligned = alignRects(items, "left");
  assert.equal(leftAligned.get("a")?.x, 20);
  assert.equal(leftAligned.get("b")?.x, 20);
  assert.equal(leftAligned.get("c")?.x, 20);

  const rightAligned = alignRects(items, "right");
  assert.equal(rightAligned.get("a")?.x, 280);
  assert.equal(rightAligned.get("b")?.x, 260);
  assert.equal(rightAligned.get("c")?.x, 240);

  const centerHAligned = alignRects(items, "centerH");
  // 中心 x = 20 + 150 = 170
  assert.equal(centerHAligned.get("a")?.x, 150);
  assert.equal(centerHAligned.get("b")?.x, 140);
  assert.equal(centerHAligned.get("c")?.x, 130);

  const topAligned = alignRects(items, "top");
  assert.equal(topAligned.get("b")?.y, 30);

  const centerVAligned = alignRects(items, "centerV");
  // 中心 y = 30 + 90 = 120
  assert.equal(centerVAligned.get("a")?.y, 110);
  assert.equal(centerVAligned.get("b")?.y, 100);
  assert.equal(centerVAligned.get("c")?.y, 90);

  const bottomAligned = alignRects(items, "bottom");
  assert.equal(bottomAligned.get("a")?.y, 190);
  assert.equal(bottomAligned.get("b")?.y, 170);
  assert.equal(bottomAligned.get("c")?.y, 150);

  // 水平等距分布：总跨度 320 - 20 = 300，总宽度 40 + 60 + 80 = 180，剩余 120 分成 2 段间距 = 60
  // a: x=20..60, b: x=120..180, c: x=240..320
  const distH = distributeRects(items, "horizontal");
  assert.equal(distH.get("a")?.x, 20);
  assert.equal(distH.get("b")?.x, 120);
  assert.equal(distH.get("c")?.x, 240);

  // 垂直等距分布：总跨度 210 - 30 = 180，总高度 20 + 40 + 60 = 120，间距 = 30
  // a: y=30..50, b: y=80..120, c: y=150..210
  const distV = distributeRects(items, "vertical");
  assert.equal(distV.get("a")?.y, 30);
  assert.equal(distV.get("b")?.y, 80);
  assert.equal(distV.get("c")?.y, 150);

  // Scene 级别调用
  const scene = makeBaseScene();
  assert.equal(alignSceneNodes(scene, ["box1", "box2", "box3"], "top"), true);
  assert.equal(scene.nodes.box1.y, 50);
  assert.equal(scene.nodes.box2.y, 50);
  assert.equal(scene.nodes.box3.y, 50);
  assert.equal(distributeSceneNodes(scene, ["box1", "box2", "box3"], "horizontal"), true);
});

// 6. 直线和曲线加拐点、移拐点、删拐点与几何路径生成
test("直线与曲线拐点：添加、移动、删除拐点及多段路径生成", () => {
  const start = { point: { x: 0, y: 0 }, direction: null };
  const end = { point: { x: 200, y: 0 }, direction: null };

  // 初始无拐点时，只有一段中点 (100, 0)
  const mids0 = lineSegmentMidpoints("straight", start, end, []);
  assert.equal(mids0.length, 1);
  assert.deepEqual(mids0[0], { x: 100, y: 0 });

  // 在第 0 段插入拐点 (100, 60)
  let props = addBendToLine({ route: "straight", x1: 0, y1: 0, x2: 200, y2: 0 }, 0, { x: 100, y: 60 });
  assert.equal(props.bends, "100,60");

  // 再在第 1 段插入拐点 (160, 40)
  props = addBendToLine(props, 1, { x: 160, y: 40 });
  assert.equal(props.bends, "100,60;160,40");

  // 移动第 0 个拐点到 (90, 80)
  props = moveBendOnLine(props, 0, { x: 90, y: 80 });
  assert.equal(props.bends, "90,80;160,40");

  // 直线几何包含全部折点
  const straightGeo = lineGeometry("straight", start, end, parseBends(props.bends));
  assert.equal(straightGeo.points.length, 4);
  assert.deepEqual(straightGeo.points[1], { x: 90, y: 80 });
  assert.deepEqual(straightGeo.points[2], { x: 160, y: 40 });
  assert.ok(straightGeo.path.includes("L90 80 L160 40"));

  // 曲线几何通过全部拐点并生成多段三次贝塞尔曲线 C 指令
  const curvedGeo = lineGeometry("curved", start, end, parseBends(props.bends));
  const cCount = (curvedGeo.path.match(/C/g) ?? []).length;
  assert.equal(cCount, 3, "2 个拐点应把曲线分成 3 段三次贝塞尔曲线");

  // 删除拐点：删完最后一个拐点时清除 bends 字段
  props = deleteBendFromLine(props, 0);
  assert.equal(props.bends, "160,40");
  props = deleteBendFromLine(props, 0);
  assert.equal(props.bends, undefined);

  // 底层数组辅助函数边界校验
  const arr = insertLineBend([], 0, { x: 10.4, y: 20.6 });
  assert.equal(formatBends(arr), "10,21");
  const updated = updateLineBend(arr, 0, { x: 30, y: 40 });
  assert.equal(formatBends(updated), "30,40");
  assert.deepEqual(removeLineBend(updated, 0), []);
});

// 7. 删除控件时检测并询问/清理 YAML 条目
test("删除控件与 YAML 条目检测和清理（含子节点及保留注释）", () => {
  const scene = makeBaseScene();
  const yamlText = `# 顶部注释保留
version: 1
state:
  count: 0
objects:
  # box1 的说明注释
  box1:
    props:
      visible: true
  child1:
    props:
      visible: true
  box2:
    props:
      visible: false
`;
  const subtree = collectSubtreeIds(scene, ["box1"]);
  assert.deepEqual([...subtree].sort(), ["box1", "child1"]);

  const matched = nodesWithYamlEntries(yamlText, subtree);
  assert.deepEqual(matched.sort(), ["box1", "child1"]);

  // 选择“只删除控件”时保留 YAML 条目
  const onlyScene = applyDeleteFromScene(scene, ["box1"], yamlText, false);
  assert.equal(onlyScene.scene.nodes.box1, undefined);
  assert.equal(onlyScene.scene.nodes.child1, undefined);
  assert.equal(onlyScene.logicText.includes("box1:"), true);

  // 选择“一并删除 YAML 条目”时删除 box1 和 child1，但保留 box2 与文件注释
  const both = applyDeleteFromScene(scene, ["box1"], yamlText, true);
  assert.equal(both.scene.nodes.box1, undefined);
  assert.equal(both.logicText.includes("box1:"), false);
  assert.equal(both.logicText.includes("child1:"), false);
  assert.equal(both.logicText.includes("box2:"), true);
  assert.equal(both.logicText.includes("# 顶部注释保留"), true);
  assert.equal(removeYamlObjects(yamlText, ["box2"]).includes("box2:"), false);
});

console.log(`\n全部 ${passed} 项编辑器单元测试通过。`);
