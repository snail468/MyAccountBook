import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSessionUser } from '@/lib/ownership';
import { badRequest, notFound } from '@/lib/apiError';

const updateSchema = z.object({
  name: z.string().trim().min(1, '经纪人姓名必填').max(50).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  company: z.string().trim().max(100).nullable().optional(),
  rateNote: z.string().trim().max(100).nullable().optional(),
  accountInfo: z.string().trim().max(200).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const { id } = await params;
  const existing = await prisma.broker.findFirst({
    where: { id, userId: user.id, deletedAt: null },
  });
  if (!existing) return notFound('经纪人不存在');

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.errors[0]?.message || '参数校验失败');
  }

  const updated = await prisma.broker.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
      ...(parsed.data.company !== undefined ? { company: parsed.data.company } : {}),
      ...(parsed.data.rateNote !== undefined ? { rateNote: parsed.data.rateNote } : {}),
      ...(parsed.data.accountInfo !== undefined ? { accountInfo: parsed.data.accountInfo } : {}),
      ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}),
    },
  });

  revalidatePath('/loan/brokers');
  revalidatePath('/loan/new');
  revalidatePath('/loan');
  return NextResponse.json({ ok: true, broker: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const { id } = await params;
  const existing = await prisma.broker.findFirst({
    where: { id, userId: user.id, deletedAt: null },
  });
  if (!existing) return notFound('经纪人不存在');

  await prisma.broker.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  revalidatePath('/loan/brokers');
  revalidatePath('/loan/new');
  revalidatePath('/loan');
  return NextResponse.json({ ok: true });
}
