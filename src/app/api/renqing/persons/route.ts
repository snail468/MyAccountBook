import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSessionUser } from '@/lib/ownership';
import { badRequest } from '@/lib/apiError';

const createPersonSchema = z.object({
  name: z.string().trim().min(1, '姓名必填').max(50),
  relationship: z.string().trim().max(50).nullable().optional(),
  group: z.enum(['relative', 'friend', 'colleague', 'classmate', 'other']).default('other'),
  phone: z.string().trim().max(30).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export async function GET(req: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const url = new URL(req.url);
  const group = url.searchParams.get('group');
  const q = url.searchParams.get('q')?.trim();

  const where: any = {
    userId: user.id,
    deletedAt: null,
  };

  if (group && group !== 'all') {
    where.group = group;
  }

  if (q) {
    where.OR = [
      { name: { contains: q } },
      { relationship: { contains: q } },
      { note: { contains: q } },
    ];
  }

  const persons = await prisma.giftPerson.findMany({
    where,
    orderBy: [{ name: 'asc' }],
    include: {
      records: {
        where: { deletedAt: null },
        select: {
          direction: true,
          amountCents: true,
          occurredAt: true,
        },
      },
    },
  });

  const list = persons.map((p) => {
    let totalOutCents = 0;
    let totalInCents = 0;
    let lastOccurredAt: Date | null = null;

    for (const r of p.records) {
      if (r.direction === 'out') totalOutCents += r.amountCents;
      else if (r.direction === 'in') totalInCents += r.amountCents;
      if (!lastOccurredAt || r.occurredAt > lastOccurredAt) {
        lastOccurredAt = r.occurredAt;
      }
    }

    return {
      id: p.id,
      name: p.name,
      relationship: p.relationship,
      group: p.group,
      phone: p.phone,
      note: p.note,
      createdAt: p.createdAt,
      recordCount: p.records.length,
      totalOutCents,
      totalInCents,
      netCents: totalInCents - totalOutCents, // 正数: 对方送我的多; 负数: 我送对方的多
      lastOccurredAt,
    };
  });

  return NextResponse.json({ persons: list });
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

  const parsed = createPersonSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message || '参数校验失败');
  }

  const data = parsed.data;

  // 查重：同名联系人
  const existing = await prisma.giftPerson.findFirst({
    where: {
      userId: user.id,
      name: data.name,
      deletedAt: null,
    },
  });

  if (existing) {
    return badRequest(`已存在名为「${data.name}」的联系人`);
  }

  const person = await prisma.giftPerson.create({
    data: {
      userId: user.id,
      name: data.name,
      relationship: data.relationship || null,
      group: data.group,
      phone: data.phone || null,
      note: data.note || null,
    },
  });

  return NextResponse.json(person);
}
