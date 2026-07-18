import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';

// 允许两类更新：状态推进 (predict/announce/pay) 或 元数据修改
const patchSchema = z.union([
  z.object({
    action: z.literal('predict'),
    predictedCents: z.number().int().positive().max(1_000_000_00),
  }),
  z.object({
    action: z.literal('announce'),
    announcedCents: z.number().int().positive().max(1_000_000_00),
  }),
  z.object({
    action: z.literal('pay'),
    paidCents: z.number().int().positive().max(1_000_000_00),
  }),
  z.object({
    action: z.literal('reopen'),
    to: z.enum(['published', 'predicted', 'announced']),
  }),
  z.object({
    action: z.literal('meta'),
    title: z.string().trim().min(1).max(80).optional(),
    deadline: z.string().datetime().nullable().optional(),
    participate: z.boolean().optional(),
    note: z.string().max(200).nullable().optional(),
  }),
]);

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  published: ['predicted'],
  predicted: ['announced'],
  announced: ['paid'],
  paid: [],
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const { id } = await params;

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event || event.userId !== user.id) return NextResponse.json({ error: '不存在' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '参数错误' }, { status: 400 });
  const p = parsed.data;

  if (p.action === 'meta') {
    const data: Record<string, unknown> = {};
    if (p.title !== undefined) data.title = p.title;
    if (p.deadline !== undefined) data.deadline = p.deadline ? new Date(p.deadline) : null;
    if (p.participate !== undefined) data.participate = p.participate;
    if (p.note !== undefined) data.note = p.note?.trim() || null;
    const updated = await prisma.event.update({ where: { id }, data });
    return NextResponse.json({ ok: true, event: updated });
  }

  if (p.action === 'reopen') {
    // 允许把状态倒回，重置对应字段
    const data: Record<string, unknown> = { status: p.to };
    if (p.to === 'published') {
      data.predictedCents = null;
      data.announcedCents = null;
      data.paidCents = null;
      data.paidAt = null;
    } else if (p.to === 'predicted') {
      data.announcedCents = null;
      data.paidCents = null;
      data.paidAt = null;
    } else if (p.to === 'announced') {
      data.paidCents = null;
      data.paidAt = null;
    }
    const updated = await prisma.event.update({ where: { id }, data });
    return NextResponse.json({ ok: true, event: updated });
  }

  // 前向推进
  const targetStatus =
    p.action === 'predict' ? 'predicted' : p.action === 'announce' ? 'announced' : 'paid';
  if (!ALLOWED_TRANSITIONS[event.status]?.includes(targetStatus)) {
    return NextResponse.json(
      { error: `当前状态 ${event.status} 不能推进到 ${targetStatus}` },
      { status: 400 },
    );
  }

  const data: Record<string, unknown> = { status: targetStatus };
  if (p.action === 'predict') data.predictedCents = p.predictedCents;
  if (p.action === 'announce') data.announcedCents = p.announcedCents;
  if (p.action === 'pay') {
    data.paidCents = p.paidCents;
    data.paidAt = new Date();
  }

  const updated = await prisma.event.update({ where: { id }, data });
  return NextResponse.json({ ok: true, event: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id }, select: { userId: true } });
  if (!event || event.userId !== user.id) return NextResponse.json({ error: '不存在' }, { status: 404 });
  await prisma.event.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
