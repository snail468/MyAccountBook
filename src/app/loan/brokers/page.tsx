import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import BrokerList from './BrokerList';

export const dynamic = 'force-dynamic';

export default async function BrokersPage() {
  const user = await requireUser();
  if (!user) redirect('/login');

  const list = await prisma.broker.findMany({
    where: {
      userId: user.id,
      deletedAt: null,
    },
    orderBy: [{ createdAt: 'desc' }],
    include: {
      _count: {
        select: {
          orders: { where: { deletedAt: null } },
        },
      },
    },
  });

  const serialized = list.map((b) => ({
    id: b.id,
    name: b.name,
    phone: b.phone,
    company: b.company,
    rateNote: b.rateNote,
    accountInfo: b.accountInfo,
    note: b.note,
    createdAt: b.createdAt.toISOString(),
    _count: b._count,
  }));

  return (
    <div className="px-6 pt-14 pb-20">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/loan" className="text-ink-500 text-sm">‹ 返回工作台</Link>
        <h1 className="text-2xl font-semibold flex-1">经纪人 / 渠道档案</h1>
      </div>

      <BrokerList initialList={serialized} />
    </div>
  );
}
