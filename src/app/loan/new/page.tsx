import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import NewOrderForm from './NewOrderForm';

export const dynamic = 'force-dynamic';

export default async function NewLoanOrderPage() {
  const user = await requireUser();
  if (!user) redirect('/login');

  const [brokers, cardStaffs] = await Promise.all([
    prisma.broker.findMany({
      where: { userId: user.id, deletedAt: null },
      orderBy: [{ createdAt: 'desc' }],
      select: { id: true, name: true, company: true },
    }),
    prisma.cardStaff.findMany({
      where: { userId: user.id, deletedAt: null },
      orderBy: [{ createdAt: 'desc' }],
      select: { id: true, name: true, workNo: true, branch: true },
    }),
  ]);

  return (
    <div className="px-6 pt-14 pb-20">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/loan" className="text-ink-500 text-sm">‹ 返回业务台账</Link>
        <h1 className="text-2xl font-semibold flex-1">新建个贷意向单</h1>
      </div>

      <NewOrderForm brokers={brokers} cardStaffs={cardStaffs} />
    </div>
  );
}
