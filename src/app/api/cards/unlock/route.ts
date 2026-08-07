import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { verifyPassword } from '@/lib/auth';
import { getSession, requireVerifiedUser, CARDS_UNLOCK_TTL_MS } from '@/lib/session';
import { apiError, badRequest, ErrorCode, forbidden, unauthorized } from '@/lib/apiError';
import { cardEncryptionAvailable } from '@/lib/cardCrypto';
import { createLogger } from '@/lib/logger';

const log = createLogger('cards');

// POST /api/cards/unlock —— 页面级解锁。
//
// 用户诉求：不要每张卡都验密，进"银行卡"页面时验一次即可，之后短期内
// 直接看/复制。10 分钟 TTL 后接口自动失效，回到解锁页。
//
// 与原来 per-card /reveal 需要 body.password 的区别：现在 GET /api/cards 只查
// session.cardsUnlockedAt 是否新鲜，新鲜就直接给明文；这里是唯一处理密码的入口。

const schema = z.object({
  password: z.string().min(1).max(128),
});

export async function POST(req: Request) {
  const current = await requireVerifiedUser();
  if (!current) return unauthorized();
  if (!cardEncryptionAvailable()) {
    return apiError(
      503,
      ErrorCode.SERVICE_UNAVAILABLE,
      '银行卡功能未启用：请在环境变量里配置 CARD_SECRET（至少 32 字符）后重启',
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest('请输入登录密码');

  const user = await prisma.user.findUnique({
    where: { id: current.id },
    select: { passwordHash: true },
  });
  if (!user) return unauthorized();

  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
    log.warn('银行卡解锁密码验证失败', { userId: current.id });
    return forbidden('密码不正确');
  }

  const session = await getSession();
  session.cardsUnlockedAt = Date.now();
  await session.save();

  log.info('银行卡解锁成功', { userId: current.id });
  return NextResponse.json({ ok: true, ttlMs: CARDS_UNLOCK_TTL_MS });
}

export async function DELETE() {
  // 主动上锁：用户点"锁定"或离开页面时可以调，立刻收回明文查看权限。
  const current = await requireVerifiedUser();
  if (!current) return unauthorized();

  const session = await getSession();
  session.cardsUnlockedAt = undefined;
  await session.save();
  return NextResponse.json({ ok: true });
}
