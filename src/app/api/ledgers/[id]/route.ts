import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireOwnedLedger } from '@/lib/ownership';
import { badRequest } from '@/lib/apiError';
import { cleanupCollectedImages, collectLedgerImageUrls } from '@/lib/imageCleanup';

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
  customCategories: z
    .object({
      added: z
        .array(
          z.object({
            name: z.string().trim().min(1).max(20),
            icon: z.string().min(1).max(8),
            direction: z.enum(['income', 'expense']),
          }),
        )
        .max(50),
      hidden: z.array(z.string().max(20)).max(50),
      // 分类别月预算：{ [category]: cents }。可选，兼容老客户端。
      // 单值上限 100 万元，防止误输入 —— 谁家一个月餐饮花超 100 万
      budgets: z.record(z.number().int().nonnegative().max(1_000_000_00)).optional(),
    })
    .nullable()
    .optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await requireOwnedLedger(id);
  if (ctx instanceof Response) return ctx;

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return badRequest();
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
  if (p.customCategories !== undefined) {
    data.customCategories = p.customCategories ? JSON.stringify(p.customCategories) : null;
  }

  await prisma.ledger.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

// 删除：软删除到回收站（deletedAt = now），60 天后由 cleanup 硬删
// 支持 ?permanent=1 立即硬删（回收站里的"永久删除"）
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await requireOwnedLedger(id);
  if (ctx instanceof Response) return ctx;

  const url = new URL(req.url);
  const permanent = url.searchParams.get('permanent') === '1';

  if (permanent) {
    // 先收集图片 URL（删掉账本后级联删了条目就查不到了），删完再清文件
    const imageUrls = await collectLedgerImageUrls(id);
    await prisma.ledger.delete({ where: { id } });
    await cleanupCollectedImages(imageUrls);
    return NextResponse.json({ ok: true, permanent: true });
  }
  await prisma.ledger.update({
    where: { id },
    data: { deletedAt: new Date(), archived: true },
  });
  return NextResponse.json({ ok: true });
}
