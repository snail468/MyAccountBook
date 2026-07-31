import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireOwnedEvent } from '@/lib/ownership';
import { badRequest } from '@/lib/apiError';
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
  const { id } = await params;
  const ctx = await requireOwnedEvent(id);
  if (ctx instanceof Response) return ctx;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest();
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
