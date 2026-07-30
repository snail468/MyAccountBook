import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { cleanupImagesAfterDelete, cleanupRemovedImages } from '@/lib/imageCleanup';
import { resolveShares } from '@/lib/resolveShares';

const splitSchema = z.object({
  memberId: z.string().min(1),
  shareCents: z.number().int().nonnegative().max(1_000_000_00),
});

const allocationSchema = z.object({
  memberId: z.string().min(1),
  weight: z.number().positive().max(1_000_000),
});

const patchSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  category: z.string().trim().min(1).max(32).optional(),
  phase: z.enum(['pre', 'during']).optional(),
  currency: z.string().length(3).optional(),
  amountForeignCents: z.number().int().positive().max(1_000_000_00).optional(),
  rate: z.number().positive().max(1_000_000).optional(),
  payerId: z.string().min(1).optional(),
  // 与 POST 保持同一套语义：allocation 走服务端重算，splits 走零容差校验
  allocation: z.array(allocationSchema).min(1).max(50).optional(),
  splits: z.array(splitSchema).min(1).max(50).optional(),
  note: z.string().max(500).nullable().optional(),
  imageUrls: z.array(z.string().max(500)).max(9).optional(),
  occurredAt: z.string().datetime().nullable().optional(),
});

async function ensureOwn(ledgerId: string, expenseId: string, userId: string) {
  const exp = await prisma.tripExpense.findUnique({
    where: { id: expenseId },
    // imageUrls 一并取出：删除/改图时要拿它清理不再被引用的文件
    select: { ledgerId: true, imageUrls: true, ledger: { select: { userId: true } } },
  });
  if (!exp || exp.ledgerId !== ledgerId || exp.ledger.userId !== userId) return null;
  return exp;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; expenseId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const { id, expenseId } = await params;
  const own = await ensureOwn(id, expenseId, user.id);
  if (!own) return NextResponse.json({ error: '不存在' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '参数错误' }, { status: 400 });
  const p = parsed.data;

  // 若涉及成员/分摊，先确认所有 id 属于同一账本
  const participants = p.allocation ?? p.splits;
  if (p.payerId || participants) {
    const members = await prisma.tripMember.findMany({
      where: { ledgerId: id },
      select: { id: true },
    });
    const memberIds = new Set(members.map((m) => m.id));
    if (p.payerId && !memberIds.has(p.payerId)) {
      return NextResponse.json({ error: '付款人不在成员列表' }, { status: 400 });
    }
    if (participants) {
      for (const s of participants) {
        if (!memberIds.has(s.memberId)) {
          return NextResponse.json({ error: '分摊成员不在成员列表' }, { status: 400 });
        }
      }
    }
  }

  const data: Record<string, unknown> = {};
  if (p.title !== undefined) data.title = p.title;
  if (p.category !== undefined) data.category = p.category;
  if (p.phase !== undefined) data.phase = p.phase;
  if (p.currency !== undefined) data.currency = p.currency.toUpperCase();
  if (p.amountForeignCents !== undefined) data.amountForeignCents = p.amountForeignCents;
  if (p.rate !== undefined) data.rate = p.rate;
  if (p.payerId !== undefined) data.payerId = p.payerId;
  if (p.note !== undefined) data.note = p.note?.trim() || null;
  if (p.imageUrls !== undefined)
    data.imageUrls = p.imageUrls.length > 0 ? JSON.stringify(p.imageUrls) : null;
  if (p.occurredAt !== undefined)
    data.occurredAt = p.occurredAt ? new Date(p.occurredAt) : new Date();

  // 若 amountForeignCents 或 rate 变，重新算 amountBaseCents
  const needRecalcBase =
    p.amountForeignCents !== undefined || p.rate !== undefined;
  if (needRecalcBase) {
    const current = await prisma.tripExpense.findUniqueOrThrow({
      where: { id: expenseId },
      select: { amountForeignCents: true, rate: true },
    });
    const foreign = p.amountForeignCents ?? current.amountForeignCents;
    const rate = p.rate ?? current.rate;
    data.amountBaseCents = Math.round(foreign * rate);
  }

  // 金额或分摊有变动，就得重算分摊 —— 注意即便只改了金额、没改分摊人，
  // 也必须按新总额重新分配，否则会留下一笔不守恒的账。
  // （原来这里只在 p.splits 存在时校验，改金额不动分摊就能绕过去。）
  const baseAfter =
    (data.amountBaseCents as number | undefined) ??
    (
      await prisma.tripExpense.findUniqueOrThrow({
        where: { id: expenseId },
        select: { amountBaseCents: true },
      })
    ).amountBaseCents;

  let newSplits: { memberId: string; shareCents: number }[] | null = null;

  if (participants) {
    const resolved = resolveShares(baseAfter, p.allocation, p.splits);
    if (!resolved.ok) return NextResponse.json({ error: resolved.reason }, { status: 400 });
    newSplits = resolved.shares;
  } else if (data.amountBaseCents !== undefined) {
    // 只改了金额：按原有分摊比例重新分配，保持守恒
    const existing = await prisma.tripSplit.findMany({
      where: { expenseId },
      select: { memberId: true, shareCents: true },
    });
    if (existing.length > 0) {
      const weights = existing.map((s) => ({
        memberId: s.memberId,
        // 原分摊为 0 的成员给一个极小权重，避免总权重为 0
        weight: s.shareCents > 0 ? s.shareCents : 1e-9,
      }));
      const resolved = resolveShares(baseAfter, weights, undefined);
      if (!resolved.ok) return NextResponse.json({ error: resolved.reason }, { status: 400 });
      newSplits = resolved.shares;
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.tripExpense.update({ where: { id: expenseId }, data });
    if (newSplits) {
      await tx.tripSplit.deleteMany({ where: { expenseId } });
      await tx.tripSplit.createMany({
        data: newSplits.map((s) => ({
          expenseId,
          memberId: s.memberId,
          shareCents: s.shareCents,
        })),
      });
    }
  });

  // 用户在编辑里移掉的小票照片，清理掉不再被任何记录引用的那些
  if (p.imageUrls !== undefined) {
    await cleanupRemovedImages(own.imageUrls, p.imageUrls);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; expenseId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const { id, expenseId } = await params;
  const own = await ensureOwn(id, expenseId, user.id);
  if (!own) return NextResponse.json({ error: '不存在' }, { status: 404 });
  await prisma.tripExpense.delete({ where: { id: expenseId } });
  // 删完再清图：此时引用计数查询不会把自己算进去
  await cleanupImagesAfterDelete(own.imageUrls);
  return NextResponse.json({ ok: true });
}
