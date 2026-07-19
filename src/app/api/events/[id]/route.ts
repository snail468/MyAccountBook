import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { stringifyRewardMethods } from '@/lib/rewardMethod';

const patchSchema = z.object({
  action: z.literal('meta'),
  title: z.string().trim().min(1).max(200).optional(),
  startAt: z.string().datetime().nullable().optional(),
  deadline: z.string().datetime().nullable().optional(),
  participate: z.boolean().optional(),
  content: z.string().max(2000).nullable().optional(),
  reward: z.string().max(200).nullable().optional(),
  rewardMethods: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  contentImages: z.array(z.string().max(500)).max(9).optional(),
  topicTag: z.string().max(200).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const { id } = await params;

  const event = await prisma.event.findUnique({ where: { id }, select: { userId: true } });
  if (!event || event.userId !== user.id)
    return NextResponse.json({ error: '不存在' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '参数错误' }, { status: 400 });
  const p = parsed.data;

  const data: Record<string, unknown> = {};
  if (p.title !== undefined) data.title = p.title;
  if (p.startAt !== undefined) data.startAt = p.startAt ? new Date(p.startAt) : null;
  if (p.deadline !== undefined) data.deadline = p.deadline ? new Date(p.deadline) : null;
  if (p.participate !== undefined) data.participate = p.participate;
  if (p.content !== undefined) data.content = p.content?.trim() || null;
  if (p.reward !== undefined) data.reward = p.reward?.trim() || null;
  if (p.rewardMethods !== undefined) data.rewardMethods = stringifyRewardMethods(p.rewardMethods);
  if (p.contentImages !== undefined)
    data.contentImages = p.contentImages.length > 0 ? JSON.stringify(p.contentImages) : null;
  if (p.topicTag !== undefined) data.topicTag = p.topicTag?.trim() || null;
  if (p.note !== undefined) data.note = p.note?.trim() || null;

  const updated = await prisma.event.update({ where: { id }, data });
  return NextResponse.json({ ok: true, event: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const { id } = await params;
  const event = await prisma.event.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!event || event.userId !== user.id)
    return NextResponse.json({ error: '不存在' }, { status: 404 });
  await prisma.event.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
