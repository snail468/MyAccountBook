import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUserWithRole } from '@/lib/session';
import { prisma } from '@/lib/db';
import { ensureLegacyMigrated } from '@/lib/legacyMigrate';
import { parseRewardMethods } from '@/lib/rewardMethod';
import LogoutButton from '@/components/LogoutButton';
import ExportButton from '@/components/ExportButton';
import Money from '@/components/ui/Money';
import Prefetcher from '@/components/ui/Prefetcher';

export const dynamic = 'force-dynamic';

async function loadDashboard(userId: string) {
  await ensureLegacyMigrated();

  const ledgers = await prisma.ledger.findMany({
    where: { userId, archived: false, deletedAt: null },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  });

  const hasWork = ledgers.some((l) => l.kind === 'work');
  const hasTaoyuan = ledgers.some((l) => l.kind === 'taoyuan');

  // 工作数据 —— 用 SQL 聚合，不再把全部条目拉进内存
  const workSums = hasWork
    ? await prisma.entry.groupBy({
        by: ['direction'],
        where: { userId },
        _sum: { amountCents: true },
      })
    : [];
  const workSumOf = (dir: string) =>
    workSums.find((r) => r.direction === dir)?._sum.amountCents ?? 0;
  const B = workSumOf('income');
  const expenseTotal = workSumOf('expense');

  // 桃源数据
  const paidAmounts = hasTaoyuan
    ? await prisma.eventAmount.findMany({
        where: { stage: 'paid', event: { userId } },
        select: {
          cents: true,
          rewardMethod: true,
          event: { select: { rewardMethod: true, rewardMethods: true } },
        },
      })
    : [];
  let C = 0;
  let D = 0;
  const otherReward = new Map<string, number>();
  for (const a of paidAmounts) {
    let method = a.rewardMethod;
    if (!method) {
      const methods = parseRewardMethods(a.event.rewardMethods, a.event.rewardMethod);
      method = methods[0] ?? null;
    }
    if (method === 'cash') C += a.cents;
    else if (method === 'jdcard') D += a.cents;
    else if (method) otherReward.set(method, (otherReward.get(method) ?? 0) + a.cents);
    else C += a.cents;
  }

  const pendingCount = hasTaoyuan
    ? await prisma.event.count({
        where: {
          userId,
          status: { in: ['published', 'predicted', 'announced'] },
        },
      })
    : 0;

  // 其它自建账本的小卡片数据
  //
  // 原来这里是 for 循环里逐个账本发查询（N+1）—— 账本一多首页就线性变慢。
  // 现在改成按类型各发一组 groupBy，总查询数固定为 3 条，与账本数量无关。
  const generalIds = ledgers.filter((l) => l.kind === 'general').map((l) => l.id);
  const travelIds = ledgers.filter((l) => l.kind === 'travel').map((l) => l.id);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [generalSums, travelSums, travelMemberCounts] = await Promise.all([
    generalIds.length > 0
      ? prisma.generalEntry.groupBy({
          by: ['ledgerId', 'direction'],
          where: {
            ledgerId: { in: generalIds },
            occurredAt: { gte: monthStart, lt: monthEnd },
          },
          _sum: { amountCents: true },
        })
      : Promise.resolve([]),
    travelIds.length > 0
      ? prisma.tripExpense.groupBy({
          by: ['ledgerId'],
          where: { ledgerId: { in: travelIds } },
          _sum: { amountBaseCents: true },
        })
      : Promise.resolve([]),
    travelIds.length > 0
      ? prisma.tripMember.groupBy({
          by: ['ledgerId'],
          where: { ledgerId: { in: travelIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const generalSumOf = (ledgerId: string, dir: string) =>
    generalSums.find((r) => r.ledgerId === ledgerId && r.direction === dir)?._sum
      .amountCents ?? 0;
  const travelTotalOf = (ledgerId: string) =>
    travelSums.find((r) => r.ledgerId === ledgerId)?._sum.amountBaseCents ?? 0;
  const travelMembersOf = (ledgerId: string) =>
    travelMemberCounts.find((r) => r.ledgerId === ledgerId)?._count._all ?? 0;

  const otherLedgers = ledgers.filter((l) => l.kind === 'general' || l.kind === 'travel');
  const ledgerCards: {
    id: string;
    kind: string;
    name: string;
    icon: string | null;
    summary: string;
    accent: string | null;
  }[] = [];
  for (const l of otherLedgers) {
    let summary: string;
    if (l.kind === 'general') {
      const income = generalSumOf(l.id, 'income');
      const expense = generalSumOf(l.id, 'expense');
      summary = `本月支出 ${(expense / 100).toFixed(2)} · 收入 ${(income / 100).toFixed(2)}`;
      if (l.budgetCents && l.budgetCents > 0) {
        summary += ` · 预算 ${Math.round((expense / l.budgetCents) * 100)}%`;
      }
    } else {
      const total = travelTotalOf(l.id);
      summary = `${travelMembersOf(l.id)} 人 · 已花 ${(total / 100).toFixed(2)} ${l.baseCurrency ?? ''}`;
    }
    ledgerCards.push({
      id: l.id,
      kind: l.kind,
      name: l.name,
      icon: l.icon,
      summary,
      accent: null,
    });
  }

  return {
    hasWork,
    hasTaoyuan,
    A: B + C + D,
    B,
    C,
    D,
    expenseTotal,
    pendingCount,
    otherReward: [...otherReward.entries()],
    ledgerCards,
  };
}

export default async function HomePage() {
  const user = await requireUserWithRole();
  if (!user) redirect('/login');

  const s = await loadDashboard(user.id);
  const showCombined = s.hasWork && s.hasTaoyuan;

  // 预取所有可能的目标路由
  const prefetchRoutes: string[] = ['/ledgers'];
  if (s.hasWork) prefetchRoutes.push('/work', '/work/expenses');
  if (s.hasTaoyuan) prefetchRoutes.push('/taoyuan');
  if (user.role === 'admin') prefetchRoutes.push('/admin');
  for (const c of s.ledgerCards) prefetchRoutes.push(`/l/${c.id}`);

  return (
    <div className="px-6 pt-14">
      <Prefetcher routes={prefetchRoutes} />
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-ink-500">{user.username} · 心愿便利贴</div>
        <LogoutButton />
      </div>

      {showCombined && (
        <div className="rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 p-6 mt-4 shadow-sm">
          <div className="text-xs text-ink-500 mb-1">总收入 A = B + C + D (元)</div>
          <div className="num text-5xl font-bold" style={{ color: '#ff2d87' }}>
            <Money cents={s.A} />
          </div>
          <div className="mt-5 space-y-2 text-sm">
            <SumRow label="B  工作账本 · 进项" cents={s.B} className="text-ink-900 dark:text-ink-100" />
            <SumRow label="C  桃源 · 现金奖励" cents={s.C} className="text-ink-900 dark:text-ink-100" />
            <SumRow
              label="D  桃源 · 京东卡奖励"
              cents={s.D}
              className="text-ink-400 dark:text-ink-500"
            />
          </div>
          {s.otherReward.length > 0 && (
            <div className="mt-4 pt-3 border-t border-ink-100 dark:border-ink-700">
              <div className="text-[11px] text-ink-500 mb-1">
                以下奖励类型不计入 A，仅存档展示
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-500 num">
                {s.otherReward.map(([k, v]) => (
                  <span key={k}>
                    {rewardLabel(k)} <Money cents={v} />
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!showCombined && s.hasWork && (
        <div className="rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 p-6 mt-4 shadow-sm">
          <div className="text-xs text-ink-500 mb-1">工作账本 · 累计进项 (元)</div>
          <div className="num text-4xl font-bold" style={{ color: '#ff2d87' }}>
            <Money cents={s.B} />
          </div>
          <div className="mt-3 text-xs text-ink-500 num">
            累计出项 <Money cents={s.expenseTotal} />
          </div>
        </div>
      )}

      {!showCombined && s.hasTaoyuan && (
        <div className="rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 p-6 mt-4 shadow-sm">
          <div className="text-xs text-ink-500 mb-1">桃源账本 · 累计到账 (元)</div>
          <div className="num text-4xl font-bold" style={{ color: '#ff2d87' }}>
            <Money cents={s.C + s.D} />
          </div>
          <div className="mt-3 text-xs text-ink-500 num flex gap-4">
            <span>现金 <Money cents={s.C} /></span>
            <span>京东卡 <Money cents={s.D} /></span>
          </div>
        </div>
      )}

      <div className="mt-8 space-y-3">
        {s.hasWork && (
          <>
            <Link
              href="/work"
              className="flex items-center justify-between p-5 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 active:scale-[0.98] transition"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xl">💼</span>
                <div className="min-w-0">
                  <div className="text-lg font-medium">工作账本</div>
                  <div className="text-xs text-ink-500 mt-0.5">按月记录进项与出项</div>
                </div>
              </div>
              <span className="text-ink-400">›</span>
            </Link>
            <Link
              href="/work/expenses"
              className="flex items-center justify-between p-5 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 active:scale-[0.98] transition"
            >
              <div>
                <div className="text-lg font-medium">工作出项汇总</div>
                <div className="text-xs text-ink-500 mt-1 num">
                  合计 <Money cents={s.expenseTotal} />
                </div>
              </div>
              <span className="text-ink-400">›</span>
            </Link>
          </>
        )}

        {s.hasTaoyuan && (
          <Link
            href="/taoyuan"
            className="flex items-center justify-between p-5 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 active:scale-[0.98] transition"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xl">🌸</span>
              <div className="min-w-0">
                <div className="text-lg font-medium flex items-center gap-2">
                  桃源账本
                  {s.pendingCount > 0 && (
                    <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-xs rounded-full bg-red-500 text-white">
                      {s.pendingCount}
                    </span>
                  )}
                </div>
                <div className="text-xs text-ink-500 mt-0.5">活动发布 → 预测 → 公示 → 发钱</div>
              </div>
            </div>
            <span className="text-ink-400">›</span>
          </Link>
        )}

        {s.ledgerCards.map((c) => (
          <Link
            key={c.id}
            href={`/l/${c.id}`}
            className="flex items-center justify-between p-5 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 active:scale-[0.98] transition"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xl">{c.icon ?? (c.kind === 'travel' ? '✈️' : '📒')}</span>
              <div className="min-w-0">
                <div className="text-lg font-medium truncate">{c.name}</div>
                <div className="text-xs text-ink-500 mt-0.5 truncate">{c.summary}</div>
              </div>
            </div>
            <span className="text-ink-400">›</span>
          </Link>
        ))}

        <Link
          href="/ledgers"
          className="flex items-center justify-between p-5 rounded-2xl border-2 border-dashed border-ink-300 dark:border-ink-600 text-ink-500 active:scale-[0.98] transition"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">＋</span>
            <div>
              <div className="text-lg font-medium">添加 / 删除账本</div>
              <div className="text-xs mt-0.5">新增账本 · 恢复回收站 · 管理已有</div>
            </div>
          </div>
          <span>›</span>
        </Link>

        <ExportButton />

        {user.role === 'admin' && (
          <Link
            href="/admin"
            className="flex items-center justify-between p-5 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 active:scale-[0.98] transition"
          >
            <div>
              <div className="text-lg font-medium">用户管理</div>
              <div className="text-xs text-ink-500 mt-1">管理员专属：新增/删除/重置用户</div>
            </div>
            <span className="text-ink-400">›</span>
          </Link>
        )}
      </div>
    </div>
  );
}

function SumRow({
  label,
  cents,
  className,
}: {
  label: string;
  cents: number;
  className?: string;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-xs text-ink-500">{label}</span>
      <span className={`num text-base font-medium ${className ?? ''}`}>
        <Money cents={cents} />
      </span>
    </div>
  );
}

function rewardLabel(k: string) {
  if (k.startsWith('custom:')) return k.slice('custom:'.length);
  switch (k) {
    case 'qcoin':
      return 'Q币';
    case 'carrotcoin':
      return '萝卜币';
    case 'merch':
      return '周边';
    default:
      return k;
  }
}
