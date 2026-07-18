import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { formatYuan } from '@/lib/money';
import NewEntryFlow from './NewEntryFlow';
import EntryRow from './EntryRow';

export const dynamic = 'force-dynamic';

export default async function MonthPage({
  params,
}: {
  params: Promise<{ month: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect('/login');
  const { month } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) notFound();

  const entries = await prisma.entry.findMany({
    where: { userId: user.id, yearMonth: month },
    orderBy: { createdAt: 'desc' },
  });

  const income = entries
    .filter((e) => e.direction === 'income')
    .reduce((a, e) => a + e.amountCents, 0);
  const expense = entries
    .filter((e) => e.direction === 'expense')
    .reduce((a, e) => a + e.amountCents, 0);
  const net = income - expense;

  return (
    <div className="px-6 pt-10">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/work" className="text-ink-500 text-sm">‹ 工作账本</Link>
      </div>
      <div className="rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 p-5">
        <div className="text-xs text-ink-500">
          {month.split('-')[0]} 年 {Number(month.split('-')[1])} 月
        </div>
        <div className={`num text-3xl font-semibold mt-1 ${net < 0 ? 'text-red-500' : ''}`}>
          {formatYuan(net, { sign: true })}
        </div>
        <div className="mt-2 flex gap-4 text-xs text-ink-500 num">
          <span>入 {formatYuan(income)}</span>
          <span>出 {formatYuan(expense)}</span>
        </div>
      </div>

      <NewEntryFlow yearMonth={month} />

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
          />
        ))}
      </div>
    </div>
  );
}
