import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { displaySharedLedgerName } from '@/lib/ledgerRole';
import Prefetcher from '@/components/ui/Prefetcher';
import { parseImageUrls } from '@/lib/imageCleanup';
import { DEFAULT_PAGE_SIZE, slicePage, TIME_DESC_ORDER } from '@/lib/pagination';
import { NOT_DELETED } from '@/lib/softDelete';
import { RECENCY_WINDOW } from '@/lib/categoryOrder';
import { parseCustom } from '@/lib/generalCategories';
import GeneralView from './GeneralView';
import TravelView from './TravelView';
import { loadTravel } from '@/lib/travelData';

export const dynamic = 'force-dynamic';

/**
 * 本月区间。在服务端算，避免客户端时区/挂载时刻不同导致 hydration 差异，
 * 也顺手修掉一个老问题：原来只有下界，未来日期的记录会被算进"本月"。
 */
function monthRange(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

/**
 * 本周区间：**周一 00:00 到下周一 00:00**（ISO 周制）。
 * 用周一作为起点是国内习惯 —— 用户配置周起始日属于未来 C15，暂不做。
 */
function weekRange(now = new Date()) {
  const dow = now.getDay(); // 0=周日, 1=周一, …, 6=周六
  const daysSinceMonday = (dow + 6) % 7;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { start, end };
}

async function loadGeneral(ledgerId: string, customCategoriesJson: string | null) {
  const { start, end } = monthRange();
  const monthWhere = { ledgerId, ...NOT_DELETED, occurredAt: { gte: start, lt: end } };
  // 分类别预算：从 customCategories 抽出来，客户端不再解析 JSON
  const custom = parseCustom(customCategoriesJson);
  const categoryBudgets = custom.budgets ?? {};
  const categoryBudgetsWeekly = custom.budgetsWeekly ?? {};
  // 有周预算的类别才查本周花销 —— 不然对每类都跑一次 groupBy 太贵
  const weeklyCategories = Object.keys(categoryBudgetsWeekly);
  const { start: weekStart, end: weekEnd } = weekRange();

  // 汇总下推到 SQL —— 不再把全部条目拉进内存 reduce
  const [byDirection, topCatRows, firstPage, recentUsage, weeklySpendRows] = await Promise.all([
    prisma.generalEntry.groupBy({
      by: ['direction'],
      where: monthWhere,
      _sum: { amountCents: true },
    }),
    prisma.generalEntry.groupBy({
      by: ['category'],
      where: { ...monthWhere, direction: 'expense' },
      _sum: { amountCents: true },
      orderBy: { _sum: { amountCents: 'desc' } },
      take: 5,
    }),
    prisma.generalEntry.findMany({
      where: { ledgerId, ...NOT_DELETED },
      orderBy: TIME_DESC_ORDER,
      take: DEFAULT_PAGE_SIZE + 1,
    }),
    // 类别智能排序：最近 N 条条目的 category+direction+occurredAt。
    // 与首页那一页可能重合但字段少得多，独立查一次省得跨组件传递
    prisma.generalEntry.findMany({
      where: { ledgerId, ...NOT_DELETED },
      select: { category: true, direction: true, occurredAt: true },
      orderBy: TIME_DESC_ORDER,
      take: RECENCY_WINDOW,
    }),
    // 周预算类别的本周花销 —— 没设周预算的类别跳过整个查询
    weeklyCategories.length > 0
      ? prisma.generalEntry.groupBy({
          by: ['category'],
          where: {
            ledgerId,
            ...NOT_DELETED,
            direction: 'expense',
            category: { in: weeklyCategories },
            occurredAt: { gte: weekStart, lt: weekEnd },
          },
          _sum: { amountCents: true },
        })
      : Promise.resolve([]),
  ]);

  const weeklySpend: Record<string, number> = {};
  for (const r of weeklySpendRows) weeklySpend[r.category] = r._sum.amountCents ?? 0;

  const sumOf = (dir: string) =>
    byDirection.find((r) => r.direction === dir)?._sum.amountCents ?? 0;

  const { items, nextCursor } = slicePage(firstPage, DEFAULT_PAGE_SIZE);

  return {
    monthStartISO: start.toISOString(),
    monthEndISO: end.toISOString(),
    income: sumOf('income'),
    expense: sumOf('expense'),
    topCats: topCatRows.map((r) => ({
      category: r.category,
      cents: r._sum.amountCents ?? 0,
    })),
    categoryBudgets,
    categoryBudgetsWeekly,
    weeklySpend,
    weekStartISO: weekStart.toISOString(),
    entries: items.map((e) => ({
      id: e.id,
      direction: e.direction,
      category: e.category,
      amountCents: e.amountCents,
      tags: e.tags,
      note: e.note,
      imageUrls: parseImageUrls(e.imageUrls),
      occurredAt: e.occurredAt.toISOString(),
    })),
    recentUsage: recentUsage.map((r) => ({
      category: r.category,
      direction: r.direction,
      occurredAt: r.occurredAt.toISOString(),
    })),
    nextCursor,
  };
}


export default async function LedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) redirect('/login');
  const { id } = await params;

  // B7：走 LedgerMember 判定"我能不能看这个账本"。owner/editor/viewer 都能看，
  // 具体到写操作再由 route handler 自己按 minRole 拦。
  const ledger = await prisma.ledger.findUnique({
    where: { id },
    include: {
      members: { where: { userId: user.id }, select: { role: true }, take: 1 },
      // owner username 用于给共享账本加前缀（区分 "自己那本" vs "别人共享的同类账本"）
      user: { select: { username: true } },
    },
  });
  if (!ledger || ledger.members.length === 0) notFound();
  // 角色暂时只在服务器端做拦截；UI 上的"隐藏写按钮"要等成员管理面板一并做。
  // 拿出来只是为了往下游 view 组件传（当前签名还没接，先留 void）。
  void ledger.members[0]!.role;
  const displayName = displaySharedLedgerName(
    ledger.name,
    ledger.userId,
    user.id,
    ledger.user?.username,
  );

  if (ledger.kind === 'general') {
    const data = await loadGeneral(id, ledger.customCategories);
    return (
      <div className="px-6 pt-14 pb-24">
        <Prefetcher routes={['/']} />
        <GeneralView
          ledger={{
            id: ledger.id,
            name: displayName,
            icon: ledger.icon,
            budgetCents: ledger.budgetCents,
            customCategories: ledger.customCategories,
          }}
          summary={{
            monthStartISO: data.monthStartISO,
            monthEndISO: data.monthEndISO,
            income: data.income,
            expense: data.expense,
            topCats: data.topCats,
            categoryBudgets: data.categoryBudgets,
            categoryBudgetsWeekly: data.categoryBudgetsWeekly,
            weeklySpend: data.weeklySpend,
            weekStartISO: data.weekStartISO,
          }}
          initialEntries={data.entries}
          initialCursor={data.nextCursor}
          recentUsage={data.recentUsage}
        />
      </div>
    );
  }

  if (ledger.kind === 'travel') {
    const data = await loadTravel(id);
    return (
      <div className="px-6 pt-14 pb-24">
        <Prefetcher routes={['/']} />
        <TravelView
          ledger={{
            id: ledger.id,
            name: displayName,
            icon: ledger.icon,
            baseCurrency: ledger.baseCurrency ?? 'CNY',
            startDate: ledger.startDate?.toISOString() ?? null,
            endDate: ledger.endDate?.toISOString() ?? null,
            tripBudget: ledger.tripBudget ?? null,
          }}
          currentUserId={user.id}
          members={data.members}
          preTotal={data.preTotal}
          duringTotal={data.duringTotal}
          balances={data.balances}
          transfers={data.transfers}
          settlementError={data.settlementError}
          preExpenses={data.preExpenses}
          preCursor={data.preCursor}
          duringExpenses={data.duringExpenses}
          duringCursor={data.duringCursor}
          daily={data.daily}
          currencyTotals={data.currencyTotals}
        />
      </div>
    );
  }

  // work/taoyuan Phase 3：可以就地渲染完整的 UI。
  // owner 本人仍重定向到 /work、/taoyuan —— 那两个 URL 是他们已经习惯的入口，
  // 且组件相同，行为一致，只是入口稳定。
  if (ledger.kind === 'work') {
    if (ledger.userId === user.id) redirect('/work');
    const { default: WorkMonthsSection } = await import(
      '@/app/work/_views/WorkMonthsSection'
    );
    return (
      <WorkMonthsSection
        ledgerId={ledger.id}
        ledgerName={`💼 ${displayName}`}
        backHref="/"
        monthHrefPrefix={`/l/${ledger.id}/month`}
      />
    );
  }
  if (ledger.kind === 'taoyuan') {
    if (ledger.userId === user.id) redirect('/taoyuan');
    const { default: TaoyuanSection } = await import(
      '@/app/taoyuan/_views/TaoyuanSection'
    );
    return (
      <TaoyuanSection ledgerId={ledger.id} ledgerName={`🌸 ${displayName}`} backHref="/" />
    );
  }

  return (
    <div className="px-6 pt-14">
      <Link href="/" className="text-ink-500 text-sm">‹ 返回</Link>
      <p className="mt-4 text-ink-500">未知账本类型：{ledger.kind}</p>
    </div>
  );
}
