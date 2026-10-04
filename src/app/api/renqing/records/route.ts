import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSessionUser } from '@/lib/ownership';
import { badRequest } from '@/lib/apiError';

const createRecordSchema = z.object({
  personId: z.string().trim().optional(),
  newPersonName: z.string().trim().optional(),
  newPersonRelationship: z.string().trim().optional(),
  newPersonGroup: z.string().trim().optional(),
  eventId: z.string().trim().nullable().optional(),
  direction: z.enum(['out', 'in']),
  amountCents: z.number().int().min(0, '金额必须大于等于0'),
  category: z.string().trim().min(1, '事由类别必填').max(50),
  itemType: z.enum(['money', 'gift', 'both']).default('money'),
  giftItemDesc: z.string().trim().max(200).nullable().optional(),
  occurredAt: z.string().trim().optional(),
  isPendingReturn: z.boolean().default(false),
  returnRemindedAt: z.string().trim().nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export async function GET(req: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const url = new URL(req.url);
  const personId = url.searchParams.get('personId');
  const eventId = url.searchParams.get('eventId');
  const direction = url.searchParams.get('direction');
  const category = url.searchParams.get('category');
  const year = url.searchParams.get('year');
  const pending = url.searchParams.get('pending');
  const q = url.searchParams.get('q')?.trim();

  const where: any = {
    userId: user.id,
    deletedAt: null,
  };

  if (personId) where.personId = personId;
  if (eventId) where.eventId = eventId;
  if (direction && (direction === 'out' || direction === 'in')) where.direction = direction;
  if (category && category !== 'all') where.category = category;
  if (pending === 'true') where.isPendingReturn = true;

  if (year && /^\d{4}$/.test(year)) {
    const start = new Date(`${year}-01-01T00:00:00.000Z`);
    const end = new Date(`${Number(year) + 1}-01-01T00:00:00.000Z`);
    where.occurredAt = { gte: start, lt: end };
  }

  if (q) {
    where.OR = [
      { personNameSnapshot: { contains: q } },
      { note: { contains: q } },
      { giftItemDesc: { contains: q } },
      { category: { contains: q } },
      { person: { name: { contains: q } } },
    ];
  }

  const [records, sums, totalCount] = await Promise.all([
    prisma.giftRecord.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        person: {
          select: { id: true, name: true, relationship: true, group: true },
        },
        event: {
          select: { id: true, title: true, category: true },
        },
      },
    }),
    prisma.giftRecord.groupBy({
      by: ['direction'],
      where,
      _sum: { amountCents: true },
    }),
    prisma.giftRecord.count({ where }),
  ]);

  const outCents = sums.find((s) => s.direction === 'out')?._sum.amountCents ?? 0;
  const inCents = sums.find((s) => s.direction === 'in')?._sum.amountCents ?? 0;

  return NextResponse.json({
    records,
    totalCount,
    outCents,
    inCents,
    netCents: inCents - outCents,
  });
}

export async function POST(req: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return badRequest('请求体必须是合法 JSON');
  }

  const parsed = createRecordSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message || '参数校验失败');
  }

  const data = parsed.data;

  // 必须有 personId 或 newPersonName
  let targetPersonId = data.personId;
  let targetPersonName = '';

  if (!targetPersonId) {
    if (!data.newPersonName) {
      return badRequest('请选择联系人或输入姓名');
    }
    const cleanName = data.newPersonName.trim();
    // 查找已有同名未删除联系人，没有则创建
    let person = await prisma.giftPerson.findFirst({
      where: { userId: user.id, name: cleanName, deletedAt: null },
    });
    if (!person) {
      person = await prisma.giftPerson.create({
        data: {
          userId: user.id,
          name: cleanName,
          relationship: data.newPersonRelationship?.trim() || null,
          group: data.newPersonGroup?.trim() || 'other',
        },
      });
    }
    targetPersonId = person.id;
    targetPersonName = person.name;
  } else {
    const person = await prisma.giftPerson.findFirst({
      where: { id: targetPersonId, userId: user.id, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!person) return badRequest('联系人不存在');
    targetPersonName = person.name;
  }

  const record = await prisma.giftRecord.create({
    data: {
      userId: user.id,
      personId: targetPersonId,
      personNameSnapshot: targetPersonName,
      eventId: data.eventId || null,
      direction: data.direction,
      amountCents: data.amountCents,
      category: data.category,
      itemType: data.itemType,
      giftItemDesc: data.giftItemDesc || null,
      occurredAt: data.occurredAt ? new Date(data.occurredAt) : new Date(),
      isPendingReturn: data.isPendingReturn ?? false,
      returnRemindedAt: data.returnRemindedAt ? new Date(data.returnRemindedAt) : null,
      note: data.note || null,
    },
    include: {
      person: { select: { id: true, name: true, relationship: true, group: true } },
      event: { select: { id: true, title: true, category: true } },
    },
  });

  return NextResponse.json(record);
}
