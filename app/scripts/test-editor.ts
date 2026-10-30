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
  cloneScene,
  collectSubtreeIds,
  createHistory,
  nodesWithYamlEntries,
  parseScene,
  pushHistory,
  redoHistory,
  removeYamlObjects,
  renameComponentTypeInHistory,
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
  absRectInScene,
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
  hasLockedInSubtree,
  isNodeLocked,
  lockedAncestorInScene,
  moveBendOnLine,
  nodeLocalToWorldInScene,
  normalizeRotation,
  pointInRotatedRect,
  rectIntersectsRotatedRect,
  rotatePoint,
  scaleGroupItems,
  setNodeRotation,
  setNodesLocked,
  toggleNodesLocked,
  visualBoundsInScene,
  worldRotationInScene,
  worldToNodeLocalInScene,
  worldToParentDeltaInScene,
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

  // 选择“一并删除 YAML 条目”时删除 box1 和 child1，连带清除首项 box1 头顶的注释，但保留 box2 与文件顶部注释
  const both = applyDeleteFromScene(scene, ["box1"], yamlText, true);
  assert.equal(both.scene.nodes.box1, undefined);
  assert.equal(both.logicText.includes("box1:"), false);
  assert.equal(both.logicText.includes("# box1 的说明注释"), false);
  assert.equal(both.logicText.includes("child1:"), false);
  assert.equal(both.logicText.includes("box2:"), true);
  assert.equal(both.logicText.includes("# 顶部注释保留"), true);
  assert.equal(removeYamlObjects(yamlText, ["box2"]).includes("box2:"), false);
});

// 8. [阻塞 1 回归] 跨文件外部修改隔离、同文件外部修改两步撤销、以及 docs / presets 纳入版本栈
test("版本恢复与外部修改协同：跨文件隔离与同文件外部修改不丢失", () => {
  const s0 = makeBaseScene();
  const s1 = applyMoveToScene(s0, ["box1"], 30, 20);
  const l0 = `version: 1\nstate:\n  a: 1\n`;
  const lExt = `version: 1\nstate:\n  a: 999\n`;
  const d0 = { "docs/panel.md": "# 初始文档\n" };
  const dExt = { "docs/panel.md": "# 外部修改后的文档\n" };

  let history = createHistory(50);
  // 用户只在画布上移动了 box1（S0 -> S1），未改 YAML 和文档
  history = pushHistory(history, snapshotOf(s0, l0, d0, "[]"), snapshotOf(s1, l0, d0, "[]"), "移动 box1");

  // 随后外部 Agent 修改了 app.logic.yaml (L0 -> L_ext) 和 docs/panel.md (D0 -> D_ext)
  const currentAfterExt = snapshotOf(s1, lExt, dExt, "[]");
  const u1 = undoHistory(history, currentAfterExt);
  assert.ok(u1.snapshot);
  history = u1.stack;
  // 撤销画布移动只回退 sceneText 到 S0，外部修改后的 L_ext 与 D_ext 完整保留！
  assert.equal(parseScene(u1.snapshot.sceneText).nodes.box1.x, 40);
  assert.equal(u1.snapshot.logicText, lExt);
  assert.deepEqual(u1.snapshot.docs, dExt);

  // 重做画布移动：恢复 S1，同时继续保留 L_ext 与 D_ext
  const r1 = redoHistory(history, u1.snapshot);
  assert.ok(r1.snapshot);
  history = r1.stack;
  assert.equal(parseScene(r1.snapshot.sceneText).nodes.box1.x, 70);
  assert.equal(r1.snapshot.logicText, lExt);
  assert.deepEqual(r1.snapshot.docs, dExt);

  // 同文件外部修改场景：画布当前为 S1，外部直接把 scene.json 改成了 S_ext (box1.x = 300)
  const sExt = applyMoveToScene(s1, ["box1"], 230, 0);
  assert.equal(sExt.nodes.box1.x, 300);
  const snapExt = snapshotOf(sExt, lExt, dExt, "[]");

  // 第一次 Ctrl+Z：先从外部状态 S_ext 退回到工具操作完成时的状态 S1 (box1.x = 70)，且把 S_ext 压入重做栈
  const uSame1 = undoHistory(history, snapExt);
  assert.ok(uSame1.snapshot);
  history = uSame1.stack;
  assert.equal(parseScene(uSame1.snapshot.sceneText).nodes.box1.x, 70);
  assert.equal(canUndo(history), true, "第一次撤销仅回退外部修改，原操作仍在撤销栈中");
  assert.equal(canRedo(history), true, "外部修改状态应被压入重做栈");

  // 第二次 Ctrl+Z：从 S1 退回到初始状态 S0 (box1.x = 40)
  const uSame2 = undoHistory(history, uSame1.snapshot);
  assert.ok(uSame2.snapshot);
  history = uSame2.stack;
  assert.equal(parseScene(uSame2.snapshot.sceneText).nodes.box1.x, 40);
  assert.equal(canUndo(history), false);

  // 连续两次重做：先回到 S1 (70)，再回到 S_ext (300)
  const rSame1 = redoHistory(history, uSame2.snapshot);
  assert.ok(rSame1.snapshot);
  history = rSame1.stack;
  assert.equal(parseScene(rSame1.snapshot.sceneText).nodes.box1.x, 70);

  const rSame2 = redoHistory(history, rSame1.snapshot);
  assert.ok(rSame2.snapshot);
  history = rSame2.stack;
  assert.equal(parseScene(rSame2.snapshot.sceneText).nodes.box1.x, 300);

  // 文档与预设修改也能独立入栈与撤销
  const d2 = { "docs/panel.md": "# 新建小节后的文档\n" };
  history = pushHistory(history, rSame2.snapshot, snapshotOf(sExt, lExt, d2, '[{"id":"p1"}]'), "新增说明与预设");
  const uDoc = undoHistory(history, snapshotOf(sExt, lExt, d2, '[{"id":"p1"}]'));
  assert.ok(uDoc.snapshot);
  assert.deepEqual(uDoc.snapshot.docs, dExt);
  assert.equal(uDoc.snapshot.presetsText, "[]");
});

// 9. [阻塞 2 回归] 父容器未锁定但内部含锁定子孙时，拒绝整棵删除，绝不产生孤儿节点
test("锁定保护：父容器含已锁定子孙时禁止删除父容器", () => {
  const scene = makeBaseScene();
  // 仅锁定子控件 child1，父容器 box1 本身不设 locked
  setNodesLocked(scene, ["child1"], true);
  assert.equal(scene.nodes.box1.locked, undefined);
  assert.equal(scene.nodes.child1.locked, true);
  assert.equal(hasLockedInSubtree(scene, "box1"), true);
  assert.equal(hasLockedInSubtree(scene, "box2"), false);

  // 试图收集 box1 的待删子树时应因含锁定子孙而被整体拒绝
  const toDelete = collectSubtreeIds(scene, ["box1"]);
  assert.equal(toDelete.size, 0);

  // applyDeleteFromScene 删除 ["box1"] 时，box1 与 child1 均完好保留
  const yamlText = `version: 1\nobjects:\n  box1:\n    props:\n      visible: true\n  child1:\n    props:\n      visible: true\n`;
  const res = applyDeleteFromScene(scene, ["box1"], yamlText, true);
  assert.ok(res.scene.nodes.box1, "父容器 box1 不应被删掉");
  assert.ok(res.scene.nodes.child1, "锁定子节点 child1 不应变成孤儿节点");
  assert.ok(res.scene.nodes.window.children?.includes("box1"));
  assert.equal(res.logicText.includes("box1:"), true);

  // 同时选中含锁定子孙的 box1 与完全未锁定的 box2 删除时，只删除 box2，保留 box1 子树
  const resMixed = applyDeleteFromScene(scene, ["box1", "box2"], yamlText, true);
  assert.ok(resMixed.scene.nodes.box1);
  assert.ok(resMixed.scene.nodes.child1);
  assert.equal(resMixed.scene.nodes.box2, undefined);
});

// 10. [复审第 8 项回归] 解锁子节点只解除其自身锁定标记，绝不连带解开父容器和兄弟节点，并能定位锁定的祖先容器
test("解锁继承锁定的子节点时不连带解开父容器和兄弟节点", () => {
  const scene = makeBaseScene();
  scene.nodes.child2 = { type: "Button", x: 10, y: 40, width: 60, height: 24 };
  scene.nodes.box1.children = ["child1", "child2"];
  // 锁定父容器 box1 与子节点 child1
  setNodesLocked(scene, ["box1", "child1"], true);
  assert.equal(isNodeLocked(scene, "box1"), true);
  assert.equal(isNodeLocked(scene, "child1"), true);
  assert.equal(isNodeLocked(scene, "child2"), true);
  assert.equal(lockedAncestorInScene(scene, "child1"), "box1");
  assert.equal(lockedAncestorInScene(scene, "child2"), "box1");
  assert.equal(lockedAncestorInScene(scene, "box1"), null);

  // 对 child1 执行解锁：只清除 child1 自身的 locked 标记，父容器 box1 和兄弟 child2 保持锁定
  const changed = setNodesLocked(scene, ["child1"], false);
  assert.equal(changed, true);
  assert.equal(scene.nodes.child1.locked, undefined);
  assert.equal(scene.nodes.box1.locked, true, "父容器 box1 不应被连带解锁");
  assert.equal(isNodeLocked(scene, "box1"), true);
  assert.equal(isNodeLocked(scene, "child2"), true, "兄弟节点 child2 不应被连带解锁");

  // 解锁父容器 box1 后，child1 与 child2 才一并恢复可编辑
  setNodesLocked(scene, ["box1"], false);
  assert.equal(isNodeLocked(scene, "box1"), false);
  assert.equal(isNodeLocked(scene, "child1"), false);
  assert.equal(isNodeLocked(scene, "child2"), false);
});

// 11. [阻塞 4 回归] 旋转节点的局部系缩放、视觉外包围盒、旋转框选碰撞、旋转父容器坐标换算与对齐分布
test("旋转几何体系：旋转节点八方向缩放、旋转框选、旋转父容器与旋转后对齐分布", () => {
  // (a) 旋转 90° 的节点拖右把手 "e"（在世界系中朝下 +y 方向拉 40px）：
  // 节点局部右边缘沿世界 +y 扩展 40px，而对侧世界锚点（局部左边缘中点）在世界坐标系中保持不动
  const box = { x: 100, y: 100, width: 100, height: 60 };
  const centerBefore = { x: box.x + box.width / 2, y: box.y + box.height / 2 }; // (150, 130)
  // 局部左边缘中点 (-50, 0) 绕中心顺时针转 90° 后在世界系中的位置为 (150, 80)
  const westWorldBefore = rotatePoint({ x: box.x, y: centerBefore.y }, centerBefore, 90);
  assert.deepEqual({ x: Math.round(westWorldBefore.x), y: Math.round(westWorldBefore.y) }, { x: 150, y: 80 });

  const resized90 = computeResizeBox(box, "e", 0, 40, false, 8, 90);
  assert.equal(resized90.width, 140);
  assert.equal(resized90.height, 60);
  const centerAfter = { x: resized90.x + resized90.width / 2, y: resized90.y + resized90.height / 2 };
  const westWorldAfter = rotatePoint({ x: resized90.x, y: centerAfter.y }, centerAfter, 90);
  assert.ok(Math.abs(westWorldAfter.x - westWorldBefore.x) <= 1, "旋转缩放后对侧锚点 X 不应漂移");
  assert.ok(Math.abs(westWorldAfter.y - westWorldBefore.y) <= 1, "旋转缩放后对侧锚点 Y 不应漂移");

  // (b) 旋转 45° 的节点拖右下角 "se"：左上角 "nw" 世界坐标锚点保持不变
  const nwWorldBefore = rotatePoint({ x: box.x, y: box.y }, centerBefore, 45);
  const resized45 = computeResizeBox(box, "se", 30, 30, false, 8, 45);
  const center45After = { x: resized45.x + resized45.width / 2, y: resized45.y + resized45.height / 2 };
  const nwWorldAfter = rotatePoint({ x: resized45.x, y: resized45.y }, center45After, 45);
  assert.ok(Math.abs(nwWorldAfter.x - nwWorldBefore.x) <= 1);
  assert.ok(Math.abs(nwWorldAfter.y - nwWorldBefore.y) <= 1);

  // (c) 旋转框选（SAT 碰撞检测）：宽 100 高 20 的扁矩形（中心 100,100）旋转 90° 后变成竖条 (x:90..110, y:50..150)
  const flatRect = { x: 50, y: 90, width: 100, height: 20 };
  // 框选竖条顶部 (95..105, 52..58)：未旋转时不相交，旋转 90° 后相交
  assert.equal(rectIntersectsRotatedRect({ x: 95, y: 52, width: 10, height: 6 }, flatRect, 0), false);
  assert.equal(rectIntersectsRotatedRect({ x: 95, y: 52, width: 10, height: 6 }, flatRect, 90), true);
  // 框选原左端 (52..58, 95..105)：未旋转时相交，旋转 90° 后不再相交
  assert.equal(rectIntersectsRotatedRect({ x: 52, y: 95, width: 6, height: 10 }, flatRect, 0), true);
  assert.equal(rectIntersectsRotatedRect({ x: 52, y: 95, width: 6, height: 10 }, flatRect, 90), false);

  // (d) 旋转父容器与子节点的坐标换算
  const scene = makeBaseScene();
  setNodeRotation(scene.nodes.box1, 90);
  assert.equal(worldRotationInScene(scene, "box1"), 90);
  assert.equal(worldRotationInScene(scene, "child1"), 90);
  const localPt = { x: 25, y: 20 };
  const worldPt = nodeLocalToWorldInScene(scene, "box1", localPt);
  const roundTrip = worldToNodeLocalInScene(scene, "box1", worldPt);
  assert.ok(Math.abs(roundTrip.x - localPt.x) < 1e-6);
  assert.ok(Math.abs(roundTrip.y - localPt.y) < 1e-6);

  // 旋转父容器内移动子节点：世界位移 (20, 0) 换算为父容器局部位移后，子节点世界中心精确右移 20px
  const childAbsBefore = absRectInScene(scene, "child1")!;
  const localDelta = worldToParentDeltaInScene(scene, "child1", 20, 0);
  scene.nodes.child1.x = (scene.nodes.child1.x ?? 0) + localDelta.x;
  scene.nodes.child1.y = (scene.nodes.child1.y ?? 0) + localDelta.y;
  const childAbsAfter = absRectInScene(scene, "child1")!;
  assert.equal(Math.round(childAbsAfter.x - childAbsBefore.x), 20);
  assert.equal(Math.round(childAbsAfter.y - childAbsBefore.y), 0);

  // (e) 旋转节点的视觉外框与对齐：box1 (100x60 旋转 90° -> 视觉宽 60 高 100) 与 box2 左对齐后，两者视觉左边缘相等
  alignSceneNodes(scene, ["box1", "box2"], "left");
  const v1 = visualBoundsInScene(scene, "box1")!;
  const v2 = visualBoundsInScene(scene, "box2")!;
  assert.equal(Math.round(v1.x), Math.round(v2.x));
});

// 12. [应修 6 & 9 回归] 多选拖四角默认等比缩放、有效未锁定节点不足时对齐返回 false
test("多选四角默认等比缩放与单节点对齐防归零保护", () => {
  const scene = makeBaseScene();
  // 选中 box1 (40,50,100x60) 与 box2 (200,120,80x40)，合围外框 240x110
  // 拖右下角 "se" 且不传 keepAspect，即使 dx=240, dy=10 不成比例，四角把手也默认按比例等比放大 2 倍
  const bounds = applyGroupResize(scene, ["box1", "box2"], "se", 240, 10);
  assert.ok(bounds);
  assert.equal(bounds.width, 480);
  assert.equal(bounds.height, 220);
  assert.equal(scene.nodes.box1.width, 200);
  assert.equal(scene.nodes.box1.height, 120);

  // 拖右边把手 "e" 默认只改宽度不改高度
  const boundsEdge = applyGroupResize(scene, ["box1", "box2"], "e", -240, 50);
  assert.ok(boundsEdge);
  assert.equal(boundsEdge.width, 240);
  assert.equal(boundsEdge.height, 220);

  // 2 个节点中 1 个被锁定时，仅剩 1 个未锁定节点，alignSceneNodes 必须返回 false 且不把未锁定节点移到 (0, 0)
  const scene2 = makeBaseScene();
  setNodesLocked(scene2, ["box1"], true);
  const prevX = scene2.nodes.box2.x;
  const prevY = scene2.nodes.box2.y;
  assert.equal(alignSceneNodes(scene2, ["box1", "box2"], "left"), false);
  assert.equal(scene2.nodes.box2.x, prevX);
  assert.equal(scene2.nodes.box2.y, prevY);
});

// 13. [复审阻塞 1 & 2 回归] applyResizeToScene 旋转参数顺序与旋转父容器内子节点的移动/单选缩放/多选缩放
test("旋转节点与旋转父容器内子节点的移动和缩放精度", () => {
  const scene = makeBaseScene();
  // (a) 节点自身旋转 90° 或 -45° 时调用 applyResizeToScene：不会把旋转角误传为 minSize
  setNodeRotation(scene.nodes.box2, 90);
  // box2 初始 (200, 120, 80x40)，旋转 90° 后拖右把手 "e" 朝世界 +y 方向拉 20px -> 宽度变为 100，高度保持 40
  const resizedRot = applyResizeToScene(scene, "box2", "e", 0, 20);
  assert.equal(resizedRot.nodes.box2.width, 100);
  assert.equal(resizedRot.nodes.box2.height, 40);

  // 负旋转角 -45° 缩放到极小值时仍受 MIN_NODE_SIZE (8) 保护，不会缩成 0 或负数
  setNodeRotation(scene.nodes.box2, -45);
  const clampedRot = applyResizeToScene(scene, "box2", "w", 500, 500);
  assert.ok(clampedRot.nodes.box2.width >= 8, "负角度旋转节点缩放宽度不应小于最小尺寸 8");
  assert.ok(clampedRot.nodes.box2.height >= 8, "负角度旋转节点缩放高度不应小于最小尺寸 8");

  // (b) 父容器 box1 旋转 90° 时，移动子节点 child1（世界位移 dx=30, dy=0）：
  // 子节点在世界坐标系中的外框应精确右移 30px、垂直方向不漂移
  const sceneParentRot = makeBaseScene();
  setNodeRotation(sceneParentRot.nodes.box1, 90);
  const childWorldBefore = absRectInScene(sceneParentRot, "child1");
  const movedScene = applyMoveToScene(sceneParentRot, ["child1"], 30, 0);
  const childWorldAfterMove = absRectInScene(movedScene, "child1");
  assert.equal(Math.round(childWorldAfterMove.x - childWorldBefore.x), 30);
  assert.equal(Math.round(childWorldAfterMove.y - childWorldBefore.y), 0);

  // (c) 父容器 box1 旋转 90° 时，缩放子节点 child1（拖 "e" 把手沿世界 +y 拉 20px）：
  // child1 的宽度增加 20（30 -> 50），高度保持 20，且不会把世界坐标直接赋给局部坐标导致跳出父容器
  const resizedChildScene = applyResizeToScene(sceneParentRot, "child1", "e", 0, 20);
  assert.equal(resizedChildScene.nodes.child1.width, 50);
  assert.equal(resizedChildScene.nodes.child1.height, 20);
  assert.equal(resizedChildScene.nodes.child1.x, 10, "在父容器局部系中拖右把手不应改变左边缘 x");
  assert.equal(resizedChildScene.nodes.child1.y, 10, "在父容器局部系中拖右把手不应改变上边缘 y");
});

// 14. [复审阻塞 3 回归] 重命名项目控件类型后同步更新历史栈快照，撤销/重做不会回退到已删除的旧控件类型
test("重命名项目控件类型后历史栈同步更新组件类型引用", () => {
  const s0 = makeBaseScene();
  s0.nodes.child1.type = "Button";
  const s1 = applyMoveToScene(s0, ["child1"], 24, 0);
  let stack = createHistory(20);
  stack = pushHistory(stack, snapshotOf(s0, "version: 1\n"), snapshotOf(s1, "version: 1\n"), "移动 child1");

  // 重命名控件 Button -> PrimaryBtn
  stack = renameComponentTypeInHistory(stack, ["Button"], "PrimaryBtn");
  const currentRenamed = cloneScene(s1);
  currentRenamed.nodes.child1.type = "PrimaryBtn";

  // 按 Ctrl+Z 撤销移动：child1 的位置退回 s0，但 type 保持为重命名后的 PrimaryBtn
  const undone = undoHistory(stack, snapshotOf(currentRenamed, "version: 1\n"));
  assert.ok(undone.snapshot);
  const sceneAfterUndo = parseScene(undone.snapshot.sceneText);
  assert.equal(sceneAfterUndo.nodes.child1.x, s0.nodes.child1.x);
  assert.equal(sceneAfterUndo.nodes.child1.type, "PrimaryBtn");

  // 按 Ctrl+Y 重做移动：位置前进到 s1，type 仍为 PrimaryBtn
  const redone = redoHistory(undone.stack, undone.snapshot);
  assert.ok(redone.snapshot);
  const sceneAfterRedo = parseScene(redone.snapshot.sceneText);
  assert.equal(sceneAfterRedo.nodes.child1.x, s1.nodes.child1.x);
  assert.equal(sceneAfterRedo.nodes.child1.type, "PrimaryBtn");
});

// 15. [复审应修 6 & 9 回归] 跨通道外部修改自动补入历史记录、删除 objects 首条目保留顶层块注释
test("跨通道外部修改历史记录与删除首条目保留 objects 顶层块注释", () => {
  // (a) 两次画布移动之间，外部修改了 logicText：pushHistory 自动记录“外部修改”，跳回 #0 初始状态可完整恢复 (S0, L0)
  const s0 = makeBaseScene();
  const s1 = applyMoveToScene(s0, ["box1"], 20, 0);
  const s2 = applyMoveToScene(s1, ["box1"], 40, 0);
  const l0 = "version: 1\nstate:\n  count: 0\n";
  const lExt = "version: 1\nstate:\n  count: 99\n";

  let stack = createHistory(20);
  stack = pushHistory(stack, snapshotOf(s0, l0), snapshotOf(s1, l0), "第一次移动");
  // 外部把 logic 从 l0 改成了 lExt，然后用户进行第二次画布移动
  stack = pushHistory(stack, snapshotOf(s1, lExt), snapshotOf(s2, lExt), "第二次移动");
  assert.equal(stack.past.length, 3, "应在两次画布操作之间自动补入一条外部修改记录");
  assert.equal(stack.past[1].label, "外部修改");

  // 跳转到 #0 初始状态，画布与逻辑均恢复为 (s0, l0)
  const restored0 = restoreHistoryVersion(stack, 0, snapshotOf(s2, lExt));
  assert.ok(restored0.snapshot);
  assert.equal(parseScene(restored0.snapshot.sceneText).nodes.box1.x, s0.nodes.box1.x);
  assert.equal(restored0.snapshot.logicText, l0);

  // (b) objects: 下既有块级顶层注释（空行分隔），又有首条目专属注释时，删除首条目保留块级顶层注释
  const yamlWithSectionComment = [
    "version: 1",
    "objects:",
    "  # 控件逻辑总表",
    "",
    "  # 第一个按钮的逻辑",
    "  btn1:",
    "    doc: docs/main.md#btn1",
    "  # 第二个按钮的逻辑",
    "  btn2:",
    "    doc: docs/main.md#btn2",
    "",
  ].join("\n");
  const afterDel = removeYamlObjects(yamlWithSectionComment, ["btn1"]);
  assert.equal(afterDel.includes("# 控件逻辑总表"), true, "应保留 objects 块级顶层注释");
  assert.equal(afterDel.includes("# 第一个按钮的逻辑"), false, "应清除被删首条目的前导注释");
  assert.equal(afterDel.includes("# 第二个按钮的逻辑"), true, "应保留后续条目的注释");
  assert.equal(afterDel.includes("btn2:"), true);
});

console.log(`\n全部 ${passed} 项编辑器单元测试通过。`);
