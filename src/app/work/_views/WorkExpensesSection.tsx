import Link from 'next/link';
import { prisma } from '@/lib/db';
import Money from '@/components/ui/Money';
import { DEFAULT_PAGE_SIZE, encodeCursor } from '@/lib/pagination';
import ExpenseList from '../expenses/ExpenseList';
import { NOT_DELETED } from '@/lib/softDelete';
import { REFUND_OVERDUE_DAYS, daysSincePending, refundStatus } from '@/lib/refundStatus';

// 工作账本"出项汇总"section。同 WorkMonthsSection：/work/expenses 与
// /l/[id]/expenses 共用同一段渲染逻辑。
//
// **重要设计约束**：所有汇总（total / refunded / byCategory / overdue）与
// 首屏列表**必须从同一次 SQL 查询里派生**。历史上这里发过 5 条独立 SQL：
//   1. aggregate(所有出项)      -> total
//   2. aggregate(已回款)        -> refundedTotal
//   3. groupBy(category)        -> byCategory
//   4. groupBy(refunded, category) -> refundedByCategory
//   5. findMany(refundedAt=null) -> pendingRows → summarizeOverdue
//   6. findMany(take=51)        -> firstPage
// 每条 SQL 单独看都对，但只要其中任何一条与另一条对**同一批行的观察角度**
// 存在细微差别（Prisma 版本差、SQLite TEXT 比较边界、软删/直删 race、
// 老数据 refundedAt 格式怪、bootstrap 期间 ledger 迁移余温……），
// 就会出现"页面顶部说 8 笔，列表里明明能看到 12 条红条"这类漂移。
//
// 换成一次 findMany 拿全，所有派生量在 JS 里 reduce ——
// 派生量之间的一致性变成算术恒等式，不依赖任何 SQL 层的假设。个人账本
// 量级下（几千行）内存/耗时都可以接受，且避免了原来 5 次 round-trip。
//
// **但那还不是漏计的根因**。真正的根因在 lib/refundStatus.ts 的 advanceDate()：
// 补录进旧月份的垫款，occurredAt 是"补录那天"，按它算根本不到 30 天，
// 于是顶部不计、列表不标红，人却能在页面最底下的旧月份里看见它。
// 聚合口径改多少遍都修不好一个错的基准日期。现在基准日期统一走 advanceDate()。
//
// 另一条不变量：`now` 由这里取一次，连同数据一起传给 ExpenseList，
// 客户端不再自己 new Date()。顶部汇总与每一行的红标因此是**同一时刻**的
// 同一份判定 —— 页面开着放几个小时也不会出现"顶部说 8 笔、列表 9 条红"。

type CategoryStat = {
  category: string;
  totalCents: number;
  count: number;
  refundedCents: number;
  pendingCents: number;
};

async function loadExpenses(ledgerId: string) {
  const baseWhere = { ledgerId, ...NOT_DELETED, direction: 'expense' as const };

  // 一次拉全部：TIME_DESC_ORDER 让 items[0..49] 自然就是首屏，无需二次查询
  const all = await prisma.entry.findMany({
    where: baseWhere,
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
  });

  // 单次遍历同时算：total / refunded / byCategory / overdue。所有派生量
  // 都出自 all，任何两组数字之间的关系永远算术等价。
  const now = new Date();
  let total = 0;
  let refundedTotal = 0;
  let refundedCount = 0;
  let overdueCount = 0;
  let overdueTotalCents = 0;
  let overdueOldestDays = 0;
  const catMap = new Map<
    string,
    { totalCents: number; count: number; refundedCents: number }
  >();
  for (const e of all) {
    total += e.amountCents;
    const isRefunded = e.refundedAt !== null;
    if (isRefunded) {
      refundedTotal += e.amountCents;
      refundedCount += 1;
    } else {
      // 与客户端 ExpenseList 里的 refundStatus() 用完全同一个函数、同一个 now
      const input = {
        occurredAt: e.occurredAt,
        refundedAt: e.refundedAt,
        yearMonth: e.yearMonth,
      };
      if (refundStatus(input, now) === 'overdue') {
        overdueCount += 1;
        overdueTotalCents += e.amountCents;
        // 天数也必须走 daysSincePending —— 自己写 now - occurredAt 就又把
        // advanceDate() 的月末夹绕过去了，"最久 N 天"会跟着一起少算
        const ageDays = daysSincePending(input, now);
        if (ageDays > overdueOldestDays) overdueOldestDays = ageDays;
      }
    }
    const c = catMap.get(e.category) ?? { totalCents: 0, count: 0, refundedCents: 0 };
    c.totalCents += e.amountCents;
    c.count += 1;
    if (isRefunded) c.refundedCents += e.amountCents;
    catMap.set(e.category, c);
  }

  const categoryStats: CategoryStat[] = [...catMap.entries()]
    .map(([category, c]) => ({
      category,
      totalCents: c.totalCents,
      count: c.count,
      refundedCents: c.refundedCents,
      pendingCents: c.totalCents - c.refundedCents,
    }))
    .sort((a, b) => b.totalCents - a.totalCents);

  // 首屏切片：拿 all 的前 DEFAULT_PAGE_SIZE 条；有更多就给游标供客户端加载
  const items = all.slice(0, DEFAULT_PAGE_SIZE);
  const nextCursor =
    all.length > DEFAULT_PAGE_SIZE && items.length > 0
      ? encodeCursor({
          occurredAt: items[items.length - 1].occurredAt,
          id: items[items.length - 1].id,
        })
      : null;

  return {
    total,
    refundedTotal,
    pending: total - refundedTotal,
    count: all.length,
    refundedCount,
    overdue: {
      count: overdueCount,
      totalCents: overdueTotalCents,
      oldestDays: overdueOldestDays,
    },
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
    // 客户端拿它当"现在"，保证红标与上面的 overdue 汇总同一时刻同一口径
    asOf: now.toISOString(),
  };
}

export default async function WorkExpensesSection({
  ledgerId,
  title,
  backHref,
}: {
  ledgerId: string;
  title: string;
  backHref: string;
}) {
  const s = await loadExpenses(ledgerId);

  return (
    <div className="px-6 pt-14 pb-24">
      <div className="flex items-center gap-3 mb-6">
        <Link href={backHref} className="text-ink-500 text-sm">‹ 返回</Link>
        <h1 className="text-2xl font-semibold flex-1">{title}</h1>
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
        <ExpenseList
          initialEntries={s.entries}
          initialCursor={s.nextCursor}
          ledgerId={ledgerId}
          asOf={s.asOf}
        />
      </section>
    </div>
  );
}
