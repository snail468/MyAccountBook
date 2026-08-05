import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireOwnedEvent } from '@/lib/ownership';
import { badRequest } from '@/lib/apiError';
import { syncEventStatus } from '@/lib/eventStatus';
import { normalizeAmountInput } from '@/lib/amountInput';

const stageSchema = z.enum(['predicted', 'announced', 'paid']);

// 三种计量方式共用一个接口，字段都是可选的，由 rewardMethod 决定哪个必填 ——
// 校验与归一在 lib/amountInput.ts 的 normalizeAmountInput 里做 —— 规则依赖另一个字段的值，
// zod 的 refine 写出来反而更绕。
const bodySchema = z.object({
  stage: stageSchema,
  cents: z.number().int().nonnegative().max(1_000_000_00).optional(),
  quantity: z.number().int().positive().max(1_000_000).optional().nullable(),
  itemDesc: z.string().trim().max(200).optional().nullable(),
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

  const norm = normalizeAmountInput(p);
  if (!norm.ok) return badRequest(norm.reason);

  const created = await prisma.eventAmount.create({
    data: {
      eventId: id,
      stage: p.stage,
      cents: norm.value.cents,
      quantity: norm.value.quantity,
      itemDesc: norm.value.itemDesc,
      note: p.note?.trim() || null,
      rewardMethod: p.rewardMethod?.trim() || null,
      occurredAt: p.occurredAt ? new Date(p.occurredAt) : new Date(),
    },
  });

  await syncEventStatus(id);

  return NextResponse.json({ ok: true, id: created.id });
}
