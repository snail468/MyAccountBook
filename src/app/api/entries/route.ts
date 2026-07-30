import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { PRESET_CATEGORIES } from '@/lib/categories';
import {
  cursorWhere,
  decodeCursor,
  parsePageSize,
  slicePage,
  TIME_DESC_ORDER,
} from '@/lib/pagination';

// GET /api/entries?direction=expense&cursor=<游标>&limit=50
// 供工作出项汇总页"加载更多"翻页。
export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const url = new URL(req.url);
  const limit = parsePageSize(url.searchParams.get('limit'));
  const cursor = decodeCursor(url.searchParams.get('cursor'));
  const dirParam = url.searchParams.get('direction');
  const direction =
    dirParam === 'income' || dirParam === 'expense' ? dirParam : undefined;

  const rows = await prisma.entry.findMany({
    where: {
      userId: user.id,
      ...(direction ? { direction } : {}),
      ...cursorWhere(cursor),
    },
    orderBy: TIME_DESC_ORDER,
    take: limit + 1,
  });

  const { items, nextCursor } = slicePage(rows, limit);

  return NextResponse.json({
    entries: items.map((e) => ({
      id: e.id,
      yearMonth: e.yearMonth,
      category: e.category,
      direction: e.direction,
      amountCents: e.amountCents,
      note: e.note,
      occurredAt: e.occurredAt.toISOString(),
      refundedAt: e.refundedAt?.toISOString() ?? null,
    })),
    nextCursor,
  });
}

const bodySchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  category: z.string().trim().min(1).max(32),
  direction: z.enum(['income', 'expense']),
  amountCents: z.number().int().positive().max(1_000_000_00),
  note: z.string().max(200).optional().nullable(),
  occurredAt: z.string().datetime().optional().nullable(),
});

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '参数错误' }, { status: 400 });
  }
  const { yearMonth, category, direction, amountCents, note, occurredAt } = parsed.data;

  // 如果是预设类别，强制方向以预设为准
  const preset = PRESET_CATEGORIES.find((c) => c.name === category);
  const finalDirection = preset ? preset.direction : direction;

  const entry = await prisma.entry.create({
    data: {
      userId: user.id,
      yearMonth,
      category,
      direction: finalDirection,
      amountCents,
      note: note?.trim() || null,
      occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
    },
  });
  return NextResponse.json({ ok: true, id: entry.id });
}
