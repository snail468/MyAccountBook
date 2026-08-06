import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import Prefetcher from '@/components/ui/Prefetcher';
import { resolveOwnLedgerId } from '@/lib/ownership';
import WorkMonthSection from '../_views/WorkMonthSection';

export const dynamic = 'force-dynamic';

// owner 视角的单月页；共享 work 走 /l/[id]/month/[month]，同 section
export default async function MonthPage({
  params,
}: {
  params: Promise<{ month: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect('/login');
  const { month } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) notFound();

  const ledgerId = await resolveOwnLedgerId(user.id, 'work');
  return (
    <>
      <Prefetcher routes={['/work', '/']} />
      <WorkMonthSection
        ledgerId={ledgerId}
        ledgerName="工作账本"
        month={month}
        backHref="/work"
      />
    </>
  );
}
