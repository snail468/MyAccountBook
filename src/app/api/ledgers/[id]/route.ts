import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';

const patchSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  icon: z.string().max(8).nullable().optional(),
  color: z.string().max(20).nullable().optional(),
  order: z.number().int().min(0).max(999).optional(),
  archived: z.boolean().optional(),
  budgetCents: z.number().int().nonnegative().max(1_000_000_00).nullable().optional(),
  baseCurrency: z.string().length(3).nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
});

async function ensureOwn(id: string, userId: string) {
  const l = await prisma.ledger.findUnique({
    where: { id },
    select: { userId: true, kind: true },
  });
  if (!l || l.userId !== userId) return null;
  return l;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const { id } = await params;
  const own = await ensureOwn(id, user.id);
  if (!own) return NextResponse.json({ error: '不存在' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '参数错误' }, { status: 400 });
  const p = parsed.data;

  const data: Record<string, unknown> = {};
  if (p.name !== undefined) data.name = p.name;
  if (p.icon !== undefined) data.icon = p.icon;
  if (p.color !== undefined) data.color = p.color;
  if (p.order !== undefined) data.order = p.order;
  if (p.archived !== undefined) data.archived = p.archived;
  if (p.budgetCents !== undefined) data.budgetCents = p.budgetCents;
  if (p.baseCurrency !== undefined) data.baseCurrency = p.baseCurrency;
  if (p.startDate !== undefined) data.startDate = p.startDate ? new Date(p.startDate) : null;
  if (p.endDate !== undefined) data.endDate = p.endDate ? new Date(p.endDate) : null;

  await prisma.ledger.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

// 删除：软删除到回收站（deletedAt = now），60 天后由 cleanup 硬删
// 支持 ?permanent=1 立即硬删（回收站里的"永久删除"）
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const { id } = await params;
  const own = await ensureOwn(id, user.id);
  if (!own) return NextResponse.json({ error: '不存在' }, { status: 404 });

  const url = new URL(req.url);
  const permanent = url.searchParams.get('permanent') === '1';

  if (permanent) {
    await prisma.ledger.delete({ where: { id } });
    return NextResponse.json({ ok: true, permanent: true });
  }
  await prisma.ledger.update({
    where: { id },
    data: { deletedAt: new Date(), archived: true },
  });
  return NextResponse.json({ ok: true });
}
