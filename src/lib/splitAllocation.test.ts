import { describe, expect, it } from 'vitest';
import {
  allocateByWeight,
  allocateEvenly,
  SplitAllocationError,
  validateExactShares,
} from './splitAllocation';

const sum = (rows: { shareCents: number }[]) => rows.reduce((a, r) => a + r.shareCents, 0);

describe('allocateEvenly', () => {
  it('整除时人人相同', () => {
    const r = allocateEvenly(30000, ['a', 'b', 'c']);
    expect(r.map((x) => x.shareCents)).toEqual([10000, 10000, 10000]);
  });

  it('不能整除时余数分给前几个，总额守恒', () => {
    // 100 分 / 3 人 = 33.33...，余 1 分
    const r = allocateEvenly(100, ['a', 'b', 'c']);
    expect(sum(r)).toBe(100);
    expect(r.map((x) => x.shareCents).sort((a, b) => b - a)).toEqual([34, 33, 33]);
  });

  it('1 分钱 3 个人也不丢', () => {
    const r = allocateEvenly(1, ['a', 'b', 'c']);
    expect(sum(r)).toBe(1);
    expect(r.filter((x) => x.shareCents === 1)).toHaveLength(1);
  });

  it('单人承担全部', () => {
    expect(allocateEvenly(12345, ['solo'])).toEqual([{ memberId: 'solo', shareCents: 12345 }]);
  });

  it('0 元也能分（全员 0）', () => {
    const r = allocateEvenly(0, ['a', 'b']);
    expect(sum(r)).toBe(0);
  });

  it('大额多人：任意人数下总额都守恒', () => {
    for (let n = 1; n <= 50; n++) {
      const ids = Array.from({ length: n }, (_, i) => `m${i}`);
      for (const total of [1, 7, 99, 100, 12345, 999999, 100000000]) {
        expect(sum(allocateEvenly(total, ids))).toBe(total);
      }
    }
  });

  it('同样输入必须得到同样输出（幂等，便于对账）', () => {
    const ids = ['zoe', 'adam', 'mia'];
    const a = allocateEvenly(1000, ids);
    const b = allocateEvenly(1000, ids);
    expect(a).toEqual(b);
  });
});

describe('allocateByWeight', () => {
  it('按比例分配且守恒', () => {
    const r = allocateByWeight(1000, [
      { memberId: 'a', weight: 1 },
      { memberId: 'b', weight: 3 },
    ]);
    expect(sum(r)).toBe(1000);
    expect(r.find((x) => x.memberId === 'a')!.shareCents).toBe(250);
    expect(r.find((x) => x.memberId === 'b')!.shareCents).toBe(750);
  });

  it('权重除不尽时仍守恒', () => {
    const r = allocateByWeight(100, [
      { memberId: 'a', weight: 1 },
      { memberId: 'b', weight: 1 },
      { memberId: 'c', weight: 1 },
    ]);
    expect(sum(r)).toBe(100);
  });

  it('小数权重也支持', () => {
    const r = allocateByWeight(10000, [
      { memberId: 'a', weight: 0.5 },
      { memberId: 'b', weight: 1.5 },
    ]);
    expect(sum(r)).toBe(10000);
    expect(r.find((x) => x.memberId === 'a')!.shareCents).toBe(2500);
  });

  it('权重为 0 的成员分到 0，但仍出现在结果里', () => {
    const r = allocateByWeight(1000, [
      { memberId: 'a', weight: 1 },
      { memberId: 'b', weight: 0 },
    ]);
    expect(sum(r)).toBe(1000);
    expect(r.find((x) => x.memberId === 'b')!.shareCents).toBe(0);
  });

  it('负总额（退款场景）也守恒', () => {
    const r = allocateByWeight(-100, [
      { memberId: 'a', weight: 1 },
      { memberId: 'b', weight: 1 },
      { memberId: 'c', weight: 1 },
    ]);
    expect(sum(r)).toBe(-100);
  });

  it('拒绝空成员列表', () => {
    expect(() => allocateByWeight(100, [])).toThrow(SplitAllocationError);
  });

  it('拒绝权重全为 0', () => {
    expect(() =>
      allocateByWeight(100, [
        { memberId: 'a', weight: 0 },
        { memberId: 'b', weight: 0 },
      ]),
    ).toThrow(/权重总和/);
  });

  it('拒绝负权重与 NaN', () => {
    expect(() => allocateByWeight(100, [{ memberId: 'a', weight: -1 }])).toThrow(
      SplitAllocationError,
    );
    expect(() => allocateByWeight(100, [{ memberId: 'a', weight: NaN }])).toThrow(
      SplitAllocationError,
    );
  });

  it('拒绝重复成员', () => {
    expect(() =>
      allocateByWeight(100, [
        { memberId: 'a', weight: 1 },
        { memberId: 'a', weight: 1 },
      ]),
    ).toThrow(/重复/);
  });

  it('拒绝非整数总额', () => {
    expect(() => allocateByWeight(10.5, [{ memberId: 'a', weight: 1 }])).toThrow(/整数/);
  });
});

describe('validateExactShares', () => {
  it('和值相等时通过', () => {
    expect(
      validateExactShares(1000, [
        { memberId: 'a', shareCents: 400 },
        { memberId: 'b', shareCents: 600 },
      ]),
    ).toEqual({ ok: true });
  });

  it('差 1 分也拒绝 —— 不再有容差', () => {
    const r = validateExactShares(1000, [
      { memberId: 'a', shareCents: 400 },
      { memberId: 'b', shareCents: 599 },
    ]);
    expect(r.ok).toBe(false);
  });

  it('拒绝空列表和重复成员', () => {
    expect(validateExactShares(0, []).ok).toBe(false);
    expect(
      validateExactShares(200, [
        { memberId: 'a', shareCents: 100 },
        { memberId: 'a', shareCents: 100 },
      ]).ok,
    ).toBe(false);
  });
});
