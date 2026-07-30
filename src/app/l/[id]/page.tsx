import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import Prefetcher from '@/components/ui/Prefetcher';
import { parseImageUrls } from '@/lib/imageCleanup';
import { DEFAULT_PAGE_SIZE, slicePage, TIME_DESC_ORDER } from '@/lib/pagination';
import { computeSettlement } from '@/lib/settlement';
import GeneralView from './GeneralView';
import TravelView from './TravelView';

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

async function loadGeneral(ledgerId: string) {
  const { start, end } = monthRange();
  const monthWhere = { ledgerId, occurredAt: { gte: start, lt: end } };

  // 汇总下推到 SQL —— 不再把全部条目拉进内存 reduce
  const [byDirection, topCatRows, firstPage] = await Promise.all([
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
      where: { ledgerId },
      orderBy: TIME_DESC_ORDER,
      take: DEFAULT_PAGE_SIZE + 1,
    }),
  ]);

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
    nextCursor,
  };
}

async function loadTravel(ledgerId: string) {
  const expenseInclude = {
    splits: true,
    payer: { select: { id: true, displayName: true } },
  } as const;

  const [members, phaseSums, paidByPayer, owedByMember, prePage, duringPage] =
    await Promise.all([
      prisma.tripMember.findMany({
        where: { ledgerId },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.tripExpense.groupBy({
        by: ['phase'],
        where: { ledgerId },
        _sum: { amountBaseCents: true },
      }),
      // 每人垫付了多少
      prisma.tripExpense.groupBy({
        by: ['payerId'],
        where: { ledgerId },
        _sum: { amountBaseCents: true },
      }),
      // 每人该承担多少 —— 结算必须基于全量数据，但只要两个聚合就够，
      // 不需要把明细拉进内存
      prisma.tripSplit.groupBy({
        by: ['memberId'],
        where: { expense: { ledgerId } },
        _sum: { shareCents: true },
      }),
      prisma.tripExpense.findMany({
        where: { ledgerId, phase: 'pre' },
        include: expenseInclude,
        orderBy: TIME_DESC_ORDER,
        take: DEFAULT_PAGE_SIZE + 1,
      }),
      prisma.tripExpense.findMany({
        where: { ledgerId, phase: 'during' },
        include: expenseInclude,
        orderBy: TIME_DESC_ORDER,
        take: DEFAULT_PAGE_SIZE + 1,
      }),
    ]);

  const paidMap = new Map(
    paidByPayer.map((r) => [r.payerId, r._sum.amountBaseCents ?? 0]),
  );
  const owedMap = new Map(owedByMember.map((r) => [r.memberId, r._sum.shareCents ?? 0]));

  const balances = members.map((m) => ({
    memberId: m.id,
    name: m.displayName,
    netCents: (paidMap.get(m.id) ?? 0) - (owedMap.get(m.id) ?? 0),
  }));
  const transfers = computeSettlement(balances);

  const serialize = (e: {
    id: string;
    title: string;
    category: string;
    phase: string;
    currency: string;
    amountForeignCents: number;
    rate: number;
    amountBaseCents: number;
    note: string | null;
    imageUrls: string | null;
    occurredAt: Date;
    payerId: string;
    payer: { displayName: string };
    splits: { memberId: string; shareCents: number }[];
  }) => ({
    id: e.id,
    title: e.title,
    category: e.category,
    phase: e.phase as 'pre' | 'during',
    currency: e.currency,
    amountForeignCents: e.amountForeignCents,
    rate: e.rate,
    amountBaseCents: e.amountBaseCents,
    note: e.note,
    imageUrls: parseImageUrls(e.imageUrls),
    occurredAt: e.occurredAt.toISOString(),
    payerId: e.payerId,
    payerName: e.payer.displayName,
    splits: e.splits.map((s) => ({ memberId: s.memberId, shareCents: s.shareCents })),
  });

  const pre = slicePage(prePage, DEFAULT_PAGE_SIZE);
  const during = slicePage(duringPage, DEFAULT_PAGE_SIZE);
  const sumOfPhase = (p: string) =>
    phaseSums.find((r) => r.phase === p)?._sum.amountBaseCents ?? 0;

  return {
    members: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      displayName: m.displayName,
    })),
    preTotal: sumOfPhase('pre'),
    duringTotal: sumOfPhase('during'),
    balances,
    transfers,
    preExpenses: pre.items.map(serialize),
    preCursor: pre.nextCursor,
    duringExpenses: during.items.map(serialize),
    duringCursor: during.nextCursor,
  };
}

export default async function LedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) redirect('/login');
  const { id } = await params;

  const ledger = await prisma.ledger.findUnique({ where: { id } });
  if (!ledger || ledger.userId !== user.id) notFound();

  if (ledger.kind === 'general') {
    const data = await loadGeneral(id);
    return (
      <div className="px-6 pt-14 pb-24">
        <Prefetcher routes={['/']} />
        <GeneralView
          ledger={{
            id: ledger.id,
            name: ledger.name,
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
          }}
          initialEntries={data.entries}
          initialCursor={data.nextCursor}
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
            name: ledger.name,
            icon: ledger.icon,
            baseCurrency: ledger.baseCurrency ?? 'CNY',
            startDate: ledger.startDate?.toISOString() ?? null,
            endDate: ledger.endDate?.toISOString() ?? null,
          }}
          members={data.members}
          preTotal={data.preTotal}
          duringTotal={data.duringTotal}
          balances={data.balances}
          transfers={data.transfers}
          preExpenses={data.preExpenses}
          preCursor={data.preCursor}
          duringExpenses={data.duringExpenses}
          duringCursor={data.duringCursor}
        />
      </div>
    );
  }

  // work/taoyuan 不应该走到这里，兜底跳转
  if (ledger.kind === 'work') redirect('/work');
  if (ledger.kind === 'taoyuan') redirect('/taoyuan');

  return (
    <div className="px-6 pt-14">
      <Link href="/" className="text-ink-500 text-sm">‹ 返回</Link>
      <p className="mt-4 text-ink-500">未知账本类型：{ledger.kind}</p>
    </div>
  );
}
