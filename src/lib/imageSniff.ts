// 图片真伪校验 —— 只信任文件内容的魔数，不信任客户端给的 MIME。
//
// 原来上传接口只看 file.type，那是浏览器（或攻击者的脚本）随口说的。
// 配上 nosniff 头风险不高，但一个伪装成 image/png 的 HTML 文件躺在
// 上传目录里，终究是个隐患。

export type SniffedImage = { mime: string; ext: string };

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const GIF87 = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61];
const GIF89 = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[offset + i] !== sig[i]) return false;
  }
  return true;
}

function isAscii(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * 识别图片真实类型。识别不出返回 null —— 调用方应当拒绝该文件。
 * 支持 jpg / png / gif / webp，与上传接口允许的类型一致。
 */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  if (startsWith(bytes, JPEG)) return { mime: 'image/jpeg', ext: 'jpg' };
  if (startsWith(bytes, PNG)) return { mime: 'image/png', ext: 'png' };
  if (startsWith(bytes, GIF87) || startsWith(bytes, GIF89)) {
    return { mime: 'image/gif', ext: 'gif' };
  }
  // WebP: "RIFF" + 4 字节长度 + "WEBP"
  if (isAscii(bytes, 0, 'RIFF') && isAscii(bytes, 8, 'WEBP')) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}
