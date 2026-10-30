// 在三个窗口尺寸下比较设计项目在工具这一侧算出的排版几何（computeSceneLayout）
// 与导出的 Qt 程序实际运行时的控件几何（layoutDump），检查同名控件的位置和大小相差不超过 3 像素。
//
//   node scripts/compare-layout.ts <设计项目文件夹> <Qt可执行文件路径>
import { execFileSync } from "node:child_process";
import path from "node:path";
import { loadProjectFiles } from "../src/loader.ts";
import { computeSceneLayout } from "../src/model.ts";
import { Runtime } from "../src/runtime.ts";
import { nodeIO } from "./node-io.ts";

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SIZES: Array<{ width: number; height: number }> = [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1024, height: 720 },
];

async function main(): Promise<number> {
  const [projectArg, qtExeArg] = process.argv.slice(2);
  if (!projectArg || !qtExeArg) {
    console.log("用法：node scripts/compare-layout.ts <设计项目文件夹> <Qt可执行文件路径>");
    return 2;
  }
  const projectDir = path.resolve(projectArg);
  const qtExe = path.resolve(qtExeArg);
  const project = await loadProjectFiles(nodeIO(projectDir), null);
  const runtime = new Runtime(project);
  runtime.start();

  const steps = [
    ...SIZES.map((s) => `resize:${s.width}x${s.height};layout`),
    "click:newProjectBtn;layout",
  ].join(";");
  const rawOut = execFileSync(qtExe, ["--steps", steps], { encoding: "utf8" });
  const layoutLines = rawOut
    .split(/\r?\n/)
    .filter((line) => line.startsWith("layout "))
    .map((line) => JSON.parse(line.slice("layout ".length)) as Record<string, Box>);

  if (layoutLines.length !== SIZES.length + 1) {
    console.log(`错误：期望收到 ${SIZES.length + 1} 行 layout 输出，实际收到 ${layoutLines.length} 行`);
    return 1;
  }

  let globalMaxDiff = 0;
  let failed = false;

  const scenarios: Array<{ label: string; size: { width: number; height: number }; before?: () => void }> = [
    ...SIZES.map((size) => ({ label: `窗口尺寸 ${size.width}x${size.height}`, size })),
    {
      label: `窗口尺寸 ${SIZES[SIZES.length - 1].width}x${SIZES[SIZES.length - 1].height}（打开新建项目对话框）`,
      size: SIZES[SIZES.length - 1],
      before: () => runtime.dispatch("newProjectBtn", "click"),
    },
  ];

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];
    scenario.before?.();
    const size = scenario.size;
    const qtBoxes = layoutLines[i];
    const webBoxes = computeSceneLayout(project.scene, {
      rootSize: size,
      isVisible: (id) => runtime.view(id).visible,
      getProp: (id, prop) => runtime.view(id).props[prop] ?? null,
    });

    let sizeMaxDiff = 0;
    let comparedCount = 0;
    const mismatches: string[] = [];

    for (const [id, box] of webBoxes) {
      if (id === project.scene.root) continue;
      if (!box.visible) continue;
      const winBox = webBoxes.get(box.windowId);
      if (winBox && !winBox.visible) continue;

      const qt = qtBoxes[id];
      if (!qt) {
        mismatches.push(`  ${id}：工具侧可见，但 Qt 侧未出现在 layoutDump 中`);
        failed = true;
        continue;
      }
      const dx = Math.abs(box.absX - qt.x);
      const dy = Math.abs(box.absY - qt.y);
      const dw = Math.abs(box.width - qt.width);
      const dh = Math.abs(box.height - qt.height);
      const maxD = Math.max(dx, dy, dw, dh);
      if (maxD > sizeMaxDiff) sizeMaxDiff = maxD;
      if (maxD > globalMaxDiff) globalMaxDiff = maxD;
      comparedCount++;

      if (maxD > 3) {
        mismatches.push(
          `  ${id}：相差 ${maxD}px（工具=[${box.absX},${box.absY},${box.width}x${box.height}] Qt=[${qt.x},${qt.y},${qt.width}x${qt.height}]）`,
        );
        failed = true;
      }
    }

    console.log(
      `${scenario.label}：对比同名可见控件 ${comparedCount} 个，最大偏差 ${sizeMaxDiff}px ${
        mismatches.length === 0 ? "（通过 <= 3px）" : "（超出 3px）"
      }`,
    );
    for (const msg of mismatches) console.log(msg);
  }

  console.log(`总结：三个窗口尺寸下最大偏差 = ${globalMaxDiff}px（阈值 3px），结果：${failed ? "未通过" : "全部通过"}`);
  return failed ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (e) => {
    console.error(e);
    process.exitCode = 1;
  },
);
