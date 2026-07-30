import { describe, expect, it } from 'vitest';
import { formatYuan, yuanToCents } from './money';

describe('yuanToCents', () => {
  it('整数元', () => {
    expect(yuanToCents('0')).toBe(0);
    expect(yuanToCents('1')).toBe(100);
    expect(yuanToCents('1000')).toBe(100000);
  });

  it('一位和两位小数', () => {
    expect(yuanToCents('1.5')).toBe(150);
    expect(yuanToCents('1.05')).toBe(105);
    expect(yuanToCents('0.01')).toBe(1);
    expect(yuanToCents('0.1')).toBe(10);
  });

  it('去除首尾空格', () => {
    expect(yuanToCents('  12.34  ')).toBe(1234);
  });

  it('不产生浮点误差 —— 经典的 0.1+0.2 陷阱', () => {
    // 用 Math.round(x*100) 实现的话 8.115 这类值会出错；这里是字符串解析
    expect(yuanToCents('8.11')).toBe(811);
    expect(yuanToCents('19.99')).toBe(1999);
    expect(yuanToCents('0.29')).toBe(29);
  });

  it('拒绝非法输入', () => {
    for (const bad of ['', ' ', 'abc', '1.234', '-1', '-0.5', '1.', '.5', '1e3', '１２３', '1,000']) {
      expect(yuanToCents(bad)).toBeNull();
    }
  });
});

describe('formatYuan', () => {
  it('基本格式带两位小数', () => {
    expect(formatYuan(0)).toBe('0.00');
    expect(formatYuan(1)).toBe('0.01');
    expect(formatYuan(100)).toBe('1.00');
    expect(formatYuan(1234)).toBe('12.34');
  });

  it('千分位分组', () => {
    expect(formatYuan(100000)).toBe('1,000.00');
    expect(formatYuan(123456789)).toBe('1,234,567.89');
  });

  it('负数带负号', () => {
    expect(formatYuan(-1234)).toBe('-12.34');
  });

  it('sign 选项给正数加正号', () => {
    expect(formatYuan(1234, { sign: true })).toBe('+12.34');
    expect(formatYuan(-1234, { sign: true })).toBe('-12.34');
    expect(formatYuan(0, { sign: true })).toBe('+0.00');
  });

  it('与 yuanToCents 互为逆运算（formatYuan 带千分位，比较时去掉逗号）', () => {
    for (const s of ['0.00', '0.01', '1.00', '12.34', '9999.99', '1234567.89']) {
      const cents = yuanToCents(s);
      expect(cents).not.toBeNull();
      expect(formatYuan(cents!).replace(/,/g, '')).toBe(s);
    }
  });
});
