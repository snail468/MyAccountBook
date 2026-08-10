// 旅游账本的服务端聚合加载，被账本页（/l/[id]）与只读分享页（/share/[token]）共用。
//
// 原本 loadTravel 定义在 page.tsx 里，两个页面要用就得复制一遍。抽到这里，
// 一处维护、两处复用。聚合逻辑（阶段合计、每人垫付/承担、净额、最优结算）
// 全部在服务端算好，客户端只负责渲染 —— 客户端分页后手里只有片段，结算算出来是错的。

import { prisma } from '@/lib/db';
import { computeSettlementSafe } from '@/lib/settlement';
import { NOT_DELETED } from '@/lib/softDelete';
import { DEFAULT_PAGE_SIZE, slicePage, TIME_DESC_ORDER } from '@/lib/pagination';
import { parseImageUrls } from '@/lib/imageCleanup';
import type { NetBalance, Transfer } from '@/lib/settlement';

/** 与客户端 TravelView 的 Expense 结构一致（纯数据，无方法） */
export type TravelExpenseDTO = {
  id: string;
  title: string;
  category: string;
  phase: 'pre' | 'during';
  currency: string;
  amountForeignCents: number;
  rate: number;
  amountBaseCents: number;
  note: string | null;
  imageUrls: string[];
  occurredAt: string;
  payerId: string;
  payerName: string;
  splits: { memberId: string; shareCents: number }[];
};

export type TravelMemberDTO = {
  id: string;
  userId: string | null;
  displayName: string;
  settled: boolean;
};

export type LoadTravelResult = {
  members: TravelMemberDTO[];
  preTotal: number;
  duringTotal: number;
  balances: NetBalance[];
  transfers: Transfer[];
  settlementError: string | null;
  preExpenses: TravelExpenseDTO[];
  preCursor: string | null;
  duringExpenses: TravelExpenseDTO[];
  duringCursor: string | null;
  daily: { date: string; cents: number; count: number }[];
  currencyTotals: { currency: string; foreignCents: number }[];
  /** 仅在 includeAllExpenses 时返回：全量支出，供只读页的报告/结算单直接使用 */
  allExpenses?: TravelExpenseDTO[];
};

export async function loadTravel(
  ledgerId: string,
  opts: { includeAllExpenses?: boolean } = {},
): Promise<LoadTravelResult> {
  const expenseInclude = {
    splits: true,
    payer: { select: { id: true, displayName: true } },
  } as const;

  const [
    members,
    phaseSums,
    paidByPayer,
    owedByMember,
    prePage,
    duringPage,
    // C11 旅游打磨：按天 / 按币种聚合。一次性只取 4 个轻字段，在内存里分桶。
    // **必须带 NOT_DELETED**，否则软删的支出会被算进每日/每币种总额。
    allExpensesAgg,
  ] = await Promise.all([
    prisma.tripMember.findMany({
      where: { ledgerId },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.tripExpense.groupBy({
      by: ['phase'],
      where: { ledgerId, ...NOT_DELETED },
      _sum: { amountBaseCents: true },
    }),
    // 每人垫付了多少 —— **软删的支出必须排除**，否则净额和最优结算算错
    prisma.tripExpense.groupBy({
      by: ['payerId'],
      where: { ledgerId, ...NOT_DELETED },
      _sum: { amountBaseCents: true },
    }),
    // 每人该承担多少 —— 同样只算未删的支出对应的分摊
    prisma.tripSplit.groupBy({
      by: ['memberId'],
      where: { expense: { ledgerId, ...NOT_DELETED } },
      _sum: { shareCents: true },
    }),
    prisma.tripExpense.findMany({
      where: { ledgerId, ...NOT_DELETED, phase: 'pre' },
      include: expenseInclude,
      orderBy: TIME_DESC_ORDER,
      take: DEFAULT_PAGE_SIZE + 1,
    }),
    prisma.tripExpense.findMany({
      where: { ledgerId, ...NOT_DELETED, phase: 'during' },
      include: expenseInclude,
      orderBy: TIME_DESC_ORDER,
      take: DEFAULT_PAGE_SIZE + 1,
    }),
    prisma.tripExpense.findMany({
      where: { ledgerId, ...NOT_DELETED },
      select: {
        occurredAt: true,
        amountBaseCents: true,
        amountForeignCents: true,
        currency: true,
      },
    }),
  ]);

  // 按天分桶（本位币）
  const dailyMap = new Map<string, { cents: number; count: number }>();
  // 按币种分桶（外币原币，用于多币种预算）
  const currencyMap = new Map<string, number>();
  for (const e of allExpensesAgg) {
    const day = e.occurredAt.toISOString().slice(0, 10);
    const cur = dailyMap.get(day) ?? { cents: 0, count: 0 };
    cur.cents += e.amountBaseCents;
    cur.count += 1;
    dailyMap.set(day, cur);
    currencyMap.set(e.currency, (currencyMap.get(e.currency) ?? 0) + e.amountForeignCents);
  }
  const daily = Array.from(dailyMap.entries())
    .map(([date, v]) => ({ date, cents: v.cents, count: v.count }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const currencyTotals = Array.from(currencyMap.entries()).map(([currency, foreignCents]) => ({
    currency,
    foreignCents,
  }));

  const paidMap = new Map(paidByPayer.map((r) => [r.payerId, r._sum.amountBaseCents ?? 0]));
  const owedMap = new Map(owedByMember.map((r) => [r.memberId, r._sum.shareCents ?? 0]));

  const balances = members.map((m) => ({
    memberId: m.id,
    name: m.displayName,
    netCents: (paidMap.get(m.id) ?? 0) - (owedMap.get(m.id) ?? 0),
  }));
  // 用容错版本：老账本可能在旧的宽容校验下存了不守恒的分摊。
  const { transfers, error: settlementError } = computeSettlementSafe(balances);

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
  }): TravelExpenseDTO => ({
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

  const result: LoadTravelResult = {
    members: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      displayName: m.displayName,
      settled: m.settled,
    })),
    preTotal: sumOfPhase('pre'),
    duringTotal: sumOfPhase('during'),
    balances,
    transfers,
    settlementError,
    preExpenses: pre.items.map(serialize),
    preCursor: pre.nextCursor,
    duringExpenses: during.items.map(serialize),
    duringCursor: during.nextCursor,
    daily,
    currencyTotals,
  };

  // 只读分享页需要全量支出来渲染报告/结算单，且不能依赖登录态。
  if (opts.includeAllExpenses) {
    const allRows = await prisma.tripExpense.findMany({
      where: { ledgerId, ...NOT_DELETED },
      include: expenseInclude,
      orderBy: TIME_DESC_ORDER,
    });
    result.allExpenses = allRows.map(serialize);
  }

  return result;
}
