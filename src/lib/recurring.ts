// 周期记账的排期计算。纯函数，不碰数据库 —— 落库在 lib/recurringRun.ts。
//
// 场景：房租、订阅、工资这类固定项，配置一次之后自动生成，或到期提醒确认。
//
// ---------------------------------------------------------------------------
// 月末是这里唯一真正难的地方
//
// 「每月 31 号」在 2 月怎么办？三种常见做法：
//   a. 跳过没有 31 号的月份      → 2 月不收房租，显然不对
//   b. 顺延到 3 月 1 日          → 账记到了下个月，月度统计会错
//   c. **落到当月最后一天**       → 2 月 28/29 号，本月的账记在本月
//
// 选 c。房租、工资这类现实中的周期事件本来就是这个语义（"月底扣款"），
// 而且它保证「每月恰好一期」—— a 会丢期，b 会让某个月出现两期。
//
// JS 的 `new Date(2026, 1, 31)` 会静默溢出成 3 月 3 日，这是本文件所有日期
// 构造都显式钳制天数的原因。

export type Frequency = 'monthly' | 'weekly';

export type RecurringSchedule = {
  frequency: Frequency;
  /** monthly：1-31，超出当月天数时落到当月最后一天 */
  dayOfMonth?: number;
  /** weekly：0=周日 … 6=周六 */
  dayOfWeek?: number;
  /** 规则生效起点（含当天） */
  startDate: Date;
  /** 结束日期（含当天），null 表示无限期 */
  endDate: Date | null;
};

/** 某年某月有多少天。month 是 0-11 */
export function daysInMonth(year: number, month: number): number {
  // 下个月的第 0 天 = 当月最后一天
  return new Date(year, month + 1, 0).getDate();
}

/** 构造某月的第 day 天，超出当月天数时钳到最后一天（见文件头对月末的说明） */
export function clampedDate(year: number, month: number, day: number): Date {
  const max = daysInMonth(year, month);
  return new Date(year, month, Math.min(day, max), 0, 0, 0, 0);
}

/** 把时间抹到当天零点，便于按天比较 */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/**
 * 规则的第一期落在哪天。
 *
 * 语义是「startDate 当天或之后的第一个匹配日」——
 * 用户 7 月 20 日创建「每月 5 号」的规则，第一期是 8 月 5 日，不是 7 月 5 日
 * （那天已经过去了，补记一笔用户没预期的账会很惊悚）。
 */
export function firstOccurrence(s: RecurringSchedule): Date {
  const start = startOfDay(s.startDate);

  if (s.frequency === 'monthly') {
    const day = s.dayOfMonth ?? 1;
    const candidate = clampedDate(start.getFullYear(), start.getMonth(), day);
    if (candidate >= start) return candidate;
    return clampedDate(start.getFullYear(), start.getMonth() + 1, day);
  }

  // weekly：往后找到第一个匹配的星期几
  const want = s.dayOfWeek ?? 1;
  const diff = (want - start.getDay() + 7) % 7;
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + diff, 0, 0, 0, 0);
}

/**
 * 给定「上一期」，算下一期。
 *
 * monthly 刻意**基于规则里的 dayOfMonth 推进，而不是基于上一期的实际日期** ——
 * 否则 1 月 31 日的下一期被钳成 2 月 28 日后，再往后就一路变成每月 28 号了，
 * 「每月 31 号」的规则会永久漂移。
 */
export function nextOccurrence(s: RecurringSchedule, prev: Date): Date {
  if (s.frequency === 'monthly') {
    const day = s.dayOfMonth ?? 1;
    return clampedDate(prev.getFullYear(), prev.getMonth() + 1, day);
  }
  return new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 7, 0, 0, 0, 0);
}

/** 规则是否已经过了结束日期 */
export function isExpired(s: RecurringSchedule, on: Date): boolean {
  return s.endDate !== null && startOfDay(on) > startOfDay(s.endDate);
}

/**
 * 算出**截至 now 为止、尚未生成**的所有期次。
 *
 * `lastGenerated` 是上次已生成到哪一期（null 表示还没生成过任何一期）。
 *
 * 为什么要支持补跑多期：容器可能停了两个月，或者用户两个月没打开应用。
 * 回来时应当把这两个月的房租都补上，而不是只记最近一笔。
 *
 * `maxCatchUp` 是护栏：规则的 startDate 若被填成十年前，一次补几百条对谁都
 * 没好处。超出上限时只生成最近的 maxCatchUp 期，并由调用方告知用户。
 */
export function dueOccurrences(
  s: RecurringSchedule,
  lastGenerated: Date | null,
  now: Date,
  maxCatchUp = 24,
): { dates: Date[]; truncated: boolean } {
  const today = startOfDay(now);
  const all: Date[] = [];

  let cursor = lastGenerated ? nextOccurrence(s, startOfDay(lastGenerated)) : firstOccurrence(s);

  // 必须**走完整个区间**再截断，不能攒够 maxCatchUp 就停 ——
  // 提前停下来拿到的是最早的几期（startDate 若是十年前，那就是十年前那几期），
  // 而我们要的是最近的几期。日期推进只是算术，跑几百次的代价可以忽略。
  //
  // HARD_LIMIT 是防呆：startDate 被填成公元 1000 年之类的情况下不至于空转太久。
  const HARD_LIMIT = 5000;
  while (cursor <= today && !isExpired(s, cursor) && all.length < HARD_LIMIT) {
    all.push(cursor);
    cursor = nextOccurrence(s, cursor);
  }

  if (all.length > maxCatchUp) {
    // 截断时保留**最近的**几期 —— 用户更关心近期的账
    return { dates: all.slice(-maxCatchUp), truncated: true };
  }
  return { dates: all, truncated: false };
}

/**
 * 下一次将要生成的日期，用于界面上显示「下次：8 月 5 日」。
 * 规则已过期时返回 null。
 */
export function upcomingDate(
  s: RecurringSchedule,
  lastGenerated: Date | null,
  now: Date,
): Date | null {
  const today = startOfDay(now);
  let cursor = lastGenerated ? nextOccurrence(s, startOfDay(lastGenerated)) : firstOccurrence(s);
  // 跳过已经到期但还没生成的（那些会在下次生成时被补上）
  while (cursor <= today) {
    if (isExpired(s, cursor)) return null;
    cursor = nextOccurrence(s, cursor);
  }
  return isExpired(s, cursor) ? null : cursor;
}

/** 界面用的中文描述 */
export function describeSchedule(s: RecurringSchedule): string {
  if (s.frequency === 'monthly') {
    const d = s.dayOfMonth ?? 1;
    return d > 28 ? `每月 ${d} 号（不足则当月最后一天）` : `每月 ${d} 号`;
  }
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `每${names[s.dayOfWeek ?? 1]}`;
}
