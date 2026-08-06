import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { ensureLegacyMigrated } from '@/lib/legacyMigrate';
import { resolveOwnLedgerId } from '@/lib/ownership';
import Prefetcher from '@/components/ui/Prefetcher';
import TaoyuanSection from './_views/TaoyuanSection';

export const dynamic = 'force-dynamic';

// /taoyuan：请求方 owner 的桃源账本。共享桃源走 /l/[id]，同 section
export default async function TaoyuanPage() {
  const user = await requireUser();
  if (!user) redirect('/login');
  await ensureLegacyMigrated();
  const ledgerId = await resolveOwnLedgerId(user.id, 'taoyuan');
  return (
    <>
      <Prefetcher routes={['/']} />
      <TaoyuanSection ledgerId={ledgerId} ledgerName="桃源账本" backHref="/" />
    </>
  );
}
