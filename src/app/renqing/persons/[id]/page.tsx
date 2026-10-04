import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import PersonDetailClient from './PersonDetailClient';

export const dynamic = 'force-dynamic';

export default async function PersonDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect('/login');

  const { id } = await props.params;

  const [person, rawEvents] = await Promise.all([
    prisma.giftPerson.findFirst({
      where: { id, userId: user.id, deletedAt: null },
      include: {
        records: {
          where: { deletedAt: null },
          orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
          include: {
            event: { select: { id: true, title: true, category: true } },
          },
        },
      },
    }),
    prisma.giftEvent.findMany({
      where: { userId: user.id, deletedAt: null },
      select: { id: true, title: true, category: true },
    }),
  ]);

  if (!person) notFound();

  let totalOutCents = 0;
  let totalInCents = 0;
  let lastInRecord: (typeof person.records)[0] | null = null;
  let lastOutRecord: (typeof person.records)[0] | null = null;

  for (const r of person.records) {
    if (r.direction === 'out') {
      totalOutCents += r.amountCents;
      if (!lastOutRecord) lastOutRecord = r;
    } else if (r.direction === 'in') {
      totalInCents += r.amountCents;
      if (!lastInRecord) lastInRecord = r;
    }
  }

  let reciprocalAdvice = '';
  if (lastInRecord) {
    const formattedYuan = (lastInRecord.amountCents / 100).toFixed(0);
    const dateStr = lastInRecord.occurredAt.toISOString().slice(0, 10);
    reciprocalAdvice = `对方曾在 ${dateStr}（${lastInRecord.category}）随礼 ¥${formattedYuan}，建议还礼额度不低于 ¥${formattedYuan}`;
  } else if (totalOutCents > 0) {
    reciprocalAdvice = `您已累计向对方随礼 ¥${(totalOutCents / 100).toFixed(0)}，对方暂无随礼记录`;
  }

  const personData = {
    id: person.id,
    name: person.name,
    relationship: person.relationship,
    group: person.group,
    phone: person.phone,
    note: person.note,
    createdAt: person.createdAt.toISOString(),
  };

  const recordsData = person.records.map((r) => ({
    id: r.id,
    direction: r.direction,
    amountCents: r.amountCents,
    category: r.category,
    itemType: r.itemType,
    giftItemDesc: r.giftItemDesc,
    occurredAt: r.occurredAt.toISOString(),
    isPendingReturn: r.isPendingReturn,
    note: r.note,
    event: r.event,
  }));

  return (
    <div className="px-6 pt-14 pb-20">
      <div className="flex items-center gap-3 mb-4">
        <Link href="/renqing" className="text-ink-500 text-sm">
          ‹ 返回人情往来
        </Link>
      </div>

      <PersonDetailClient
        person={personData}
        records={recordsData}
        events={rawEvents}
        totalOutCents={totalOutCents}
        totalInCents={totalInCents}
        netCents={totalInCents - totalOutCents}
        reciprocalAdvice={reciprocalAdvice}
      />
    </div>
  );
}
