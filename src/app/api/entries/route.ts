import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { PRESET_CATEGORIES } from '@/lib/categories';

const bodySchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  category: z.string().trim().min(1).max(32),
  direction: z.enum(['income', 'expense']),
  amountCents: z.number().int().positive().max(1_000_000_00),
  note: z.string().max(200).optional().nullable(),
  reimbursable: z.boolean().optional().default(false),
});

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '参数错误' }, { status: 400 });
  }
  const { yearMonth, category, direction, amountCents, note, reimbursable } = parsed.data;

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
      // 只有出项才允许标记为报销
      reimbursable: finalDirection === 'expense' ? reimbursable : false,
    },
  });
  return NextResponse.json({ ok: true, id: entry.id });
}
