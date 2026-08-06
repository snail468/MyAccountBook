import Link from 'next/link';
import { prisma } from '@/lib/db';
import { NOT_DELETED } from '@/lib/softDelete';
import Money from '@/components/ui/Money';

// 共享 work/taoyuan 账本的精简视图（Phase 2 MVP）。
//
// 为什么不复用 /work、/taoyuan：那两个页面把当前用户的 owner 账本作为主视角，
// 硬编码了 "userId → resolveOwnLedgerId('work')" 的入口。把它们改成能接
// 任意 ledgerId 的多视角组件是独立一大轮工作 —— 涉及月份切换、按类别累计、
// 回款进度、合并/拆分等一整套控件。
//
// 这里只做"能看见 + 让 owner 知道有共享"—— 未来把 /work、/taoyuan 抽成可
// 传 ledgerId 的组件后，这个视图直接复用就好。
export default async function SharedBuiltinView({
  ledgerId,
  ledgerName,
  ledgerKind,
}: {
  ledgerId: string;
  ledgerName: string;
  ledgerKind: string;
}) {
  const isWork = ledgerKind === 'work';

  if (isWork) {
    const entries = await prisma.entry.findMany({
      where: { ledgerId, ...NOT_DELETED },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: 50,
      select: {
        id: true,
        yearMonth: true,
        category: true,
        direction: true,
        amountCents: true,
        note: true,
        occurredAt: true,
        user: { select: { username: true } },
      },
    });
    const income = entries
      .filter((e) => e.direction === 'income')
      .reduce((a, e) => a + e.amountCents, 0);
    const expense = entries
      .filter((e) => e.direction === 'expense')
      .reduce((a, e) => a + e.amountCents, 0);
    return (
      <>
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="text-ink-500 text-sm">‹ 返回</Link>
          <h1 className="text-2xl font-semibold flex-1">
            💼 {ledgerName} <span className="text-sm text-ink-400">（共享工作账本）</span>
          </h1>
          <Link
            href={`/l/${ledgerId}/collaborators`}
            className="text-ink-400 text-sm"
            title="协作成员"
          >
            👥
          </Link>
        </div>
        <div className="rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 p-5">
          <div className="text-xs text-ink-500">最近 50 条 · 汇总</div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm num">
            <div>进 <Money cents={income} /></div>
            <div>出 <Money cents={expense} /></div>
          </div>
        </div>
        <p className="mt-4 text-xs text-ink-500">
          Phase 2 只提供只读视图；完整的记账 / 回款 / 月份切换 UI 会在后续迭代加进来。
          你仍然可以通过 API 或"我自己的 /work"账本继续用主流程记账。
        </p>
        <ul className="mt-4 divide-y divide-ink-100 dark:divide-ink-800 rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-950">
          {entries.length === 0 && (
            <li className="p-4 text-sm text-ink-500 text-center">还没有条目</li>
          )}
          {entries.map((e) => (
            <li key={e.id} className="px-4 py-3 flex items-baseline gap-3">
              <span className="text-xs text-ink-400 shrink-0 tabular-nums">{e.yearMonth}</span>
              <span className="flex-1 truncate">{e.category}</span>
              <span
                className={`num text-sm shrink-0 ${
                  e.direction === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {e.direction === 'income' ? '+' : '-'}<Money cents={e.amountCents} />
              </span>
              <span className="text-[11px] text-ink-400 shrink-0">by {e.user.username}</span>
            </li>
          ))}
        </ul>
      </>
    );
  }

  // taoyuan
  const events = await prisma.event.findMany({
    where: { ledgerId, ...NOT_DELETED },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      title: true,
      status: true,
      createdAt: true,
      topicTag: true,
      user: { select: { username: true } },
      amounts: {
        where: { deletedAt: null },
        select: { stage: true, cents: true },
      },
    },
  });
  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-ink-500 text-sm">‹ 返回</Link>
        <h1 className="text-2xl font-semibold flex-1">
          🌸 {ledgerName} <span className="text-sm text-ink-400">（共享桃源账本）</span>
        </h1>
        <Link
          href={`/l/${ledgerId}/collaborators`}
          className="text-ink-400 text-sm"
          title="协作成员"
        >
          👥
        </Link>
      </div>
      <p className="text-xs text-ink-500 mb-4">
        Phase 2 只提供只读视图；活动的编辑/合并/阶段推进 UI 会在后续迭代加进来。
      </p>
      <ul className="divide-y divide-ink-100 dark:divide-ink-800 rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-950">
        {events.length === 0 && (
          <li className="p-4 text-sm text-ink-500 text-center">还没有活动</li>
        )}
        {events.map((ev) => {
          const paid = ev.amounts.filter((a) => a.stage === 'paid').reduce((s, a) => s + a.cents, 0);
          return (
            <li key={ev.id} className="px-4 py-3">
              <div className="flex items-baseline gap-2">
                <span className="flex-1 truncate">{ev.title}</span>
                <span className="text-[11px] text-ink-400 shrink-0">{ev.status}</span>
                {paid > 0 && (
                  <span className="num text-sm text-emerald-600 dark:text-emerald-400 shrink-0">
                    <Money cents={paid} />
                  </span>
                )}
              </div>
              <div className="text-[11px] text-ink-400 mt-1">
                by {ev.user.username}
                {ev.topicTag && ` · ${ev.topicTag}`}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
