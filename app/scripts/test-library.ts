// 测试结构哈希（structhash.ts）与素材库复制、来源记录、状态判断（library.ts）的纯函数。
// 运行：npm run test:library
import assert from "node:assert/strict";
import {
  collectComponentInLibrary,
  compareLibraryStatus,
  emptyOrigins,
  isSafePathSegment,
  prepareLibraryComponentForProject,
  reconcileProjectLibrary,
  relinkOrphanedOrigin,
  removeOrphanedOrigin,
  replaceProjectComponentWithLibrary,
  rewriteComponentIdentity,
  statusBadgeText,
  unfavoriteFromLibrary,
  updateLibraryItemFromProject,
} from "../src/library.ts";
import { structHash, structHashFromFiles } from "../src/structhash.ts";

const baseFiles: Record<string, string> = {
  "component.json": JSON.stringify(
    {
      type: "TransparentInput",
      label: "透明输入框",
      description: "透明背景的单行输入框",
      defaultSize: { width: 240, height: 36 },
      entry: "index.js",
      style: "style.css",
      props: {
        placeholder: { type: "string", default: "" },
        enabled: { type: "boolean", default: true, logic: true },
      },
      bind: "string",
      events: ["change"],
      children: false,
    },
    null,
    2,
  ),
  "index.js": 'export default function create(el, { props, emit }) {\n  const input = document.createElement("input");\n  el.append(input);\n  return { update() {}, destroy() {} };\n}\n',
  "style.css": ":scope input {\n  border: none;\n  border-bottom: 1px solid var(--color-primary, #2563eb);\n}\n",
};

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed++;
  console.log(`PASS ${name}`);
}

// 1. 相同结构同哈希：改控件 type / label / description、改 JSON 键顺序与空白、改 CRLF 换行，哈希都不变
test("相同结构同哈希（忽略 type/label/description、JSON 缩进与键顺序、CRLF 换行）", () => {
  const h1 = structHashFromFiles(baseFiles);
  assert.equal(h1.length, 32);

  const renamedAndReformatted: Record<string, string> = {
    "component.json":
      '{\r\n  "children": false,\r\n  "events": [ "change" ],\r\n  "bind": "string",\r\n  "props": {\r\n    "enabled": { "logic": true, "default": true, "type": "boolean" },\r\n    "placeholder": { "default": "", "type": "string" }\r\n  },\r\n  "style": "style.css",\r\n  "entry": "index.js",\r\n  "defaultSize": { "height": 36, "width": 240 },\r\n  "description": "完全不同的说明文字",\r\n  "label": "清透输入框",\r\n  "type": "ClearInput"\r\n}\r\n',
    "index.js": baseFiles["index.js"].replace(/\n/g, "\r\n"),
    "style.css": baseFiles["style.css"].replace(/\n/g, "\r\n"),
  };
  const h2 = structHashFromFiles(renamedAndReformatted);
  assert.equal(h1, h2);

  const rewritten = rewriteComponentIdentity(baseFiles, "TransparentInput_2", "透明输入框（收藏）");
  assert.equal(structHashFromFiles(rewritten), h1);
});

// 2. 改属性名、事件名或改实现（index.js / style.css）时，哈希变化
test("改属性名、事件名或改实现（index.js / style.css）时哈希变化", () => {
  const baseHash = structHashFromFiles(baseFiles);

  // 改属性名 placeholder -> hintText
  const propRenamed = {
    ...baseFiles,
    "component.json": baseFiles["component.json"].replace('"placeholder"', '"hintText"'),
  };
  assert.notEqual(structHashFromFiles(propRenamed), baseHash);

  // 改事件名 change -> input
  const eventRenamed = {
    ...baseFiles,
    "component.json": baseFiles["component.json"].replace('"change"', '"input"'),
  };
  assert.notEqual(structHashFromFiles(eventRenamed), baseHash);

  // 改默认尺寸
  const sizeChanged = {
    ...baseFiles,
    "component.json": baseFiles["component.json"].replace("240", "260"),
  };
  assert.notEqual(structHashFromFiles(sizeChanged), baseHash);

  // 改 index.js 实现
  const jsChanged = {
    ...baseFiles,
    "index.js": baseFiles["index.js"].replace('createElement("input")', 'createElement("textarea")'),
  };
  assert.notEqual(structHashFromFiles(jsChanged), baseHash);

  // 改 style.css 样式
  const cssChanged = {
    ...baseFiles,
    "style.css": baseFiles["style.css"].replace("1px solid", "2px dashed"),
  };
  assert.notEqual(structHashFromFiles(cssChanged), baseHash);

  // 直接调用 structHash 接口也一致
  const directHash = structHash({
    decl: JSON.parse(baseFiles["component.json"]) as Record<string, unknown>,
    source: baseFiles["index.js"],
    style: baseFiles["style.css"],
  });
  assert.equal(directHash, baseHash);
});

// 3. 收藏素材并拖进没有它的项目：先复制到 components/ 并写入来源记录（规则 3）
test("拖入没有该素材的项目时，复制到 components/ 并写入来源记录", () => {
  const collected = collectComponentInLibrary("TransparentInput", baseFiles, "proj-1", [], emptyOrigins(), () => "fav-input");
  assert.equal(collected.library.length, 1);
  assert.equal(collected.origins.origins.TransparentInput.libraryId, "fav-input");
  assert.equal(collected.origins.origins.TransparentInput.baseHash, collected.item.hash);

  // 新项目为空，拖入收藏
  const dragRes = prepareLibraryComponentForProject(collected.item, {}, emptyOrigins());
  assert.equal(dragRes.action, "copy");
  assert.equal(dragRes.localType, "TransparentInput");
  assert.ok(dragRes.copiedFiles);
  assert.equal(structHashFromFiles(dragRes.copiedFiles), collected.item.hash);
  assert.equal(dragRes.origins.origins.TransparentInput.libraryId, "fav-input");
  assert.equal(dragRes.origins.origins.TransparentInput.baseHash, collected.item.hash);
  assert.equal(dragRes.hint, null);
});

// 4. 拖入已有来源记录、或已有同哈希不同名控件、或已有同名不同结构控件（规则 1、2、4）
test("拖入收藏的四条规则：来源记录复用、同结构哈希异名复用、同名异构改名复制", () => {
  const { item: fav } = collectComponentInLibrary("TransparentInput", baseFiles, "proj-1", [], emptyOrigins(), () => "fav-input");

  // 规则 1：已有来源记录，即使本地已修改，拖入时也直接复用，不复制新文件
  const modifiedLocal = {
    ...baseFiles,
    "index.js": baseFiles["index.js"] + "// 本地修改\n",
  };
  const origins1 = { version: 1 as const, origins: { TransparentInput: { libraryId: "fav-input", baseHash: fav.hash } } };
  const r1 = prepareLibraryComponentForProject(fav, { TransparentInput: modifiedLocal }, origins1);
  assert.equal(r1.action, "reuse-origin");
  assert.equal(r1.localType, "TransparentInput");
  assert.equal(r1.copiedFiles, null);

  // 规则 2：项目里已有结构完全相同、但名字叫 ClearInput 的控件（无来源记录）→ 直接复用 ClearInput 并补写来源记录
  const clearInputFiles = rewriteComponentIdentity(baseFiles, "ClearInput", "清透输入框");
  const r2 = prepareLibraryComponentForProject(fav, { ClearInput: clearInputFiles }, emptyOrigins());
  assert.equal(r2.action, "reuse-hash");
  assert.equal(r2.localType, "ClearInput");
  assert.equal(r2.copiedFiles, null);
  assert.equal(r2.origins.origins.ClearInput.libraryId, "fav-input");
  assert.equal(r2.origins.origins.ClearInput.baseHash, fav.hash);

  // 规则 4：项目里已有一个同名但结构不同的 TransparentInput → 以 TransparentInput_2 复制进来并给出说明
  const differentSameName = {
    ...baseFiles,
    "index.js": 'export default function create(el) { el.textContent = "different"; return { update() {}, destroy() {} }; }\n',
  };
  const r4 = prepareLibraryComponentForProject(fav, { TransparentInput: differentSameName }, emptyOrigins());
  assert.equal(r4.action, "copy-renamed");
  assert.equal(r4.localType, "TransparentInput_2");
  assert.ok(r4.copiedFiles);
  assert.equal(structHashFromFiles(r4.copiedFiles), fav.hash);
  assert.equal(JSON.parse(r4.copiedFiles["component.json"]).type, "TransparentInput_2");
  assert.equal(r4.origins.origins.TransparentInput_2.libraryId, "fav-input");
  assert.ok(r4.hint && r4.hint.includes("TransparentInput_2"));
});

// 5. 三个哈希比较四种状态、更新收藏、更新为收藏版本、文件夹改名找回、取消收藏
test("来源记录对账、四种状态标记、更新收藏、更新为收藏版本、文件夹改名找回与取消收藏", () => {
  const { item: fav0, library: lib0, origins: proj1Origins0 } = collectComponentInLibrary(
    "TransparentInput",
    baseFiles,
    "proj-1",
    [],
    emptyOrigins(),
    () => "fav-input",
  );

  // 初始一致
  assert.equal(compareLibraryStatus(fav0.hash, fav0.hash, fav0.hash), "clean");
  assert.equal(statusBadgeText("clean"), "");

  // 项目 1 修改了 index.js → 已修改 (modified)
  const proj1ModifiedFiles = {
    ...baseFiles,
    "index.js": baseFiles["index.js"] + "// v2 feature\n",
  };
  const rec1 = reconcileProjectLibrary({ TransparentInput: proj1ModifiedFiles }, lib0, proj1Origins0);
  assert.equal(rec1.matchedByLibraryId.get("fav-input")?.status, "modified");
  assert.equal(statusBadgeText("modified"), "已修改");

  // 项目 1 执行“更新收藏” → 素材库变为 v2，项目 1 回到 clean
  const updated = updateLibraryItemFromProject("TransparentInput", proj1ModifiedFiles, lib0, proj1Origins0)!;
  assert.ok(updated);
  const lib1 = updated.library;
  assert.notEqual(lib1[0].hash, fav0.hash);

  // 项目 2 仍停留在初始版本 → 显示“有新版本” (outdated)
  const proj2Origins0 = { version: 1 as const, origins: { TransparentInput: { libraryId: "fav-input", baseHash: fav0.hash } } };
  const rec2 = reconcileProjectLibrary({ TransparentInput: baseFiles }, lib1, proj2Origins0);
  assert.equal(rec2.matchedByLibraryId.get("fav-input")?.status, "outdated");
  assert.equal(statusBadgeText("outdated"), "有新版本");

  // 项目 2 如果也做了另一处修改 → 显示“两边都改过” (diverged)
  const proj2DivergedFiles = {
    ...baseFiles,
    "style.css": baseFiles["style.css"] + "/* custom */\n",
  };
  const recDiverged = reconcileProjectLibrary({ TransparentInput: proj2DivergedFiles }, lib1, proj2Origins0);
  assert.equal(recDiverged.matchedByLibraryId.get("fav-input")?.status, "diverged");
  assert.equal(statusBadgeText("diverged"), "两边都改过");

  // 项目 2 选择“更新为收藏版本” → 替换为收藏的 v2，回到 clean
  const replaced = replaceProjectComponentWithLibrary("TransparentInput", lib1[0], proj2Origins0);
  const recAfterReplace = reconcileProjectLibrary({ TransparentInput: replaced.writtenFiles }, lib1, replaced.origins);
  assert.equal(recAfterReplace.matchedByLibraryId.get("fav-input")?.status, "clean");

  // Agent 在工具外把文件夹从 TransparentInput 改名为 FancyInput 但未改内容 → 按哈希找回来源记录
  const renamedFiles = rewriteComponentIdentity(replaced.writtenFiles, "FancyInput", "花式输入框");
  const recRenamed = reconcileProjectLibrary({ FancyInput: renamedFiles }, lib1, replaced.origins);
  assert.equal(recRenamed.originsChanged, true);
  assert.equal(recRenamed.origins.origins.FancyInput?.libraryId, "fav-input");
  assert.equal(recRenamed.matchedByLibraryId.get("fav-input")?.localType, "FancyInput");

  // 取消收藏 → 从素材库移除，来源记录失效
  const unfav = unfavoriteFromLibrary("fav-input", lib1, recRenamed.origins);
  assert.equal(unfav.library.length, 0);
  assert.equal(Object.keys(unfav.origins.origins).length, 0);
});

// 6. [回归测试 - 阻塞问题 4.2] 素材库为空时（如在 localStorage 为空的浏览器或新机器打开项目），不清空已有的 .designer/origins.json
test("回归：素材库为空时 reconcileProjectLibrary 不清空已有的来源记录", () => {
  const existingOrigins = {
    version: 1 as const,
    origins: {
      TransparentInput: { libraryId: "fav-from-another-machine", baseHash: structHashFromFiles(baseFiles) },
    },
  };
  const rec = reconcileProjectLibrary({ TransparentInput: baseFiles }, [], existingOrigins);
  assert.equal(rec.originsChanged, false);
  assert.equal(rec.origins.origins.TransparentInput?.libraryId, "fav-from-another-machine");
});

// 7. [回归测试 - 阻塞问题 4.3 & 4.5] Agent 只改控件文件夹名而不改 component.json，或修改实现后再改文件夹名，来源记录仍能找回
test("回归：只改控件文件夹名不改 component.json，以及修改实现后再改文件夹名，均能找回来源记录", () => {
  const { library, origins } = collectComponentInLibrary(
    "TransparentInput",
    baseFiles,
    "proj-1",
    [],
    emptyOrigins(),
    () => "fav-input",
  );

  // 情况 A：只把文件夹改名为 FancyInput，component.json 里的 type 仍为 TransparentInput
  const recFolderOnly = reconcileProjectLibrary({ FancyInput: baseFiles }, library, origins);
  assert.equal(recFolderOnly.origins.origins.FancyInput?.libraryId, "fav-input");
  assert.equal(recFolderOnly.matchedByLibraryId.get("fav-input")?.localType, "FancyInput");

  // 情况 B：先修改了 index.js（哈希已变），再把文件夹和 type 改名为 ModifiedFancyInput
  const modifiedAndRenamed = rewriteComponentIdentity(
    {
      ...baseFiles,
      "index.js": baseFiles["index.js"] + "// local edit before rename\n",
    },
    "ModifiedFancyInput",
    "改过的花式输入框",
  );
  const recModifiedRenamed = reconcileProjectLibrary({ ModifiedFancyInput: modifiedAndRenamed }, library, origins);
  assert.equal(recModifiedRenamed.origins.origins.ModifiedFancyInput?.libraryId, "fav-input");
  assert.equal(recModifiedRenamed.matchedByLibraryId.get("fav-input")?.localType, "ModifiedFancyInput");
  assert.equal(recModifiedRenamed.matchedByLibraryId.get("fav-input")?.status, "modified");
});

// 8. [回归测试 - 阻塞问题 4.4] “更新为收藏版本”清理本地多出的额外文件，更新后状态回到 clean
test("回归：更新为收藏版本时清理本地新增的额外文件，状态立即回到 clean", () => {
  const filesWithoutStyle: Record<string, string> = {
    "component.json": baseFiles["component.json"],
    "index.js": baseFiles["index.js"],
  };
  const { item: fav, library, origins } = collectComponentInLibrary(
    "TransparentInput",
    filesWithoutStyle,
    "proj-1",
    [],
    emptyOrigins(),
    () => "fav-nostyle",
  );

  // 本地多出了 style.css 和 helper.txt
  const localWithExtra: Record<string, string> = {
    ...filesWithoutStyle,
    "style.css": ":scope { color: red; }\n",
    "helper.txt": "extra file\n",
  };
  assert.notEqual(structHashFromFiles(localWithExtra), fav.hash);

  const replaced = replaceProjectComponentWithLibrary("TransparentInput", fav, origins, localWithExtra) as {
    writtenFiles: Record<string, string>;
    removedFiles?: string[];
    origins: ReturnType<typeof emptyOrigins>;
  };
  assert.ok(Array.isArray(replaced.removedFiles));
  assert.deepEqual(replaced.removedFiles.sort(), ["helper.txt", "style.css"]);

  // 模拟按 removedFiles 删除本地残留文件后重新计算状态
  const diskFilesAfterReplace: Record<string, string> = { ...localWithExtra, ...replaced.writtenFiles };
  for (const rm of replaced.removedFiles) delete diskFilesAfterReplace[rm];
  const rec = reconcileProjectLibrary({ TransparentInput: diskFilesAfterReplace }, library, replaced.origins);
  assert.equal(rec.matchedByLibraryId.get("fav-nostyle")?.status, "clean");
});

// 9. [回归测试 - 阻塞问题 3.2] 拒绝包含路径穿越（.. / 斜杠）的非法控件名或文件名
test("回归：过滤或拒绝包含 ../ 或路径分隔符的非法文件名", () => {
  const maliciousFav = {
    id: "fav-bad",
    type: " SafeButton",
    label: "按钮",
    description: "",
    hash: structHashFromFiles(baseFiles),
    sourceProjectId: "p1",
    files: {
      ...baseFiles,
      "../ui/scene.json": '{"hacked":true}',
      "sub/evil.js": "alert(1)",
    },
  };
  const res = prepareLibraryComponentForProject(maliciousFav, {}, emptyOrigins());
  assert.ok(res.copiedFiles);
  assert.equal("../ui/scene.json" in res.copiedFiles, false);
  assert.equal("sub/evil.js" in res.copiedFiles, false);
  assert.equal(isSafePathSegment("."), false);
  assert.equal(isSafePathSegment(".."), false);
  assert.equal(isSafePathSegment("a/b"), false);
  assert.equal(isSafePathSegment("Valid_Name-1.json"), true);

  // 孤儿来源记录手动重关联与清理
  const orphanOrigins = {
    version: 1 as const,
    origins: { OldDeletedInput: { libraryId: "fav-bad", baseHash: maliciousFav.hash } },
  };
  const relinked = relinkOrphanedOrigin(orphanOrigins, "OldDeletedInput", "NewInput");
  assert.equal(relinked.origins.OldDeletedInput, undefined);
  assert.equal(relinked.origins.NewInput?.libraryId, "fav-bad");
  const removed = removeOrphanedOrigin(relinked, "NewInput");
  assert.equal(Object.keys(removed.origins).length, 0);
});

console.log(`全部 ${passed} 项测试通过`);
