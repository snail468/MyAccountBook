import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import CardStaffList from './CardStaffList';

export const dynamic = 'force-dynamic';

export default async function CardStaffPage() {
  const user = await requireUser();
  if (!user) redirect('/login');

  const list = await prisma.cardStaff.findMany({
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

  const serialized = list.map((item) => ({
    id: item.id,
    name: item.name,
    workNo: item.workNo,
    phone: item.phone,
    branch: item.branch,
    commissionNote: item.commissionNote,
    note: item.note,
    createdAt: item.createdAt.toISOString(),
    _count: item._count,
  }));

  return (
    <div className="px-6 pt-14 pb-20">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/loan" className="text-ink-500 text-sm">‹ 返回工作台</Link>
        <h1 className="text-2xl font-semibold flex-1">卡部人员与工号档案</h1>
      </div>

      <CardStaffList initialList={serialized} />
    </div>
  );
}
