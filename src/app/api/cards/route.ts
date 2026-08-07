import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSessionUser } from '@/lib/ownership';
import { getSession, isCardsUnlocked, requireVerifiedUser } from '@/lib/session';
import { badRequest, apiError, ErrorCode, unauthorized } from '@/lib/apiError';
import {
  cardEncryptionAvailable,
  decryptField,
  encryptField,
  isPlausibleCardNumber,
  last4Of,
  normalizeCardNumber,
} from '@/lib/cardCrypto';
import { createLogger } from '@/lib/logger';

const log = createLogger('cards');

// GET  /api/cards —— 列出卡片。
// POST /api/cards —— 新增，卡号与备注加密落库。
//
// 卡号可见性的唯一闸门是**页面级解锁**（POST /api/cards/unlock 验一次登录密码，
// session.cardsUnlockedAt 有 10 分钟 TTL）：
//   * 已解锁 → 这里连同解密后的完整卡号与备注一起返回，页面直接显示、直接编辑
//   * 未解锁 → 只给明文字段与尾号，连密文都不从库里捞出来
// 早先还有个 per-card 的 /api/cards/<id>/reveal，是"列表打码 + 单卡点开"那套
// 交互的产物。既然验密已经统一到进页面那一次，解锁后再让用户逐张点"查看"
// 只是徒增点击，那个路由已随之删除 —— 解密口径收敛到这一处。

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

/** 任何情况下都能返回的字段 —— 不含密文 */
const BASE_SELECT = {
  id: true,
  bankName: true,
  alias: true,
  cardType: true,
  holder: true,
  last4: true,
  order: true,
  createdAt: true,
} as const;

const LIST_ORDER = [{ order: 'asc' as const }, { createdAt: 'asc' as const }];

export async function GET() {
  // 要返回明文就得用 requireVerifiedUser（查库校验 sessionVersion）——
  // 管理员刚重置过密码 / 用户刚在别处改过密码时，这个会话必须立刻失效。
  const current = await requireVerifiedUser();
  if (!current) return unauthorized();
  if (!cardEncryptionAvailable()) return notConfigured();

  const session = await getSession();
  if (!isCardsUnlocked(session)) {
    // 未解锁：刻意不 select numberEnc / noteEnc —— 用不上它们，
    // 少一次从数据库到进程的搬运就少一分泄露面
    const cards = await prisma.bankCard.findMany({
      where: { userId: current.id },
      orderBy: LIST_ORDER,
      select: BASE_SELECT,
    });
    return NextResponse.json({ unlocked: false, cards });
  }

  const rows = await prisma.bankCard.findMany({
    where: { userId: current.id },
    orderBy: LIST_ORDER,
    select: { ...BASE_SELECT, numberEnc: true, noteEnc: true },
  });

  const cards = await Promise.all(
    rows.map(async ({ numberEnc, noteEnc, ...rest }) => {
      try {
        return {
          ...rest,
          number: await decryptField(numberEnc),
          note: noteEnc ? await decryptField(noteEnc) : null,
          decryptFailed: false,
        };
      } catch (err) {
        // 逐张兜住：一张卡解不开不该让整页打不开。几乎只有一个原因是
        // CARD_SECRET 变了 —— 文案要说清楚，否则用户会以为数据丢了而删卡重录
        log.error('卡号解密失败', err, { userId: current.id, cardId: rest.id });
        return { ...rest, number: null, note: null, decryptFailed: true };
      }
    }),
  );

  log.info('页面级解锁下读取了全部卡号', { userId: current.id, count: cards.length });
  return NextResponse.json(
    { unlocked: true, cards },
    // 卡号绝不能进任何缓存
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } },
  );
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
