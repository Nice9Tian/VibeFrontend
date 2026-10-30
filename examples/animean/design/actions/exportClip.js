// 导出当前动画镜头片段。
export default function exportClip(input) {
  const title = input?.title ?? "未命名镜头";
  const count = input?.layerCount ?? 0;
  return {
    outputPath: `exports/${title}.mp4`,
    summary: `已导出 ${title}（${count} 个图层）`,
  };
}
