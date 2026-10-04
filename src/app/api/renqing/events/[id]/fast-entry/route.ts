import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSessionUser } from '@/lib/ownership';
import { badRequest, notFound } from '@/lib/apiError';

const fastEntrySchema = z.object({
  guestName: z.string().trim().min(1, '宾客姓名必填').max(50),
  amountCents: z.number().int().min(0, '礼金金额必须大于等于0'),
  relationship: z.string().trim().max(50).nullable().optional(),
  group: z.enum(['relative', 'friend', 'colleague', 'classmate', 'other']).default('other'),
  itemType: z.enum(['money', 'gift', 'both']).default('money'),
  giftItemDesc: z.string().trim().max(200).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const { id: eventId } = await props.params;
  const event = await prisma.giftEvent.findFirst({
    where: { id: eventId, userId: user.id, deletedAt: null },
  });
  if (!event) return notFound('大事件礼簿不存在');

  let body: any;
  try {
    body = await req.json();
  } catch {
    return badRequest('请求体必须是合法 JSON');
  }

  const parsed = fastEntrySchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message || '参数校验失败');
  }

  const data = parsed.data;
  const cleanName = data.guestName.trim();

  const record = await prisma.$transaction(async (tx) => {
    // 查找或自动创建亲友联系人
    let person = await tx.giftPerson.findFirst({
      where: { userId: user.id, name: cleanName, deletedAt: null },
    });
    if (!person) {
      person = await tx.giftPerson.create({
        data: {
          userId: user.id,
          name: cleanName,
          relationship: data.relationship || null,
          group: data.group,
        },
      });
    }

    // 录入收礼明细
    return tx.giftRecord.create({
      data: {
        userId: user.id,
        personId: person.id,
        personNameSnapshot: person.name,
        eventId: event.id,
        direction: 'in', // 办席收礼一律为入项
        amountCents: data.amountCents,
        category: event.category,
        itemType: data.itemType,
        giftItemDesc: data.giftItemDesc || null,
        occurredAt: event.eventDate,
        isPendingReturn: true, // 办席收礼默认标记待还
        note: data.note || null,
      },
      include: {
        person: { select: { id: true, name: true, relationship: true, group: true } },
      },
    });
  });

  return NextResponse.json(record);
}
