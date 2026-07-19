export type ClientEvent = {
  id: string;
  title: string;
  status: string;
  participate: boolean;
  startAt: string | null;
  deadline: string | null;
  content: string | null;
  reward: string | null;
  rewardMethod: string | null;
  topicTag: string | null;
  predictedCents: number | null;
  announcedCents: number | null;
  paidCents: number | null;
  predictedAt: string | null;
  announcedAt: string | null;
  paidAt: string | null;
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

// 父卡片聚合数字：自身 + 所有子的对应值（子的 null 视为 0）
export function aggregate(ev: ClientEvent): {
  predicted: number | null;
  announced: number | null;
  paid: number | null;
} {
  const sum = (getter: (e: ClientEvent) => number | null) => {
    const own = getter(ev);
    if (ev.children.length === 0) return own;
    const total = ev.children.reduce((a, c) => a + (getter(c) ?? 0), 0);
    return (own ?? 0) + total;
  };
  return {
    predicted: sum((e) => e.predictedCents),
    announced: sum((e) => e.announcedCents),
    paid: sum((e) => e.paidCents),
  };
}
