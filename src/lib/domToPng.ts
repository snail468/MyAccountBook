// 纯前端、零依赖地把一个 SVG 元素导出成 PNG Blob。
//
// 为什么不用 html-to-image / dom-to-image / node-canvas：
//   * 本项目离线优先，不想为一张结算单引入额外依赖；
//   * 用 <foreignObject> 把 HTML 画进 canvas 会因外部资源/CSS 触发
//     canvas taint（toBlob 抛 SecurityError）。本工具只吃**纯 SVG**
//     （rect / text / line / path），无外部引用 ⇒ 不会污染，离线可用。
//
// 调用方负责传入一个"自包含"的 SVG（颜色全部内联，不依赖外部 CSS/字体），
// 否则导出结果可能丢失样式。

export async function svgElementToPng(svg: SVGSVGElement, scale = 2): Promise<Blob> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  const vb = svg.viewBox.baseVal;
  const w = vb && vb.width ? vb.width : svg.clientWidth || 480;
  const h = vb && vb.height ? vb.height : svg.clientHeight || 600;
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));

  const xml = new XMLSerializer().serializeToString(clone);
  const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);

  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('结算单图片渲染失败'));
    img.src = src;
  });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前环境不支持 canvas');
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('结算单图片生成失败'))),
      'image/png',
    );
  });
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 给浏览器一点时间触发下载再回收
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
