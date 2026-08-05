import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireOwnedEntry } from '@/lib/ownership';
import { badRequest } from '@/lib/apiError';

const patchSchema = z.union([
  z.object({
    action: z.literal('refund'),
    refundedAt: z.string().datetime().optional().nullable(),
  }),
  z.object({
    action: z.literal('unrefund'),
  }),
  z.object({
    action: z.literal('meta'),
    amountCents: z.number().int().positive().max(1_000_000_00).optional(),
    note: z.string().max(200).nullable().optional(),
    occurredAt: z.string().datetime().nullable().optional(),
    category: z.string().trim().min(1).max(32).optional(),
    direction: z.enum(['income', 'expense']).optional(),
  }),
]);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOwnedEntry(id);
  if (ctx instanceof Response) return ctx;

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return badRequest();
  const p = parsed.data;

  if (p.action === 'refund') {
    const at = p.refundedAt ? new Date(p.refundedAt) : new Date();
    await prisma.entry.update({ where: { id }, data: { refundedAt: at } });
    return NextResponse.json({ ok: true });
  }
  if (p.action === 'unrefund') {
    await prisma.entry.update({ where: { id }, data: { refundedAt: null } });
    return NextResponse.json({ ok: true });
  }
  // meta
  const data: Record<string, unknown> = {};
  if (p.amountCents !== undefined) data.amountCents = p.amountCents;
  if (p.note !== undefined) data.note = p.note?.trim() || null;
  if (p.occurredAt !== undefined) data.occurredAt = p.occurredAt ? new Date(p.occurredAt) : null;
  if (p.category !== undefined) data.category = p.category;
  if (p.direction !== undefined) data.direction = p.direction;
  await prisma.entry.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

// 软删：进回收站。60 天后 lib/recordTrash.ts 的 purgeExpiredRecords 会硬删。
// 彻底删走 DELETE /api/trash/entry/:id
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOwnedEntry(id);
  if (ctx instanceof Response) return ctx;

  await prisma.entry.update({ where: { id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
