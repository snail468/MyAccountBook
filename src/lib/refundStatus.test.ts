import { describe, expect, it } from 'vitest';
import {
  REFUND_OVERDUE_DAYS,
  daysSincePending,
  refundStatus,
  summarizeOverdue,
} from '@/lib/refundStatus';

const now = new Date('2026-08-01T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

describe('refundStatus', () => {
  describe('阈值常量', () => {
    it('30 天 —— 与页面文案里的"超 30 天"必须一致', () => {
      expect(REFUND_OVERDUE_DAYS).toBe(30);
    });
  });

  describe('refundStatus', () => {
    it('已回款 → refunded', () => {
      expect(
        refundStatus({ occurredAt: daysAgo(100), refundedAt: daysAgo(50) }, now),
      ).toBe('refunded');
    });

    it('未回款、发生在阈值内 → pending', () => {
      expect(refundStatus({ occurredAt: daysAgo(5), refundedAt: null }, now)).toBe('pending');
      expect(refundStatus({ occurredAt: daysAgo(29), refundedAt: null }, now)).toBe('pending');
    });

    it('未回款、发生已满 30 天 → overdue', () => {
      expect(refundStatus({ occurredAt: daysAgo(30), refundedAt: null }, now)).toBe('overdue');
      expect(refundStatus({ occurredAt: daysAgo(90), refundedAt: null }, now)).toBe('overdue');
    });

    it('未来时间（用户填错日期）→ pending，不算超期', () => {
      expect(refundStatus({ occurredAt: daysAgo(-5), refundedAt: null }, now)).toBe('pending');
    });

    it('阈值可覆盖 —— 未来做成用户可配置时的钩子', () => {
      const entry = { occurredAt: daysAgo(20), refundedAt: null };
      expect(refundStatus(entry, now, 30)).toBe('pending');
      expect(refundStatus(entry, now, 14)).toBe('overdue');
    });

    it('回款时间比发生时间还早也按 refunded —— 数据本身怪但状态无争议', () => {
      expect(
        refundStatus({ occurredAt: daysAgo(5), refundedAt: daysAgo(100) }, now),
      ).toBe('refunded');
    });
  });

  describe('daysSincePending', () => {
    it('刚发生 → 0 天', () => {
      expect(daysSincePending({ occurredAt: daysAgo(0), refundedAt: null }, now)).toBe(0);
    });

    it('未来时间 → 0（不返回负数）', () => {
      expect(daysSincePending({ occurredAt: daysAgo(-3), refundedAt: null }, now)).toBe(0);
    });

    it('90 天前 → 90 天', () => {
      expect(daysSincePending({ occurredAt: daysAgo(90), refundedAt: null }, now)).toBe(90);
    });
  });

  describe('summarizeOverdue', () => {
    it('只统计 overdue —— 已回款和未超期都不算', () => {
      const entries = [
        { occurredAt: daysAgo(50), refundedAt: null, amountCents: 10000 }, // overdue
        { occurredAt: daysAgo(100), refundedAt: daysAgo(80), amountCents: 20000 }, // refunded，跳过
        { occurredAt: daysAgo(10), refundedAt: null, amountCents: 30000 }, // pending，跳过
        { occurredAt: daysAgo(200), refundedAt: null, amountCents: 40000 }, // overdue
      ];
      expect(summarizeOverdue(entries, now)).toEqual({
        count: 2,
        totalCents: 50000,
        oldestDays: 200,
      });
    });

    it('都不超期 → 空汇总', () => {
      expect(
        summarizeOverdue(
          [{ occurredAt: daysAgo(5), refundedAt: null, amountCents: 100 }],
          now,
        ),
      ).toEqual({ count: 0, totalCents: 0, oldestDays: 0 });
    });

    it('空数组 → 空汇总（防止 UI 除零）', () => {
      expect(summarizeOverdue([], now)).toEqual({ count: 0, totalCents: 0, oldestDays: 0 });
    });
  });
});
