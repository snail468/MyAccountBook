import { summarizeNonMoney, type AmountEntry, type NonMoneySummary, type Stage } from '@/lib/amounts';

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

/** 父 + 所有子的条目合并成一个列表，聚合口径都基于它 */
function allEntries(ev: ClientEvent): AmountEntry[] {
  return [...ev.amounts, ...ev.children.flatMap((c) => c.amounts)];
}

/**
 * 父卡片聚合**金额**：父 + 所有子在该 stage 的金额总和。
 * 只累加金额类 —— Q币的个数不是钱，见 lib/amounts.ts 的 sumByStage。
 */
export function aggregateSum(ev: ClientEvent, stage: Stage): number {
  return allEntries(ev)
    .filter((a) => a.stage === stage && a.kind === 'money')
    .reduce((acc, b) => acc + b.cents, 0);
}

/** 父卡片聚合**非金额奖励**：Q币多少个、发了哪些周边 */
export function aggregateNonMoney(ev: ClientEvent, stage: Stage): NonMoneySummary[] {
  return summarizeNonMoney(allEntries(ev), stage);
}

/** 该 stage 有没有金额类条目 —— 用来区分"0 元"和"只有非金额奖励" */
export function hasMoney(ev: ClientEvent, stage: Stage): boolean {
  return allEntries(ev).some((a) => a.stage === stage && a.kind === 'money');
}

export function aggregateCount(ev: ClientEvent, stage: Stage): number {
  const own = ev.amounts.filter((a) => a.stage === stage).length;
  const childCount = ev.children.reduce(
    (acc, c) => acc + c.amounts.filter((a) => a.stage === stage).length,
    0,
  );
  return own + childCount;
}
