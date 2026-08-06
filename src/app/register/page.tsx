import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { ensureAdminBootstrap } from '@/lib/adminBootstrap';
import RegisterForm from './RegisterForm';

export const dynamic = 'force-dynamic';

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  await ensureAdminBootstrap();
  const existing = await requireUser();

  const { invite } = await searchParams;
  const inviteToken = typeof invite === 'string' && invite.length >= 20 && invite.length <= 200
    ? invite
    : undefined;

  // 已登录：邀请路径直接把用户送到 /invite/<token> 点接受；
  // 普通注册路径没意义 —— 回首页
  if (existing) {
    redirect(inviteToken ? `/invite/${inviteToken}` : '/');
  }

  const userCount = await prisma.user.count();
  const isBootstrap = userCount === 0;

  // 邀请路径：查一份邀请，有效则开放注册表单
  let inviteInfo: { ledgerName: string; ledgerIcon: string | null; role: string } | null = null;
  if (inviteToken) {
    const inv = await prisma.ledgerInvite.findUnique({
      where: { token: inviteToken },
      select: {
        acceptedByUserId: true,
        expiresAt: true,
        role: true,
        ledger: { select: { name: true, icon: true, deletedAt: true, archived: true } },
      },
    });
    const expired = inv?.expiresAt && inv.expiresAt < new Date();
    const inactive = inv?.ledger.deletedAt || inv?.ledger.archived;
    if (inv && !inv.acceptedByUserId && !expired && !inactive) {
      inviteInfo = {
        ledgerName: inv.ledger.name,
        ledgerIcon: inv.ledger.icon ?? null,
        role: inv.role,
      };
    }
  }

  // 邀请无效但用户明明是从 /invite/<token> 跳过来的 —— 提示，别静默走"注册关闭"分支
  if (inviteToken && !inviteInfo) {
    return (
      <div className="px-6 pt-16">
        <h1 className="text-3xl font-semibold mb-2">邀请链接无效</h1>
        <p className="text-sm text-ink-500 mb-8">
          这份邀请可能已过期、已被使用或账本已删除。请让邀请者重新生成一份链接。
        </p>
        <Link
          href="/login"
          className="block w-full py-3 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 font-medium text-center"
        >
          去登录
        </Link>
      </div>
    );
  }

  if (!isBootstrap && !inviteInfo) {
    return (
      <div className="px-6 pt-16">
        <h1 className="text-3xl font-semibold mb-2">注册已关闭</h1>
        <p className="text-sm text-ink-500 mb-8">
          自助注册已关闭。如需新账号，请联系管理员开号，然后到{' '}
          <Link href="/login" className="text-ink-900 dark:text-ink-100 underline">
            登录页
          </Link>{' '}
          登录。
        </p>
        <Link
          href="/login"
          className="block w-full py-3 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 font-medium text-center"
        >
          去登录
        </Link>
      </div>
    );
  }

  const roleText =
    inviteInfo?.role === 'owner'
      ? '拥有者'
      : inviteInfo?.role === 'editor'
        ? '编辑者'
        : '只读';

  return (
    <div className="px-6 pt-16">
      {inviteInfo ? (
        <>
          <h1 className="text-3xl font-semibold mb-2">注册加入账本</h1>
          <p className="text-sm text-ink-500 mb-8">
            你被邀请以 <span className="font-medium text-ink-800 dark:text-ink-200">{roleText}</span>{' '}
            身份加入{' '}
            <span className="font-medium text-ink-800 dark:text-ink-200">
              {inviteInfo.ledgerIcon ?? ''} {inviteInfo.ledgerName}
            </span>
            。注册完成后会自动带你到接受页确认。
          </p>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-semibold mb-2">首次注册</h1>
          <p className="text-sm text-ink-500 mb-8">
            这是系统里的第一个账号，将自动成为管理员。用户名 2-32 字符，密码至少 6 位。
          </p>
        </>
      )}
      <RegisterForm inviteToken={inviteToken} />
    </div>
  );
}
