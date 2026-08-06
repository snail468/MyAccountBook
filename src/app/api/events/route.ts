import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSessionUser, resolveOwnLedgerId } from '@/lib/ownership';
import { badRequest, notFound } from '@/lib/apiError';
import { isLedgerRole, roleAtLeast } from '@/lib/ledgerRole';
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
  // 可选：写入特定 taoyuan 账本（共享场景）。留空 = 用户 owner 的那本。
  ledgerId: z.string().min(1).optional().nullable(),
});

export async function POST(req: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest();
  const p = parsed.data;

  const ledgerId = await resolveTaoyuanLedger(user.id, p.ledgerId ?? null);
  if (ledgerId instanceof Response) return ledgerId;

  if (p.clientId) {
    const existing = await prisma.event.findUnique({
      where: { ledgerId_clientId: { ledgerId, clientId: p.clientId } },
      select: { id: true },
    });
    if (existing) return NextResponse.json({ ok: true, id: existing.id, deduped: true });
  }

  try {
    const event = await prisma.event.create({
      data: {
        userId: user.id,
        ledgerId,
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
        where: { ledgerId_clientId: { ledgerId, clientId: p.clientId } },
        select: { id: true },
      });
      if (existing) return NextResponse.json({ ok: true, id: existing.id, deduped: true });
    }
    throw err;
  }
}

// 与 /api/entries 的 resolveWorkLedger 对称：taoyuan 版
async function resolveTaoyuanLedger(
  userId: string,
  explicit: string | null,
): Promise<string | Response> {
  if (!explicit) {
    return resolveOwnLedgerId(userId, 'taoyuan');
  }
  const ledger = await prisma.ledger.findUnique({
    where: { id: explicit },
    select: {
      kind: true,
      members: { where: { userId }, select: { role: true }, take: 1 },
    },
  });
  if (!ledger || ledger.kind !== 'taoyuan') return notFound('账本不存在');
  const rawRole = ledger.members[0]?.role;
  if (!rawRole || !isLedgerRole(rawRole)) return notFound('账本不存在');
  if (!roleAtLeast(rawRole, 'editor')) return notFound('账本不存在');
  return explicit;
}
