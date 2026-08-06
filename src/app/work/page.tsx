import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import Prefetcher from '@/components/ui/Prefetcher';
import { resolveOwnLedgerId } from '@/lib/ownership';
import WorkMonthsSection from './_views/WorkMonthsSection';

export const dynamic = 'force-dynamic';

// /work 是"请求方 owner 的工作账本"的入口。共享 work 账本走 /l/[id]，那边
// 复用同一段 WorkMonthsSection，只是 ledgerId / 返回链接 / 单月链接前缀不同。
export default async function WorkPage() {
  const user = await requireUser();
  if (!user) redirect('/login');

  const ledgerId = await resolveOwnLedgerId(user.id, 'work');
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  return (
    <>
      <Prefetcher routes={['/', `/work/${currentMonth}`]} />
      <WorkMonthsSection
        ledgerId={ledgerId}
        ledgerName="工作账本"
        backHref="/"
        monthHrefPrefix="/work"
      />
    </>
  );
}
