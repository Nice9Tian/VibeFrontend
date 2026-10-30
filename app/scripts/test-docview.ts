// 测试文档所见即所得预览（docview.ts）的 Markdown 分块往返、XSS 防护、表格转义与小节末尾换行处理。
// 运行：npm run test:docview
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getSection, replaceSection } from "../src/model.ts";
import {
  bytesToImageDataUrl,
  hydrateDocImagesInElement,
  inlineMarkdownToHtml,
  parseMarkdownBlocks,
  parseTableCells,
  resolveDocImageRelPath,
  serializeBlocks,
} from "../src/docview.ts";

let passed = 0;
const queue: Array<{ name: string; fn: () => void | Promise<void> }> = [];
function test(name: string, fn: () => void | Promise<void>): void {
  queue.push({ name, fn });
}

// 1. [回归测试 - 阻塞问题 1.1] 二次正则替换导致的 <img> 属性逃逸零点击 XSS 探针
test("回归：拦截 ![alt](src) 与 [label](href) 组合的二次正则替换属性逃逸 XSS", () => {
  const payload = "![javascript:alert(1)](x[y)z](x onerror=location=this.alt )";
  const html = inlineMarkdownToHtml(payload);
  assert.equal(/<[^>]*\bonerror\s*=/i.test(html), false, `标签内部不应生成 onerror 属性: ${html}`);
  assert.equal(html.includes('<a href='), false, `图片属性内部不应被二次替换为 <a> 标签: ${html}`);
});

// 2. [回归测试 - 阻塞问题 1.2] 过滤 javascript: / data:text/html 等危险协议链接
test("回归：过滤 [点我](javascript:alert(1)) 等危险协议 URL", () => {
  const jsLink = inlineMarkdownToHtml("[点我](javascript:alert(1))");
  assert.equal(/href="javascript:/i.test(jsLink), false, `不应允许 javascript: 链接: ${jsLink}`);

  const vbLink = inlineMarkdownToHtml("[点我](  vbscript:msgbox(1) )");
  assert.equal(/href="[^"]*vbscript:/i.test(vbLink), false, `不应允许 vbscript: 链接: ${vbLink}`);

  const dataHtmlImg = inlineMarkdownToHtml("![x](javascript:alert(1))");
  assert.equal(/src="javascript:/i.test(dataHtmlImg), false, `不应允许 javascript: 图片: ${dataHtmlImg}`);
});

// 3. [回归测试 - 阻塞问题 1.3] 含 * 的正常 URL 不应被斜体正则破坏
test("回归：URL 中包含 * 时不被斜体正则拆坏，属性保持完整", () => {
  const md = "参考 [链接](https://example.com/a*b) 与 ![图](https://example.com/img*1.png)";
  const html = inlineMarkdownToHtml(md);
  assert.ok(html.includes('href="https://example.com/a*b"'), `href 应保持原样: ${html}`);
  assert.ok(html.includes('data-md-href="https://example.com/a*b"'), `data-md-href 应保持原样: ${html}`);
  assert.ok(html.includes('data-md-src="https://example.com/img*1.png"'), `data-md-src 应保持原样: ${html}`);
  assert.equal(html.includes("<em>"), false, `URL 内的 * 不应触发 <em>: ${html}`);
});

// 4. [回归测试 - 阻塞问题 2.1] 表格单元格含转义竖线 \| 时不丢列
test("回归：parseTableCells 正确解析含 \\| 的单元格，不把转义竖线当作分列符", () => {
  const cells = parseTableCells("| 源码 \\| 预览 | 第二列内容 |");
  assert.deepEqual(cells, ["源码 | 预览", "第二列内容"]);
});

// 5. [回归测试 - 阻塞问题 2.2] getSection 提取的小节末尾块编辑后往返不产生多余空行
test("回归：小节末尾块无结尾换行时，编辑序列化与 replaceSection/getSection 往返保持一致", () => {
  const docFile = [
    "# 页面文档",
    "",
    "<!-- ui-section: lamp -->",
    "## 指示灯",
    "",
    "点击切换亮灭。",
    "<!-- /ui-section -->",
    "",
  ].join("\n");

  const section = getSection(docFile, "lamp")!;
  assert.equal(section, "## 指示灯\n\n点击切换亮灭。");

  const blocks = parseMarkdownBlocks(section);
  const lastBlock = blocks[blocks.length - 1];
  assert.equal(lastBlock.kind, "paragraph");
  assert.equal(lastBlock.trailingNewlines, "");

  // 未改动时往返逐字一致
  assert.equal(serializeBlocks(blocks), section);
  const savedDoc = replaceSection(docFile, "lamp", serializeBlocks(blocks));
  assert.equal(savedDoc, docFile);
  assert.equal(getSection(savedDoc, "lamp"), section);
});

// 6. 整份文档分块解析与未改动块原样保留测试
test("整份 Markdown 文档分块解析后，未修改的块拼接严格等于原文", () => {
  const sample = [
    "# 标题",
    "",
    "<!-- ui-section: btn -->",
    "<!-- 🔒 用户已锁定 -->",
    "## 按钮说明",
    "",
    "- 第一项",
    "  - 缩进子项",
    "- 第二项",
    "",
    "| 模式 | 说明 |",
    "| :--- | :---: |",
    "| 源码 \\| 预览 | 支持直接编辑 |",
    "",
    "```ts",
    "const x = 1;",
    "```",
    "",
    "<div class=\"custom\">原始 HTML</div>",
    "<!-- /ui-section -->",
    "",
  ].join("\n");

  const blocks = parseMarkdownBlocks(sample);
  assert.equal(serializeBlocks(blocks), sample);
});

// 7. 小节级锁定与顶层锁定范围测试
test("小节内的 <!-- 🔒 --> 仅锁定所在小节，不影响同文件其他小节", () => {
  const multiSec = [
    "# 页面总览",
    "",
    "<!-- ui-section: locked_sec -->",
    "<!-- 🔒 已锁定 -->",
    "受保护段落",
    "<!-- /ui-section -->",
    "",
    "<!-- ui-section: open_sec -->",
    "可编辑段落",
    "<!-- /ui-section -->",
  ].join("\n");

  const blocks = parseMarkdownBlocks(multiSec);
  const topHeading = blocks.find((b) => b.kind === "heading")!;
  const lockedPara = blocks.find((b) => b.kind === "paragraph" && b.raw.includes("受保护段落"))!;
  const openPara = blocks.find((b) => b.kind === "paragraph" && b.raw.includes("可编辑段落"))!;
  assert.equal(topHeading.locked, false);
  assert.equal(lockedPara.locked, true);
  assert.equal(openPara.locked, false);
});

// 8. 相对路径图片按文档所在目录解析，且 data-md-src 保留原始相对路径
test("相对路径图片按文档所在目录解析 src，同时 data-md-src 保留原始相对路径", () => {
  const html = inlineMarkdownToHtml("![示意](../assets/a.png)", "docs/按钮.md");
  assert.ok(html.includes('src="/__fs/read?path=assets%2Fa.png"'), `应按 docs/ 目录解析相对路径: ${html}`);
  assert.ok(html.includes('data-md-src="../assets/a.png"'), `data-md-src 应保留原始相对路径: ${html}`);
});

// 9. [回归测试 - 复审新发现 2] 相对路径图片在打包 Tauri 桌面版和二进制 PNG/JPG 下均能显示，开发模式按二进制返回且路径校验不放松
test("回归：相对路径二进制 PNG/JPG 在 Tauri 桌面版与开发模式下均能正确加载且路径校验不放松", async () => {
  // (a) inlineMarkdownToHtml 应同时生成 data-doc-rel 供 Tauri 桌面版按项目内相对路径读取二进制图片
  const htmlPng = inlineMarkdownToHtml("![PNG图](../assets/icon.png)", "docs/按钮.md");
  const htmlJpg = inlineMarkdownToHtml("![JPG图](./photo.jpg)", "docs/按钮.md");
  assert.ok(htmlPng.includes('data-doc-rel="assets/icon.png"'), `应标记 data-doc-rel="assets/icon.png": ${htmlPng}`);
  assert.ok(htmlJpg.includes('data-doc-rel="docs/photo.jpg"'), `应标记 data-doc-rel="docs/photo.jpg": ${htmlJpg}`);

  // (b) 路径校验不放松：越出项目根目录的相对路径、绝对路径或盘符不得生成有效 src 或 data-doc-rel
  const htmlEscape = inlineMarkdownToHtml("![越界](../../secret.png)", "docs/按钮.md");
  assert.ok(htmlEscape.includes('src=""'), `越出项目根目录的路径应被拒绝: ${htmlEscape}`);
  assert.equal(htmlEscape.includes("data-doc-rel="), false, `越出项目根目录的路径不应生成 data-doc-rel: ${htmlEscape}`);
  assert.equal(resolveDocImageRelPath("../../secret.png", "docs/按钮.md"), "");
  assert.equal(resolveDocImageRelPath("C:\\secret.png", "docs/按钮.md"), "");

  // (c) 二进制 PNG / JPG（含非 UTF-8 字节 0x89, 0xff, 0xd8 等）编码为 Data URL 后字节完全无损，且 Tauri 桌面版水合后保留 data-md-src
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x00, 0x80]);
  const jpgBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xd9]);
  const pngDataUrl = bytesToImageDataUrl(pngBytes, "assets/icon.png");
  const jpgDataUrl = bytesToImageDataUrl(jpgBytes, "docs/photo.jpg");
  assert.ok(pngDataUrl?.startsWith("data:image/png;base64,"), `PNG Data URL 前缀错误: ${pngDataUrl}`);
  assert.ok(jpgDataUrl?.startsWith("data:image/jpeg;base64,"), `JPG Data URL 前缀错误: ${jpgDataUrl}`);
  assert.deepEqual(new Uint8Array(Buffer.from(pngDataUrl!.split(",")[1], "base64")), pngBytes);
  assert.deepEqual(new Uint8Array(Buffer.from(jpgDataUrl!.split(",")[1], "base64")), jpgBytes);

  // 验证 hydrateDocImagesInElement 对合法相对路径写入 Data URL、保留 data-md-src，且拒绝非法路径
  const makeMockImg = (rel: string, mdSrc: string) => {
    const attrs = new Map<string, string>([
      ["data-doc-rel", rel],
      ["data-md-src", mdSrc],
      ["src", `/__fs/read?path=${encodeURIComponent(rel)}`],
    ]);
    return {
      getAttribute: (k: string) => attrs.get(k) ?? null,
      setAttribute: (k: string, v: string) => {
        attrs.set(k, v);
      },
    };
  };
  const mockPng = makeMockImg("assets/icon.png", "../assets/icon.png");
  const mockJpg = makeMockImg("docs/photo.jpg", "./photo.jpg");
  const mockEvil = makeMockImg("../outside.png", "../outside.png");
  const mockRoot = {
    querySelectorAll: () => [mockPng, mockJpg, mockEvil],
  } as unknown as ParentNode;
  await hydrateDocImagesInElement(mockRoot, async (rel) => {
    if (rel === "assets/icon.png") return pngDataUrl;
    if (rel === "docs/photo.jpg") return jpgDataUrl;
    return "data:image/png;base64,AAAA";
  });
  assert.equal(mockPng.getAttribute("src"), pngDataUrl);
  assert.equal(mockPng.getAttribute("data-md-src"), "../assets/icon.png");
  assert.equal(mockJpg.getAttribute("src"), jpgDataUrl);
  assert.equal(mockJpg.getAttribute("data-md-src"), "./photo.jpg");
  assert.equal(mockEvil.getAttribute("src"), "/__fs/read?path=..%2Foutside.png");

  // (d) vite.config.ts 开发模式读取接口不能再用 readFileSync(full, "utf8") 破坏二进制图片
  const viteConfigText = fs.readFileSync(path.resolve("vite.config.ts"), "utf8");
  assert.equal(
    viteConfigText.includes('readFileSync(full, "utf8")'),
    false,
    "vite.config.ts 的 /__fs/read 不应再用 UTF-8 文本模式读取二进制图片",
  );
  assert.ok(viteConfigText.includes("image/png") && viteConfigText.includes("image/jpeg"), "vite.config.ts 应返回二进制图片 MIME 类型");
});

for (const item of queue) {
  await item.fn();
  passed++;
  console.log(`PASS ${item.name}`);
}
console.log(`全部 ${passed} 项测试通过`);
