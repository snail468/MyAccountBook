import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSessionUser } from '@/lib/ownership';
import { badRequest, notFound } from '@/lib/apiError';

const logSchema = z.object({
  action: z.string().trim().min(1, '阶段动作标签必填').max(50),
  content: z.string().trim().min(1, '跟进说明必填').max(2000),
  occurredAt: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const { id } = await params;
  const order = await prisma.loanOrder.findFirst({
    where: { id, userId: user.id, deletedAt: null },
  });
  if (!order) return notFound('单据不存在');

  const body = await req.json().catch(() => null);
  const parsed = logSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.errors[0]?.message || '参数校验失败');
  }

  const log = await prisma.loanOrderLog.create({
    data: {
      orderId: id,
      action: parsed.data.action,
      content: parsed.data.content,
      occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date(),
    },
  });

  return NextResponse.json({ ok: true, log });
}
