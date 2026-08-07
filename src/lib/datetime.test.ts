import { describe, expect, it } from 'vitest';
import { defaultOccurredAtFor } from '@/lib/datetime';

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
