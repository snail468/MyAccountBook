import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { combineAmounts } from '@/lib/amounts';
import { parseRewardMethods } from '@/lib/rewardMethod';
import { ensureLegacyMigrated } from '@/lib/legacyMigrate';
import Prefetcher from '@/components/ui/Prefetcher';
import TaoyuanClient from './TaoyuanClient';
import type { ClientEvent } from './types';

export const dynamic = 'force-dynamic';

type RawEvent = Awaited<ReturnType<typeof loadRaw>>[number];

async function loadRaw(userId: string) {
  return prisma.event.findMany({
    where: { userId },
    include: {
      amounts: {
        orderBy: { occurredAt: 'asc' },
      },
    },
    orderBy: [{ createdAt: 'desc' }],
  });
}

function serialize(ev: RawEvent, children: ClientEvent[] = []): ClientEvent {
  return {
    id: ev.id,
    title: ev.title,
    status: ev.status,
    participate: ev.participate,
    startAt: ev.startAt?.toISOString() ?? null,
    deadline: ev.deadline?.toISOString() ?? null,
    content: ev.content,
    reward: ev.reward,
    rewardMethods: parseRewardMethods(ev.rewardMethods, ev.rewardMethod),
    contentImages: parseImages(ev.contentImages),
    topicTag: ev.topicTag,
    amounts: combineAmounts(ev.amounts, {
      predictedCents: ev.predictedCents,
      announcedCents: ev.announcedCents,
      paidCents: ev.paidCents,
      predictedAt: ev.predictedAt,
      announcedAt: ev.announcedAt,
      paidAt: ev.paidAt,
      rewardMethod: ev.rewardMethod,
    }),
    note: ev.note,
    parentId: ev.parentId,
    children,
  };
}

function parseImages(v: string | null): string[] {
  if (!v) return [];
  try {
    const arr = JSON.parse(v);
    if (Array.isArray(arr)) return arr.filter((x) => typeof x === 'string');
  } catch {
    // ignore
  }
  return [];
}

export default async function TaoyuanPage() {
  const user = await requireUser();
  if (!user) redirect('/login');

  await ensureLegacyMigrated();

  const raw = await loadRaw(user.id);

  const childrenByParent = new Map<string, ClientEvent[]>();
  const topLevel: RawEvent[] = [];
  for (const ev of raw) {
    if (ev.parentId) {
      const arr = childrenByParent.get(ev.parentId) ?? [];
      arr.push(serialize(ev));
      childrenByParent.set(ev.parentId, arr);
    } else {
      topLevel.push(ev);
    }
  }
  const events: ClientEvent[] = topLevel.map((ev) =>
    serialize(ev, childrenByParent.get(ev.id) ?? []),
  );

  return (
    <div className="px-6 pt-14 pb-24">
      <Prefetcher routes={['/']} />
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-ink-500 text-sm">‹ 返回</Link>
        <h1 className="text-2xl font-semibold flex-1">桃源账本</h1>
      </div>

      <TaoyuanClient events={events} />
    </div>
  );
}
