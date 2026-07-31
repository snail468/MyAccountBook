import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireOwnedEventAmount } from '@/lib/ownership';
import { badRequest } from '@/lib/apiError';
import { syncEventStatus } from '@/lib/eventStatus';
import { normalizeAmountInput } from '@/lib/amountInput';

const patchSchema = z.object({
  cents: z.number().int().nonnegative().max(1_000_000_00).optional(),
  quantity: z.number().int().positive().max(1_000_000).nullable().optional(),
  itemDesc: z.string().trim().max(200).nullable().optional(),
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

  // 改了发放方式就等于换了计量方式，三个值字段必须整体重算 ——
  // 只改 rewardMethod 不动 cents/quantity 会留下"方式是 Q币、值却在 cents 里"
  // 这种自相矛盾的行，而金额聚合只看 kind，那笔钱就凭空消失了
  const existing = await prisma.eventAmount.findUnique({
    where: { id: amountId },
    select: { cents: true, quantity: true, itemDesc: true, rewardMethod: true },
  });
  if (!existing) return badRequest('记录不存在');

  const merged = {
    cents: p.cents ?? existing.cents,
    quantity: p.quantity !== undefined ? p.quantity : existing.quantity,
    itemDesc: p.itemDesc !== undefined ? p.itemDesc : existing.itemDesc,
    rewardMethod:
      p.rewardMethod !== undefined ? p.rewardMethod : existing.rewardMethod,
  };
  const norm = normalizeAmountInput(merged);
  if (!norm.ok) return badRequest(norm.reason);

  const data: Record<string, unknown> = {
    cents: norm.value.cents,
    quantity: norm.value.quantity,
    itemDesc: norm.value.itemDesc,
  };
  if (p.note !== undefined) data.note = p.note?.trim() || null;
  if (p.rewardMethod !== undefined) data.rewardMethod = p.rewardMethod?.trim() || null;
  if (p.occurredAt !== undefined)
    data.occurredAt = p.occurredAt ? new Date(p.occurredAt) : new Date();

  await prisma.eventAmount.update({ where: { id: amountId }, data });
  await syncEventStatus(id);
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
