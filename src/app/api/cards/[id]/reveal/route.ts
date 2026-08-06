import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, isCardsUnlocked, requireVerifiedUser } from '@/lib/session';
import { notFound, unauthorized } from '@/lib/apiError';
import { decryptField } from '@/lib/cardCrypto';
import { createLogger } from '@/lib/logger';

const log = createLogger('cards');

// POST /api/cards/<id>/reveal —— 解密并返回完整卡号
//
// 页面级解锁：不再每张卡二次验密，只检查 session.cardsUnlockedAt 是否
// 在 CARDS_UNLOCK_TTL_MS 内。密码校验的唯一入口是 /api/cards/unlock。
// 401 时前端应回退到解锁页（cardsUnlockedAt 过期或未设置）。
//
// 用 requireVerifiedUser（会查库校验 sessionVersion）而不是轻量版 ——
// 管理员刚重置过密码 / 用户刚在别处改过密码时，这个会话必须立刻失效。

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const current = await requireVerifiedUser();
  if (!current) return unauthorized();
  const { id } = await params;

  const session = await getSession();
  if (!isCardsUnlocked(session)) {
    return NextResponse.json({ error: '会话未解锁或已过期', code: 'locked' }, { status: 401 });
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
