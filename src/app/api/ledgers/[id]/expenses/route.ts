import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { parseImageUrls } from '@/lib/imageCleanup';
import {
  cursorWhere,
  decodeCursor,
  parsePageSize,
  slicePage,
  TIME_DESC_ORDER,
} from '@/lib/pagination';

const splitSchema = z.object({
  memberId: z.string().min(1),
  shareCents: z.number().int().nonnegative().max(1_000_000_00),
});

const bodySchema = z.object({
  title: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(32),
  phase: z.enum(['pre', 'during']),
  currency: z.string().length(3),
  amountForeignCents: z.number().int().positive().max(1_000_000_00),
  rate: z.number().positive().max(1_000_000),
  payerId: z.string().min(1),
  splits: z.array(splitSchema).min(1).max(50),
  note: z.string().max(500).optional().nullable(),
  imageUrls: z.array(z.string().max(500)).max(9).optional(),
  occurredAt: z.string().datetime().optional().nullable(),
});

async function ownLedger(id: string, userId: string) {
  const l = await prisma.ledger.findUnique({
    where: { id },
    select: { userId: true, kind: true },
  });
  if (!l || l.userId !== userId) return null;
  return l;
}

// GET /api/ledgers/<id>/expenses?phase=during&cursor=<游标>&limit=50
//     /api/ledgers/<id>/expenses?all=1   → 不分页返回全部（趣味报告用）
//
// 趣味报告要算"最烧钱的一天""恩格尔系数"这类跨全量的统计，SQLite 没法用 groupBy
// 表达按天聚合，所以给它一个显式的全量出口 —— 只在用户点开报告时才调，
// 不影响列表页的首屏。
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const { id } = await params;
  const own = await ownLedger(id, user.id);
  if (!own) return NextResponse.json({ error: '账本不存在' }, { status: 404 });
  if (own.kind !== 'travel') {
    return NextResponse.json({ error: '仅旅游账本可用' }, { status: 400 });
  }

  const url = new URL(req.url);
  const all = url.searchParams.get('all') === '1';
  const phaseParam = url.searchParams.get('phase');
  const phase = phaseParam === 'pre' || phaseParam === 'during' ? phaseParam : undefined;

  const include = {
    splits: true,
    payer: { select: { id: true, displayName: true } },
  } as const;

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

  if (all) {
    const rows = await prisma.tripExpense.findMany({
      where: { ledgerId: id },
      include,
      orderBy: TIME_DESC_ORDER,
    });
    return NextResponse.json({ expenses: rows.map(serialize), nextCursor: null });
  }

  const limit = parsePageSize(url.searchParams.get('limit'));
  const cursor = decodeCursor(url.searchParams.get('cursor'));

  const rows = await prisma.tripExpense.findMany({
    where: { ledgerId: id, ...(phase ? { phase } : {}), ...cursorWhere(cursor) },
    include,
    orderBy: TIME_DESC_ORDER,
    take: limit + 1,
  });

  const { items, nextCursor } = slicePage(rows, limit);
  return NextResponse.json({ expenses: items.map(serialize), nextCursor });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const { id } = await params;
  const own = await ownLedger(id, user.id);
  if (!own) return NextResponse.json({ error: '账本不存在' }, { status: 404 });
  if (own.kind !== 'travel') {
    return NextResponse.json({ error: '仅旅游账本可用' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '参数错误' }, { status: 400 });
  const p = parsed.data;

  // 验证 payerId + 所有 splits.memberId 都属于本账本
  const members = await prisma.tripMember.findMany({
    where: { ledgerId: id },
    select: { id: true },
  });
  const memberIds = new Set(members.map((m) => m.id));
  if (!memberIds.has(p.payerId)) {
    return NextResponse.json({ error: '付款人不在成员列表' }, { status: 400 });
  }
  for (const s of p.splits) {
    if (!memberIds.has(s.memberId)) {
      return NextResponse.json({ error: '分摊成员不在成员列表' }, { status: 400 });
    }
  }

  const amountBaseCents = Math.round(p.amountForeignCents * p.rate);

  // 分摊金额之和必须等于本币总额（允许 1 分误差）
  const sumShares = p.splits.reduce((a, s) => a + s.shareCents, 0);
  if (Math.abs(sumShares - amountBaseCents) > Math.max(2, p.splits.length)) {
    return NextResponse.json(
      { error: `分摊之和 ${(sumShares / 100).toFixed(2)} 与本币总额 ${(amountBaseCents / 100).toFixed(2)} 不匹配` },
      { status: 400 },
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    const e = await tx.tripExpense.create({
      data: {
        ledgerId: id,
        payerId: p.payerId,
        title: p.title,
        category: p.category,
        phase: p.phase,
        currency: p.currency.toUpperCase(),
        amountForeignCents: p.amountForeignCents,
        rate: p.rate,
        amountBaseCents,
        note: p.note?.trim() || null,
        imageUrls: p.imageUrls && p.imageUrls.length > 0 ? JSON.stringify(p.imageUrls) : null,
        occurredAt: p.occurredAt ? new Date(p.occurredAt) : new Date(),
      },
    });
    await tx.tripSplit.createMany({
      data: p.splits.map((s) => ({
        expenseId: e.id,
        memberId: s.memberId,
        shareCents: s.shareCents,
      })),
    });
    return e;
  });

  return NextResponse.json({ ok: true, id: created.id });
}
