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
};

/**
 * 判定一条出项的回款状态。
 *
 * 判定基准是 occurredAt（发生时间）而不是 createdAt —— 补录一笔上个月的
 * 出项，它当时就已经是"垫了钱"的状态，不该因为今天才录进系统就被算作
 * "才挂 1 天"。
 */
export function refundStatus(
  entry: RefundInput,
  now: Date = new Date(),
  overdueDays: number = REFUND_OVERDUE_DAYS,
): RefundStatus {
  if (entry.refundedAt !== null) return 'refunded';
  const ageMs = now.getTime() - entry.occurredAt.getTime();
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  return ageDays >= overdueDays ? 'overdue' : 'pending';
}

/** 距离超期还有多少天（正数）；已超期返回超期了多少天（正数，永远 ≥ 1） */
export function daysSincePending(
  entry: RefundInput,
  now: Date = new Date(),
): number {
  const ageMs = now.getTime() - entry.occurredAt.getTime();
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
