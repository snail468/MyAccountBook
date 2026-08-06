import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireOwnedLedger } from '@/lib/ownership';

// GET /api/ledgers/<id>/collaborators
// 列出账本上所有 LedgerMember + 未使用的邀请。owner/editor/viewer 都能看见 ——
// "谁能进这个账本"对所有成员都是可见的，藏着反而让 viewer 一头雾水。
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOwnedLedger(id, { minRole: 'viewer' });
  if (ctx instanceof Response) return ctx;

  const [members, invites] = await Promise.all([
    prisma.ledgerMember.findMany({
      where: { ledgerId: id },
      orderBy: { createdAt: 'asc' },
      select: {
        userId: true,
        role: true,
        createdAt: true,
        user: { select: { username: true } },
      },
    }),
    prisma.ledgerInvite.findMany({
      where: { ledgerId: id, acceptedByUserId: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        token: true,
        role: true,
        createdAt: true,
        expiresAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    myRole: ctx.role,
    members: members.map((m) => ({
      userId: m.userId,
      username: m.user.username,
      role: m.role,
      isSelf: m.userId === ctx.user.id,
      createdAt: m.createdAt.toISOString(),
    })),
    // owner 才需要看具体 token 值（用来复制邀请链接）；其它角色只给状态。
    invites:
      ctx.role === 'owner'
        ? invites.map((v) => ({
            id: v.id,
            token: v.token,
            role: v.role,
            createdAt: v.createdAt.toISOString(),
            expiresAt: v.expiresAt?.toISOString() ?? null,
          }))
        : [],
  });
}
