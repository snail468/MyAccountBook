import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSessionUser } from '@/lib/ownership';
import { badRequest, notFound } from '@/lib/apiError';
import {
  encryptField,
  isPlausibleCardNumber,
  last4Of,
  normalizeCardNumber,
} from '@/lib/cardCrypto';

const patchSchema = z.object({
  bankName: z.string().trim().min(1).max(40).optional(),
  alias: z.string().trim().max(40).nullable().optional(),
  cardType: z.enum(['debit', 'credit']).optional(),
  holder: z.string().trim().max(40).nullable().optional(),
  number: z.string().min(1).max(40).optional(),
  note: z.string().max(500).nullable().optional(),
});

/** 归属校验。卡片不属于你就当作不存在，与其它资源一致（见 lib/apiError.ts） */
async function ownCard(id: string, userId: string) {
  const c = await prisma.bankCard.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });
  return c && c.userId === userId ? c : null;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  if (!(await ownCard(id, user.id))) return notFound();

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return badRequest();
  const p = parsed.data;

  const data: Record<string, unknown> = {};
  if (p.bankName !== undefined) data.bankName = p.bankName;
  if (p.alias !== undefined) data.alias = p.alias?.trim() || null;
  if (p.cardType !== undefined) data.cardType = p.cardType;
  if (p.holder !== undefined) data.holder = p.holder?.trim() || null;

  if (p.number !== undefined) {
    const normalized = normalizeCardNumber(p.number);
    if (!isPlausibleCardNumber(normalized)) return badRequest('卡号应为 8-24 位数字');
    // 尾号与密文必须一起更新 —— 只更一个会让列表显示的尾号和真实卡号对不上
    data.numberEnc = await encryptField(normalized);
    data.last4 = last4Of(normalized);
  }
  if (p.note !== undefined) {
    data.noteEnc = p.note?.trim() ? await encryptField(p.note.trim()) : null;
  }

  await prisma.bankCard.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  if (!(await ownCard(id, user.id))) return notFound();

  await prisma.bankCard.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
