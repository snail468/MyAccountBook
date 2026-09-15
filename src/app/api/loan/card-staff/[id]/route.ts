import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSessionUser } from '@/lib/ownership';
import { badRequest, notFound } from '@/lib/apiError';

const updateSchema = z.object({
  name: z.string().trim().min(1, '姓名必填').max(50).optional(),
  workNo: z.string().trim().max(50).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  branch: z.string().trim().max(100).nullable().optional(),
  commissionNote: z.string().trim().max(100).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const { id } = await params;
  const existing = await prisma.cardStaff.findFirst({
    where: { id, userId: user.id, deletedAt: null },
  });
  if (!existing) return notFound('卡部人员不存在');

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.errors[0]?.message || '参数校验失败');
  }

  const updated = await prisma.cardStaff.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.workNo !== undefined ? { workNo: parsed.data.workNo } : {}),
      ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
      ...(parsed.data.branch !== undefined ? { branch: parsed.data.branch } : {}),
      ...(parsed.data.commissionNote !== undefined ? { commissionNote: parsed.data.commissionNote } : {}),
      ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}),
    },
  });

  revalidatePath('/loan/card-staff');
  revalidatePath('/loan/new');
  revalidatePath('/loan');
  return NextResponse.json({ ok: true, staff: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const { id } = await params;
  const existing = await prisma.cardStaff.findFirst({
    where: { id, userId: user.id, deletedAt: null },
  });
  if (!existing) return notFound('卡部人员不存在');

  await prisma.cardStaff.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  revalidatePath('/loan/card-staff');
  revalidatePath('/loan/new');
  revalidatePath('/loan');
  return NextResponse.json({ ok: true });
}
