import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSessionUser } from '@/lib/ownership';
import { badRequest, notFound } from '@/lib/apiError';
import { materializeDueRules } from '@/lib/recurringRun';

// GET  /api/recurring        列出规则
// POST /api/recurring        新增规则
// POST /api/recurring?run=1  立即跑一次生成（界面上的「立即生成」按钮）

const bodySchema = z
  .object({
    target: z.enum(['work', 'general']),
    ledgerId: z.string().min(1).nullable().optional(),
    direction: z.enum(['income', 'expense']),
    category: z.string().trim().min(1).max(32),
    amountCents: z.number().int().positive().max(1_000_000_00),
    note: z.string().max(200).nullable().optional(),
    frequency: z.enum(['monthly', 'weekly']),
    dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
    dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
    startDate: z.string().datetime(),
    endDate: z.string().datetime().nullable().optional(),
    autoCreate: z.boolean().default(true),
  })
  .refine((v) => (v.frequency === 'monthly' ? v.dayOfMonth != null : v.dayOfWeek != null), {
    message: '按月要给 dayOfMonth，按周要给 dayOfWeek',
  })
  .refine((v) => (v.target === 'general' ? !!v.ledgerId : true), {
    message: '普通账本的规则必须指定账本',
  });

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const rules = await prisma.recurringRule.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: { ledger: { select: { id: true, name: true } } },
  });
  return NextResponse.json({
    rules: rules.map((r) => ({
      ...r,
      startDate: r.startDate.toISOString(),
      endDate: r.endDate?.toISOString() ?? null,
      lastGeneratedAt: r.lastGeneratedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  });
}

export async function POST(req: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const url = new URL(req.url);
  if (url.searchParams.get('run') === '1') {
    const result = await materializeDueRules(user.id);
    return NextResponse.json({ ok: true, ...result });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message || '参数错误');
  }
  const p = parsed.data;

  // 普通账本的规则要确认账本确实属于当前用户，否则等于给了一个往别人账本写数据的口子
  if (p.target === 'general') {
    const ledger = await prisma.ledger.findUnique({
      where: { id: p.ledgerId! },
      select: { userId: true, kind: true, deletedAt: true },
    });
    if (!ledger || ledger.userId !== user.id || ledger.deletedAt) return notFound('账本不存在');
    if (ledger.kind !== 'general') return notFound('仅普通账本可用');
  }

  const created = await prisma.recurringRule.create({
    data: {
      userId: user.id,
      target: p.target,
      ledgerId: p.target === 'general' ? p.ledgerId! : null,
      direction: p.direction,
      category: p.category,
      amountCents: p.amountCents,
      note: p.note?.trim() || null,
      frequency: p.frequency,
      dayOfMonth: p.frequency === 'monthly' ? p.dayOfMonth! : null,
      dayOfWeek: p.frequency === 'weekly' ? p.dayOfWeek! : null,
      startDate: new Date(p.startDate),
      endDate: p.endDate ? new Date(p.endDate) : null,
      autoCreate: p.autoCreate,
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, id: created.id });
}
