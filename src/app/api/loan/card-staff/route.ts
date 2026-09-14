import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSessionUser } from '@/lib/ownership';
import { badRequest } from '@/lib/apiError';

const cardStaffSchema = z.object({
  name: z.string().trim().min(1, '姓名必填').max(50),
  workNo: z.string().trim().max(50).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  branch: z.string().trim().max(100).nullable().optional(),
  commissionNote: z.string().trim().max(100).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export async function GET(req: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim();

  const where: any = {
    userId: user.id,
    deletedAt: null,
  };

  if (q) {
    where.OR = [
      { name: { contains: q } },
      { workNo: { contains: q } },
      { branch: { contains: q } },
    ];
  }

  const list = await prisma.cardStaff.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    include: {
      _count: {
        select: {
          orders: { where: { deletedAt: null } },
        },
      },
    },
  });

  return NextResponse.json({ ok: true, list });
}

export async function POST(req: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const body = await req.json().catch(() => null);
  const parsed = cardStaffSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.errors[0]?.message || '参数校验失败');
  }

  const staff = await prisma.cardStaff.create({
    data: {
      userId: user.id,
      name: parsed.data.name,
      workNo: parsed.data.workNo || null,
      phone: parsed.data.phone || null,
      branch: parsed.data.branch || null,
      commissionNote: parsed.data.commissionNote || null,
      note: parsed.data.note || null,
    },
  });

  return NextResponse.json({ ok: true, staff });
}
