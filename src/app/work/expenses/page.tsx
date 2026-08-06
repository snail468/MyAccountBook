import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import Prefetcher from '@/components/ui/Prefetcher';
import { resolveOwnLedgerId } from '@/lib/ownership';
import WorkExpensesSection from '../_views/WorkExpensesSection';

export const dynamic = 'force-dynamic';

// owner 视角的出项汇总；共享 work 走 /l/[id]/expenses，同 section
export default async function ExpensesPage() {
  const user = await requireUser();
  if (!user) redirect('/login');

  const ledgerId = await resolveOwnLedgerId(user.id, 'work');
  return (
    <>
      <Prefetcher routes={['/']} />
      <WorkExpensesSection
        ledgerId={ledgerId}
        title="工作出项汇总"
        backHref="/"
      />
    </>
  );
}
