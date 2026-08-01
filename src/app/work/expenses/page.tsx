import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import Money from '@/components/ui/Money';
import Prefetcher from '@/components/ui/Prefetcher';
import { DEFAULT_PAGE_SIZE, slicePage, TIME_DESC_ORDER } from '@/lib/pagination';
import ExpenseList from './ExpenseList';
import { NOT_DELETED } from '@/lib/softDelete';
import { REFUND_OVERDUE_DAYS, summarizeOverdue } from '@/lib/refundStatus';

export const dynamic = 'force-dynamic';

type CategoryStat = {
  category: string;
  totalCents: number;
  count: number;
  refundedCents: number;
  pendingCents: number;
};

async function loadExpenses(userId: string) {
  const baseWhere = { userId, ...NOT_DELETED, direction: 'expense' as const };

  // 未回款超期阈值：occurredAt 早于此的未回款条目算超期。
  // 见 lib/refundStatus.ts 的 REFUND_OVERDUE_DAYS。
  const overdueCutoff = new Date(Date.now() - REFUND_OVERDUE_DAYS * 24 * 60 * 60 * 1000);

  const [overall, refundedOverall, byCategory, refundedByCategory, overdueRows, firstPage] =
    await Promise.all([
      // 汇总下推到 SQL —— 不再把全部出项拉进内存 reduce
      prisma.entry.aggregate({
        where: baseWhere,
        _sum: { amountCents: true },
        _count: true,
      }),
      prisma.entry.aggregate({
        where: { ...baseWhere, refundedAt: { not: null } },
        _sum: { amountCents: true },
        _count: true,
      }),
      prisma.entry.groupBy({
        by: ['category'],
        where: baseWhere,
        _sum: { amountCents: true },
        _count: true,
        orderBy: { _sum: { amountCents: 'desc' } },
      }),
      // refundedAt 是日期不是布尔，没法直接 group by 它的空/非空 —— 单独查一次再合并
      prisma.entry.groupBy({
        by: ['category'],
        where: { ...baseWhere, refundedAt: { not: null } },
        _sum: { amountCents: true },
      }),
      // 超期条目：只查最必要的字段，扔进 summarizeOverdue 得到合计
      prisma.entry.findMany({
        where: { ...baseWhere, refundedAt: null, occurredAt: { lt: overdueCutoff } },
        select: { amountCents: true, occurredAt: true, refundedAt: true },
      }),
      prisma.entry.findMany({
        where: baseWhere,
        orderBy: TIME_DESC_ORDER,
        take: DEFAULT_PAGE_SIZE + 1,
      }),
    ]);
  const overdue = summarizeOverdue(overdueRows);

  const refundedMap = new Map(
    refundedByCategory.map((r) => [r.category, r._sum.amountCents ?? 0]),
  );

  const categoryStats: CategoryStat[] = byCategory.map((r) => {
    const totalCents = r._sum.amountCents ?? 0;
    const refundedCents = refundedMap.get(r.category) ?? 0;
    return {
      category: r.category,
      totalCents,
      count: r._count,
      refundedCents,
      pendingCents: totalCents - refundedCents,
    };
  });

  const { items, nextCursor } = slicePage(firstPage, DEFAULT_PAGE_SIZE);

  const total = overall._sum.amountCents ?? 0;
  const refundedTotal = refundedOverall._sum.amountCents ?? 0;

  return {
    total,
    refundedTotal,
    pending: total - refundedTotal,
    count: overall._count,
    refundedCount: refundedOverall._count,
    overdue,
    categoryStats,
    entries: items.map((e) => ({
      id: e.id,
      yearMonth: e.yearMonth,
      category: e.category,
      amountCents: e.amountCents,
      note: e.note,
      occurredAt: e.occurredAt.toISOString(),
      refundedAt: e.refundedAt?.toISOString() ?? null,
    })),
    nextCursor,
  };
}

export default async function ExpensesPage() {
  const user = await requireUser();
  if (!user) redirect('/login');

  const s = await loadExpenses(user.id);

  return (
    <div className="px-6 pt-14 pb-24">
      <Prefetcher routes={['/']} />
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-ink-500 text-sm">‹ 返回</Link>
        <h1 className="text-2xl font-semibold flex-1">工作出项汇总</h1>
      </div>

      {s.overdue.count > 0 && (
        <div className="rounded-3xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 mb-3">
          <div className="text-xs text-amber-800 dark:text-amber-300 font-medium">
            ⚠️ {s.overdue.count} 笔未回款已超 {REFUND_OVERDUE_DAYS} 天
          </div>
          <div className="text-sm text-amber-900 dark:text-amber-200 num mt-1">
            合计 <Money cents={s.overdue.totalCents} />
            {s.overdue.oldestDays > REFUND_OVERDUE_DAYS && (
              <span className="text-[11px] text-amber-700 dark:text-amber-400 ml-2">
                · 最久 {s.overdue.oldestDays} 天
              </span>
            )}
          </div>
          <div className="text-[11px] text-amber-700 dark:text-amber-400 mt-1.5">
            下方列表中已标红，回款后到月页面把它标为「已回款」即可。
          </div>
        </div>
      )}

      <div className="rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 p-5">
        <div className="text-xs text-ink-500">
          全部出项 (元) · {s.count} 笔
        </div>
        <div className="num text-3xl font-semibold mt-1"><Money cents={s.total} /></div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded-lg bg-ink-50 dark:bg-ink-700">
            <div className="text-ink-500">已回款 · {s.refundedCount} 笔</div>
            <div className="num font-medium mt-0.5 text-emerald-600 dark:text-emerald-400">
              <Money cents={s.refundedTotal} />
            </div>
          </div>
          <div className="p-2 rounded-lg bg-ink-50 dark:bg-ink-700">
            <div className="text-ink-500">未回款 · {s.count - s.refundedCount} 笔</div>
            <div className="num font-medium mt-0.5 text-red-500">
              <Money cents={s.pending} />
            </div>
          </div>
        </div>
        {s.total > 0 && (
          <div className="mt-3">
            <div className="h-2 rounded-full bg-ink-100 dark:bg-ink-700 overflow-hidden flex">
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${Math.round((s.refundedTotal / s.total) * 100)}%` }}
              />
            </div>
            <div className="text-[10px] text-ink-400 mt-1">
              回款进度 {Math.round((s.refundedTotal / s.total) * 100)}%
            </div>
          </div>
        )}
      </div>

      {/* 按出项类别累计 —— 每个类别一张卡，看清钱都垫在哪儿、哪类还没收回来 */}
      {s.categoryStats.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-medium px-1 mb-3">按类别累计</h2>
          <div className="space-y-2">
            {s.categoryStats.map((c) => {
              const pctOfTotal = s.total > 0 ? Math.round((c.totalCents / s.total) * 100) : 0;
              const refundPct =
                c.totalCents > 0 ? Math.round((c.refundedCents / c.totalCents) * 100) : 0;
              const cleared = c.pendingCents <= 0;
              return (
                <div
                  key={c.category}
                  className="p-4 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="text-sm font-medium truncate">{c.category}</span>
                      <span className="text-[10px] text-ink-400 shrink-0">
                        {c.count} 笔 · 占 {pctOfTotal}%
                      </span>
                    </div>
                    <span className="num text-base font-semibold shrink-0">
                      <Money cents={c.totalCents} />
                    </span>
                  </div>

                  <div className="mt-2 h-1.5 rounded-full bg-ink-100 dark:bg-ink-700 overflow-hidden">
                    <div
                      className={`h-full ${cleared ? 'bg-emerald-500' : 'bg-emerald-500/70'}`}
                      style={{ width: `${refundPct}%` }}
                    />
                  </div>

                  <div className="mt-2 flex items-baseline justify-between text-[11px]">
                    <span className="text-emerald-600 dark:text-emerald-400 num">
                      已回款 <Money cents={c.refundedCents} />
                    </span>
                    {cleared ? (
                      <span className="text-emerald-600 dark:text-emerald-400">已结清 ✓</span>
                    ) : (
                      <span className="text-red-500 num">
                        未回款 <Money cents={c.pendingCents} />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-medium px-1 mb-3">明细</h2>
        <ExpenseList initialEntries={s.entries} initialCursor={s.nextCursor} />
      </section>
    </div>
  );
}
