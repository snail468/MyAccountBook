import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSessionUser } from '@/lib/ownership';
import { badRequest, notFound } from '@/lib/apiError';

const updatePersonSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  relationship: z.string().trim().max(50).nullable().optional(),
  group: z.enum(['relative', 'friend', 'colleague', 'classmate', 'other']).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export async function GET(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const { id } = await props.params;

  const person = await prisma.giftPerson.findFirst({
    where: { id, userId: user.id, deletedAt: null },
    include: {
      records: {
        where: { deletedAt: null },
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        include: {
          event: { select: { id: true, title: true, category: true } },
        },
      },
    },
  });

  if (!person) return notFound('亲友档案不存在');

  let totalOutCents = 0;
  let totalInCents = 0;
  let lastInRecord: (typeof person.records)[0] | null = null;
  let lastOutRecord: (typeof person.records)[0] | null = null;

  for (const r of person.records) {
    if (r.direction === 'out') {
      totalOutCents += r.amountCents;
      if (!lastOutRecord) lastOutRecord = r;
    } else if (r.direction === 'in') {
      totalInCents += r.amountCents;
      if (!lastInRecord) lastInRecord = r;
    }
  }

  // 礼尚往来建议
  let reciprocalAdvice = '';
  if (lastInRecord) {
    const formattedYuan = (lastInRecord.amountCents / 100).toFixed(0);
    const dateStr = lastInRecord.occurredAt.toISOString().slice(0, 10);
    reciprocalAdvice = `对方曾在 ${dateStr}（${lastInRecord.category}）随礼 ¥${formattedYuan}，建议还礼额度不低于 ¥${formattedYuan}`;
  } else if (totalOutCents > 0) {
    reciprocalAdvice = `您已累计向对方随礼 ¥${(totalOutCents / 100).toFixed(0)}，对方暂无随礼记录`;
  }

  return NextResponse.json({
    person,
    totalOutCents,
    totalInCents,
    netCents: totalInCents - totalOutCents,
    reciprocalAdvice,
  });
}

export async function PATCH(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const { id } = await props.params;
  const existing = await prisma.giftPerson.findFirst({
    where: { id, userId: user.id, deletedAt: null },
  });
  if (!existing) return notFound('亲友档案不存在');

  let body: any;
  try {
    body = await req.json();
  } catch {
    return badRequest('请求体必须是合法 JSON');
  }

  const parsed = updatePersonSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message || '参数校验失败');
  }

  const data = parsed.data;

  // 如果改名，同步更新该人名下所有记录的 personNameSnapshot
  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.giftPerson.update({
      where: { id },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.relationship !== undefined ? { relationship: data.relationship } : {}),
        ...(data.group ? { group: data.group } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.note !== undefined ? { note: data.note } : {}),
      },
    });

    if (data.name && data.name !== existing.name) {
      await tx.giftRecord.updateMany({
        where: { personId: id },
        data: { personNameSnapshot: data.name },
      });
    }

    return p;
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
  const existing = await prisma.giftPerson.findFirst({
    where: { id, userId: user.id, deletedAt: null },
  });
  if (!existing) return notFound('亲友档案不存在');

  // 软删除亲友及其名下记录
  const now = new Date();
  await prisma.$transaction([
    prisma.giftPerson.update({
      where: { id },
      data: { deletedAt: now },
    }),
    prisma.giftRecord.updateMany({
      where: { personId: id, deletedAt: null },
      data: { deletedAt: now },
    }),
  ]);

  return NextResponse.json({ success: true, id });
}
