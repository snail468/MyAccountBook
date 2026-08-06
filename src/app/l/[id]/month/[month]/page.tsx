import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import WorkMonthSection from '@/app/work/_views/WorkMonthSection';

export const dynamic = 'force-dynamic';

// 共享 work 账本的单月页。owner 走 /work/[month]；这个路由专门给非 owner 成员，
// 但 owner 直接访问也能用（同 section）。
export default async function SharedWorkMonthPage({
  params,
}: {
  params: Promise<{ id: string; month: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect('/login');
  const { id, month } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) notFound();

  const ledger = await prisma.ledger.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      kind: true,
      members: { where: { userId: user.id }, select: { role: true }, take: 1 },
    },
  });
  if (!ledger || ledger.kind !== 'work' || ledger.members.length === 0) notFound();

  return (
    <WorkMonthSection
      ledgerId={ledger.id}
      ledgerName={`💼 ${ledger.name}`}
      month={month}
      backHref={`/l/${ledger.id}`}
    />
  );
}
