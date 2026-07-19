import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import TaoyuanClient from './TaoyuanClient';
import type { ClientEvent } from './types';

export const dynamic = 'force-dynamic';

function serializeEvent(
  ev: {
    id: string;
    title: string;
    status: string;
    participate: boolean;
    startAt: Date | null;
    deadline: Date | null;
    content: string | null;
    reward: string | null;
    rewardMethod: string | null;
    topicTag: string | null;
    predictedCents: number | null;
    announcedCents: number | null;
    paidCents: number | null;
    predictedAt: Date | null;
    announcedAt: Date | null;
    paidAt: Date | null;
    note: string | null;
    parentId: string | null;
  },
  children: ClientEvent[] = [],
): ClientEvent {
  return {
    id: ev.id,
    title: ev.title,
    status: ev.status,
    participate: ev.participate,
    startAt: ev.startAt?.toISOString() ?? null,
    deadline: ev.deadline?.toISOString() ?? null,
    content: ev.content,
    reward: ev.reward,
    rewardMethod: ev.rewardMethod,
    topicTag: ev.topicTag,
    predictedCents: ev.predictedCents,
    announcedCents: ev.announcedCents,
    paidCents: ev.paidCents,
    predictedAt: ev.predictedAt?.toISOString() ?? null,
    announcedAt: ev.announcedAt?.toISOString() ?? null,
    paidAt: ev.paidAt?.toISOString() ?? null,
    note: ev.note,
    parentId: ev.parentId,
    children,
  };
}

export default async function TaoyuanPage() {
  const user = await requireUser();
  if (!user) redirect('/login');

  const raw = await prisma.event.findMany({
    where: { userId: user.id },
    orderBy: [{ createdAt: 'desc' }],
  });

  // 构建 父 → 子[] 映射；顶层是 parentId === null
  const childrenByParent = new Map<string, ClientEvent[]>();
  const topLevel: typeof raw = [];
  for (const ev of raw) {
    if (ev.parentId) {
      const arr = childrenByParent.get(ev.parentId) ?? [];
      arr.push(serializeEvent(ev));
      childrenByParent.set(ev.parentId, arr);
    } else {
      topLevel.push(ev);
    }
  }
  const events: ClientEvent[] = topLevel.map((ev) =>
    serializeEvent(ev, childrenByParent.get(ev.id) ?? []),
  );

  return (
    <div className="px-6 pt-14 pb-24">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-ink-500 text-sm">‹ 返回</Link>
        <h1 className="text-2xl font-semibold flex-1">桃源账本</h1>
      </div>

      <TaoyuanClient events={events} />
    </div>
  );
}
