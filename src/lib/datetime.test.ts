import { describe, expect, it } from 'vitest';
import {
  defaultOccurredAtFor,
  localInputToISO,
  toLocalInput,
  formatShort,
  formatDateBeijing,
  formatDateShortBeijing,
  formatYearMonthBeijing,
  getBeijingMonthRange,
} from '@/lib/datetime';

// 写侧的源头修复：月页面「记一笔」的"操作时间"默认值不能再无脑取 new Date()。
// 读侧的兜底见 refundStatus.test.ts 里 advanceDate 的那组用例。
describe('defaultOccurredAtFor', () => {
  // 本地时区构造，与函数内部一致（它喂的是 <input type="datetime-local">）
  const now = new Date(2026, 7, 7, 15, 30); // 2026-08-07 15:30 本地

  it('当月 → 就是此刻', () => {
    expect(defaultOccurredAtFor('2026-08', now).getTime()).toBe(now.getTime());
  });

  it('过去的月份 → 该月最后一天 12:00，而不是"今天"', () => {
    const d = defaultOccurredAtFor('2026-03', now);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()]).toEqual([
      2026, 3, 31, 12,
    ]);
  });

  it('过去月份的天数按真实月长 —— 2 月不会给出 31 号', () => {
    expect(defaultOccurredAtFor('2026-02', now).getDate()).toBe(28);
    expect(defaultOccurredAtFor('2024-02', new Date(2024, 5, 1)).getDate()).toBe(29);
  });

  it('跨年的旧月份', () => {
    const d = defaultOccurredAtFor('2025-12', now);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2025, 12, 31]);
  });

  it('未来的月份 → 该月 1 号 12:00', () => {
    const d = defaultOccurredAtFor('2026-11', now);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 11, 1]);
  });

  it('脏 yearMonth → 退回此刻，不炸表单', () => {
    expect(defaultOccurredAtFor('nope', now).getTime()).toBe(now.getTime());
  });
});

describe('UTC+8 时间与时区一致性测试', () => {
  it('localInputToISO: 将本地无时区字符串按 UTC+8 解析为标准 UTC ISO 串', () => {
    // 2026-09-14 17:30 UTC+8 对应的 UTC 应该为 2026-09-14 09:30:00Z
    const iso = localInputToISO('2026-09-14T17:30');
    expect(iso).toBe('2026-09-14T09:30:00.000Z');

    // 精确到秒
    expect(localInputToISO('2026-09-14T17:30:45')).toBe('2026-09-14T09:30:45.000Z');

    // 纯日期
    expect(localInputToISO('2026-09-14')).toBe('2026-09-13T16:00:00.000Z');

    // 跨天情况：北京时间 01:00 应是前一天 17:00 UTC
    expect(localInputToISO('2026-09-14T01:00')).toBe('2026-09-13T17:00:00.000Z');

    // 空值
    expect(localInputToISO('')).toBeNull();
    expect(localInputToISO(null)).toBeNull();
  });

  it('toLocalInput: 将 UTC ISO 串或 Date 对象反向输出为北京时间 YYYY-MM-DDTHH:mm', () => {
    // UTC 09:30 -> 北京时间 17:30
    expect(toLocalInput('2026-09-14T09:30:00.000Z')).toBe('2026-09-14T17:30');
    // UTC 17:00 前一天 -> 北京时间 01:00
    expect(toLocalInput('2026-09-13T17:00:00.000Z')).toBe('2026-09-14T01:00');
  });

  it('formatShort: 格式化为北京时间 yyyy-MM-dd HH:mm', () => {
    expect(formatShort('2026-09-14T09:30:00.000Z')).toBe('2026-09-14 17:30');
    expect(formatShort('2026-09-13T17:00:00.000Z')).toBe('2026-09-14 01:00');
  });

  it('formatDateBeijing: 格式化为北京时间日期 yyyy-MM-dd', () => {
    expect(formatDateBeijing('2026-09-14T09:30:00.000Z')).toBe('2026-09-14');
    expect(formatDateBeijing('2026-09-13T17:00:00.000Z')).toBe('2026-09-14');
    expect(formatDateShortBeijing('2026-09-13T17:00:00.000Z')).toBe('09-14');
  });

  it('formatYearMonthBeijing: 格式化为北京时间年月 yyyy-MM', () => {
    // 2026-08-31 18:00:00Z 在北京时间是 2026-09-01 02:00:00，属于 9 月
    expect(formatYearMonthBeijing('2026-08-31T18:00:00.000Z')).toBe('2026-09');
    // 2026-08-31 15:59:59Z 在北京时间是 2026-08-31 23:59:59，属于 8 月
    expect(formatYearMonthBeijing('2026-08-31T15:59:59.000Z')).toBe('2026-08');
  });

  it('getBeijingMonthRange: 准确返回指定月份在 UTC+8 下的开始和结束点', () => {
    const { start, end } = getBeijingMonthRange('2026-09');
    // 2026-09-01 00:00:00+08:00 = 2026-08-31 16:00:00Z
    expect(start.toISOString()).toBe('2026-08-31T16:00:00.000Z');
    // 2026-10-01 00:00:00+08:00 = 2026-09-30 16:00:00Z
    expect(end.toISOString()).toBe('2026-09-30T16:00:00.000Z');
  });
});

