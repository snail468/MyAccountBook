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
  // 它的支出必须带付款人与分摊，没法凭规则自动编一笔出来
  const ledgers = await prisma.ledger.findMany({
    where: { userId: user.id, kind: 'general', deletedAt: null, archived: false },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, name: true },
  });

  return (
    <div>
      <header className="px-4 pt-6 pb-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">周期记账</h1>
        <Link href="/" className="text-xs text-ink-400 underline">
          返回
        </Link>
      </header>
      <p className="px-4 pb-3 text-xs text-ink-500">房租、订阅、工资这类固定项自动记</p>
      <RecurringClient ledgers={ledgers} />
    </div>
  );
}
