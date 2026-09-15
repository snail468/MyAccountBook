import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireUserWithRole } from '@/lib/session';
import Prefetcher from '@/components/ui/Prefetcher';
import AdminDashboard from './AdminDashboard';

export const dynamic = 'force-dynamic';

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const current = await requireUserWithRole();
  if (!current) redirect('/login');
  if (current.role !== 'admin') redirect('/');

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialTab = resolvedSearchParams?.tab === 'webdav' ? 'webdav' : 'users';

  const users = await prisma.user.findMany({
    orderBy: [{ role: 'desc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      username: true,
      role: true,
      createdAt: true,
      _count: { select: { entries: true, events: true } },
    },
  });

  return (
    <div className="px-6 pt-14 pb-20">
      <Prefetcher routes={['/']} />
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-ink-500 text-sm">‹ 返回</Link>
        <h1 className="text-2xl font-semibold flex-1">系统管理</h1>
      </div>

      <AdminDashboard
        currentUserId={current.id}
        initialTab={initialTab}
        users={users.map((u) => ({
          id: u.id,
          username: u.username,
          role: u.role,
          createdAt: u.createdAt.toISOString(),
          entryCount: u._count.entries,
          eventCount: u._count.events,
        }))}
      />
    </div>
  );
}
