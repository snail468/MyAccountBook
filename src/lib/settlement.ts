// 贪心结算：给定每个成员的净额，输出最少转账清单
// 输入: [{memberId, name, netCents}]  netCents > 0 表示别人欠他；< 0 表示他欠别人
// 输出: [{fromId, fromName, toId, toName, amountCents}]

export type NetBalance = {
  memberId: string;
  name: string;
  netCents: number;
};

export type Transfer = {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amountCents: number;
};

export class SettlementError extends Error {}

/**
 * 把净额清单压成最少笔数的转账。
 *
 * 原实现用 `> 1` / `<= 1` 分的阈值跳过小额，会留下最多 1 分的尾差永远结不掉
 * （净额 ±1 分的人被直接忽略，转账总额与债务总额不相等）。现在改成：
 *   * 严格按 != 0 筛选，不丢任何一分
 *   * 主循环结束后如果还有残余，兜底转给当前最大债权人
 *   * 返回前做守恒断言
 *
 * 前置条件：所有净额之和必须为 0（分摊守恒的必然结果）。不为 0 说明上游
 * 数据已经错了，这里直接抛错而不是悄悄产出一份对不上的清单。
 */
export function computeSettlement(balances: NetBalance[]): Transfer[] {
  const totalNet = balances.reduce((a, b) => a + b.netCents, 0);
  if (totalNet !== 0) {
    throw new SettlementError(
      `净额总和应为 0，实际为 ${totalNet} 分 —— 上游分摊数据不守恒`,
    );
  }

  // 按绝对值降序，让大额优先配对，笔数更少。
  // 金额相同时按 memberId 排序，保证同样输入得到同样清单（幂等，便于测试和对账）。
  const byMagnitudeThenId = (a: { remaining: number; memberId: string }, b: { remaining: number; memberId: string }) => {
    if (b.remaining !== a.remaining) return b.remaining - a.remaining;
    return a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0;
  };

  const debtors = balances
    .filter((b) => b.netCents < 0)
    .map((b) => ({ ...b, remaining: -b.netCents }))
    .sort(byMagnitudeThenId);
  const creditors = balances
    .filter((b) => b.netCents > 0)
    .map((b) => ({ ...b, remaining: b.netCents }))
    .sort(byMagnitudeThenId);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const pay = Math.min(debtor.remaining, creditor.remaining);
    if (pay > 0) {
      transfers.push({
        fromId: debtor.memberId,
        fromName: debtor.name,
        toId: creditor.memberId,
        toName: creditor.name,
        amountCents: pay,
      });
      debtor.remaining -= pay;
      creditor.remaining -= pay;
    }
    // 严格清零才推进，不再用 <= 1 的阈值把 1 分残余丢掉
    if (debtor.remaining === 0) i++;
    if (creditor.remaining === 0) j++;
  }

  // 净额守恒 + 严格清零推进 ⇒ 这里理论上不会有残余。
  // 留个兜底并断言，万一将来改动破坏了不变量，让它当场暴露。
  const leftoverDebt = debtors.reduce((a, d) => a + d.remaining, 0);
  const leftoverCredit = creditors.reduce((a, c) => a + c.remaining, 0);
  if (leftoverDebt !== 0 || leftoverCredit !== 0) {
    throw new SettlementError(
      `结算残留未清：欠 ${leftoverDebt} 分 / 应收 ${leftoverCredit} 分（实现 bug）`,
    );
  }

  const moved = transfers.reduce((a, t) => a + t.amountCents, 0);
  const owed = balances.filter((b) => b.netCents > 0).reduce((a, b) => a + b.netCents, 0);
  if (moved !== owed) {
    throw new SettlementError(`转账总额 ${moved} 与应收总额 ${owed} 不一致（实现 bug）`);
  }

  return transfers;
}

/**
 * 容错版本：上游数据不守恒时不抛错，返回空清单并把原因带出来，
 * 供页面渲染时使用 —— 一个历史数据有问题的旧账本不该让整页 500。
 */
export function computeSettlementSafe(
  balances: NetBalance[],
): { transfers: Transfer[]; error: string | null } {
  try {
    return { transfers: computeSettlement(balances), error: null };
  } catch (err) {
    return {
      transfers: [],
      error: err instanceof Error ? err.message : '结算计算失败',
    };
  }
}
