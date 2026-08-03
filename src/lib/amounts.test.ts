import { describe, expect, it } from 'vitest';
import {
  combineAmounts,
  deriveStatus,
  hasAnyByStage,
  splitTaxable,
  summarizeNonMoney,
  sumByStage,
} from '@/lib/amounts';
import { isTaxable, rewardValueKind } from '@/lib/rewardMethod';

const D = new Date('2026-07-01T00:00:00.000Z');

const row = (
  id: string,
  stage: string,
  over: Partial<{
    cents: number;
    quantity: number | null;
    itemDesc: string | null;
    rewardMethod: string | null;
  }> = {},
) => ({
  id,
  stage,
  cents: 0,
  quantity: null,
  itemDesc: null,
  note: null,
  rewardMethod: null,
  occurredAt: D,
  ...over,
});

const noLegacy = {
  predictedCents: null,
  announcedCents: null,
  paidCents: null,
  predictedAt: null,
  announcedAt: null,
  paidAt: null,
  rewardMethod: null,
};

describe('rewardValueKind', () => {
  it('现金与京东卡按金额', () => {
    expect(rewardValueKind('cash')).toBe('money');
    expect(rewardValueKind('jdcard')).toBe('money');
  });

  it('Q币与萝卜币按个数', () => {
    expect(rewardValueKind('qcoin')).toBe('count');
    expect(rewardValueKind('carrotcoin')).toBe('count');
  });

  it('周边与自定义按文字', () => {
    expect(rewardValueKind('merch')).toBe('text');
    expect(rewardValueKind('custom:某某联名礼盒')).toBe('text');
  });

  it('没选方式时按金额 —— 与历史数据一致', () => {
    expect(rewardValueKind(null)).toBe('money');
    expect(rewardValueKind('')).toBe('money');
    expect(rewardValueKind(undefined)).toBe('money');
  });

  it('未知 key 兜底成金额，而不是悄悄从收入里消失', () => {
    expect(rewardValueKind('alipay')).toBe('money');
  });
});

describe('sumByStage · 只累加金额类', () => {
  it('金额条目正常累加', () => {
    const e = combineAmounts(
      [
        row('a', 'paid', { cents: 10000, rewardMethod: 'cash' }),
        row('b', 'paid', { cents: 5000, rewardMethod: 'jdcard' }),
      ],
      noLegacy,
    );
    expect(sumByStage(e, 'paid')).toBe(15000);
  });

  it('个数类不进金额合计 —— 200 个 Q币不是 200 分钱', () => {
    const e = combineAmounts(
      [
        row('a', 'paid', { cents: 10000, rewardMethod: 'cash' }),
        row('b', 'paid', { cents: 0, quantity: 200, rewardMethod: 'qcoin' }),
      ],
      noLegacy,
    );
    expect(sumByStage(e, 'paid')).toBe(10000);
  });

  it('文字类不进金额合计', () => {
    const e = combineAmounts(
      [row('a', 'paid', { itemDesc: '限量手办', rewardMethod: 'merch' })],
      noLegacy,
    );
    expect(sumByStage(e, 'paid')).toBe(0);
  });

  it('即便非金额条目被错误地填了 cents 也不污染合计', () => {
    // 防的是将来某处忘记把 cents 置 0
    const e = combineAmounts(
      [row('a', 'paid', { cents: 99999, quantity: 5, rewardMethod: 'qcoin' })],
      noLegacy,
    );
    expect(sumByStage(e, 'paid')).toBe(0);
  });

  it('阶段之间互不干扰', () => {
    const e = combineAmounts(
      [
        row('a', 'predicted', { cents: 100, rewardMethod: 'cash' }),
        row('b', 'paid', { cents: 200, rewardMethod: 'cash' }),
      ],
      noLegacy,
    );
    expect(sumByStage(e, 'predicted')).toBe(100);
    expect(sumByStage(e, 'paid')).toBe(200);
    expect(sumByStage(e, 'announced')).toBe(0);
  });

  it('旧列兜底条目按金额计入 —— 旧数据只有金额一种形态', () => {
    const e = combineAmounts([], { ...noLegacy, paidCents: 8888, rewardMethod: 'cash' });
    expect(sumByStage(e, 'paid')).toBe(8888);
    expect(e[0].kind).toBe('money');
  });
});

describe('summarizeNonMoney', () => {
  it('个数类按方式分组累加', () => {
    const e = combineAmounts(
      [
        row('a', 'paid', { quantity: 200, rewardMethod: 'qcoin' }),
        row('b', 'paid', { quantity: 50, rewardMethod: 'qcoin' }),
        row('c', 'paid', { quantity: 3, rewardMethod: 'carrotcoin' }),
      ],
      noLegacy,
    );
    const s = summarizeNonMoney(e, 'paid');
    expect(s.find((x) => x.rewardMethod === 'qcoin')).toMatchObject({ kind: 'count', total: 250 });
    expect(s.find((x) => x.rewardMethod === 'carrotcoin')).toMatchObject({ total: 3 });
  });

  it('文字类收集描述并去重', () => {
    const e = combineAmounts(
      [
        row('a', 'paid', { itemDesc: '手办', rewardMethod: 'merch' }),
        row('b', 'paid', { itemDesc: '手办', rewardMethod: 'merch' }),
        row('c', 'paid', { itemDesc: '海报', rewardMethod: 'merch' }),
      ],
      noLegacy,
    );
    const s = summarizeNonMoney(e, 'paid');
    expect(s[0].items).toEqual(['手办', '海报']);
  });

  it('自定义方式各自成组', () => {
    const e = combineAmounts(
      [
        row('a', 'paid', { itemDesc: '礼盒', rewardMethod: 'custom:年会奖品' }),
        row('b', 'paid', { itemDesc: '手办', rewardMethod: 'merch' }),
      ],
      noLegacy,
    );
    expect(summarizeNonMoney(e, 'paid')).toHaveLength(2);
  });

  it('金额条目不出现在非金额汇总里', () => {
    const e = combineAmounts(
      [row('a', 'paid', { cents: 100, rewardMethod: 'cash' })],
      noLegacy,
    );
    expect(summarizeNonMoney(e, 'paid')).toEqual([]);
  });
});

describe('hasAnyByStage / deriveStatus', () => {
  it('非金额条目也算"这个阶段有数据"', () => {
    const e = combineAmounts(
      [row('a', 'announced', { quantity: 10, rewardMethod: 'qcoin' })],
      noLegacy,
    );
    expect(hasAnyByStage(e, 'announced')).toBe(true);
    expect(sumByStage(e, 'announced')).toBe(0); // 金额是 0，但不代表没数据
  });

  it('状态推导不受计量方式影响 —— 发了 Q币也算已到账', () => {
    const e = combineAmounts(
      [row('a', 'paid', { quantity: 200, rewardMethod: 'qcoin' })],
      noLegacy,
    );
    expect(deriveStatus(e)).toBe('paid');
  });
});

describe('splitTaxable · 京东卡不并入税基', () => {
  it('isTaxable：京东卡免税，其它一律应税兜底', () => {
    expect(isTaxable('jdcard')).toBe(false);
    expect(isTaxable('cash')).toBe(true);
    expect(isTaxable(null)).toBe(true); // 兜底应税，防止漏
    expect(isTaxable(undefined)).toBe(true);
    // 非 money 类的 key 理论上被 splitTaxable 用 kind 过滤掉了，
    // 即便直接问也不能算免税
    expect(isTaxable('qcoin')).toBe(true);
    expect(isTaxable('merch')).toBe(true);
    expect(isTaxable('custom:季度奖')).toBe(true);
  });

  it('现金 + 京东卡 分开：现金应税、京东卡免税', () => {
    const e = combineAmounts(
      [
        row('a', 'announced', { cents: 500000, rewardMethod: 'cash' }),
        row('b', 'announced', { cents: 200000, rewardMethod: 'jdcard' }),
      ],
      noLegacy,
    );
    expect(splitTaxable(e, 'announced')).toEqual({
      taxable: 500000,
      nonTaxable: 200000,
    });
  });

  it('只有京东卡 → taxable=0，无需交税', () => {
    const e = combineAmounts(
      [row('a', 'announced', { cents: 300000, rewardMethod: 'jdcard' })],
      noLegacy,
    );
    expect(splitTaxable(e, 'announced')).toEqual({
      taxable: 0,
      nonTaxable: 300000,
    });
  });

  it('只有现金 → 全部计税', () => {
    const e = combineAmounts(
      [row('a', 'announced', { cents: 100000, rewardMethod: 'cash' })],
      noLegacy,
    );
    expect(splitTaxable(e, 'announced')).toEqual({
      taxable: 100000,
      nonTaxable: 0,
    });
  });

  it('非金额条目不出现在拆分里 —— Q币 / 周边不参与税基', () => {
    const e = combineAmounts(
      [
        row('a', 'announced', { cents: 100000, rewardMethod: 'cash' }),
        row('b', 'announced', { quantity: 500, rewardMethod: 'qcoin' }),
        row('c', 'announced', { itemDesc: '手办', rewardMethod: 'merch' }),
      ],
      noLegacy,
    );
    expect(splitTaxable(e, 'announced')).toEqual({
      taxable: 100000,
      nonTaxable: 0,
    });
  });

  it('阶段隔离：announced 的拆分不受 paid 影响', () => {
    const e = combineAmounts(
      [
        row('a', 'announced', { cents: 100000, rewardMethod: 'jdcard' }),
        row('b', 'paid', { cents: 200000, rewardMethod: 'jdcard' }),
      ],
      noLegacy,
    );
    expect(splitTaxable(e, 'announced')).toEqual({
      taxable: 0,
      nonTaxable: 100000,
    });
    expect(splitTaxable(e, 'paid')).toEqual({
      taxable: 0,
      nonTaxable: 200000,
    });
  });

  it('rewardMethod=null（老数据）走应税兜底 —— 与 rewardValueKind 的 money 兜底配对', () => {
    // custom: 前缀的 kind='text'，压根不进 splitTaxable（kind !== 'money' 就跳过），
    // 所以自定义方式的金额行为跟着 sumByStage 走 —— 本身就不参与金额合计
    const e = combineAmounts(
      [row('a', 'announced', { cents: 200000, rewardMethod: null })],
      noLegacy,
    );
    expect(splitTaxable(e, 'announced')).toEqual({
      taxable: 200000,
      nonTaxable: 0,
    });
  });
});
