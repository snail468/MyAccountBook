import Link from 'next/link';
import { prisma } from '@/lib/db';
import Money from '@/components/ui/Money';
import PendingBadge from '@/components/ui/PendingBadge';
import NewEntryFlow from '../[month]/NewEntryFlow';
import EntryRow from '../[month]/EntryRow';
import { NOT_DELETED } from '@/lib/softDelete';

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
}: {
  ledgerId: string;
  ledgerName: string;
  month: string;
  backHref: string;
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

  return (
    <div className="px-6 pt-14">
      <div className="flex items-center gap-3 mb-6">
        <Link href={backHref} className="text-ink-500 text-sm">
          ‹ {ledgerName}
        </Link>
      </div>
      <PendingBadge kind="work" ledgerId={ledgerId} />
      <div className="rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 p-5">
        <div className="text-xs text-ink-500">
          {month.split('-')[0]} 年 {Number(month.split('-')[1])} 月
        </div>
        <div className="num text-3xl font-semibold mt-1">
          进项 <Money cents={income} />
        </div>
        <div className="mt-2 text-xs text-ink-500 num">
          出项 <Money cents={expense} />
        </div>
      </div>

      <NewEntryFlow yearMonth={month} ledgerId={ledgerId} />

      <div className="mt-6 space-y-2">
        {entries.length === 0 && (
          <div className="text-center text-sm text-ink-400 py-8">还没有记录，点击上方 + 开始</div>
        )}
        {entries.map((e) => (
          <EntryRow
            key={e.id}
            id={e.id}
            category={e.category}
            direction={e.direction as 'income' | 'expense'}
            amountCents={e.amountCents}
            note={e.note}
            occurredAt={e.occurredAt.toISOString()}
            refundedAt={e.refundedAt ? e.refundedAt.toISOString() : null}
          />
        ))}
      </div>
    </div>
  );
}
