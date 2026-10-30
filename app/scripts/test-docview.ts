// 测试文档所见即所得预览（docview.ts）的 Markdown 分块往返、XSS 防护、表格转义与小节末尾换行处理。
// 运行：npm run test:docview
import assert from "node:assert/strict";
import { getSection, replaceSection } from "../src/model.ts";
import {
  inlineMarkdownToHtml,
  parseMarkdownBlocks,
  parseTableCells,
  serializeBlocks,
} from "../src/docview.ts";

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed++;
  console.log(`PASS ${name}`);
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

console.log(`全部 ${passed} 项测试通过`);
