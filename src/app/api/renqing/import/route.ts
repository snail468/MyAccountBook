import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSessionUser } from '@/lib/ownership';
import { badRequest } from '@/lib/apiError';

const importItemSchema = z.object({
  name: z.string().trim().min(1, '姓名不能为空').max(50),
  direction: z.enum(['out', 'in']).default('out'),
  amountCents: z.number().int().min(0, '金额必须大于等于0'),
  category: z.string().trim().max(50).default('人情往来'),
  occurredAt: z.string().trim().optional(),
  itemType: z.enum(['money', 'gift', 'both']).default('money'),
  giftItemDesc: z.string().trim().max(200).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  eventTitle: z.string().trim().max(100).nullable().optional(),
  group: z.enum(['relative', 'friend', 'colleague', 'classmate', 'other']).default('other'),
  relationship: z.string().trim().max(50).nullable().optional(),
  isPendingReturn: z.boolean().default(false),
});

const importSchema = z.object({
  items: z.array(importItemSchema).min(1, '导入数据不能为空').max(1000, '单次最多导入1000条'),
});

export async function POST(req: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return badRequest('请求体必须是合法 JSON');
  }

  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message || '导入数据格式校验失败');
  }

  const items = parsed.data.items;

  let createdPersonsCount = 0;
  let createdEventsCount = 0;

  await prisma.$transaction(async (tx) => {
    // 1. 预载当前用户所有未删除联系人
    const existingPersons = await tx.giftPerson.findMany({
      where: { userId: user.id, deletedAt: null },
    });
    const personMap = new Map<string, string>(); // name -> id
    for (const p of existingPersons) {
      personMap.set(p.name, p.id);
    }

    // 2. 预载当前用户所有未删除大事件
    const existingEvents = await tx.giftEvent.findMany({
      where: { userId: user.id, deletedAt: null },
    });
    const eventMap = new Map<string, string>(); // title -> id
    for (const e of existingEvents) {
      eventMap.set(e.title, e.id);
    }

    // 3. 逐条处理或批量创建联系人/大事件
    for (const item of items) {
      // 检查联系人
      let personId = personMap.get(item.name);
      if (!personId) {
        const newPerson = await tx.giftPerson.create({
          data: {
            userId: user.id,
            name: item.name,
            group: item.group,
            relationship: item.relationship || null,
          },
        });
        personId = newPerson.id;
        personMap.set(item.name, personId);
        createdPersonsCount++;
      }

      // 检查大事件
      let eventId: string | null = null;
      if (item.eventTitle) {
        eventId = eventMap.get(item.eventTitle) || null;
        if (!eventId) {
          const newEvent = await tx.giftEvent.create({
            data: {
              userId: user.id,
              title: item.eventTitle,
              category: item.category || '喜事',
              eventDate: item.occurredAt ? new Date(item.occurredAt) : new Date(),
            },
          });
          eventId = newEvent.id;
          eventMap.set(item.eventTitle, eventId);
          createdEventsCount++;
        }
      }

      // 录入往来明细
      await tx.giftRecord.create({
        data: {
          userId: user.id,
          personId,
          personNameSnapshot: item.name,
          eventId,
          direction: item.direction,
          amountCents: item.amountCents,
          category: item.category,
          itemType: item.itemType,
          giftItemDesc: item.giftItemDesc || null,
          occurredAt: item.occurredAt ? new Date(item.occurredAt) : new Date(),
          isPendingReturn: item.isPendingReturn,
          note: item.note || null,
        },
      });
    }
  });

  return NextResponse.json({
    success: true,
    importedCount: items.length,
    createdPersonsCount,
    createdEventsCount,
  });
}
