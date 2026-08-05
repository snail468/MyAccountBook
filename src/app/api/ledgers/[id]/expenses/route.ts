import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireOwnedLedger } from '@/lib/ownership';
import { badRequest } from '@/lib/apiError';
import { parseImageUrls } from '@/lib/imageCleanup';
import { resolveShares } from '@/lib/resolveShares';
import {
  cursorWhere,
  decodeCursor,
  parsePageSize,
  slicePage,
  TIME_DESC_ORDER,
} from '@/lib/pagination';
import { NOT_DELETED } from '@/lib/softDelete';

const splitSchema = z.object({
  memberId: z.string().min(1),
  shareCents: z.number().int().nonnegative().max(1_000_000_00),
});

const allocationSchema = z.object({
  memberId: z.string().min(1),
  weight: z.number().positive().max(1_000_000),
});

const bodySchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    category: z.string().trim().min(1).max(32),
    phase: z.enum(['pre', 'during']),
    currency: z.string().length(3),
    amountForeignCents: z.number().int().positive().max(1_000_000_00),
    rate: z.number().positive().max(1_000_000),
    payerId: z.string().min(1),
    // 首选：只给「谁参与 + 权重」，金额由服务端用最大余额法算，保证守恒
    allocation: z.array(allocationSchema).min(1).max(50).optional(),
    // 兼容旧客户端：直接给精确金额，服务端做**零容差**校验
    splits: z.array(splitSchema).min(1).max(50).optional(),
    note: z.string().max(500).optional().nullable(),
    imageUrls: z.array(z.string().max(500)).max(9).optional(),
    occurredAt: z.string().datetime().optional().nullable(),
    // 离线队列幂等键。见 lib/offlineQueue.ts
    clientId: z.string().length(36).optional().nullable(),
  })
  .refine((v) => v.allocation || v.splits, {
    message: '需要提供 allocation 或 splits',
  });

// GET /api/ledgers/<id>/expenses?phase=during&cursor=<游标>&limit=50
//     /api/ledgers/<id>/expenses?all=1   → 不分页返回全部（趣味报告用）
//
// 趣味报告要算"最烧钱的一天""恩格尔系数"这类跨全量的统计，SQLite 没法用 groupBy
// 表达按天聚合，所以给它一个显式的全量出口 —— 只在用户点开报告时才调，
// 不影响列表页的首屏。
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOwnedLedger(id, { kind: 'travel', kindMessage: '仅旅游账本可用' });
  if (ctx instanceof Response) return ctx;

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
      where: { ledgerId: id, ...NOT_DELETED },
      include,
      orderBy: TIME_DESC_ORDER,
    });
    return NextResponse.json({ expenses: rows.map(serialize), nextCursor: null });
  }

  const limit = parsePageSize(url.searchParams.get('limit'));
  const cursor = decodeCursor(url.searchParams.get('cursor'));

  const rows = await prisma.tripExpense.findMany({
    where: { ledgerId: id, ...NOT_DELETED, ...(phase ? { phase } : {}), ...cursorWhere(cursor) },
    include,
    orderBy: TIME_DESC_ORDER,
    take: limit + 1,
  });

  const { items, nextCursor } = slicePage(rows, limit);
  return NextResponse.json({ expenses: items.map(serialize), nextCursor });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOwnedLedger(id, { kind: 'travel', kindMessage: '仅旅游账本可用' });
  if (ctx instanceof Response) return ctx;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest();
  const p = parsed.data;

  // 验证 payerId + 所有 splits.memberId 都属于本账本
  const members = await prisma.tripMember.findMany({
    where: { ledgerId: id },
    select: { id: true },
  });
  const memberIds = new Set(members.map((m) => m.id));
  if (!memberIds.has(p.payerId)) {
    return badRequest('付款人不在成员列表');
  }
  const participants = p.allocation ?? p.splits ?? [];
  for (const s of participants) {
    if (!memberIds.has(s.memberId)) {
      return badRequest('分摊成员不在成员列表');
    }
  }

  const amountBaseCents = Math.round(p.amountForeignCents * p.rate);

  const resolved = resolveShares(amountBaseCents, p.allocation, p.splits);
  if (!resolved.ok) {
    return badRequest(resolved.reason);
  }
  const splits = resolved.shares;

  // 幂等：客户端传了 clientId 时先查
  if (p.clientId) {
    const existing = await prisma.tripExpense.findUnique({
      where: { ledgerId_clientId: { ledgerId: id, clientId: p.clientId } },
      select: { id: true },
    });
    if (existing) return NextResponse.json({ ok: true, id: existing.id, deduped: true });
  }

  try {
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
          clientId: p.clientId ?? null,
        },
      });
      await tx.tripSplit.createMany({
        data: splits.map((s) => ({
          expenseId: e.id,
          memberId: s.memberId,
          shareCents: s.shareCents,
        })),
      });
      return e;
    });

    return NextResponse.json({ ok: true, id: created.id });
  } catch (err) {
    if (
      p.clientId &&
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      const existing = await prisma.tripExpense.findUnique({
        where: { ledgerId_clientId: { ledgerId: id, clientId: p.clientId } },
        select: { id: true },
      });
      if (existing) return NextResponse.json({ ok: true, id: existing.id, deduped: true });
    }
    throw err;
  }
}
