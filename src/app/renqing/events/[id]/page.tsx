import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import EventDetailClient from './EventDetailClient';

export const dynamic = 'force-dynamic';

export default async function EventDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect('/login');

  const { id } = await props.params;

  const event = await prisma.giftEvent.findFirst({
    where: { id, userId: user.id, deletedAt: null },
    include: {
      records: {
        where: { deletedAt: null },
        orderBy: [{ createdAt: 'desc' }],
        include: {
          person: {
            select: { id: true, name: true, relationship: true, group: true },
          },
        },
      },
    },
  });

  if (!event) notFound();

  let totalGiftCents = 0;
  for (const r of event.records) {
    if (r.direction === 'in') totalGiftCents += r.amountCents;
  }
  const banquetCost = event.banquetCostCents || 0;
  const netProfitCents = totalGiftCents - banquetCost;

  const eventData = {
    id: event.id,
    title: event.title,
    category: event.category,
    eventDate: event.eventDate.toISOString(),
    banquetCostCents: event.banquetCostCents,
    note: event.note,
  };

  const recordsData = event.records.map((r) => ({
    id: r.id,
    amountCents: r.amountCents,
    itemType: r.itemType,
    giftItemDesc: r.giftItemDesc,
    occurredAt: r.occurredAt.toISOString(),
    note: r.note,
    person: r.person,
  }));

  return (
    <div className="px-6 pt-14 pb-20">
      <div className="flex items-center gap-3 mb-4">
        <Link href="/renqing" className="text-ink-500 text-sm">
          ‹ 返回人情往来
        </Link>
      </div>

      <EventDetailClient
        event={eventData}
        records={recordsData}
        guestCount={event.records.length}
        totalGiftCents={totalGiftCents}
        netProfitCents={netProfitCents}
      />
    </div>
  );
}
