import { describe, expect, it } from 'vitest';
import {
  clampedDate,
  daysInMonth,
  describeSchedule,
  dueOccurrences,
  firstOccurrence,
  isExpired,
  nextOccurrence,
  upcomingDate,
  type RecurringSchedule,
} from '@/lib/recurring';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 0, 0, 0, 0);
const iso = (x: Date) =>
  `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

const monthly = (day: number, start: Date, end: Date | null = null): RecurringSchedule => ({
  frequency: 'monthly',
  dayOfMonth: day,
  startDate: start,
  endDate: end,
});
const weekly = (dow: number, start: Date, end: Date | null = null): RecurringSchedule => ({
  frequency: 'weekly',
  dayOfWeek: dow,
  startDate: start,
  endDate: end,
});

describe('daysInMonth / clampedDate', () => {
  it('平年 2 月 28 天，闰年 29 天', () => {
    expect(daysInMonth(2026, 1)).toBe(28);
    expect(daysInMonth(2028, 1)).toBe(29); // 2028 是闰年
  });

  it('31 号落到 2 月时钳成当月最后一天，而不是溢出到 3 月', () => {
    // new Date(2026, 1, 31) 会静默变成 3 月 3 日
    expect(iso(clampedDate(2026, 1, 31))).toBe('2026-02-28');
    expect(iso(clampedDate(2028, 1, 31))).toBe('2028-02-29');
  });

  it('不超过当月天数时原样', () => {
    expect(iso(clampedDate(2026, 6, 15))).toBe('2026-07-15');
  });
});

describe('firstOccurrence', () => {
  it('起始日当天就匹配时，第一期就是当天', () => {
    expect(iso(firstOccurrence(monthly(5, d(2026, 7, 5))))).toBe('2026-07-05');
  });

  it('起始日之后才匹配时落在本月', () => {
    expect(iso(firstOccurrence(monthly(20, d(2026, 7, 5))))).toBe('2026-07-20');
  });

  it('本月的日子已经过了就顺延到下月 —— 不补记用户没预期的账', () => {
    expect(iso(firstOccurrence(monthly(5, d(2026, 7, 20))))).toBe('2026-08-05');
  });

  it('每月 31 号从 1 月 31 日起，第一期是当天', () => {
    expect(iso(firstOccurrence(monthly(31, d(2026, 1, 31))))).toBe('2026-01-31');
  });

  it('weekly 找到起始日之后的第一个匹配星期几', () => {
    // 2026-07-01 是周三（getDay()===3）
    expect(new Date(2026, 6, 1).getDay()).toBe(3);
    expect(iso(firstOccurrence(weekly(5, d(2026, 7, 1))))).toBe('2026-07-03'); // 周五
    expect(iso(firstOccurrence(weekly(3, d(2026, 7, 1))))).toBe('2026-07-01'); // 当天就是周三
    expect(iso(firstOccurrence(weekly(1, d(2026, 7, 1))))).toBe('2026-07-06'); // 下周一
  });
});

describe('nextOccurrence', () => {
  it('monthly 推进一个月', () => {
    expect(iso(nextOccurrence(monthly(5, d(2026, 1, 1)), d(2026, 7, 5)))).toBe('2026-08-05');
  });

  it('weekly 推进七天', () => {
    expect(iso(nextOccurrence(weekly(3, d(2026, 1, 1)), d(2026, 7, 1)))).toBe('2026-07-08');
  });

  it('跨年正确', () => {
    expect(iso(nextOccurrence(monthly(5, d(2026, 1, 1)), d(2026, 12, 5)))).toBe('2027-01-05');
  });

  it('「每月 31 号」经过 2 月后不会永久漂移成 28 号', () => {
    const s = monthly(31, d(2026, 1, 1));
    const feb = nextOccurrence(s, d(2026, 1, 31));
    expect(iso(feb)).toBe('2026-02-28'); // 钳到月末
    // 关键：下一期要回到 31 号，而不是继续按 28 号推
    expect(iso(nextOccurrence(s, feb))).toBe('2026-03-31');
  });
});

describe('isExpired', () => {
  it('没有结束日期就永不过期', () => {
    expect(isExpired(monthly(5, d(2026, 1, 1)), d(2099, 1, 1))).toBe(false);
  });

  it('结束日期当天仍然有效（闭区间）', () => {
    const s = monthly(5, d(2026, 1, 1), d(2026, 7, 31));
    expect(isExpired(s, d(2026, 7, 31))).toBe(false);
    expect(isExpired(s, d(2026, 8, 1))).toBe(true);
  });
});

describe('dueOccurrences', () => {
  it('还没生成过时，从第一期补到今天', () => {
    const s = monthly(5, d(2026, 5, 1));
    const { dates } = dueOccurrences(s, null, d(2026, 7, 20));
    expect(dates.map(iso)).toEqual(['2026-05-05', '2026-06-05', '2026-07-05']);
  });

  it('容器停了两个月，回来时把漏掉的都补上', () => {
    const s = monthly(5, d(2026, 1, 1));
    const { dates } = dueOccurrences(s, d(2026, 5, 5), d(2026, 7, 20));
    expect(dates.map(iso)).toEqual(['2026-06-05', '2026-07-05']);
  });

  it('本期还没到就什么都不生成', () => {
    const s = monthly(25, d(2026, 7, 1));
    const { dates } = dueOccurrences(s, null, d(2026, 7, 20));
    expect(dates).toEqual([]);
  });

  it('到期当天要生成（闭区间）', () => {
    const s = monthly(20, d(2026, 7, 1));
    const { dates } = dueOccurrences(s, null, d(2026, 7, 20));
    expect(dates.map(iso)).toEqual(['2026-07-20']);
  });

  it('过了结束日期就不再生成', () => {
    const s = monthly(5, d(2026, 1, 1), d(2026, 3, 31));
    const { dates } = dueOccurrences(s, null, d(2026, 7, 20));
    expect(dates.map(iso)).toEqual(['2026-01-05', '2026-02-05', '2026-03-05']);
  });

  it('补跑有上限，且保留最近的几期而不是最早的', () => {
    const s = monthly(1, d(2000, 1, 1));
    const { dates, truncated } = dueOccurrences(s, null, d(2026, 7, 20), 3);
    expect(truncated).toBe(true);
    expect(dates).toHaveLength(3);
    // 保留最近三期
    expect(dates.map(iso)).toEqual(['2026-05-01', '2026-06-01', '2026-07-01']);
  });

  it('恰好等于上限时不算截断', () => {
    const s = monthly(5, d(2026, 5, 1));
    const { dates, truncated } = dueOccurrences(s, null, d(2026, 7, 20), 3);
    expect(truncated).toBe(false);
    expect(dates).toHaveLength(3);
  });

  it('weekly 按周补', () => {
    const s = weekly(3, d(2026, 7, 1)); // 周三
    const { dates } = dueOccurrences(s, null, d(2026, 7, 20));
    expect(dates.map(iso)).toEqual(['2026-07-01', '2026-07-08', '2026-07-15']);
  });

  it('「每月 31 号」补跑时每月恰好一期，2 月落在月末', () => {
    const s = monthly(31, d(2026, 1, 1));
    // 4 月只有 30 天，4 月那期被钳到 4-30，而今天正是 4-30，所以它也到期了
    const { dates } = dueOccurrences(s, null, d(2026, 4, 30));
    expect(dates.map(iso)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('每月恰好一期 —— 不会因为月末钳制而丢期或多期', () => {
    const s = monthly(31, d(2026, 1, 1));
    const { dates } = dueOccurrences(s, null, d(2026, 12, 31));
    expect(dates).toHaveLength(12);
    // 每一期都落在各自的月份里，没有串月
    expect(dates.map((x) => x.getMonth())).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});

describe('upcomingDate', () => {
  it('给出下一次将要生成的日期', () => {
    const s = monthly(5, d(2026, 1, 1));
    expect(iso(upcomingDate(s, d(2026, 7, 5), d(2026, 7, 20))!)).toBe('2026-08-05');
  });

  it('有漏掉的期次时，跳过它们给出未来那一期', () => {
    const s = monthly(5, d(2026, 1, 1));
    // 上次生成到 5 月，6/7 月都欠着 —— 下次"将要"的应该是 8 月
    expect(iso(upcomingDate(s, d(2026, 5, 5), d(2026, 7, 20))!)).toBe('2026-08-05');
  });

  it('规则已过期时返回 null', () => {
    const s = monthly(5, d(2026, 1, 1), d(2026, 6, 30));
    expect(upcomingDate(s, d(2026, 6, 5), d(2026, 7, 20))).toBeNull();
  });
});

describe('describeSchedule', () => {
  it('普通日期直说', () => {
    expect(describeSchedule(monthly(5, d(2026, 1, 1)))).toBe('每月 5 号');
  });

  it('29-31 号要提示月末行为', () => {
    expect(describeSchedule(monthly(31, d(2026, 1, 1)))).toContain('当月最后一天');
    expect(describeSchedule(monthly(28, d(2026, 1, 1)))).toBe('每月 28 号');
  });

  it('每周', () => {
    expect(describeSchedule(weekly(1, d(2026, 1, 1)))).toBe('每周一');
    expect(describeSchedule(weekly(0, d(2026, 1, 1)))).toBe('每周日');
  });
});
