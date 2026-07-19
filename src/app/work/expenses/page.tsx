import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { formatYuan } from '@/lib/money';
import { formatShort } from '@/lib/datetime';

export const dynamic = 'force-dynamic';

export default async function ExpensesPage() {
  const user = await requireUser();
  if (!user) redirect('/login');

  const expenses = await prisma.entry.findMany({
    where: { userId: user.id, direction: 'expense' },
    orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
  });

  const total = expenses.reduce((a, e) => a + e.amountCents, 0);
  const refundedTotal = expenses
    .filter((e) => !!e.refundedAt)
    .reduce((a, e) => a + e.amountCents, 0);
  const pending = total - refundedTotal;

  // 按月份分组展示
  const byMonth = new Map<string, typeof expenses>();
  for (const e of expenses) {
    const arr = byMonth.get(e.yearMonth) ?? [];
    arr.push(e);
    byMonth.set(e.yearMonth, arr);
  }
  const months = [...byMonth.keys()].sort().reverse();

  return (
    <div className="px-6 pt-10">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-ink-500 text-sm">‹ 返回</Link>
        <h1 className="text-2xl font-semibold flex-1">工作出项汇总</h1>
      </div>

      <div className="rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 p-5">
        <div className="text-xs text-ink-500">全部出项 (元)</div>
        <div className="num text-3xl font-semibold mt-1">{formatYuan(total)}</div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded-lg bg-ink-50 dark:bg-ink-700">
            <div className="text-ink-500">已回款</div>
            <div className="num font-medium mt-0.5">{formatYuan(refundedTotal)}</div>
          </div>
          <div className="p-2 rounded-lg bg-ink-50 dark:bg-ink-700">
            <div className="text-ink-500">未回款</div>
            <div className="num font-medium mt-0.5 text-red-500">{formatYuan(pending)}</div>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {months.length === 0 && (
          <div className="text-center text-sm text-ink-400 py-8">还没有出项</div>
        )}
        {months.map((m) => {
          const list = byMonth.get(m) ?? [];
          const sum = list.reduce((a, e) => a + e.amountCents, 0);
          return (
            <section key={m}>
              <Link
                href={`/work/${m}`}
                className="flex items-baseline justify-between px-1 mb-2 hover:opacity-80"
              >
                <div className="text-sm font-medium">
                  {m.split('-')[0]} 年 {Number(m.split('-')[1])} 月
                </div>
                <div className="text-xs text-ink-500 num">{formatYuan(sum)}</div>
              </Link>
              <div className="space-y-2">
                {list.map((e) => {
                  const refunded = !!e.refundedAt;
                  return (
                    <div
                      key={e.id}
                      className={`flex items-center gap-3 p-3 rounded-2xl border ${
                        refunded
                          ? 'bg-ink-50 dark:bg-ink-800/60 border-ink-200 dark:border-ink-700 text-ink-400'
                          : 'bg-white dark:bg-ink-800 border-ink-200 dark:border-ink-700'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium truncate ${refunded ? 'line-through' : ''}`}>
                          {e.category}
                        </div>
                        <div className="text-[11px] text-ink-500 truncate mt-0.5">
                          {formatShort(e.occurredAt)}
                          {refunded && e.refundedAt && (
                            <> · 回款 {formatShort(e.refundedAt)}</>
                          )}
                        </div>
                        {e.note && (
                          <div
                            className={`text-xs mt-0.5 truncate ${refunded ? 'line-through text-ink-400' : 'text-ink-500'}`}
                          >
                            {e.note}
                          </div>
                        )}
                      </div>
                      <div
                        className={`num text-sm font-medium ${refunded ? 'line-through text-ink-400' : 'text-red-500'}`}
                      >
                        -{formatYuan(e.amountCents)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
