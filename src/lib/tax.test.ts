import { describe, expect, it } from 'vitest';
import {
  afterTaxCents,
  calcTaxCents,
  DEFAULT_TAX_BRACKETS,
  parseBrackets,
  TaxConfigError,
  validateBrackets,
  type TaxBracket,
} from './tax';

const yuan = (n: number) => Math.round(n * 100);

describe('calcTaxCents 档位边界', () => {
  it('0 与负数不计税', () => {
    expect(calcTaxCents(0)).toBe(0);
    expect(calcTaxCents(-100)).toBe(0);
  });

  it('800 元及以下免征', () => {
    expect(calcTaxCents(yuan(1))).toBe(0);
    expect(calcTaxCents(yuan(799.99))).toBe(0);
    expect(calcTaxCents(yuan(800))).toBe(0);
  });

  it('刚过 800 元只对超出部分计税', () => {
    // (800.01 - 800) * 20% = 0.002 元 → 0 分（四舍五入）
    expect(calcTaxCents(yuan(800) + 1)).toBe(0);
    // 1000 元 → (1000-800)*20% = 40 元
    expect(calcTaxCents(yuan(1000))).toBe(yuan(40));
  });

  it('800–4000 档上界', () => {
    // 4000 元 → (4000-800)*20% = 640 元
    expect(calcTaxCents(yuan(4000))).toBe(yuan(640));
  });

  it('跨入 4000–25000 档', () => {
    // 4000.01 元 → 4000.01 * 16% = 640.0016 → 640.00 元
    expect(calcTaxCents(yuan(4000) + 1)).toBe(64000);
    // 25000 元 → 25000 * 16% = 4000 元
    expect(calcTaxCents(yuan(25000))).toBe(yuan(4000));
  });

  it('跨入 25000–62500 档', () => {
    // 25000.01 → 25000.01*24% - 2000 = 4000.0024 → 4000.00 元
    expect(calcTaxCents(yuan(25000) + 1)).toBe(400000);
    // 62500 → 62500*24% - 2000 = 13000 元
    expect(calcTaxCents(yuan(62500))).toBe(yuan(13000));
  });

  it('最高档无上界', () => {
    // 62500.01 → 62500.01*32% - 7000 = 13000.0032 → 13000.00 元
    expect(calcTaxCents(yuan(62500) + 1)).toBe(1300000);
    // 100000 → 100000*32% - 7000 = 25000 元
    expect(calcTaxCents(yuan(100000))).toBe(yuan(25000));
  });

  it('档位切换处不出现税额倒挂（多赚一分不该少交税）', () => {
    for (const boundary of [800, 4000, 25000, 62500]) {
      const before = calcTaxCents(yuan(boundary));
      const after = calcTaxCents(yuan(boundary) + 1);
      expect(after).toBeGreaterThanOrEqual(before);
    }
  });

  it('税额单调不减', () => {
    let prev = 0;
    for (let y = 0; y <= 200000; y += 137) {
      const t = calcTaxCents(yuan(y));
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });

  it('税额永不超过收入，也永不为负', () => {
    for (const y of [0.01, 1, 799, 801, 3999, 4001, 24999, 62501, 1000000]) {
      const income = yuan(y);
      const tax = calcTaxCents(income);
      expect(tax).toBeGreaterThanOrEqual(0);
      expect(tax).toBeLessThanOrEqual(income);
    }
  });

  it('超大额不溢出', () => {
    const income = yuan(100000000);
    expect(calcTaxCents(income)).toBeLessThanOrEqual(income);
  });
});

describe('afterTaxCents', () => {
  it('税前减税额', () => {
    const income = yuan(1000);
    expect(afterTaxCents(income)).toBe(income - calcTaxCents(income));
  });

  it('税后金额非负', () => {
    for (const y of [0.01, 800, 4000, 62500, 999999]) {
      expect(afterTaxCents(yuan(y))).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('自定义档位', () => {
  const flat: TaxBracket[] = [{ upToCents: null, rate: 0.1, base: 'full' }];

  it('可以传入自定义档位表', () => {
    expect(calcTaxCents(yuan(1000), flat)).toBe(yuan(100));
  });

  it('reduced 基数按 80% 计税', () => {
    const reduced: TaxBracket[] = [{ upToCents: null, rate: 0.2, base: 'reduced' }];
    // 1000 * 0.8 * 0.2 = 160
    expect(calcTaxCents(yuan(1000), reduced)).toBe(yuan(160));
  });

  it('validateBrackets 拒绝非法表', () => {
    expect(() => validateBrackets([])).toThrow(TaxConfigError);
    // 最后一档必须无上界
    expect(() => validateBrackets([{ upToCents: 100, rate: 0.1, base: 'full' }])).toThrow(
      /无上界/,
    );
    // 上界必须递增
    expect(() =>
      validateBrackets([
        { upToCents: 500, rate: 0.1, base: 'full' },
        { upToCents: 200, rate: 0.2, base: 'full' },
        { upToCents: null, rate: 0.3, base: 'full' },
      ]),
    ).toThrow(/递增/);
    // 税率越界
    expect(() => validateBrackets([{ upToCents: null, rate: 1.5, base: 'full' }])).toThrow(
      /税率/,
    );
  });

  it('validateBrackets 接受默认表', () => {
    expect(() => validateBrackets(DEFAULT_TAX_BRACKETS)).not.toThrow();
  });

  it('parseBrackets 非法 JSON 回落默认', () => {
    expect(parseBrackets(null)).toBe(DEFAULT_TAX_BRACKETS);
    expect(parseBrackets('not json')).toBe(DEFAULT_TAX_BRACKETS);
    expect(parseBrackets('{"a":1}')).toBe(DEFAULT_TAX_BRACKETS);
    // 结构合法但档位非法 → 也回落
    expect(parseBrackets('[{"upToCents":100,"rate":0.1,"base":"full"}]')).toBe(
      DEFAULT_TAX_BRACKETS,
    );
  });

  it('parseBrackets 接受合法自定义表', () => {
    const parsed = parseBrackets(JSON.stringify(flat));
    expect(parsed).toHaveLength(1);
    expect(calcTaxCents(yuan(1000), parsed)).toBe(yuan(100));
  });
});
