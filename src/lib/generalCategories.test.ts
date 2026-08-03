import { describe, expect, it } from 'vitest';
import {
  categoryBudgetOf,
  parseCustom,
  stringifyCustom,
  type CustomCategoriesJson,
} from '@/lib/generalCategories';

describe('parseCustom · budgets', () => {
  it('null/undefined → 空 added/hidden/budgets', () => {
    expect(parseCustom(null)).toEqual({ added: [], hidden: [], budgets: {} });
    expect(parseCustom(undefined)).toEqual({ added: [], hidden: [], budgets: {} });
  });

  it('无 budgets 字段的老 JSON → budgets 是空对象', () => {
    expect(parseCustom('{"added":[],"hidden":[]}')).toEqual({
      added: [],
      hidden: [],
      budgets: {},
    });
  });

  it('合法 budgets 保留', () => {
    const c = parseCustom('{"added":[],"hidden":[],"budgets":{"餐饮":50000,"交通":20000}}');
    expect(c.budgets).toEqual({ 餐饮: 50000, 交通: 20000 });
  });

  it('非法 budgets（数组）→ 空对象', () => {
    expect(parseCustom('{"added":[],"hidden":[],"budgets":[1,2,3]}').budgets).toEqual({});
  });

  it('过滤掉负数 / 0 / NaN / 非数字', () => {
    const c = parseCustom(
      '{"added":[],"hidden":[],"budgets":{"a":100,"b":0,"c":-50,"d":"x","e":null}}',
    );
    expect(c.budgets).toEqual({ a: 100 });
  });

  it('损坏 JSON → 兜底空对象，不抛', () => {
    expect(parseCustom('not json').budgets).toEqual({});
  });
});

describe('stringifyCustom · budgets', () => {
  it('空 budgets 不落库 —— 让"没预算"和"清 0"两种状态一致', () => {
    const c: CustomCategoriesJson = { added: [], hidden: [], budgets: {} };
    const s = stringifyCustom(c);
    expect(JSON.parse(s)).toEqual({ added: [], hidden: [] });
  });

  it('undefined budgets 不落库', () => {
    const s = stringifyCustom({ added: [], hidden: [] });
    expect(JSON.parse(s)).toEqual({ added: [], hidden: [] });
  });

  it('非空 budgets 落库', () => {
    const s = stringifyCustom({ added: [], hidden: [], budgets: { 餐饮: 50000 } });
    expect(JSON.parse(s)).toEqual({ added: [], hidden: [], budgets: { 餐饮: 50000 } });
  });

  it('往返一致', () => {
    const orig: CustomCategoriesJson = {
      added: [{ name: '孩子', icon: '🧸', direction: 'expense' }],
      hidden: ['娱乐'],
      budgets: { 餐饮: 50000, 交通: 20000 },
    };
    const roundTrip = parseCustom(stringifyCustom(orig));
    expect(roundTrip).toEqual(orig);
  });
});

describe('categoryBudgetOf', () => {
  it('有预算 → 返回分', () => {
    const json = stringifyCustom({
      added: [],
      hidden: [],
      budgets: { 餐饮: 50000 },
    });
    expect(categoryBudgetOf(json, '餐饮')).toBe(50000);
  });

  it('无预算 → null', () => {
    expect(categoryBudgetOf(null, '餐饮')).toBe(null);
    expect(categoryBudgetOf('{"added":[],"hidden":[]}', '餐饮')).toBe(null);
  });

  it('类别名不匹配 → null', () => {
    const json = stringifyCustom({
      added: [],
      hidden: [],
      budgets: { 餐饮: 50000 },
    });
    expect(categoryBudgetOf(json, '交通')).toBe(null);
  });

  it('预算 0 或负数 → null（视为无预算）', () => {
    // parseCustom 已经过滤，这里再校验一遍防止绕过
    expect(
      categoryBudgetOf('{"added":[],"hidden":[],"budgets":{"a":0}}', 'a'),
    ).toBe(null);
    expect(
      categoryBudgetOf('{"added":[],"hidden":[],"budgets":{"a":-1}}', 'a'),
    ).toBe(null);
  });
});
