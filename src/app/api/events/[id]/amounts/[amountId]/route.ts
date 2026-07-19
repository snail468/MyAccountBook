import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { syncEventStatus } from '@/lib/eventStatus';

const patchSchema = z.object({
  cents: z.number().int().positive().max(1_000_000_00).optional(),
  note: z.string().max(200).nullable().optional(),
  rewardMethod: z.string().trim().min(1).max(64).nullable().optional(),
  occurredAt: z.string().datetime().nullable().optional(),
});

async function ensureOwn(
  eventId: string,
  amountId: string,
  userId: string,
): Promise<{ eventId: string } | null> {
  const amt = await prisma.eventAmount.findUnique({
    where: { id: amountId },
    select: { eventId: true, event: { select: { userId: true, id: true } } },
  });
  if (!amt || amt.event.userId !== userId || amt.eventId !== eventId) return null;
  return { eventId: amt.eventId };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; amountId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const { id, amountId } = await params;

  const own = await ensureOwn(id, amountId, user.id);
  if (!own) return NextResponse.json({ error: '不存在' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '参数错误' }, { status: 400 });
  const p = parsed.data;

  const data: Record<string, unknown> = {};
  if (p.cents !== undefined) data.cents = p.cents;
  if (p.note !== undefined) data.note = p.note?.trim() || null;
  if (p.rewardMethod !== undefined) data.rewardMethod = p.rewardMethod?.trim() || null;
  if (p.occurredAt !== undefined)
    data.occurredAt = p.occurredAt ? new Date(p.occurredAt) : new Date();

  await prisma.eventAmount.update({ where: { id: amountId }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; amountId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const { id, amountId } = await params;

  const own = await ensureOwn(id, amountId, user.id);
  if (!own) return NextResponse.json({ error: '不存在' }, { status: 404 });

  await prisma.eventAmount.delete({ where: { id: amountId } });
  await syncEventStatus(own.eventId);
  return NextResponse.json({ ok: true });
}
