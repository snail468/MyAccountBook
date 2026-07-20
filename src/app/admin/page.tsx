import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireUserWithRole } from '@/lib/session';
import Prefetcher from '@/components/ui/Prefetcher';
import AdminUserList from './AdminUserList';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const current = await requireUserWithRole();
  if (!current) redirect('/login');
  if (current.role !== 'admin') redirect('/');

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
        <h1 className="text-2xl font-semibold flex-1">用户管理</h1>
      </div>

      <AdminUserList
        currentUserId={current.id}
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
