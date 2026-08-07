// 工作账本出项的回款状态判定。
//
// 出项本质是"我垫的钱，等报销/回款"。原状态只有两种：
//   * 已回款：refundedAt 非空
//   * 未回款：refundedAt 为空
// 但一笔挂了半年的账和昨天新挂的账，风险差得远。这里把未回款细分成
// "正常"（还在合理等待期内）和"超期"（超过阈值），方便页面高亮。

/**
 * 未回款条目的"超期"阈值，天数。
 *
 * 选 30 天是因为大多数公司报销周期在 3-4 周；超过一个月还没到账，
 * 值得单独提醒用户跟一下。改成用户可配置放在 [[settings]] 里再说。
 */
export const REFUND_OVERDUE_DAYS = 30;

export type RefundStatus = 'refunded' | 'pending' | 'overdue';

export type RefundInput = {
  occurredAt: Date;
  refundedAt: Date | null;
  /**
   * 这笔记在哪个月（'YYYY-MM'）。**必填**，不是可选的锦上添花 ——
   * 见下面 advanceDate() 的说明：少了它，超期判定就会漏算补录的垫款。
   * 声明成必填是为了让编译器守住每个调用点，而不是靠人记得传。
   */
  yearMonth: string;
};

/** 'YYYY-MM' → 该月最后一刻（UTC）。格式不对返回 null。 */
export function monthEndUtc(yearMonth: string): Date | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(yearMonth);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]); // 1-12
  // 下月 1 号 00:00 UTC 减 1ms。用 UTC 而不是本地时区：服务端（Docker 里常是
  // UTC）与客户端（用户本地）必须算出**逐毫秒相同**的值，否则又会出现
  // "顶部汇总和列表红标不一致"。对 30 天的阈值来说，时区那点偏差无关紧要。
  const nextMonthStart = Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1);
  return new Date(nextMonthStart - 1);
}

/**
 * 这笔钱**实际垫出去的时间**。
 *
 * 为什么不能直接用 occurredAt —— 这是"顶部黄色汇总漏计"反复复发的真正原因：
 *
 *   月页面的「记一笔」表单里，occurredAt 的默认值是**打开表单的那一刻**，
 *   跟你正在看的是哪个月完全无关。于是 3 月的垫款如果 8 月才补录进系统，
 *   落库就是 { yearMonth: '2026-03', occurredAt: '2026-08-04' }。
 *   按 occurredAt 算，它"才挂了 3 天" → 不超期 → 顶部不计、列表不标红；
 *   但它在明细里是按 yearMonth 分组的，稳稳待在页面最底下的「3 月」里。
 *   用户翻到底看见一笔三月的垫款没进汇总，报"漏计"。
 *
 *   前两次修复都在改聚合口径（SQL 分裂 → 单次 SQL → 单遍 reduce），
 *   而漏计压根不在聚合层 —— 是**判定基准日期本身就是错的**，
 *   所以聚合怎么改都没用。
 *
 * 取 min(occurredAt, 该 yearMonth 的月末)：3 月的账最晚也只能是 3 月 31 日
 * 垫出去的，不可能是 8 月。这个式子是**单调**的 —— 只会把基准日往前挪，
 * 永远不会让一笔本该超期的变成不超期，所以不存在"修 A 漏 B"的反向风险。
 *
 * 注意反方向不夹：occurredAt 早于所属月份（手动改过日期、旧数据）时保持原值，
 * 那种情况本来就该算得更久，夹回月初反而会把超期的藏起来。
 */
export function advanceDate(entry: RefundInput): Date {
  const end = monthEndUtc(entry.yearMonth);
  if (!end) return entry.occurredAt; // yearMonth 脏数据：退回老行为
  return entry.occurredAt.getTime() <= end.getTime() ? entry.occurredAt : end;
}

/**
 * 判定一条出项的回款状态。
 *
 * 判定基准是 advanceDate（见上）而不是 createdAt —— 补录一笔上个月的
 * 出项，它当时就已经是"垫了钱"的状态，不该因为今天才录进系统就被算作
 * "才挂 1 天"。
 */
export function refundStatus(
  entry: RefundInput,
  now: Date = new Date(),
  overdueDays: number = REFUND_OVERDUE_DAYS,
): RefundStatus {
  if (entry.refundedAt !== null) return 'refunded';
  const ageMs = now.getTime() - advanceDate(entry).getTime();
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  return ageDays >= overdueDays ? 'overdue' : 'pending';
}

/** 距离超期还有多少天（正数）；已超期返回超期了多少天（正数，永远 ≥ 1） */
export function daysSincePending(
  entry: RefundInput,
  now: Date = new Date(),
): number {
  const ageMs = now.getTime() - advanceDate(entry).getTime();
  return Math.max(0, Math.floor(ageMs / (24 * 60 * 60 * 1000)));
}

export type OverdueSummary = {
  count: number;
  totalCents: number;
  oldestDays: number;
};

/**
 * 一次扫过所有未回款条目，返回超期部分的合计。
 * 供 /work/expenses 页顶部的高亮卡片使用。
 */
export function summarizeOverdue(
  entries: (RefundInput & { amountCents: number })[],
  now: Date = new Date(),
  overdueDays: number = REFUND_OVERDUE_DAYS,
): OverdueSummary {
  let count = 0;
  let totalCents = 0;
  let oldestDays = 0;
  for (const e of entries) {
    if (refundStatus(e, now, overdueDays) !== 'overdue') continue;
    count += 1;
    totalCents += e.amountCents;
    const d = daysSincePending(e, now);
    if (d > oldestDays) oldestDays = d;
  }
  return { count, totalCents, oldestDays };
}
