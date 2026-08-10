import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSessionUser } from '@/lib/ownership';
import { conflict, notFound } from '@/lib/apiError';

// 邀请 token 的接受路径。/invite/<token> 前端页面拉这里的 GET 展示预览，
// 用户点"接受"再打 POST 落库。
//
// 一致性策略：所有失败一律 404（"邀请无效或已过期"）—— 已用/过期/不存在
// 都归到同一个信号，不给外部枚举有效 token 的探针。POST 的"你已经是成员"
// 是唯一的 conflict，那是幂等信息，泄露也没关系。

async function loadInvite(token: string) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
  const invite = await prisma.ledgerInvite.findUnique({
    where: { token },
    select: {
      id: true,
      ledgerId: true,
      role: true,
      expiresAt: true,
      acceptedByUserId: true,
      ledger: {
        select: { name: true, kind: true, icon: true, deletedAt: true, archived: true },
      },
    },
  });
  if (!invite) return null;
  if (invite.ledger.deletedAt || invite.ledger.archived) return null;
  if (invite.expiresAt && invite.expiresAt < new Date()) return null;
  return invite;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const { token } = await params;
  const invite = await loadInvite(token);
  if (!invite) return notFound('邀请无效或已过期');

  const existing = await prisma.ledgerMember.findUnique({
    where: { ledgerId_userId: { ledgerId: invite.ledgerId, userId: user.id } },
    select: { role: true },
  });

  return NextResponse.json({
    ledgerId: invite.ledgerId,
    ledgerName: invite.ledger.name,
    ledgerKind: invite.ledger.kind,
    ledgerIcon: invite.ledger.icon,
    role: invite.role,
    accepted: !!invite.acceptedByUserId,
    alreadyMember: !!existing,
  });
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const { token } = await params;
  const invite = await loadInvite(token);
  if (!invite) return notFound('邀请无效或已过期');
  if (invite.acceptedByUserId) return notFound('邀请已被使用');

  const existing = await prisma.ledgerMember.findUnique({
    where: { ledgerId_userId: { ledgerId: invite.ledgerId, userId: user.id } },
    select: { role: true },
  });

  // 幂等：本来就是成员时不重复插行，只把 invite 标为已用（防止一份邀请码
  // 被同一个人反复接受，把 acceptedByUserId 一直重写）。
  if (existing) {
    await prisma.ledgerInvite.update({
      where: { token },
      data: { acceptedByUserId: user.id, acceptedAt: new Date() },
    });
    return NextResponse.json({
      ok: true,
      alreadyMember: true,
      ledgerId: invite.ledgerId,
    });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.ledgerMember.create({
        data: { ledgerId: invite.ledgerId, userId: user.id, role: invite.role },
      });
      await tx.ledgerInvite.update({
        where: { token },
        data: { acceptedByUserId: user.id, acceptedAt: new Date() },
      });
      // 旅游账本：接受邀请即自动成为「同伴」（付款人/分摊人占位）。
      // 两步：① 先把建者事先用「纯名字」占位的 TripMember（displayName 恰好等于
      //    用户名且未绑定用户）绑到本人；② 再确保本人作为同伴存在（幂等）。
      // 顺序不能反 —— 先 link 占位，再查 existing 才不会凭空多出一个重名同伴。
      if (invite.ledger.kind === 'travel') {
        const orphan = await tx.tripMember.findMany({
          where: { ledgerId: invite.ledgerId, userId: null, displayName: user.username },
          select: { id: true },
        });
        if (orphan.length === 1) {
          await tx.tripMember.update({
            where: { id: orphan[0]!.id },
            data: { userId: user.id },
          });
        }
        const mine = await tx.tripMember.findFirst({
          where: { ledgerId: invite.ledgerId, userId: user.id },
          select: { id: true },
        });
        if (!mine) {
          await tx.tripMember.create({
            data: { ledgerId: invite.ledgerId, userId: user.id, displayName: user.username },
          });
        }
      }
    });
  } catch (err) {
    // 竞态：两个请求同时到；UNIQUE(ledgerId,userId) 会兜住第二条
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
      return conflict('已经是账本成员');
    }
    throw err;
  }

  return NextResponse.json({ ok: true, ledgerId: invite.ledgerId });
}
