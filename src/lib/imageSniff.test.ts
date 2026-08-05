import { describe, expect, it } from 'vitest';
import { sniffImage } from './imageSniff';

const bytes = (...vals: number[]) => new Uint8Array(vals);
const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
const concat = (...parts: Uint8Array[]) => {
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

describe('sniffImage 识别真实类型', () => {
  it('JPEG', () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10))).toEqual({
      mime: 'image/jpeg',
      ext: 'jpg',
    });
  });

  it('PNG', () => {
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00))).toEqual({
      mime: 'image/png',
      ext: 'png',
    });
  });

  it('GIF87a 和 GIF89a', () => {
    expect(sniffImage(ascii('GIF87a....'))).toEqual({ mime: 'image/gif', ext: 'gif' });
    expect(sniffImage(ascii('GIF89a....'))).toEqual({ mime: 'image/gif', ext: 'gif' });
  });

  it('WebP（RIFF + 4 字节长度 + WEBP）', () => {
    const webp = concat(ascii('RIFF'), bytes(0x10, 0x00, 0x00, 0x00), ascii('WEBPVP8 '));
    expect(sniffImage(webp)).toEqual({ mime: 'image/webp', ext: 'webp' });
  });
});

describe('sniffImage 拒绝伪装', () => {
  it('HTML 伪装成图片被拒', () => {
    expect(sniffImage(ascii('<html><script>alert(1)</script>'))).toBeNull();
  });

  it('SVG 被拒（可含脚本，不在白名单里）', () => {
    expect(sniffImage(ascii('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
  });

  it('PDF 被拒', () => {
    expect(sniffImage(ascii('%PDF-1.7'))).toBeNull();
  });

  it('空文件与超短文件被拒，不越界读取', () => {
    expect(sniffImage(new Uint8Array(0))).toBeNull();
    expect(sniffImage(bytes(0xff))).toBeNull();
    expect(sniffImage(bytes(0xff, 0xd8))).toBeNull();
    expect(sniffImage(ascii('RIFF'))).toBeNull();
  });

  it('RIFF 但不是 WEBP（例如 wav）被拒', () => {
    const wav = concat(ascii('RIFF'), bytes(0x10, 0x00, 0x00, 0x00), ascii('WAVEfmt '));
    expect(sniffImage(wav)).toBeNull();
  });

  it('PNG 签名少一个字节就不认', () => {
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a))).toBeNull();
  });
});
