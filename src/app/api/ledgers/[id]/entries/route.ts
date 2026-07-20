import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';

const bodySchema = z.object({
  direction: z.enum(['income', 'expense']),
  category: z.string().trim().min(1).max(32),
  amountCents: z.number().int().positive().max(1_000_000_00),
  tags: z.string().max(200).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
  imageUrls: z.array(z.string().max(500)).max(9).optional(),
  occurredAt: z.string().datetime().optional().nullable(),
});

async function ownLedger(id: string, userId: string) {
  const l = await prisma.ledger.findUnique({
    where: { id },
    select: { userId: true, kind: true },
  });
  if (!l || l.userId !== userId) return null;
  return l;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const { id } = await params;
  const own = await ownLedger(id, user.id);
  if (!own) return NextResponse.json({ error: '账本不存在' }, { status: 404 });
  if (own.kind !== 'general') {
    return NextResponse.json({ error: '仅普通账本可用' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '参数错误' }, { status: 400 });
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
