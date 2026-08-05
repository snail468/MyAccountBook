// 上传前的客户端图片压缩。
//
// 起因：单张放行 8MB 原图，而列表页把原图直接塞进 32×32 的缩略框。
// 手机随手拍几张就是几十 MB —— 上传慢、流量费、列表页每次都要重新下载。
// 现代手机拍一张 12MP JPEG 约 4~6MB，缩到长边 1600px 后通常只有 200~400KB，
// 而记账小票、活动截图这类内容在 1600px 下完全够看。
//
// 三条硬性原则：
//   1. **压缩失败绝不阻断上传** —— 任何异常都退回原文件，宁可传大图也不能传不上去
//   2. **压完更大就用原图** —— 已经压过的小图重新编码经常会变大
//   3. **GIF 一律不碰** —— canvas 只能拿到第一帧，压完动图就死了
//
// canvas 部分依赖浏览器 API，纯计算部分（尺寸换算、是否值得压）拆成了纯函数，
// 单独进单测。

/** 压缩后的长边上限。1600 是「够看」与「够小」的平衡点 */
export const MAX_EDGE = 1600;

/** 小于这个体积的直接放行 —— 再压省不下多少，不值得付出解码开销 */
export const SKIP_BELOW_BYTES = 300 * 1024;

/** JPEG/WebP 编码质量 */
export const QUALITY = 0.82;

/**
 * 按长边上限等比缩放。已经在上限内的返回原尺寸（不放大）。
 * 结果取整且至少为 1，避免 canvas 拿到 0 宽高直接抛错。
 */
export function targetDimensions(
  width: number,
  height: number,
  maxEdge: number = MAX_EDGE,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 1, height: 1 };
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * 这个文件值不值得压。
 *
 * GIF 排除的原因见文件头；非图片类型不该走到这里，但防一手。
 */
export function shouldCompress(
  file: { type: string; size: number },
  skipBelow: number = SKIP_BELOW_BYTES,
): boolean {
  if (!file.type.startsWith('image/')) return false;
  if (file.type === 'image/gif') return false;
  if (file.size <= skipBelow) return false;
  return true;
}

/**
 * 压完之后是否采用。比原图还大就别用了 ——
 * 对已经压过的图重新编码，这种情况相当常见。
 */
export function isWorthKeeping(originalSize: number, compressedSize: number): boolean {
  return compressedSize > 0 && compressedSize < originalSize;
}

/** 输出格式：能编 webp 就用 webp，否则退回 jpeg。png 的透明通道会丢，但小票截图不在乎 */
function pickOutputType(): 'image/webp' | 'image/jpeg' {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').startsWith('data:image/webp')
      ? 'image/webp'
      : 'image/jpeg';
  } catch {
    return 'image/jpeg';
  }
}

function replaceExt(name: string, type: string): string {
  const ext = type === 'image/webp' ? 'webp' : 'jpg';
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}.${ext}`;
}

/** 把 File 解码成可绘制的位图。优先 createImageBitmap（省一次 DOM 往返） */
async function decode(file: File): Promise<{ bitmap: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    return {
      bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  }
  // Safari 老版本没有 createImageBitmap，退回 <img> + objectURL
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('图片解码失败'));
      el.src = url;
    });
    return {
      bitmap: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

/**
 * 压缩一张图。**任何失败都返回原文件**，调用方不需要 try/catch。
 *
 * @returns 压缩后的 File，或原文件（不值得压 / 压不动 / 压完更大 / 出错）
 */
export async function compressImage(file: File, maxEdge: number = MAX_EDGE): Promise<File> {
  if (!shouldCompress(file)) return file;

  let handle: Awaited<ReturnType<typeof decode>> | null = null;
  try {
    handle = await decode(file);
    const { width, height } = targetDimensions(handle.width, handle.height, maxEdge);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(handle.bitmap, 0, 0, width, height);

    const type = pickOutputType();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, QUALITY),
    );
    if (!blob) return file;
    if (!isWorthKeeping(file.size, blob.size)) return file;

    return new File([blob], replaceExt(file.name, type), {
      type,
      lastModified: file.lastModified,
    });
  } catch {
    // 解码失败、canvas 被隐私模式禁用、内存不足…… 一律用原图，不打断用户
    return file;
  } finally {
    handle?.close();
  }
}

/** 人类可读的体积，用于给用户看「省了多少」 */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
