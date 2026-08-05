import { describe, expect, it } from 'vitest';
import {
  isIncomeComponentEnabled,
  letterFor,
  mergePrefs,
  parsePrefs,
  stringifyPrefs,
} from '@/lib/userPrefs';

describe('userPrefs', () => {
  describe('parsePrefs', () => {
    it('null / 空串 → 默认 {}', () => {
      expect(parsePrefs(null)).toEqual({});
      expect(parsePrefs('')).toEqual({});
      expect(parsePrefs(undefined)).toEqual({});
    });

    it('合法 JSON 原样返回', () => {
      const j = '{"incomeComponents":{"work":false}}';
      expect(parsePrefs(j)).toEqual({ incomeComponents: { work: false } });
    });

    it('坏 JSON 不抛，退回默认（一个坏字段不该让首页 500）', () => {
      expect(parsePrefs('{not json}')).toEqual({});
      expect(parsePrefs('null')).toEqual({});
      expect(parsePrefs('[1,2]')).toEqual({});
      expect(parsePrefs('"a string"')).toEqual({});
    });
  });

  describe('isIncomeComponentEnabled', () => {
    it('无 incomeComponents → 一律启用（老用户零迁移）', () => {
      expect(isIncomeComponentEnabled({}, 'work')).toBe(true);
      expect(isIncomeComponentEnabled({}, 'taoyuan:cash')).toBe(true);
      expect(isIncomeComponentEnabled({}, 'general:abc')).toBe(true);
    });

    it('key 不在 map 里 → 启用（新增来源默认自动加入 A）', () => {
      expect(
        isIncomeComponentEnabled({ incomeComponents: { work: false } }, 'general:newone'),
      ).toBe(true);
    });

    it('仅显式 false 才禁用', () => {
      const p = { incomeComponents: { work: false, 'taoyuan:cash': true } };
      expect(isIncomeComponentEnabled(p, 'work')).toBe(false);
      expect(isIncomeComponentEnabled(p, 'taoyuan:cash')).toBe(true);
    });
  });

  describe('mergePrefs', () => {
    it('浅合并 incomeComponents —— 不替换整个 map', () => {
      const current = {
        incomeComponents: { work: false, 'taoyuan:cash': true },
      };
      const patched = mergePrefs(current, {
        incomeComponents: { 'taoyuan:cash': false, 'general:x': true },
      });
      expect(patched).toEqual({
        incomeComponents: {
          work: false, // 保留
          'taoyuan:cash': false, // 覆盖
          'general:x': true, // 新增
        },
      });
    });

    it('未传的顶层字段保留', () => {
      const current = { incomeComponents: { work: false } } as const;
      expect(mergePrefs(current, {})).toEqual(current);
    });
  });

  describe('stringifyPrefs / parsePrefs 往返', () => {
    it('保序无损', () => {
      const p = { incomeComponents: { work: true, 'general:a': false } };
      expect(parsePrefs(stringifyPrefs(p))).toEqual(p);
    });
  });

  describe('letterFor', () => {
    it('索引 0 起 → B、C、D…', () => {
      expect(letterFor(0)).toBe('B');
      expect(letterFor(1)).toBe('C');
      expect(letterFor(2)).toBe('D');
      expect(letterFor(3)).toBe('E');
    });

    it('Z 是 24', () => {
      expect(letterFor(24)).toBe('Z');
    });

    it('超过 Z 走双字母，25 → AA, 26 → AB', () => {
      expect(letterFor(25)).toBe('AA');
      expect(letterFor(26)).toBe('AB');
      expect(letterFor(50)).toBe('AZ');
      expect(letterFor(51)).toBe('BA');
    });
  });
});
