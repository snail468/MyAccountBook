import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  isWorthKeeping,
  MAX_EDGE,
  shouldCompress,
  SKIP_BELOW_BYTES,
  targetDimensions,
} from '@/lib/imageCompress';

describe('targetDimensions', () => {
  it('在上限内的图不放大', () => {
    expect(targetDimensions(800, 600)).toEqual({ width: 800, height: 600 });
    expect(targetDimensions(MAX_EDGE, 900)).toEqual({ width: MAX_EDGE, height: 900 });
  });

  it('按长边等比缩放 —— 横图', () => {
    // 4000×3000 → 长边 1600，短边等比 1200
    expect(targetDimensions(4000, 3000)).toEqual({ width: 1600, height: 1200 });
  });

  it('按长边等比缩放 —— 竖图', () => {
    expect(targetDimensions(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });

  it('保持宽高比（允许取整误差 1px）', () => {
    const src = { w: 4032, h: 3024 }; // iPhone 12MP
    const out = targetDimensions(src.w, src.h);
    const srcRatio = src.w / src.h;
    const outRatio = out.width / out.height;
    expect(Math.abs(srcRatio - outRatio)).toBeLessThan(0.01);
  });

  it('极端细长图的短边不会被算成 0', () => {
    const out = targetDimensions(10000, 3);
    expect(out.width).toBe(1600);
    expect(out.height).toBeGreaterThanOrEqual(1);
  });

  it('非法尺寸不抛错', () => {
    expect(targetDimensions(0, 0)).toEqual({ width: 1, height: 1 });
    expect(targetDimensions(-5, 100)).toEqual({ width: 1, height: 1 });
  });

  it('可以自定义长边上限', () => {
    expect(targetDimensions(2000, 1000, 500)).toEqual({ width: 500, height: 250 });
  });
});

describe('shouldCompress', () => {
  it('大的 jpeg/png/webp 要压', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(shouldCompress({ type, size: 5 * 1024 * 1024 })).toBe(true);
    }
  });

  it('GIF 一律不碰 —— canvas 只能拿到第一帧，压完动图就死了', () => {
    expect(shouldCompress({ type: 'image/gif', size: 8 * 1024 * 1024 })).toBe(false);
  });

  it('本来就小的图不折腾', () => {
    expect(shouldCompress({ type: 'image/jpeg', size: SKIP_BELOW_BYTES })).toBe(false);
    expect(shouldCompress({ type: 'image/jpeg', size: SKIP_BELOW_BYTES - 1 })).toBe(false);
    expect(shouldCompress({ type: 'image/jpeg', size: SKIP_BELOW_BYTES + 1 })).toBe(true);
  });

  it('非图片类型不处理', () => {
    expect(shouldCompress({ type: 'application/pdf', size: 9 * 1024 * 1024 })).toBe(false);
    expect(shouldCompress({ type: '', size: 9 * 1024 * 1024 })).toBe(false);
  });

  it('阈值可自定义', () => {
    expect(shouldCompress({ type: 'image/jpeg', size: 1000 }, 500)).toBe(true);
  });
});

describe('isWorthKeeping', () => {
  it('压小了才要', () => {
    expect(isWorthKeeping(1000, 400)).toBe(true);
  });

  it('压完反而更大就用原图', () => {
    expect(isWorthKeeping(1000, 1200)).toBe(false);
    expect(isWorthKeeping(1000, 1000)).toBe(false);
  });

  it('空结果不采用', () => {
    expect(isWorthKeeping(1000, 0)).toBe(false);
  });
});

describe('formatBytes', () => {
  it('按量级切换单位', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
