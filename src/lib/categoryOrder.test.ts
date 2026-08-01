import { describe, expect, it } from 'vitest';
import { sortCategoriesByRecency } from '@/lib/categoryOrder';
import type { GeneralCategory } from '@/lib/generalCategories';

const cats: GeneralCategory[] = [
  { name: '餐饮', icon: '🍜', direction: 'expense' },
  { name: '交通', icon: '🚌', direction: 'expense' },
  { name: '购物', icon: '🛍️', direction: 'expense' },
  { name: '学习', icon: '📚', direction: 'expense' },
];

const day = (n: number) => new Date(`2026-08-${String(n).padStart(2, '0')}T00:00:00Z`);

describe('sortCategoriesByRecency', () => {
  it('用过的排前，按最近时间倒序', () => {
    const entries = [
      { category: '购物', direction: 'expense', occurredAt: day(10) },
      { category: '交通', direction: 'expense', occurredAt: day(20) },
      { category: '餐饮', direction: 'expense', occurredAt: day(15) },
    ];
    const sorted = sortCategoriesByRecency(cats, entries, 'expense');
    expect(sorted.map((c) => c.name)).toEqual(['交通', '餐饮', '购物', '学习']);
  });

  it('没用过的按原始预设顺序垫在后面', () => {
    const entries = [{ category: '购物', direction: 'expense', occurredAt: day(1) }];
    const sorted = sortCategoriesByRecency(cats, entries, 'expense');
    // 购物排最前，其余按预设顺序：餐饮/交通/学习
    expect(sorted.map((c) => c.name)).toEqual(['购物', '餐饮', '交通', '学习']);
  });

  it('反方向的条目不影响排序 —— 收入排序不看支出使用记录', () => {
    const incomeCats: GeneralCategory[] = [
      { name: '工资', icon: '💰', direction: 'income' },
      { name: '奖金', icon: '🎊', direction: 'income' },
    ];
    const entries = [
      { category: '工资', direction: 'expense', occurredAt: day(20) }, // 方向不对
    ];
    const sorted = sortCategoriesByRecency(incomeCats, entries, 'income');
    // 都没用过，保持原顺序
    expect(sorted.map((c) => c.name)).toEqual(['工资', '奖金']);
  });

  it('同一类别多次使用取最新时间戳', () => {
    const entries = [
      { category: '餐饮', direction: 'expense', occurredAt: day(1) },
      { category: '交通', direction: 'expense', occurredAt: day(10) },
      { category: '餐饮', direction: 'expense', occurredAt: day(30) },
    ];
    const sorted = sortCategoriesByRecency(cats, entries, 'expense');
    // 餐饮最近是 30 号，比交通的 10 号新
    expect(sorted.map((c) => c.name)).toEqual(['餐饮', '交通', '购物', '学习']);
  });

  it('空条目 → 原样返回（不改预设顺序）', () => {
    const sorted = sortCategoriesByRecency(cats, [], 'expense');
    expect(sorted.map((c) => c.name)).toEqual(['餐饮', '交通', '购物', '学习']);
  });

  it('条目里的类别不在选项里 → 不影响排序', () => {
    const entries = [
      { category: '不存在的类别', direction: 'expense', occurredAt: day(20) },
    ];
    const sorted = sortCategoriesByRecency(cats, entries, 'expense');
    expect(sorted.map((c) => c.name)).toEqual(['餐饮', '交通', '购物', '学习']);
  });

  it('稳定排序：两个类别使用时间相同保持原顺序', () => {
    const entries = [
      { category: '餐饮', direction: 'expense', occurredAt: day(10) },
      { category: '交通', direction: 'expense', occurredAt: day(10) },
    ];
    const sorted = sortCategoriesByRecency(cats, entries, 'expense');
    // 时间相同 → 保持"餐饮 在 交通 前"
    expect(sorted.map((c) => c.name)).toEqual(['餐饮', '交通', '购物', '学习']);
  });

  it('不 mutate 传入的数组', () => {
    const input = [...cats];
    const snapshot = input.map((c) => c.name);
    sortCategoriesByRecency(input, [
      { category: '学习', direction: 'expense', occurredAt: day(30) },
    ], 'expense');
    expect(input.map((c) => c.name)).toEqual(snapshot);
  });
});
