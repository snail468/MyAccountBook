import { describe, expect, it } from 'vitest';
import {
  isPlausibleCardNumber,
  last4Of,
  maskCardNumber,
  normalizeCardNumber,
} from '@/lib/cardFormat';

describe('normalizeCardNumber', () => {
  it('去掉空格与连字符 —— 用户抄卡号时习惯四位一组', () => {
    expect(normalizeCardNumber('6222 0212 3456 7890')).toBe('6222021234567890');
    expect(normalizeCardNumber('6222-0212-3456-7890')).toBe('6222021234567890');
    expect(normalizeCardNumber(' 6222 - 0212 ')).toBe('62220212');
  });

  it('已经规整的原样返回', () => {
    expect(normalizeCardNumber('6222021234567890')).toBe('6222021234567890');
  });
});

describe('isPlausibleCardNumber', () => {
  it('接受 8-24 位纯数字', () => {
    expect(isPlausibleCardNumber('12345678')).toBe(true);
    expect(isPlausibleCardNumber('6222021234567890')).toBe(true);
    expect(isPlausibleCardNumber('1'.repeat(24))).toBe(true);
  });

  it('拒绝过短过长', () => {
    expect(isPlausibleCardNumber('1234567')).toBe(false);
    expect(isPlausibleCardNumber('1'.repeat(25))).toBe(false);
    expect(isPlausibleCardNumber('')).toBe(false);
  });

  it('拒绝非数字 —— 规整应该在校验之前做', () => {
    expect(isPlausibleCardNumber('6222 0212 3456 7890')).toBe(false);
    expect(isPlausibleCardNumber('abcd12345678')).toBe(false);
  });

  it('刻意不做 Luhn 校验 —— 虚拟卡/储值卡不一定满足', () => {
    // 4111111111111112 是 Luhn 校验失败的号码，这里应当照收
    expect(isPlausibleCardNumber('4111111111111112')).toBe(true);
  });
});

describe('last4Of / maskCardNumber', () => {
  it('取后四位', () => {
    expect(last4Of('6222021234567890')).toBe('7890');
  });

  it('位数不足时不越界', () => {
    expect(last4Of('123')).toBe('123');
  });

  it('打码只露后四位', () => {
    const masked = maskCardNumber('7890');
    expect(masked).toBe('**** **** **** 7890');
    expect(masked).not.toContain('6222');
  });
});
