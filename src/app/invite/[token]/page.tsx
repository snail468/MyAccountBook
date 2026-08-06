import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import AcceptButton from './AcceptButton';

export const dynamic = 'force-dynamic';

/**
 * 邀请接受落地页 /invite/<token>。
 *
 * 未登录：直接跳登录，登录后回来（redirect 携带 next 参数）。
 * 已登录：显示"XX 邀请你加入 YY 账本，角色 ZZ"，点接受按钮走 POST /api/invites/<token>。
 * 已是成员：显示"你已经是这个账本的成员"+进入按钮。
 * 邀请无效/过期：显示提示。
 *
 * 服务端直接查数据库（不走内部 fetch），响应更快也不需要 host 头。
 */
export default async function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invite =
    token.length >= 20 && token.length <= 200
      ? await prisma.ledgerInvite.findUnique({
          where: { token },
          select: {
            role: true,
            expiresAt: true,
            acceptedByUserId: true,
            ledger: {
              select: {
                id: true,
                name: true,
                kind: true,
                icon: true,
                deletedAt: true,
                archived: true,
              },
            },
          },
        })
      : null;

  const expired = invite?.expiresAt && invite.expiresAt < new Date();
  const inactive = invite?.ledger.deletedAt || invite?.ledger.archived;
  const invalid = !invite || expired || inactive;

  const user = await requireUser();
  if (!user) {
    // 邀请有效且未使用 —— 直接把访客送到自助注册页（一次性 register 通道）。
    // 已使用 / 过期 / 无效 —— 走登录路径（防止用邀请码枚举来触达注册页）。
    if (invite && !invite.acceptedByUserId && !invalid) {
      redirect(`/register?invite=${encodeURIComponent(token)}`);
    }
    redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  }

  if (invalid) {
    return (
      <div className="mx-auto max-w-md px-6 pt-24 text-center">
        <h1 className="mb-3 text-2xl font-semibold">邀请链接无效</h1>
        <p className="text-ink-500">链接可能已过期、已被撤回，或账本已被删除。</p>
        <Link href="/" className="mt-6 inline-block text-indigo-600 hover:underline">
          回到首页
        </Link>
      </div>
    );
  }

  const alreadyAccepted = !!invite.acceptedByUserId;

  const existing = await prisma.ledgerMember.findUnique({
    where: {
      ledgerId_userId: { ledgerId: invite.ledger.id, userId: user.id },
    },
    select: { role: true },
  });

  if (existing) {
    return (
      <div className="mx-auto max-w-md px-6 pt-24 text-center">
        <h1 className="mb-3 text-2xl font-semibold">
          {invite.ledger.icon ?? ''} {invite.ledger.name}
        </h1>
        <p className="text-ink-500">你已经是这个账本的成员。</p>
        <Link
          href={`/l/${invite.ledger.id}`}
          className="mt-6 inline-block rounded bg-indigo-600 px-4 py-2 text-white"
        >
          进入账本
        </Link>
      </div>
    );
  }

  if (alreadyAccepted) {
    return (
      <div className="mx-auto max-w-md px-6 pt-24 text-center">
        <h1 className="mb-3 text-2xl font-semibold">邀请已被使用</h1>
        <p className="text-ink-500">这份邀请链接已经被别人接受了。请让邀请者重新生成一份。</p>
        <Link href="/" className="mt-6 inline-block text-indigo-600 hover:underline">
          回到首页
        </Link>
      </div>
    );
  }

  const roleText =
    invite.role === 'owner'
      ? '拥有者'
      : invite.role === 'editor'
        ? '编辑者（可增删改条目）'
        : '只读';

  return (
    <div className="mx-auto max-w-md px-6 pt-24 text-center">
      <div className="mb-4 text-5xl">{invite.ledger.icon ?? '📒'}</div>
      <h1 className="mb-2 text-2xl font-semibold">{invite.ledger.name}</h1>
      <p className="mb-6 text-ink-500">
        你被邀请以 <span className="font-medium text-ink-800 dark:text-ink-200">{roleText}</span>{' '}
        身份加入这个账本
      </p>
      <AcceptButton token={token} />
      <Link href="/" className="mt-4 block text-sm text-ink-500 hover:underline">
        暂不加入
      </Link>
    </div>
  );
}
