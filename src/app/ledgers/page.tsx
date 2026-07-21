import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import Prefetcher from '@/components/ui/Prefetcher';
import LedgerManage from './LedgerManage';

export const dynamic = 'force-dynamic';

export default async function LedgersPage() {
  const user = await requireUser();
  if (!user) redirect('/login');

  const all = await prisma.ledger.findMany({
    where: { userId: user.id },
    orderBy: [{ deletedAt: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
  });

  const active = all
    .filter((l) => !l.deletedAt && !l.archived)
    .map(serialize);
  const trashed = all
    .filter((l) => !!l.deletedAt)
    .map((l) => ({
      ...serialize(l),
      deletedAt: l.deletedAt!.toISOString(),
    }));

  const hasWork = active.some((l) => l.kind === 'work');
  const hasTaoyuan = active.some((l) => l.kind === 'taoyuan');

  return (
    <div className="px-6 pt-14 pb-20">
      <Prefetcher routes={['/']} />
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-ink-500 text-sm">‹ 返回</Link>
        <h1 className="text-2xl font-semibold flex-1">添加 / 删除账本</h1>
      </div>
      <LedgerManage
        active={active}
        trashed={trashed}
        hasWork={hasWork}
        hasTaoyuan={hasTaoyuan}
      />
    </div>
  );
}

function serialize(l: {
  id: string;
  kind: string;
  name: string;
  icon: string | null;
  color: string | null;
}) {
  return {
    id: l.id,
    kind: l.kind,
    name: l.name,
    icon: l.icon,
    color: l.color,
  };
}
