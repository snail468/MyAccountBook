import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';

const bodySchema = z.object({
  title: z.string().trim().min(1).max(80),
  participate: z.boolean().default(true),
  deadline: z.string().datetime().optional().nullable(),
  note: z.string().max(200).optional().nullable(),
});

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '参数错误' }, { status: 400 });
  const { title, participate, deadline, note } = parsed.data;

  const event = await prisma.event.create({
    data: {
      userId: user.id,
      title,
      participate,
      deadline: deadline ? new Date(deadline) : null,
      note: note?.trim() || null,
      status: 'published',
    },
  });
  return NextResponse.json({ ok: true, id: event.id });
}
