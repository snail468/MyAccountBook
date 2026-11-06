import { describe, it, expect } from 'vitest';
import { makeMonthList } from './WorkMonthsSection';

describe('makeMonthList 月份列表生成', () => {
  it('至少包含最近12个月', () => {
    const list = makeMonthList(null);
    expect(list.length).toBeGreaterThanOrEqual(12);
  });

  it('当 earliest 早于12个月前时，扩展到 earliest 所在月份', () => {
    const list = makeMonthList('2024-01');
    expect(list[list.length - 1]).toBe('2024-01');
  });

  it('当 latest 晚于当前月份（未来月份记账）时，扩展到 latest 所在月份', () => {
    const list = makeMonthList(null, '2028-05');
    expect(list[0]).toBe('2028-05');
    expect(list.includes('2028-01')).toBe(true);
  });
});
