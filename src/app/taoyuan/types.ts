import type { AmountEntry, Stage } from '@/lib/amounts';

export type ClientEvent = {
  id: string;
  title: string;
  status: string;
  participate: boolean;
  startAt: string | null;
  deadline: string | null;
  content: string | null;
  reward: string | null;
  rewardMethods: string[];
  contentImages: string[];
  topicTag: string | null;
  amounts: AmountEntry[];
  note: string | null;
  parentId: string | null;
  children: ClientEvent[];
};

export const STATUS_LABEL: Record<string, string> = {
  published: '活动火热进行中',
  predicted: '待公示',
  announced: '待发钱',
  paid: '已到账',
};

export const STATUS_ORDER = ['published', 'predicted', 'announced', 'paid'] as const;

// 父卡片聚合金额：父 + 所有子在每个 stage 的总和
export function aggregateSum(ev: ClientEvent, stage: Stage): number {
  const own = ev.amounts.filter((a) => a.stage === stage).reduce((a, b) => a + b.cents, 0);
  const childSum = ev.children.reduce(
    (acc, c) => acc + c.amounts.filter((a) => a.stage === stage).reduce((a, b) => a + b.cents, 0),
    0,
  );
  return own + childSum;
}

export function aggregateCount(ev: ClientEvent, stage: Stage): number {
  const own = ev.amounts.filter((a) => a.stage === stage).length;
  const childCount = ev.children.reduce(
    (acc, c) => acc + c.amounts.filter((a) => a.stage === stage).length,
    0,
  );
  return own + childCount;
}
