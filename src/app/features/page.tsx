import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { displaySharedLedgerName } from '@/lib/ledgerRole';
import { parsePrefs, isLoanBusinessEnabled, getLoanBusinessName } from '@/lib/userPrefs';
import Prefetcher from '@/components/ui/Prefetcher';
import FeatureManage from './FeatureManage';

export const dynamic = 'force-dynamic';

export default async function FeaturesPage() {
  const user = await requireUser();
  if (!user) redirect('/login');

  const [allLedgers, userRow] = await Promise.all([
    prisma.ledger.findMany({
      where: { members: { some: { userId: user.id } } },
      orderBy: [{ deletedAt: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
      include: { user: { select: { username: true } } },
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { preferences: true },
    }),
  ]);

  const prefs = parsePrefs(userRow?.preferences);
  const loanEnabled = isLoanBusinessEnabled(prefs);
  const loanName = getLoanBusinessName(prefs);

  const viewerId = user.id;
  const withDisplayName = <T extends { name: string; userId: string; user: { username: string } | null }>(l: T) => ({
    ...l,
    name: displaySharedLedgerName(l.name, l.userId, viewerId, l.user?.username),
    isOwn: l.userId === viewerId,
  });

  const active = allLedgers
    .filter((l) => !l.deletedAt && !l.archived)
    .map(withDisplayName)
    .map(serialize);

  const trashed = allLedgers
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
        <h1 className="text-2xl font-semibold flex-1">添加 / 删除功能</h1>
      </div>

      <FeatureManage
        initialLoanEnabled={loanEnabled}
        initialLoanName={loanName}
        activeLedgers={active}
        trashedLedgers={trashed}
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
