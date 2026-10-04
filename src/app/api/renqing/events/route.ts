import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSessionUser } from '@/lib/ownership';
import { badRequest } from '@/lib/apiError';

const createEventSchema = z.object({
  title: z.string().trim().min(1, '标题必填').max(100),
  category: z.string().trim().min(1, '事由类别必填').max(50),
  eventDate: z.string().trim().min(1, '日期必填'),
  banquetCostCents: z.number().int().min(0).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export async function GET(_req: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const events = await prisma.giftEvent.findMany({
    where: { userId: user.id, deletedAt: null },
    orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }],
    include: {
      records: {
        where: { deletedAt: null },
        select: {
          direction: true,
          amountCents: true,
        },
      },
    },
  });

  const list = events.map((e) => {
    let totalGiftCents = 0;
    let guestCount = 0;

    for (const r of e.records) {
      if (r.direction === 'in') {
        totalGiftCents += r.amountCents;
        guestCount++;
      }
    }

    const banquetCost = e.banquetCostCents || 0;
    const netProfitCents = totalGiftCents - banquetCost;

    return {
      id: e.id,
      title: e.title,
      category: e.category,
      eventDate: e.eventDate,
      banquetCostCents: e.banquetCostCents,
      note: e.note,
      createdAt: e.createdAt,
      guestCount,
      totalGiftCents,
      netProfitCents,
    };
  });

  return NextResponse.json({ events: list });
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

  const parsed = createEventSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message || '参数校验失败');
  }

  const data = parsed.data;

  const event = await prisma.giftEvent.create({
    data: {
      userId: user.id,
      title: data.title,
      category: data.category,
      eventDate: new Date(data.eventDate),
      banquetCostCents: data.banquetCostCents || null,
      note: data.note || null,
    },
  });

  return NextResponse.json(event);
}
