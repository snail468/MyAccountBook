import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { stringifyRewardMethods } from '@/lib/rewardMethod';

const rewardMethodStr = z.string().trim().min(1).max(64);

const bodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  participate: z.boolean().default(true),
  startAt: z.string().datetime().optional().nullable(),
  deadline: z.string().datetime().optional().nullable(),
  content: z.string().max(2000).optional().nullable(),
  reward: z.string().max(200).optional().nullable(),
  rewardMethods: z.array(rewardMethodStr).max(20).optional(),
  contentImages: z.array(z.string().max(500)).max(9).optional(),
  topicTag: z.string().max(200).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '参数错误' }, { status: 400 });
  const p = parsed.data;

  const event = await prisma.event.create({
    data: {
      userId: user.id,
      title: p.title,
      participate: p.participate,
      startAt: p.startAt ? new Date(p.startAt) : null,
      deadline: p.deadline ? new Date(p.deadline) : null,
      content: p.content?.trim() || null,
      reward: p.reward?.trim() || null,
      rewardMethods: stringifyRewardMethods(p.rewardMethods ?? []),
      contentImages: p.contentImages && p.contentImages.length > 0
        ? JSON.stringify(p.contentImages)
        : null,
      topicTag: p.topicTag?.trim() || null,
      note: p.note?.trim() || null,
      status: 'published',
    },
  });
  return NextResponse.json({ ok: true, id: event.id });
}
