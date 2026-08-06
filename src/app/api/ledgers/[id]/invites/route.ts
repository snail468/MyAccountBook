import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/db';
import { requireOwnedLedger } from '@/lib/ownership';
import { badRequest } from '@/lib/apiError';

// POST /api/ledgers/<id>/invites  { role: 'editor' | 'viewer' }
// owner 生成一个一次性邀请 token，返回给客户端拼进 /invite/<token> 链接。
//
// 有效期固定 7 天 —— 更长的话丢失渠道后风险太大，更短用户还没来得及分享。
// 想再邀请就再生成一个；不追求可撤回性（token 已经在链路上）。
//
// **只允许邀请到 editor / viewer**，不给 owner。转让所有权是独立的流程，
// 不能通过邀请一键"送出"账本 —— 想让位应该显式操作。
//
// **Phase 1 只放开 general / travel**：work/taoyuan 的数据仍是 user-scoped
// （Entry.userId / Event.userId），共享账本对被邀请者来说看不到别人的条目。
// 与其埋雷不如先禁掉，Phase 2 迁移完再开。
const body = z.object({ role: z.enum(['editor', 'viewer']) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOwnedLedger(id);
  if (ctx instanceof Response) return ctx;
  if (ctx.ledger.kind === 'work' || ctx.ledger.kind === 'taoyuan') {
    return badRequest('工作/桃源账本共享暂未支持，敬请期待');
  }

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest();

  // 24 字节 -> 32 字符 base64url。冲突概率可以忽略；即便真撞了也会被 UNIQUE
  // 索引挡住，返回 500 让客户端重试就行 —— 不做重试循环，避免藏问题。
  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const invite = await prisma.ledgerInvite.create({
    data: {
      ledgerId: id,
      token,
      role: parsed.data.role,
      createdByUserId: ctx.user.id,
      expiresAt,
    },
    select: { id: true, token: true, role: true, expiresAt: true },
  });

  return NextResponse.json({
    ok: true,
    id: invite.id,
    token: invite.token,
    role: invite.role,
    expiresAt: invite.expiresAt?.toISOString() ?? null,
  });
}
