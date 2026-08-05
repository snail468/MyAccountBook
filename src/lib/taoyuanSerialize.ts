// Event → ClientEvent 的序列化，page.tsx 和分页 API 共用，
// 避免两处各写一份导致字段漂移。

import { combineAmounts } from '@/lib/amounts';
import { parseRewardMethods } from '@/lib/rewardMethod';
import { parseImageUrls } from '@/lib/imageCleanup';
import type { ClientEvent } from '@/app/taoyuan/types';

export type RawEventWithAmounts = {
  id: string;
  title: string;
  status: string;
  participate: boolean;
  startAt: Date | null;
  deadline: Date | null;
  content: string | null;
  reward: string | null;
  rewardMethod: string | null;
  rewardMethods: string | null;
  contentImages: string | null;
  topicTag: string | null;
  note: string | null;
  parentId: string | null;
  createdAt: Date;
  predictedCents: number | null;
  announcedCents: number | null;
  paidCents: number | null;
  predictedAt: Date | null;
  announcedAt: Date | null;
  paidAt: Date | null;
  amounts: {
    id: string;
    stage: string;
    cents: number;
    note: string | null;
    rewardMethod: string | null;
    occurredAt: Date;
  }[];
};

export function serializeEvent(
  ev: RawEventWithAmounts,
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
    rewardMethods: parseRewardMethods(ev.rewardMethods, ev.rewardMethod),
    contentImages: parseImageUrls(ev.contentImages),
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

/**
 * 把一批顶层活动和它们的子活动组装成树。
 *
 * 分页时子活动必须跟着父活动一起返回 —— 否则合并过的活动在列表里会散架。
 * 所以调用方要先查顶层的一页，再按 parentId in (...) 把子活动一次性捞回来。
 */
export function buildEventTree(
  topLevel: RawEventWithAmounts[],
  children: RawEventWithAmounts[],
): ClientEvent[] {
  const byParent = new Map<string, ClientEvent[]>();
  for (const c of children) {
    if (!c.parentId) continue;
    const arr = byParent.get(c.parentId) ?? [];
    arr.push(serializeEvent(c));
    byParent.set(c.parentId, arr);
  }
  return topLevel.map((ev) => serializeEvent(ev, byParent.get(ev.id) ?? []));
}
