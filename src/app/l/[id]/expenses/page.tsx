import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import WorkExpensesSection from '@/app/work/_views/WorkExpensesSection';

export const dynamic = 'force-dynamic';

// 共享 work 账本的出项汇总页。同 month 子路由 —— owner 也能用，但通常走 /work/expenses。
export default async function SharedWorkExpensesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect('/login');
  const { id } = await params;

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
    <WorkExpensesSection
      ledgerId={ledger.id}
      title={`💼 ${ledger.name} · 出项汇总`}
      backHref={`/l/${ledger.id}`}
    />
  );
}
