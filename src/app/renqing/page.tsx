import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { parsePrefs, getRenqingName } from '@/lib/userPrefs';
import Prefetcher from '@/components/ui/Prefetcher';
import RenqingDashboard, {
  DashboardRecord,
  DashboardPerson,
  DashboardEvent,
} from './RenqingDashboard';

export const dynamic = 'force-dynamic';

export default async function RenqingPage() {
  const user = await requireUser();
  if (!user) redirect('/login');

  const [rawRecords, rawPersons, rawEvents, userRow] = await Promise.all([
    prisma.giftRecord.findMany({
      where: { userId: user.id, deletedAt: null },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        person: {
          select: { id: true, name: true, relationship: true, group: true },
        },
        event: {
          select: { id: true, title: true, category: true },
        },
      },
    }),
    prisma.giftPerson.findMany({
      where: { userId: user.id, deletedAt: null },
      orderBy: [{ name: 'asc' }],
      include: {
        records: {
          where: { deletedAt: null },
          select: { direction: true, amountCents: true, occurredAt: true },
        },
      },
    }),
    prisma.giftEvent.findMany({
      where: { userId: user.id, deletedAt: null },
      orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        records: {
          where: { deletedAt: null },
          select: { direction: true, amountCents: true },
        },
      },
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { preferences: true },
    }),
  ]);

  const prefs = parsePrefs(userRow?.preferences);
  const businessName = getRenqingName(prefs);

  // 格式化流水数据
  const records: DashboardRecord[] = rawRecords.map((r) => ({
    id: r.id,
    personId: r.personId,
    eventId: r.eventId,
    direction: r.direction,
    amountCents: r.amountCents,
    category: r.category,
    itemType: r.itemType,
    giftItemDesc: r.giftItemDesc,
    occurredAt: r.occurredAt.toISOString(),
    isPendingReturn: r.isPendingReturn,
    note: r.note,
    person: r.person,
    event: r.event,
  }));

  // 格式化联系人数据
  const persons: DashboardPerson[] = rawPersons.map((p) => {
    let totalOutCents = 0;
    let totalInCents = 0;
    let lastOccurredAt: Date | null = null;
    for (const r of p.records) {
      if (r.direction === 'out') totalOutCents += r.amountCents;
      else if (r.direction === 'in') totalInCents += r.amountCents;
      if (!lastOccurredAt || r.occurredAt > lastOccurredAt) {
        lastOccurredAt = r.occurredAt;
      }
    }
    return {
      id: p.id,
      name: p.name,
      relationship: p.relationship,
      group: p.group,
      phone: p.phone,
      note: p.note,
      recordCount: p.records.length,
      totalOutCents,
      totalInCents,
      netCents: totalInCents - totalOutCents,
      lastOccurredAt: lastOccurredAt ? lastOccurredAt.toISOString() : null,
    };
  });

  // 格式化大事件数据
  const events: DashboardEvent[] = rawEvents.map((e) => {
    let totalGiftCents = 0;
    let guestCount = 0;
    for (const r of e.records) {
      if (r.direction === 'in') {
        totalGiftCents += r.amountCents;
        guestCount++;
      }
    }
    const banquetCost = e.banquetCostCents || 0;
    return {
      id: e.id,
      title: e.title,
      category: e.category,
      eventDate: e.eventDate.toISOString(),
      banquetCostCents: e.banquetCostCents,
      note: e.note,
      guestCount,
      totalGiftCents,
      netProfitCents: totalGiftCents - banquetCost,
    };
  });

  // 统计指标
  let totalOutCents = 0;
  let totalInCents = 0;
  let monthOutCents = 0;
  let pendingCount = 0;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  for (const r of rawRecords) {
    if (r.direction === 'out') {
      totalOutCents += r.amountCents;
      const d = new Date(r.occurredAt);
      if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
        monthOutCents += r.amountCents;
      }
    } else if (r.direction === 'in') {
      totalInCents += r.amountCents;
    }
    if (r.isPendingReturn) {
      pendingCount++;
    }
  }

  const stats = {
    totalOutCents,
    totalInCents,
    netCents: totalInCents - totalOutCents,
    monthOutCents,
    pendingCount,
  };

  return (
    <div className="px-6 pt-14 pb-20">
      <Prefetcher routes={['/']} />
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-ink-500 text-sm">‹ 返回</Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span>🧧</span>
            <span>{businessName}</span>
          </h1>
        </div>

        <Link
          href="/renqing/import"
          className="text-xs px-2.5 py-1 rounded-full bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300 hover:text-ink-900 transition"
        >
          批量导入
        </Link>
      </div>

      <RenqingDashboard
        businessName={businessName}
        records={records}
        persons={persons}
        events={events}
        stats={stats}
      />
    </div>
  );
}
