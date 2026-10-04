import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSessionUser } from '@/lib/ownership';
import { badRequest, notFound } from '@/lib/apiError';

const updateRecordSchema = z.object({
  amountCents: z.number().int().min(0).optional(),
  direction: z.enum(['out', 'in']).optional(),
  category: z.string().trim().min(1).max(50).optional(),
  itemType: z.enum(['money', 'gift', 'both']).optional(),
  giftItemDesc: z.string().trim().max(200).nullable().optional(),
  occurredAt: z.string().trim().optional(),
  isPendingReturn: z.boolean().optional(),
  returnRemindedAt: z.string().trim().nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  eventId: z.string().trim().nullable().optional(),
});

export async function GET(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const { id } = await props.params;
  const record = await prisma.giftRecord.findFirst({
    where: { id, userId: user.id, deletedAt: null },
    include: {
      person: true,
      event: true,
    },
  });

  if (!record) return notFound('往来记录不存在');
  return NextResponse.json(record);
}

export async function PATCH(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const { id } = await props.params;
  const existing = await prisma.giftRecord.findFirst({
    where: { id, userId: user.id, deletedAt: null },
  });
  if (!existing) return notFound('往来记录不存在');

  let body: any;
  try {
    body = await req.json();
  } catch {
    return badRequest('请求体必须是合法 JSON');
  }

  const parsed = updateRecordSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message || '参数校验失败');
  }

  const data = parsed.data;
  const updateData: any = {};
  if (data.amountCents !== undefined) updateData.amountCents = data.amountCents;
  if (data.direction !== undefined) updateData.direction = data.direction;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.itemType !== undefined) updateData.itemType = data.itemType;
  if (data.giftItemDesc !== undefined) updateData.giftItemDesc = data.giftItemDesc;
  if (data.occurredAt !== undefined) updateData.occurredAt = new Date(data.occurredAt);
  if (data.isPendingReturn !== undefined) updateData.isPendingReturn = data.isPendingReturn;
  if (data.returnRemindedAt !== undefined) {
    updateData.returnRemindedAt = data.returnRemindedAt ? new Date(data.returnRemindedAt) : null;
  }
  if (data.note !== undefined) updateData.note = data.note;
  if (data.eventId !== undefined) updateData.eventId = data.eventId || null;

  const updated = await prisma.giftRecord.update({
    where: { id },
    data: updateData,
    include: {
      person: { select: { id: true, name: true, relationship: true, group: true } },
      event: { select: { id: true, title: true, category: true } },
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const { id } = await props.params;
  const existing = await prisma.giftRecord.findFirst({
    where: { id, userId: user.id, deletedAt: null },
  });
  if (!existing) return notFound('往来记录不存在');

  await prisma.giftRecord.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ success: true, id });
}
