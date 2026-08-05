import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSessionUser } from '@/lib/ownership';
import { badRequest, apiError, ErrorCode } from '@/lib/apiError';
import {
  cardEncryptionAvailable,
  encryptField,
  isPlausibleCardNumber,
  last4Of,
  normalizeCardNumber,
} from '@/lib/cardCrypto';

// GET  /api/cards —— 列出卡片。**只返回明文字段与尾号，不解密卡号**。
// POST /api/cards —— 新增，卡号与备注加密落库。
//
// 完整卡号只能通过 POST /api/cards/<id>/reveal 拿，且要二次验证登录密码。

const bodySchema = z.object({
  bankName: z.string().trim().min(1).max(40),
  alias: z.string().trim().max(40).nullable().optional(),
  cardType: z.enum(['debit', 'credit']),
  holder: z.string().trim().max(40).nullable().optional(),
  number: z.string().min(1).max(40),
  note: z.string().max(500).nullable().optional(),
});

/** 功能没启用时的统一回应 —— 不是用户的错，要说清楚怎么开 */
function notConfigured() {
  return apiError(
    503,
    ErrorCode.SERVICE_UNAVAILABLE,
    '银行卡功能未启用：请在环境变量里配置 CARD_SECRET（至少 32 字符）后重启',
  );
}

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (!cardEncryptionAvailable()) return notConfigured();

  const cards = await prisma.bankCard.findMany({
    where: { userId: user.id },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    // 刻意不 select numberEnc / noteEnc —— 列表根本不需要它们，
    // 少一次从数据库到进程的搬运就少一分泄露面
    select: {
      id: true,
      bankName: true,
      alias: true,
      cardType: true,
      holder: true,
      last4: true,
      order: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ cards });
}

export async function POST(req: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (!cardEncryptionAvailable()) return notConfigured();

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest();
  const p = parsed.data;

  const normalized = normalizeCardNumber(p.number);
  if (!isPlausibleCardNumber(normalized)) {
    return badRequest('卡号应为 8-24 位数字');
  }

  const last = await prisma.bankCard.findFirst({
    where: { userId: user.id },
    orderBy: { order: 'desc' },
    select: { order: true },
  });

  const created = await prisma.bankCard.create({
    data: {
      userId: user.id,
      bankName: p.bankName,
      alias: p.alias?.trim() || null,
      cardType: p.cardType,
      holder: p.holder?.trim() || null,
      last4: last4Of(normalized),
      numberEnc: await encryptField(normalized),
      noteEnc: p.note?.trim() ? await encryptField(p.note.trim()) : null,
      order: (last?.order ?? -1) + 1,
    },
    select: { id: true, last4: true },
  });

  return NextResponse.json({ ok: true, ...created });
}
