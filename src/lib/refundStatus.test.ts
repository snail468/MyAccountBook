import { describe, expect, it } from 'vitest';
import {
  REFUND_OVERDUE_DAYS,
  advanceDate,
  daysSincePending,
  monthEndUtc,
  refundStatus,
  summarizeOverdue,
} from '@/lib/refundStatus';

const now = new Date('2026-08-01T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

/** 该 Date 所属的 'YYYY-MM'（UTC，与 monthEndUtc 同口径） */
const ymOf = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/** 正常数据：occurredAt 与 yearMonth 自洽（在月页面当场记的一笔） */
const at = (n: number) => ({ occurredAt: daysAgo(n), yearMonth: ymOf(daysAgo(n)) });

describe('refundStatus', () => {
  describe('阈值常量', () => {
    it('30 天 —— 与页面文案里的"超 30 天"必须一致', () => {
      expect(REFUND_OVERDUE_DAYS).toBe(30);
    });
  });

  describe('monthEndUtc', () => {
    it('普通月份 → 该月最后一毫秒', () => {
      expect(monthEndUtc('2026-03')?.toISOString()).toBe('2026-03-31T23:59:59.999Z');
    });

    it('12 月要跨年进位', () => {
      expect(monthEndUtc('2026-12')?.toISOString()).toBe('2026-12-31T23:59:59.999Z');
    });

    it('闰年 2 月是 29 天', () => {
      expect(monthEndUtc('2024-02')?.toISOString()).toBe('2024-02-29T23:59:59.999Z');
      expect(monthEndUtc('2026-02')?.toISOString()).toBe('2026-02-28T23:59:59.999Z');
    });

    it('格式不对 → null（脏数据不炸，由调用方退回 occurredAt）', () => {
      expect(monthEndUtc('2026-13')).toBeNull();
      expect(monthEndUtc('202603')).toBeNull();
      expect(monthEndUtc('')).toBeNull();
    });
  });

  describe('advanceDate —— 真正垫钱的那一刻', () => {
    it('occurredAt 在所属月份内 → 原样返回', () => {
      const e = { occurredAt: new Date('2026-03-15T08:00:00Z'), refundedAt: null, yearMonth: '2026-03' };
      expect(advanceDate(e).toISOString()).toBe('2026-03-15T08:00:00.000Z');
    });

    it('occurredAt 晚于所属月份（旧月份页面补录）→ 夹到月末', () => {
      const e = { occurredAt: new Date('2026-08-04T01:00:00Z'), refundedAt: null, yearMonth: '2026-03' };
      expect(advanceDate(e).toISOString()).toBe('2026-03-31T23:59:59.999Z');
    });

    it('occurredAt 早于所属月份 → **不**夹回月初（只会往前挪，不会藏起超期的）', () => {
      const e = { occurredAt: new Date('2026-01-10T00:00:00Z'), refundedAt: null, yearMonth: '2026-03' };
      expect(advanceDate(e).toISOString()).toBe('2026-01-10T00:00:00.000Z');
    });

    it('yearMonth 是脏数据 → 退回 occurredAt，行为与老版本一致', () => {
      const e = { occurredAt: new Date('2026-08-04T01:00:00Z'), refundedAt: null, yearMonth: 'oops' };
      expect(advanceDate(e).toISOString()).toBe('2026-08-04T01:00:00.000Z');
    });
  });

  describe('refundStatus', () => {
    it('已回款 → refunded', () => {
      expect(refundStatus({ ...at(100), refundedAt: daysAgo(50) }, now)).toBe('refunded');
    });

    it('未回款、发生在阈值内 → pending', () => {
      expect(refundStatus({ ...at(5), refundedAt: null }, now)).toBe('pending');
      expect(refundStatus({ ...at(29), refundedAt: null }, now)).toBe('pending');
    });

    it('未回款、发生已满 30 天 → overdue', () => {
      expect(refundStatus({ ...at(30), refundedAt: null }, now)).toBe('overdue');
      expect(refundStatus({ ...at(90), refundedAt: null }, now)).toBe('overdue');
    });

    it('未来时间（用户填错日期）→ pending，不算超期', () => {
      expect(refundStatus({ ...at(-5), refundedAt: null }, now)).toBe('pending');
    });

    it('阈值可覆盖 —— 未来做成用户可配置时的钩子', () => {
      const entry = { ...at(20), refundedAt: null };
      expect(refundStatus(entry, now, 30)).toBe('pending');
      expect(refundStatus(entry, now, 14)).toBe('overdue');
    });

    it('回款时间比发生时间还早也按 refunded —— 数据本身怪但状态无争议', () => {
      expect(refundStatus({ ...at(5), refundedAt: daysAgo(100) }, now)).toBe('refunded');
    });
  });

  describe('daysSincePending', () => {
    it('刚发生 → 0 天', () => {
      expect(daysSincePending({ ...at(0), refundedAt: null }, now)).toBe(0);
    });

    it('未来时间 → 0（不返回负数）', () => {
      expect(daysSincePending({ ...at(-3), refundedAt: null }, now)).toBe(0);
    });

    it('90 天前 → 90 天', () => {
      expect(daysSincePending({ ...at(90), refundedAt: null }, now)).toBe(90);
    });
  });

  // ==================================================================
  // 回归：顶部黄色汇总漏掉"最早的几笔垫款"
  //
  // 症状（用户三次实测报同一现象）：/work/expenses 顶部说"8 笔未回款已超
  // 30 天 · 合计 663.00"，翻到页面最底下却还有几笔更早的未回款垫款，
  // 既没进汇总也没标红。
  //
  // 前两次修复都押在聚合口径上（SQL 判定 → JS 判定 → 5 条 SQL 合成 1 条），
  // 全都没用 —— 因为漏计根本不在聚合层：月页面「记一笔」的"操作时间"默认
  // 是**打开表单的此刻**，与你正在看哪个月无关。3 月的垫款 8 月才补录，
  // 落库就是 { yearMonth: '2026-03', occurredAt: '2026-08-04' }：
  //   * 明细按 yearMonth 分组 → 它排在页面最底下的「3 月」里
  //   * 超期按 occurredAt 算 → "才挂 3 天"，不超期
  // 于是"看得见、算不着"。基准日期本身错了，聚合再怎么算都是错的。
  // ==================================================================
  describe('回归：旧月份补录的垫款必须算进超期', () => {
    it('3 月的垫款 8 月才补录 —— 按月末算已超期，而不是"才挂 3 天"', () => {
      const backfilled = {
        occurredAt: new Date('2026-07-30T01:00:00Z'), // 2 天前才录进系统
        refundedAt: null,
        yearMonth: '2026-03', // 但它是 3 月垫出去的钱
      };
      expect(refundStatus(backfilled, now)).toBe('overdue');
      // 2026-03-31T23:59:59.999 → 2026-08-01T12:00，122 天
      expect(daysSincePending(backfilled, now)).toBe(122);
    });

    it('当月当场记的一笔不受影响 —— 夹取是单调的，不会误伤', () => {
      const today = {
        occurredAt: new Date('2026-08-01T09:00:00Z'),
        refundedAt: null,
        yearMonth: '2026-08',
      };
      expect(refundStatus(today, now)).toBe('pending');
      expect(daysSincePending(today, now)).toBe(0);
    });

    it('汇总口径：补录的旧垫款要一起进 count / totalCents / oldestDays', () => {
      const rows = [
        // 真·老账，occurredAt 与月份自洽
        { ...at(97), refundedAt: null, amountCents: 12000 },
        { ...at(33), refundedAt: null, amountCents: 7000 },
        // 补录：occurredAt 是最近，但属于很早的月份 —— 老实现会漏掉这两笔
        { occurredAt: daysAgo(2), refundedAt: null, yearMonth: '2026-03', amountCents: 15000 },
        { occurredAt: daysAgo(5), refundedAt: null, yearMonth: '2026-04', amountCents: 18000 },
        // 当月的，不该算
        { ...at(3), refundedAt: null, amountCents: 999 },
      ];
      expect(summarizeOverdue(rows, now)).toEqual({
        count: 4,
        totalCents: 12000 + 7000 + 15000 + 18000,
        oldestDays: 122, // 2026-03 月末起算，比那笔 97 天的更久
      });
    });
  });

  describe('summarizeOverdue', () => {
    it('只统计 overdue —— 已回款和未超期都不算', () => {
      const entries = [
        { ...at(50), refundedAt: null, amountCents: 10000 }, // overdue
        { ...at(100), refundedAt: daysAgo(80), amountCents: 20000 }, // refunded，跳过
        { ...at(10), refundedAt: null, amountCents: 30000 }, // pending，跳过
        { ...at(200), refundedAt: null, amountCents: 40000 }, // overdue
      ];
      expect(summarizeOverdue(entries, now)).toEqual({
        count: 2,
        totalCents: 50000,
        oldestDays: 200,
      });
    });

    // 回归：早期 /work/expenses/page.tsx 在 SQL 层用 occurredAt < cutoff 过滤
    // 得到 overdueRows，客户端 ExpenseList 却用 refundStatus() 打红标，两处判定
    // 分裂 —— 老数据 / 时区偏移能让 SQL 漏掉列表已标红的行，页面顶部数字比实际
    // 小。改成 SQL 只筛 refundedAt: null，overdueness 全交给 summarizeOverdue，
    // 保证"看到几条红条 === 汇总显示几条"。
    it('传入全部未回款条目也能得到正确数字（不再依赖 SQL 层的 occurredAt 裁剪）', () => {
      const allPending = [
        { ...at(1), refundedAt: null, amountCents: 100 },
        { ...at(15), refundedAt: null, amountCents: 200 },
        { ...at(29), refundedAt: null, amountCents: 300 }, // 恰好未超
        { ...at(30), refundedAt: null, amountCents: 400 }, // 恰好达标
        { ...at(97), refundedAt: null, amountCents: 500 },
        { ...at(300), refundedAt: null, amountCents: 600 },
      ];
      expect(summarizeOverdue(allPending, now)).toEqual({
        count: 3,
        totalCents: 400 + 500 + 600,
        oldestDays: 300,
      });
    });

    it('都不超期 → 空汇总', () => {
      expect(
        summarizeOverdue([{ ...at(5), refundedAt: null, amountCents: 100 }], now),
      ).toEqual({ count: 0, totalCents: 0, oldestDays: 0 });
    });

    it('空数组 → 空汇总（防止 UI 除零）', () => {
      expect(summarizeOverdue([], now)).toEqual({ count: 0, totalCents: 0, oldestDays: 0 });
    });
  });
});
