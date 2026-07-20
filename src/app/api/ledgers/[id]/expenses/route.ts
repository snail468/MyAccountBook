import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';

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
