import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';

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
  }),
]);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const { id } = await params;

  const entry = await prisma.entry.findUnique({ where: { id }, select: { userId: true } });
  if (!entry || entry.userId !== user.id)
    return NextResponse.json({ error: '不存在' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '参数错误' }, { status: 400 });
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
  await prisma.entry.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const { id } = await params;

  const entry = await prisma.entry.findUnique({ where: { id }, select: { userId: true } });
  if (!entry || entry.userId !== user.id) {
    return NextResponse.json({ error: '不存在' }, { status: 404 });
  }
  await prisma.entry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
