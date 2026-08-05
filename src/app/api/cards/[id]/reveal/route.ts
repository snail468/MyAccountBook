import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { verifyPassword } from '@/lib/auth';
import { requireVerifiedUser } from '@/lib/session';
import { badRequest, forbidden, notFound, unauthorized } from '@/lib/apiError';
import { decryptField } from '@/lib/cardCrypto';
import { createLogger } from '@/lib/logger';

const log = createLogger('cards');

// POST /api/cards/<id>/reveal —— 解密并返回完整卡号
//
// **必须二次输入登录密码**。会话有效不等于此刻坐在设备前的是本人：
// 手机没锁屏被人拿走、电脑没锁走开一会，这类场景下会话都是有效的。
// 卡号是这个应用里最敏感的数据，值得再拦一道。
//
// 用 requireVerifiedUser（会查库校验 sessionVersion）而不是轻量版 ——
// 管理员刚重置过密码 / 用户刚在别处改过密码时，这个会话必须立刻失效。

const schema = z.object({
  password: z.string().min(1).max(128),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const current = await requireVerifiedUser();
  if (!current) return unauthorized();
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest('请输入登录密码');

  const user = await prisma.user.findUnique({
    where: { id: current.id },
    select: { passwordHash: true },
  });
  if (!user) return unauthorized();

  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
    // 与 /api/auth/password 保持一致：会话是有效的，只是二次验证没过，用 403 不是 401
    log.warn('查看卡号时密码验证失败', { userId: current.id, cardId: id });
    return forbidden('密码不正确');
  }

  const card = await prisma.bankCard.findUnique({
    where: { id },
    select: { userId: true, numberEnc: true, noteEnc: true },
  });
  if (!card || card.userId !== current.id) return notFound();

  try {
    const number = await decryptField(card.numberEnc);
    const note = card.noteEnc ? await decryptField(card.noteEnc) : null;
    log.info('查看了完整卡号', { userId: current.id, cardId: id });
    return NextResponse.json(
      { ok: true, number, note },
      // 卡号绝不能进任何缓存
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } },
    );
  } catch (err) {
    // 解密失败几乎只有一个原因：CARD_SECRET 变了。要说清楚，
    // 否则用户会以为数据丢了而把卡片删掉重录
    log.error('卡号解密失败', err, { userId: current.id, cardId: id });
    return NextResponse.json(
      {
        error: '解密失败 —— 通常是 CARD_SECRET 与加密时不一致。换回原来的密钥即可恢复，数据没有丢失',
        code: 'decrypt_failed',
      },
      { status: 500 },
    );
  }
}
