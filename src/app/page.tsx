import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { formatYuan } from '@/lib/money';
import LogoutButton from '@/components/LogoutButton';

export const dynamic = 'force-dynamic';

async function getSummary(userId: string) {
  const [entries, paidEvents, pendingCount] = await Promise.all([
    prisma.entry.findMany({
      where: { userId },
      select: { direction: true, amountCents: true },
    }),
    prisma.event.findMany({
      where: { userId, status: 'paid' },
      select: { paidCents: true },
    }),
    prisma.event.count({
      where: { userId, status: { in: ['published', 'predicted', 'announced'] } },
    }),
  ]);

  const workBalance = entries.reduce(
    (acc, e) => acc + (e.direction === 'income' ? e.amountCents : -e.amountCents),
    0,
  );
  const taoyuanBalance = paidEvents.reduce((acc, e) => acc + (e.paidCents ?? 0), 0);
  return {
    total: workBalance + taoyuanBalance,
    workBalance,
    taoyuanBalance,
    pendingCount,
  };
}

export default async function HomePage() {
  const user = await requireUser();
  if (!user) redirect('/login');

  const s = await getSummary(user.id);

  return (
    <div className="px-6 pt-10">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-ink-500">{user.username} · 我的账本</div>
        <LogoutButton />
      </div>

      <div className="rounded-3xl bg-gradient-to-br from-ink-900 to-ink-700 text-white p-6 mt-4 shadow-lg">
        <div className="text-xs text-ink-300 mb-1">目前总储蓄 (元)</div>
        <div className={`num text-4xl font-semibold ${s.total < 0 ? 'text-red-300' : ''}`}>
          {formatYuan(s.total)}
        </div>
        <div className="mt-4 flex text-xs text-ink-300 gap-6">
          <div>
            <div>工作</div>
            <div className="num text-white">{formatYuan(s.workBalance)}</div>
          </div>
          <div>
            <div>桃源</div>
            <div className="num text-white">{formatYuan(s.taoyuanBalance)}</div>
          </div>
        </div>
      </div>

      <div className="mt-8 space-y-3">
        <Link
          href="/work"
          className="flex items-center justify-between p-5 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 active:scale-[0.98] transition"
        >
          <div>
            <div className="text-lg font-medium">工作账本</div>
            <div className="text-xs text-ink-500 mt-1">按月记录工资、奖金、垫款</div>
          </div>
          <span className="text-ink-400">›</span>
        </Link>

        <Link
          href="/taoyuan"
          className="flex items-center justify-between p-5 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 active:scale-[0.98] transition"
        >
          <div>
            <div className="text-lg font-medium flex items-center gap-2">
              桃源账本
              {s.pendingCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-xs rounded-full bg-red-500 text-white">
                  {s.pendingCount}
                </span>
              )}
            </div>
            <div className="text-xs text-ink-500 mt-1">活动发布 → 预测 → 公示 → 发钱</div>
          </div>
          <span className="text-ink-400">›</span>
        </Link>

        <a
          href="/api/export"
          className="flex items-center justify-between p-5 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 active:scale-[0.98] transition"
        >
          <div>
            <div className="text-lg font-medium">导出 CSV</div>
            <div className="text-xs text-ink-500 mt-1">下载全部数据用于备份</div>
          </div>
          <span className="text-ink-400">↓</span>
        </a>
      </div>
    </div>
  );
}
