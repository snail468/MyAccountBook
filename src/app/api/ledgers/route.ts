import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSessionUser } from '@/lib/ownership';
import { badRequest, conflict } from '@/lib/apiError';

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

// GET /api/ledgers —— 返回当前用户作为成员的全部（未删除）账本。
// 原生 App 本地优先架构的首屏数据拉取用。
export async function GET(req: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const ledgers = await prisma.ledger.findMany({
    where: { members: { some: { userId: user.id } }, deletedAt: null },
    orderBy: { order: 'asc' },
    select: {
      id: true,
      kind: true,
      name: true,
      icon: true,
      color: true,
      order: true,
      archived: true,
      budgetCents: true,
      customCategories: true,
      baseCurrency: true,
      startDate: true,
      endDate: true,
      tripBudget: true,
    },
  });

  const serialize = (l: {
    id: string;
    kind: string;
    name: string;
    icon: string | null;
    color: string | null;
    order: number;
    archived: boolean;
    budgetCents: number | null;
    customCategories: string | null;
    baseCurrency: string | null;
    startDate: Date | null;
    endDate: Date | null;
    tripBudget: string | null;
  }) => ({
    id: l.id,
    kind: l.kind,
    name: l.name,
    icon: l.icon,
    color: l.color,
    order: l.order,
    archived: l.archived,
    budgetCents: l.budgetCents,
    customCategories: l.customCategories,
    baseCurrency: l.baseCurrency,
    startDate: l.startDate?.toISOString() ?? null,
    endDate: l.endDate?.toISOString() ?? null,
    tripBudget: l.tripBudget,
  });

  return NextResponse.json({ ledgers: ledgers.map(serialize) });
}

export async function POST(req: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest();
  const p = parsed.data;

  // 内置账本每人只能有一份 —— 判定条件：作为 owner 参与、未归档、未软删
  if (p.kind === 'work' || p.kind === 'taoyuan') {
    const existing = await prisma.ledger.findFirst({
      where: {
        kind: p.kind,
        archived: false,
        deletedAt: null,
        members: { some: { userId: user.id, role: 'owner' } },
      },
    });
    if (existing) {
      return conflict(p.kind === 'work' ? '你已经有工作账本了' : '你已经有桃源账本了');
    }
  }

  // 计算 order：追加到末尾（仅看自己作为成员的账本）
  const last = await prisma.ledger.findFirst({
    where: { members: { some: { userId: user.id } } },
    orderBy: { order: 'desc' },
    select: { order: true },
  });
  const order = (last?.order ?? -1) + 1;

  // 建者自动落一条 LedgerMember(role='owner') —— 从今以后归属都以这张表为准。
  // Ledger.userId 保留是为了让老代码路径（导出/迁移/统计）继续能拿到"建者"，
  // 但**任何权限判断都不要用 userId 直接比对**，改走 requireOwnedLedger。
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
      members: { create: { userId: user.id, role: 'owner' } },
    },
  });
  return NextResponse.json({ ok: true, id: created.id, kind: created.kind });
}
