import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSessionUser } from '@/lib/ownership';
import { badRequest } from '@/lib/apiError';

const brokerSchema = z.object({
  name: z.string().trim().min(1, '经纪人姓名必填').max(50),
  phone: z.string().trim().max(30).nullable().optional(),
  company: z.string().trim().max(100).nullable().optional(),
  rateNote: z.string().trim().max(100).nullable().optional(),
  accountInfo: z.string().trim().max(200).nullable().optional(),
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
      { phone: { contains: q } },
      { company: { contains: q } },
    ];
  }

  const list = await prisma.broker.findMany({
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
  const parsed = brokerSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.errors[0]?.message || '参数校验失败');
  }

  const broker = await prisma.broker.create({
    data: {
      userId: user.id,
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      company: parsed.data.company || null,
      rateNote: parsed.data.rateNote || null,
      accountInfo: parsed.data.accountInfo || null,
      note: parsed.data.note || null,
    },
  });

  revalidatePath('/loan/brokers');
  revalidatePath('/loan/new');
  revalidatePath('/loan');
  return NextResponse.json({ ok: true, broker });
}
