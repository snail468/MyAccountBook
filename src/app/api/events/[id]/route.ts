import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { REWARD_METHOD_KEYS } from '@/lib/rewardMethod';

const patchSchema = z.union([
  // 推进：填写下一步的金额
  z.object({
    action: z.literal('predict'),
    predictedCents: z.number().int().positive().max(1_000_000_00),
    at: z.string().datetime().optional().nullable(),
  }),
  z.object({
    action: z.literal('announce'),
    announcedCents: z.number().int().positive().max(1_000_000_00),
    at: z.string().datetime().optional().nullable(),
  }),
  z.object({
    action: z.literal('pay'),
    paidCents: z.number().int().positive().max(1_000_000_00),
    at: z.string().datetime().optional().nullable(),
  }),
  // 就地修改已填写的金额或对应时间（不改状态）
  z.object({
    action: z.literal('editAmount'),
    stage: z.enum(['predicted', 'announced', 'paid']),
    cents: z.number().int().positive().max(1_000_000_00),
    at: z.string().datetime().optional().nullable(),
  }),
  // 删除某一步的金额 → 状态倒回上一步
  z.object({
    action: z.literal('clearStage'),
    stage: z.enum(['predicted', 'announced', 'paid']),
  }),
  // 元信息更新（活动本身的字段）
  z.object({
    action: z.literal('meta'),
    title: z.string().trim().min(1).max(80).optional(),
    startAt: z.string().datetime().nullable().optional(),
    deadline: z.string().datetime().nullable().optional(),
    participate: z.boolean().optional(),
    content: z.string().max(500).nullable().optional(),
    reward: z.string().max(200).nullable().optional(),
    rewardMethod: z
      .enum(REWARD_METHOD_KEYS as [string, ...string[]])
      .nullable()
      .optional(),
    topicTag: z.string().max(200).nullable().optional(),
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
  if (!event || event.userId !== user.id)
    return NextResponse.json({ error: '不存在' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '参数错误' }, { status: 400 });
  const p = parsed.data;

  if (p.action === 'meta') {
    const data: Record<string, unknown> = {};
    if (p.title !== undefined) data.title = p.title;
    if (p.startAt !== undefined) data.startAt = p.startAt ? new Date(p.startAt) : null;
    if (p.deadline !== undefined) data.deadline = p.deadline ? new Date(p.deadline) : null;
    if (p.participate !== undefined) data.participate = p.participate;
    if (p.content !== undefined) data.content = p.content?.trim() || null;
    if (p.reward !== undefined) data.reward = p.reward?.trim() || null;
    if (p.rewardMethod !== undefined) data.rewardMethod = p.rewardMethod || null;
    if (p.topicTag !== undefined) data.topicTag = p.topicTag?.trim() || null;
    if (p.note !== undefined) data.note = p.note?.trim() || null;
    const updated = await prisma.event.update({ where: { id }, data });
    return NextResponse.json({ ok: true, event: updated });
  }

  if (p.action === 'clearStage') {
    // 删除某一步的金额，状态倒回上一步；同步清掉后续步骤的所有值
    const data: Record<string, unknown> = {};
    if (p.stage === 'predicted') {
      data.predictedCents = null;
      data.predictedAt = null;
      data.announcedCents = null;
      data.announcedAt = null;
      data.paidCents = null;
      data.paidAt = null;
      data.status = 'published';
    } else if (p.stage === 'announced') {
      data.announcedCents = null;
      data.announcedAt = null;
      data.paidCents = null;
      data.paidAt = null;
      data.status = 'predicted';
    } else if (p.stage === 'paid') {
      data.paidCents = null;
      data.paidAt = null;
      data.status = 'announced';
    }
    const updated = await prisma.event.update({ where: { id }, data });
    return NextResponse.json({ ok: true, event: updated });
  }

  if (p.action === 'editAmount') {
    // 就地改一个已经填写的阶段金额（不改 status）
    const currentValueField: Record<string, number | null> = {
      predicted: event.predictedCents,
      announced: event.announcedCents,
      paid: event.paidCents,
    };
    if (currentValueField[p.stage] === null) {
      return NextResponse.json(
        { error: '该阶段尚未填写，请从上一步推进' },
        { status: 400 },
      );
    }
    const data: Record<string, unknown> = {};
    if (p.stage === 'predicted') {
      data.predictedCents = p.cents;
      if (p.at !== undefined) data.predictedAt = p.at ? new Date(p.at) : null;
    } else if (p.stage === 'announced') {
      data.announcedCents = p.cents;
      if (p.at !== undefined) data.announcedAt = p.at ? new Date(p.at) : null;
    } else if (p.stage === 'paid') {
      data.paidCents = p.cents;
      if (p.at !== undefined) data.paidAt = p.at ? new Date(p.at) : null;
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

  const at = p.at ? new Date(p.at) : new Date();
  const data: Record<string, unknown> = { status: targetStatus };
  if (p.action === 'predict') {
    data.predictedCents = p.predictedCents;
    data.predictedAt = at;
  } else if (p.action === 'announce') {
    data.announcedCents = p.announcedCents;
    data.announcedAt = at;
  } else if (p.action === 'pay') {
    data.paidCents = p.paidCents;
    data.paidAt = at;
  }

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
