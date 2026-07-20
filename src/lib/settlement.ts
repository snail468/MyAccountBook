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

export function computeSettlement(balances: NetBalance[]): Transfer[] {
  // 复制并规范化（去掉净额为 0 的）
  const debtors = balances
    .filter((b) => b.netCents < -1) // 欠钱的（阈值 1 分避免浮点误差）
    .map((b) => ({ ...b, remaining: -b.netCents }))
    .sort((a, b) => b.remaining - a.remaining);
  const creditors = balances
    .filter((b) => b.netCents > 1) // 该收钱的
    .map((b) => ({ ...b, remaining: b.netCents }))
    .sort((a, b) => b.remaining - a.remaining);

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
    if (debtor.remaining <= 1) i++;
    if (creditor.remaining <= 1) j++;
  }
  return transfers;
}
