import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUserWithRole } from '@/lib/session';
import { prisma } from '@/lib/db';
import RecurringClient from './RecurringClient';

export const dynamic = 'force-dynamic';

export default async function RecurringPage() {
  const user = await requireUserWithRole();
  if (!user) redirect('/login');

  // 普通账本列表供选择目标账本。旅游账本不支持周期记账 ——
  // 它的支出必须带付款人与分摊，没法凭规则自动编一笔出来。
  // Phase 2：只列自己 editor+ 权限的（一条规则一旦启用就会往账本里写条目）。
  const ledgers = await prisma.ledger.findMany({
    where: {
      kind: 'general',
      deletedAt: null,
      archived: false,
      members: { some: { userId: user.id, role: { in: ['owner', 'editor'] } } },
    },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, name: true },
  });

  return (
    <div className="pt-14">
      <div className="px-4 flex items-center gap-3 mb-2">
        <Link href="/" className="text-ink-500 text-sm">
          ‹ 返回
        </Link>
        <h1 className="text-2xl font-semibold flex-1">周期记账</h1>
      </div>
      <p className="px-4 pb-3 text-xs text-ink-500">房租、订阅、工资这类固定项自动记</p>
      <RecurringClient ledgers={ledgers} />
    </div>
  );
}
