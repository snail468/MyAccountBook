import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';

const patchSchema = z.object({
  category: z.string().trim().min(1).max(32).optional(),
  amountCents: z.number().int().positive().max(1_000_000_00).optional(),
  tags: z.string().max(200).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  imageUrls: z.array(z.string().max(500)).max(9).optional(),
  occurredAt: z.string().datetime().nullable().optional(),
});

async function ensureOwn(ledgerId: string, entryId: string, userId: string) {
  const entry = await prisma.generalEntry.findUnique({
    where: { id: entryId },
    select: { ledgerId: true, ledger: { select: { userId: true } } },
  });
  if (!entry || entry.ledgerId !== ledgerId || entry.ledger.userId !== userId) return null;
  return entry;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const { id, entryId } = await params;
  const own = await ensureOwn(id, entryId, user.id);
  if (!own) return NextResponse.json({ error: '不存在' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '参数错误' }, { status: 400 });
  const p = parsed.data;

  const data: Record<string, unknown> = {};
  if (p.category !== undefined) data.category = p.category;
  if (p.amountCents !== undefined) data.amountCents = p.amountCents;
  if (p.tags !== undefined) data.tags = p.tags?.trim() || null;
  if (p.note !== undefined) data.note = p.note?.trim() || null;
  if (p.imageUrls !== undefined)
    data.imageUrls = p.imageUrls.length > 0 ? JSON.stringify(p.imageUrls) : null;
  if (p.occurredAt !== undefined)
    data.occurredAt = p.occurredAt ? new Date(p.occurredAt) : new Date();

  await prisma.generalEntry.update({ where: { id: entryId }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const { id, entryId } = await params;
  const own = await ensureOwn(id, entryId, user.id);
  if (!own) return NextResponse.json({ error: '不存在' }, { status: 404 });
  await prisma.generalEntry.delete({ where: { id: entryId } });
  return NextResponse.json({ ok: true });
}
