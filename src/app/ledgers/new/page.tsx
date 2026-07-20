import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import Prefetcher from '@/components/ui/Prefetcher';
import PresetPicker from './PresetPicker';

export const dynamic = 'force-dynamic';

export default async function NewLedgerPage() {
  const user = await requireUser();
  if (!user) redirect('/login');

  const existing = await prisma.ledger.findMany({
    where: { userId: user.id, archived: false },
    select: { kind: true },
  });
  const has = new Set(existing.map((l) => l.kind));

  return (
    <div className="px-6 pt-14 pb-20">
      <Prefetcher routes={['/']} />
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-ink-500 text-sm">‹ 返回</Link>
        <h1 className="text-2xl font-semibold flex-1">添加账本</h1>
      </div>
      <PresetPicker hasWork={has.has('work')} hasTaoyuan={has.has('taoyuan')} />
    </div>
  );
}
