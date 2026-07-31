import { describe, expect, it } from 'vitest';
import {
  bucketByMonth,
  categoryShare,
  monthKeyOf,
  monthOverMonth,
  normalizeSeries,
  recentMonthKeys,
  totals,
  windowStart,
  yearOverYear,
  type StatRow,
} from '@/lib/stats';

const row = (
  iso: string,
  cents: number,
  direction: 'income' | 'expense' = 'expense',
  category = '吃饭',
): StatRow => ({
  occurredAt: new Date(iso),
  amountCents: cents,
  direction,
  category,
  sourceLabel: '普通账本',
});

describe('monthKeyOf', () => {
  it('补零到两位', () => {
    expect(monthKeyOf(new Date(2026, 0, 15))).toBe('2026-01');
    expect(monthKeyOf(new Date(2026, 11, 1))).toBe('2026-12');
  });
});

describe('recentMonthKeys', () => {
  it('升序、含当月', () => {
    const keys = recentMonthKeys(new Date(2026, 6, 15), 3);
    expect(keys).toEqual(['2026-05', '2026-06', '2026-07']);
  });

  it('跨年正确', () => {
    expect(recentMonthKeys(new Date(2026, 1, 10), 4)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('31 号往前推不会跳月 —— JS Date 的经典陷阱', () => {
    // new Date(2026, 2, 31) 减一个月若不置 1 号会落到 3 月 3 日
    const keys = recentMonthKeys(new Date(2026, 2, 31), 2);
    expect(keys).toEqual(['2026-02', '2026-03']);
  });

  it('count=1 只返回当月', () => {
    expect(recentMonthKeys(new Date(2026, 6, 1), 1)).toEqual(['2026-07']);
  });
});

describe('windowStart', () => {
  it('指向窗口第一个月的 1 号零点', () => {
    const s = windowStart(new Date(2026, 6, 20, 13, 45), 3);
    expect(s.getFullYear()).toBe(2026);
    expect(s.getMonth()).toBe(4); // 5 月
    expect(s.getDate()).toBe(1);
    expect(s.getHours()).toBe(0);
  });
});

describe('bucketByMonth', () => {
  const keys = ['2026-05', '2026-06', '2026-07'];

  it('按月归集收入与支出', () => {
    const b = bucketByMonth(
      [
        row('2026-05-10T00:00:00', 100),
        row('2026-05-20T00:00:00', 200),
        row('2026-06-01T00:00:00', 500, 'income'),
      ],
      keys,
    );
    expect(b[0]).toMatchObject({ key: '2026-05', expense: 300, income: 0, net: -300 });
    expect(b[1]).toMatchObject({ key: '2026-06', income: 500, expense: 0, net: 500 });
  });

  it('没有记录的月份也要出现（值为 0）—— 否则折线会跳过空月份', () => {
    const b = bucketByMonth([row('2026-07-01T00:00:00', 100)], keys);
    expect(b).toHaveLength(3);
    expect(b[0]).toMatchObject({ key: '2026-05', income: 0, expense: 0, net: 0 });
  });

  it('窗口外的记录被忽略，不会串到边界月份', () => {
    const b = bucketByMonth([row('2026-01-01T00:00:00', 9999)], keys);
    expect(b.every((x) => x.income === 0 && x.expense === 0)).toBe(true);
  });

  it('顺序与传入的 keys 一致', () => {
    const b = bucketByMonth([], keys);
    expect(b.map((x) => x.key)).toEqual(keys);
  });
});

describe('categoryShare', () => {
  it('按金额降序并算占比', () => {
    const s = categoryShare(
      [
        row('2026-07-01T00:00:00', 700, 'expense', '房租'),
        row('2026-07-02T00:00:00', 300, 'expense', '吃饭'),
      ],
      'expense',
    );
    expect(s.map((x) => x.category)).toEqual(['房租', '吃饭']);
    expect(s[0].percent).toBe(70);
    expect(s[1].percent).toBe(30);
  });

  it('只统计指定方向', () => {
    const s = categoryShare(
      [
        row('2026-07-01T00:00:00', 700, 'income', '工资'),
        row('2026-07-02T00:00:00', 300, 'expense', '吃饭'),
      ],
      'income',
    );
    expect(s).toHaveLength(1);
    expect(s[0].category).toBe('工资');
  });

  it('同类别累加', () => {
    const s = categoryShare(
      [row('2026-07-01T00:00:00', 100), row('2026-07-02T00:00:00', 150)],
      'expense',
    );
    expect(s).toHaveLength(1);
    expect(s[0].cents).toBe(250);
  });

  it('超过 topN 的合并成「其他」', () => {
    const rows = ['a', 'b', 'c', 'd'].map((c, i) =>
      row('2026-07-01T00:00:00', (4 - i) * 100, 'expense', c),
    );
    const s = categoryShare(rows, 'expense', 2);
    expect(s.map((x) => x.category)).toEqual(['a', 'b', '其他']);
    // 其他 = c(200) + d(100)
    expect(s[2].cents).toBe(300);
  });

  it('没有数据时返回空数组，不除以 0', () => {
    expect(categoryShare([], 'expense')).toEqual([]);
    expect(categoryShare([row('2026-07-01T00:00:00', 100, 'income')], 'expense')).toEqual([]);
  });

  it('金额相同时按类别名排序，保证结果稳定', () => {
    const s = categoryShare(
      [
        row('2026-07-01T00:00:00', 100, 'expense', 'b'),
        row('2026-07-01T00:00:00', 100, 'expense', 'a'),
      ],
      'expense',
    );
    expect(s.map((x) => x.category)).toEqual(['a', 'b']);
  });
});

describe('monthOverMonth / yearOverYear', () => {
  const mk = (n: number, income = 0, expense = 0) => ({
    key: `k${n}`,
    income,
    expense,
    net: income - expense,
  });

  it('环比算最后两个月', () => {
    const r = monthOverMonth([mk(1, 100, 200), mk(2, 150, 100)]);
    expect(r!.income.changePercent).toBe(50); // 100 → 150
    expect(r!.expense.changePercent).toBe(-50); // 200 → 100
  });

  it('对比期为 0 时变化率为 null，而不是 Infinity', () => {
    const r = monthOverMonth([mk(1, 0, 0), mk(2, 150, 100)]);
    expect(r!.income.changePercent).toBeNull();
    expect(r!.income.current).toBe(150);
  });

  it('不足两个月返回 null', () => {
    expect(monthOverMonth([mk(1, 1, 1)])).toBeNull();
  });

  it('同比需要 13 个月，不够就返回 null 而不是编一个', () => {
    const twelve = Array.from({ length: 12 }, (_, i) => mk(i));
    expect(yearOverYear(twelve)).toBeNull();
  });

  it('去年同月一条记录都没有时返回 null —— 那是"没得算"，不是"算不出来"', () => {
    const buckets = Array.from({ length: 13 }, (_, i) => mk(i));
    buckets[12] = mk(12, 500, 300); // 本月有数据，去年同月全 0
    expect(yearOverYear(buckets)).toBeNull();
  });

  it('去年同月只要有任一方向有记录就照常算', () => {
    const buckets = Array.from({ length: 13 }, (_, i) => mk(i));
    buckets[0] = mk(0, 0, 100); // 去年同月只有支出
    buckets[12] = mk(12, 0, 200);
    const r = yearOverYear(buckets);
    expect(r).not.toBeNull();
    expect(r!.expense.changePercent).toBe(100);
  });

  it('同比对比的是去年同月（倒数第 13 个）', () => {
    const buckets = Array.from({ length: 13 }, (_, i) => mk(i, i === 0 ? 1000 : 0, 0));
    buckets[12] = mk(12, 500, 0);
    const r = yearOverYear(buckets);
    expect(r!.income.previous).toBe(1000);
    expect(r!.income.current).toBe(500);
    expect(r!.income.changePercent).toBe(-50);
  });
});

describe('normalizeSeries', () => {
  it('按最大值归一到 0~1', () => {
    expect(normalizeSeries([0, 50, 100])).toEqual([0, 0.5, 1]);
  });

  it('全 0 时不除以 0', () => {
    expect(normalizeSeries([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('空数组不炸', () => {
    expect(normalizeSeries([])).toEqual([]);
  });
});

describe('totals', () => {
  const mk = (income: number, expense: number) => ({
    key: 'k',
    income,
    expense,
    net: income - expense,
  });

  it('汇总收入支出与结余', () => {
    const t = totals([mk(100, 50), mk(200, 100)]);
    expect(t).toMatchObject({ income: 300, expense: 150, net: 150 });
  });

  it('月均只按有记录的月份摊，空月份不参与', () => {
    // 3 个月里只有 2 个月有记录，600 分应该摊成 300 而不是 200
    const t = totals([mk(0, 400), mk(0, 200), mk(0, 0)]);
    expect(t.avgMonthlyExpense).toBe(300);
  });

  it('全空时月均为 0，不除以 0', () => {
    expect(totals([mk(0, 0)]).avgMonthlyExpense).toBe(0);
    expect(totals([]).avgMonthlyExpense).toBe(0);
  });
});
