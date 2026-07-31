import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireOwnedEventAmount } from '@/lib/ownership';
import { badRequest } from '@/lib/apiError';
import { syncEventStatus } from '@/lib/eventStatus';

const patchSchema = z.object({
  cents: z.number().int().positive().max(1_000_000_00).optional(),
  note: z.string().max(200).nullable().optional(),
  rewardMethod: z.string().trim().min(1).max(64).nullable().optional(),
  occurredAt: z.string().datetime().nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; amountId: string }> },
) {
  const { id, amountId } = await params;
  const ctx = await requireOwnedEventAmount(id, amountId);
  if (ctx instanceof Response) return ctx;

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return badRequest();
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
  const { id, amountId } = await params;
  const ctx = await requireOwnedEventAmount(id, amountId);
  if (ctx instanceof Response) return ctx;

  await prisma.eventAmount.delete({ where: { id: amountId } });
  await syncEventStatus(ctx.amount.eventId);
  return NextResponse.json({ ok: true });
}
