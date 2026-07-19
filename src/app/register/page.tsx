import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { ensureAdminBootstrap } from '@/lib/adminBootstrap';
import RegisterForm from './RegisterForm';

export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  await ensureAdminBootstrap();
  const existing = await requireUser();
  if (existing) redirect('/');

  const userCount = await prisma.user.count();
  const isBootstrap = userCount === 0;

  if (!isBootstrap) {
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

  return (
    <div className="px-6 pt-16">
      <h1 className="text-3xl font-semibold mb-2">首次注册</h1>
      <p className="text-sm text-ink-500 mb-8">
        这是系统里的第一个账号，将自动成为管理员。用户名 2-32 字符，密码至少 6 位。
      </p>
      <RegisterForm />
    </div>
  );
}
