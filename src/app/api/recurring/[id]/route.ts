import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSessionUser } from '@/lib/ownership';
import { badRequest, notFound } from '@/lib/apiError';

const patchSchema = z.object({
  active: z.boolean().optional(),
  autoCreate: z.boolean().optional(),
  amountCents: z.number().int().positive().max(1_000_000_00).optional(),
  category: z.string().trim().min(1).max(32).optional(),
  note: z.string().max(200).nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
});

async function ownRule(id: string, userId: string) {
  const r = await prisma.recurringRule.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });
  return r && r.userId === userId ? r : null;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  if (!(await ownRule(id, user.id))) return notFound();

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return badRequest();
  const p = parsed.data;

  const data: Record<string, unknown> = {};
  if (p.active !== undefined) data.active = p.active;
  if (p.autoCreate !== undefined) data.autoCreate = p.autoCreate;
  if (p.amountCents !== undefined) data.amountCents = p.amountCents;
  if (p.category !== undefined) data.category = p.category;
  if (p.note !== undefined) data.note = p.note?.trim() || null;
  if (p.endDate !== undefined) data.endDate = p.endDate ? new Date(p.endDate) : null;

  await prisma.recurringRule.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

// 删规则**不删已经生成的账目** —— 那些是真实发生过的支出，
// 用户删的是"以后别再自动记了"，不是"把过去几个月的房租抹掉"
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  if (!(await ownRule(id, user.id))) return notFound();

  await prisma.recurringRule.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
