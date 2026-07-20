import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';

const bodySchema = z.object({
  kind: z.enum(['work', 'taoyuan', 'general', 'travel']),
  name: z.string().trim().min(1).max(50),
  icon: z.string().max(8).optional().nullable(),
  color: z.string().max(20).optional().nullable(),
  budgetCents: z.number().int().nonnegative().max(1_000_000_00).optional().nullable(),
  baseCurrency: z.string().length(3).optional().nullable(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
});

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '参数错误' }, { status: 400 });
  const p = parsed.data;

  // 内置账本每人只能有一份
  if (p.kind === 'work' || p.kind === 'taoyuan') {
    const existing = await prisma.ledger.findFirst({
      where: { userId: user.id, kind: p.kind, archived: false },
    });
    if (existing) {
      return NextResponse.json(
        { error: p.kind === 'work' ? '你已经有工作账本了' : '你已经有桃源账本了' },
        { status: 409 },
      );
    }
  }

  // 计算 order：追加到末尾
  const last = await prisma.ledger.findFirst({
    where: { userId: user.id },
    orderBy: { order: 'desc' },
    select: { order: true },
  });
  const order = (last?.order ?? -1) + 1;

  const created = await prisma.ledger.create({
    data: {
      userId: user.id,
      kind: p.kind,
      name: p.name,
      icon: p.icon || null,
      color: p.color || null,
      order,
      budgetCents: p.budgetCents ?? null,
      baseCurrency: p.baseCurrency || null,
      startDate: p.startDate ? new Date(p.startDate) : null,
      endDate: p.endDate ? new Date(p.endDate) : null,
    },
  });
  return NextResponse.json({ ok: true, id: created.id, kind: created.kind });
}
