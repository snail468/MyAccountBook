import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSessionUser } from '@/lib/ownership';
import { badRequest, notFound } from '@/lib/apiError';

const updateEventSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  category: z.string().trim().min(1).max(50).optional(),
  eventDate: z.string().trim().optional(),
  banquetCostCents: z.number().int().min(0).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export async function GET(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const { id } = await props.params;

  const event = await prisma.giftEvent.findFirst({
    where: { id, userId: user.id, deletedAt: null },
    include: {
      records: {
        where: { deletedAt: null },
        orderBy: [{ createdAt: 'desc' }],
        include: {
          person: { select: { id: true, name: true, relationship: true, group: true } },
        },
      },
    },
  });

  if (!event) return notFound('大事件礼簿不存在');

  let totalGiftCents = 0;
  for (const r of event.records) {
    if (r.direction === 'in') totalGiftCents += r.amountCents;
  }
  const banquetCost = event.banquetCostCents || 0;
  const netProfitCents = totalGiftCents - banquetCost;

  return NextResponse.json({
    event,
    guestCount: event.records.length,
    totalGiftCents,
    netProfitCents,
  });
}

export async function PATCH(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const { id } = await props.params;
  const existing = await prisma.giftEvent.findFirst({
    where: { id, userId: user.id, deletedAt: null },
  });
  if (!existing) return notFound('大事件礼簿不存在');

  let body: any;
  try {
    body = await req.json();
  } catch {
    return badRequest('请求体必须是合法 JSON');
  }

  const parsed = updateEventSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message || '参数校验失败');
  }

  const data = parsed.data;
  const updateData: any = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.eventDate !== undefined) updateData.eventDate = new Date(data.eventDate);
  if (data.banquetCostCents !== undefined) updateData.banquetCostCents = data.banquetCostCents;
  if (data.note !== undefined) updateData.note = data.note;

  const updated = await prisma.giftEvent.update({
    where: { id },
    data: updateData,
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
  const existing = await prisma.giftEvent.findFirst({
    where: { id, userId: user.id, deletedAt: null },
  });
  if (!existing) return notFound('大事件礼簿不存在');

  await prisma.giftEvent.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ success: true, id });
}
