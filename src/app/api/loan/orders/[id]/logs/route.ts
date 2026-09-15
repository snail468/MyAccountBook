import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
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

  revalidatePath('/loan');
  revalidatePath(`/loan/${id}`);
  return NextResponse.json({ ok: true, log });
}

export async function DELETE(
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

  const url = new URL(req.url);
  const logId = url.searchParams.get('logId');
  if (!logId) return badRequest('缺少日志ID');

  const log = await prisma.loanOrderLog.findFirst({
    where: { id: logId, orderId: id },
  });
  if (!log) return notFound('日志不存在');

  await prisma.loanOrderLog.delete({
    where: { id: logId },
  });

  revalidatePath('/loan');
  revalidatePath(`/loan/${id}`);
  return NextResponse.json({ ok: true });
}
