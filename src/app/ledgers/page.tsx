import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { displaySharedLedgerName } from '@/lib/ledgerRole';
import Prefetcher from '@/components/ui/Prefetcher';
import LedgerManage from './LedgerManage';

export const dynamic = 'force-dynamic';

export default async function LedgersPage() {
  const user = await requireUser();
  if (!user) redirect('/login');

  // 列出"我作为成员的所有账本"—— B7 后一个账本可以有多位成员，Ledger.userId
  // 只是建者，不再等价于访问权。这里改成走 LedgerMember。
  const all = await prisma.ledger.findMany({
    where: { members: { some: { userId: user.id } } },
    orderBy: [{ deletedAt: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
    // owner username 用来给共享账本加前缀，参见 displaySharedLedgerName
    include: { user: { select: { username: true } } },
  });
  const viewerId = user.id;
  const withDisplayName = <T extends { name: string; userId: string; user: { username: string } | null }>(l: T) => ({
    ...l,
    name: displaySharedLedgerName(l.name, l.userId, viewerId, l.user?.username),
    // 判断在 UI 里禁用 "删除" 按钮 —— 只有 owner 才能软删账本；共享账本
    // 非 owner 侧目前无从退出（后续可加"退出协作"，暂时至少别显示删除按钮）
    isOwn: l.userId === viewerId,
  });

  const active = all
    .filter((l) => !l.deletedAt && !l.archived)
    .map(withDisplayName)
    .map(serialize);
  const trashed = all
    .filter((l) => !!l.deletedAt)
    .map(withDisplayName)
    .map((l) => ({
      ...serialize(l),
      deletedAt: l.deletedAt!.toISOString(),
    }));

  const hasWork = active.some((l) => l.kind === 'work' && l.isOwn);
  const hasTaoyuan = active.some((l) => l.kind === 'taoyuan' && l.isOwn);

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
  isOwn: boolean;
}) {
  return {
    id: l.id,
    kind: l.kind,
    name: l.name,
    icon: l.icon,
    color: l.color,
    isOwn: l.isOwn,
  };
}
