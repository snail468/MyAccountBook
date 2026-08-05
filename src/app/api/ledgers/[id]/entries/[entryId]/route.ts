import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireOwnedGeneralEntry } from '@/lib/ownership';
import { badRequest } from '@/lib/apiError';
import { cleanupRemovedImages } from '@/lib/imageCleanup';

const patchSchema = z.object({
  direction: z.enum(['income', 'expense']).optional(),
  category: z.string().trim().min(1).max(32).optional(),
  amountCents: z.number().int().positive().max(1_000_000_00).optional(),
  tags: z.string().max(200).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  imageUrls: z.array(z.string().max(500)).max(9).optional(),
  occurredAt: z.string().datetime().nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const { id, entryId } = await params;
  const ctx = await requireOwnedGeneralEntry(id, entryId);
  if (ctx instanceof Response) return ctx;
  const { entry } = ctx;

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return badRequest();
  const p = parsed.data;

  const data: Record<string, unknown> = {};
  if (p.direction !== undefined) data.direction = p.direction;
  if (p.category !== undefined) data.category = p.category;
  if (p.amountCents !== undefined) data.amountCents = p.amountCents;
  if (p.tags !== undefined) data.tags = p.tags?.trim() || null;
  if (p.note !== undefined) data.note = p.note?.trim() || null;
  if (p.imageUrls !== undefined)
    data.imageUrls = p.imageUrls.length > 0 ? JSON.stringify(p.imageUrls) : null;
  if (p.occurredAt !== undefined)
    data.occurredAt = p.occurredAt ? new Date(p.occurredAt) : new Date();

  await prisma.generalEntry.update({ where: { id: entryId }, data });

  // 用户在编辑里移掉的图片，清理掉不再被任何记录引用的那些
  if (p.imageUrls !== undefined) {
    await cleanupRemovedImages(entry.imageUrls, p.imageUrls);
  }
  return NextResponse.json({ ok: true });
}

// 软删：进回收站。图片**不清理** —— 记录仍在保留期内可以恢复，
// 图删了恢复出来就是空壳。彻底删走 DELETE /api/trash/generalEntry/:id
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const { id, entryId } = await params;
  const ctx = await requireOwnedGeneralEntry(id, entryId);
  if (ctx instanceof Response) return ctx;

  await prisma.generalEntry.update({
    where: { id: entryId },
    data: { deletedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
