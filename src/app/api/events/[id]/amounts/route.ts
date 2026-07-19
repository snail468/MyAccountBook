import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { syncEventStatus } from '@/lib/eventStatus';

const stageSchema = z.enum(['predicted', 'announced', 'paid']);

const bodySchema = z.object({
  stage: stageSchema,
  cents: z.number().int().positive().max(1_000_000_00),
  note: z.string().max(200).optional().nullable(),
  rewardMethod: z.string().trim().min(1).max(64).optional().nullable(),
  occurredAt: z.string().datetime().optional().nullable(),
});

// 新增一条金额（可能同时推进 event.status）
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const { id } = await params;

  const ev = await prisma.event.findUnique({ where: { id }, select: { userId: true } });
  if (!ev || ev.userId !== user.id)
    return NextResponse.json({ error: '不存在' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '参数错误' }, { status: 400 });
  const p = parsed.data;

  const created = await prisma.eventAmount.create({
    data: {
      eventId: id,
      stage: p.stage,
      cents: p.cents,
      note: p.note?.trim() || null,
      rewardMethod: p.rewardMethod?.trim() || null,
      occurredAt: p.occurredAt ? new Date(p.occurredAt) : new Date(),
    },
  });

  await syncEventStatus(id);

  return NextResponse.json({ ok: true, id: created.id });
}
