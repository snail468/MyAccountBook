import { describe, expect, it } from 'vitest';
import { formatCents, getGroupLabel, PERSON_GROUPS, RENQING_CATEGORIES } from './renqing';

describe('renqing helpers', () => {
  it('formats cents correctly with zero and non-zero decimals', () => {
    expect(formatCents(0)).toBe('0');
    expect(formatCents(50000)).toBe('500');
    expect(formatCents(50050)).toBe('500.50');
    expect(formatCents(8888)).toBe('88.88');
    expect(formatCents(100)).toBe('1');
  });

  it('resolves group label properly and falls back to other', () => {
    expect(getGroupLabel('relative')).toBe('亲戚');
    expect(getGroupLabel('friend')).toBe('朋友');
    expect(getGroupLabel('colleague')).toBe('同事');
    expect(getGroupLabel('classmate')).toBe('同学');
    expect(getGroupLabel('other')).toBe('其他');
    expect(getGroupLabel('unknown_group')).toBe('其他');
  });

  it('defines valid categories and groups', () => {
    expect(RENQING_CATEGORIES.length).toBeGreaterThan(0);
    expect(PERSON_GROUPS.length).toBe(5);
  });
});
