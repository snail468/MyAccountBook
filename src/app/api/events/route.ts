import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSessionUser } from '@/lib/ownership';
import { badRequest } from '@/lib/apiError';
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
  // 离线队列幂等键。见 lib/offlineQueue.ts
  clientId: z.string().length(36).optional().nullable(),
});

export async function POST(req: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest();
  const p = parsed.data;

  if (p.clientId) {
    const existing = await prisma.event.findUnique({
      where: { userId_clientId: { userId: user.id, clientId: p.clientId } },
      select: { id: true },
    });
    if (existing) return NextResponse.json({ ok: true, id: existing.id, deduped: true });
  }

  try {
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
        clientId: p.clientId ?? null,
      },
    });
    return NextResponse.json({ ok: true, id: event.id });
  } catch (err) {
    if (
      p.clientId &&
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      const existing = await prisma.event.findUnique({
        where: { userId_clientId: { userId: user.id, clientId: p.clientId } },
        select: { id: true },
      });
      if (existing) return NextResponse.json({ ok: true, id: existing.id, deduped: true });
    }
    throw err;
  }
}
