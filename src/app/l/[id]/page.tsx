import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import Prefetcher from '@/components/ui/Prefetcher';
import GeneralView from './GeneralView';
import TravelView from './TravelView';

export const dynamic = 'force-dynamic';

export default async function LedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) redirect('/login');
  const { id } = await params;

  const ledger = await prisma.ledger.findUnique({ where: { id } });
  if (!ledger || ledger.userId !== user.id) notFound();

  if (ledger.kind === 'general') {
    const entries = await prisma.generalEntry.findMany({
      where: { ledgerId: id },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    });
    return (
      <div className="px-6 pt-14 pb-24">
        <Prefetcher routes={['/']} />
        <GeneralView
          ledger={{
            id: ledger.id,
            name: ledger.name,
            icon: ledger.icon,
            budgetCents: ledger.budgetCents,
          }}
          entries={entries.map((e) => ({
            id: e.id,
            direction: e.direction,
            category: e.category,
            amountCents: e.amountCents,
            tags: e.tags,
            note: e.note,
            imageUrls: parseImages(e.imageUrls),
            occurredAt: e.occurredAt.toISOString(),
          }))}
        />
      </div>
    );
  }

  if (ledger.kind === 'travel') {
    const [members, expenses] = await Promise.all([
      prisma.tripMember.findMany({
        where: { ledgerId: id },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.tripExpense.findMany({
        where: { ledgerId: id },
        include: { splits: true, payer: { select: { id: true, displayName: true } } },
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    return (
      <div className="px-6 pt-14 pb-24">
        <Prefetcher routes={['/']} />
        <TravelView
          ledger={{
            id: ledger.id,
            name: ledger.name,
            icon: ledger.icon,
            baseCurrency: ledger.baseCurrency ?? 'CNY',
            startDate: ledger.startDate?.toISOString() ?? null,
            endDate: ledger.endDate?.toISOString() ?? null,
          }}
          members={members.map((m) => ({
            id: m.id,
            userId: m.userId,
            displayName: m.displayName,
          }))}
          expenses={expenses.map((e) => ({
            id: e.id,
            title: e.title,
            category: e.category,
            phase: e.phase as 'pre' | 'during',
            currency: e.currency,
            amountForeignCents: e.amountForeignCents,
            rate: e.rate,
            amountBaseCents: e.amountBaseCents,
            note: e.note,
            imageUrls: parseImages(e.imageUrls),
            occurredAt: e.occurredAt.toISOString(),
            payerId: e.payerId,
            payerName: e.payer.displayName,
            splits: e.splits.map((s) => ({
              memberId: s.memberId,
              shareCents: s.shareCents,
            })),
          }))}
        />
      </div>
    );
  }

  // work/taoyuan 不应该走到这里，兜底跳转
  if (ledger.kind === 'work') redirect('/work');
  if (ledger.kind === 'taoyuan') redirect('/taoyuan');

  return (
    <div className="px-6 pt-14">
      <Link href="/" className="text-ink-500 text-sm">‹ 返回</Link>
      <p className="mt-4 text-ink-500">未知账本类型：{ledger.kind}</p>
    </div>
  );
}

function parseImages(v: string | null): string[] {
  if (!v) return [];
  try {
    const arr = JSON.parse(v);
    if (Array.isArray(arr)) return arr.filter((x) => typeof x === 'string');
  } catch {}
  return [];
}
