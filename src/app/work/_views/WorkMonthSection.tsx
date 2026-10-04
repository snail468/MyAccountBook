import { prisma } from '@/lib/db';
import { NOT_DELETED } from '@/lib/softDelete';
import WorkMonthClient from './WorkMonthClient';

// 工作账本"单月"section。
//
// 同 WorkMonthsSection：共享 work 账本走同一段 UI，只是 ledgerId 与返回链接不同。
// NewEntryFlow / EntryRow 依然复用；NewEntryFlow 现在接受 ledgerId 参数
// 会把它带进 POST /api/entries 与离线队列 payload 里。
//
// EntryRow 的 PATCH/DELETE 路径走 /api/entries/[id]，通过 entry.id 反查
// ledger 归属，不需要显式 ledgerId。

export default async function WorkMonthSection({
  ledgerId,
  ledgerName,
  month,
  backHref,
  canEdit = true,
}: {
  ledgerId: string;
  ledgerName: string;
  month: string;
  backHref: string;
  /** 只读协作者(viewer)传 false：隐藏「记一笔」入口。默认可写（owner 自有路由）。 */
  canEdit?: boolean;
}) {
  const entries = await prisma.entry.findMany({
    where: { ledgerId, ...NOT_DELETED, yearMonth: month },
    orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
  });

  const income = entries
    .filter((e) => e.direction === 'income')
    .reduce((a, e) => a + e.amountCents, 0);
  const expense = entries
    .filter((e) => e.direction === 'expense')
    .reduce((a, e) => a + e.amountCents, 0);

  const initialEntries = entries.map((e) => ({
    id: e.id,
    category: e.category,
    direction: e.direction as 'income' | 'expense',
    amountCents: e.amountCents,
    note: e.note,
    occurredAt: e.occurredAt.toISOString(),
    refundedAt: e.refundedAt ? e.refundedAt.toISOString() : null,
  }));

  return (
    <WorkMonthClient
      ledgerId={ledgerId}
      ledgerName={ledgerName}
      month={month}
      backHref={backHref}
      canEdit={canEdit}
      income={income}
      expense={expense}
      initialEntries={initialEntries}
    />
  );
}
