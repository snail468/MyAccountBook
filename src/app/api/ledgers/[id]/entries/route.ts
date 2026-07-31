import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireOwnedLedger } from '@/lib/ownership';
import { badRequest } from '@/lib/apiError';
import { parseImageUrls } from '@/lib/imageCleanup';
import {
  cursorWhere,
  decodeCursor,
  parsePageSize,
  slicePage,
  TIME_DESC_ORDER,
} from '@/lib/pagination';

const bodySchema = z.object({
  direction: z.enum(['income', 'expense']),
  category: z.string().trim().min(1).max(32),
  amountCents: z.number().int().positive().max(1_000_000_00),
  tags: z.string().max(200).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
  imageUrls: z.array(z.string().max(500)).max(9).optional(),
  occurredAt: z.string().datetime().optional().nullable(),
});

// GET /api/ledgers/<id>/entries?cursor=<游标>&limit=50
// 供客户端"加载更多"翻页。首屏那一页由 server component 直接查，不走这里。
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOwnedLedger(id, { kind: 'general', kindMessage: '仅普通账本可用' });
  if (ctx instanceof Response) return ctx;

  const url = new URL(req.url);
  const limit = parsePageSize(url.searchParams.get('limit'));
  const cursor = decodeCursor(url.searchParams.get('cursor'));

  const rows = await prisma.generalEntry.findMany({
    where: { ledgerId: id, ...cursorWhere(cursor) },
    orderBy: TIME_DESC_ORDER,
    take: limit + 1, // 多取一条用于判断是否还有下一页
  });

  const { items, nextCursor } = slicePage(rows, limit);

  return NextResponse.json({
    entries: items.map((e) => ({
      id: e.id,
      direction: e.direction,
      category: e.category,
      amountCents: e.amountCents,
      tags: e.tags,
      note: e.note,
      imageUrls: parseImageUrls(e.imageUrls),
      occurredAt: e.occurredAt.toISOString(),
    })),
    nextCursor,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOwnedLedger(id, { kind: 'general', kindMessage: '仅普通账本可用' });
  if (ctx instanceof Response) return ctx;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest();
  const p = parsed.data;

  const created = await prisma.generalEntry.create({
    data: {
      ledgerId: id,
      direction: p.direction,
      category: p.category,
      amountCents: p.amountCents,
      tags: p.tags?.trim() || null,
      note: p.note?.trim() || null,
      imageUrls: p.imageUrls && p.imageUrls.length > 0 ? JSON.stringify(p.imageUrls) : null,
      occurredAt: p.occurredAt ? new Date(p.occurredAt) : new Date(),
    },
  });
  return NextResponse.json({ ok: true, id: created.id });
}
