// 兼容层：把新表 EventAmount 与旧列 (predictedCents / announcedCents / paidCents) 统一成一个"金额条目"列表

import { isTaxable, rewardValueKind, type RewardValueKind } from '@/lib/rewardMethod';

export type Stage = 'predicted' | 'announced' | 'paid';

export type AmountEntry = {
  id: string;
  stage: Stage;
  /** 金额（分）。非金额奖励恒为 0 */
  cents: number;
  /** 个数类奖励的数量 */
  quantity: number | null;
  /** 文字类奖励的描述 */
  itemDesc: string | null;
  /** 计量方式，由 rewardMethod 推导 */
  kind: RewardValueKind;
  note: string | null;
  rewardMethod: string | null;
  occurredAt: string; // ISO
};

type LegacyLike = {
  predictedCents: number | null;
  announcedCents: number | null;
  paidCents: number | null;
  predictedAt: Date | null;
  announcedAt: Date | null;
  paidAt: Date | null;
  rewardMethod: string | null;
};

type AmountRow = {
  id: string;
  stage: string;
  cents: number;
  quantity?: number | null;
  itemDesc?: string | null;
  note: string | null;
  rewardMethod: string | null;
  occurredAt: Date;
};

// 把 EventAmount 行 + 旧列合并成一个列表。旧列仅在新表当阶段无记录时兜底。
export function combineAmounts(
  amounts: AmountRow[],
  legacy: LegacyLike,
): AmountEntry[] {
  const byStage = new Map<Stage, AmountEntry[]>();
  for (const s of ['predicted', 'announced', 'paid'] as Stage[]) byStage.set(s, []);
  for (const a of amounts) {
    if (a.stage !== 'predicted' && a.stage !== 'announced' && a.stage !== 'paid') continue;
    byStage.get(a.stage)!.push({
      id: a.id,
      stage: a.stage,
      cents: a.cents,
      quantity: a.quantity ?? null,
      itemDesc: a.itemDesc ?? null,
      kind: rewardValueKind(a.rewardMethod),
      note: a.note,
      rewardMethod: a.rewardMethod,
      occurredAt: a.occurredAt.toISOString(),
    });
  }
  // 兜底：旧列若非空且新表当 stage 为空，做为伪条目挂上（id 以 "legacy:" 打前缀，前端不允许改/删）
  const inject = (
    stage: Stage,
    cents: number | null,
    at: Date | null,
  ) => {
    if (cents === null) return;
    const list = byStage.get(stage)!;
    if (list.length > 0) return;
    list.push({
      id: `legacy:${stage}`,
      stage,
      cents,
      // 旧列时代只有金额这一种形态，所以兜底条目一律是 money
      quantity: null,
      itemDesc: null,
      kind: 'money',
      note: null,
      rewardMethod: legacy.rewardMethod,
      occurredAt: (at ?? new Date()).toISOString(),
    });
  };
  inject('predicted', legacy.predictedCents, legacy.predictedAt);
  inject('announced', legacy.announcedCents, legacy.announcedAt);
  inject('paid', legacy.paidCents, legacy.paidAt);

  return [...byStage.get('predicted')!, ...byStage.get('announced')!, ...byStage.get('paid')!].sort(
    (a, b) => a.occurredAt.localeCompare(b.occurredAt),
  );
}

/**
 * 某阶段的**金额**合计。
 *
 * 只累加 kind === 'money' 的条目 —— Q币的个数、周边的件数都不是钱，
 * 加进来就把账算错了。非金额奖励用 summarizeNonMoney 单独汇总。
 *
 * 非金额条目的 cents 本来就存 0，这里的过滤是为了让意图显式：
 * 万一将来有人给 count 类也填了 cents，也不会污染金额合计。
 */
export function sumByStage(entries: AmountEntry[], stage: Stage): number {
  return entries
    .filter((e) => e.stage === stage && e.kind === 'money')
    .reduce((a, b) => a + b.cents, 0);
}

/**
 * 某阶段的**应税**与**免税**金额拆分。
 *
 * 应税：现金及自定义（视同现金等价物）—— 参与个税计算
 * 免税：京东卡等实物 —— 不参与个税，但仍算发放金额
 *
 * 用途：桃源账本的"公示税后"= afterTax(taxable) + nonTaxable，不能把京东卡
 * 一起并进税基算，那样会多扣税。
 */
export function splitTaxable(
  entries: AmountEntry[],
  stage: Stage,
): { taxable: number; nonTaxable: number } {
  let taxable = 0;
  let nonTaxable = 0;
  for (const e of entries) {
    if (e.stage !== stage || e.kind !== 'money') continue;
    if (isTaxable(e.rewardMethod)) taxable += e.cents;
    else nonTaxable += e.cents;
  }
  return { taxable, nonTaxable };
}

export type NonMoneySummary = {
  rewardMethod: string;
  kind: 'count' | 'text';
  /** count 类：个数合计 */
  total: number;
  /** text 类：描述列表（去重） */
  items: string[];
};

/**
 * 某阶段的非金额奖励汇总，按发放方式分组。
 * count 类累加个数，text 类收集描述。
 */
export function summarizeNonMoney(entries: AmountEntry[], stage: Stage): NonMoneySummary[] {
  const map = new Map<string, NonMoneySummary>();
  for (const e of entries) {
    if (e.stage !== stage || e.kind === 'money') continue;
    const key = e.rewardMethod ?? '';
    let cur = map.get(key);
    if (!cur) {
      cur = { rewardMethod: key, kind: e.kind, total: 0, items: [] };
      map.set(key, cur);
    }
    if (e.kind === 'count') cur.total += e.quantity ?? 0;
    else if (e.itemDesc && !cur.items.includes(e.itemDesc)) cur.items.push(e.itemDesc);
  }
  return [...map.values()];
}

/** 该阶段有没有任何条目（金额的或非金额的）—— 界面据此决定显示金额还是"—" */
export function hasAnyByStage(entries: AmountEntry[], stage: Stage): boolean {
  return entries.some((e) => e.stage === stage);
}

export function countByStage(entries: AmountEntry[], stage: Stage): number {
  return entries.filter((e) => e.stage === stage).length;
}

// 派生状态：有 paid → paid; 有 announced → announced; 有 predicted → predicted; 否则 published
export function deriveStatus(entries: AmountEntry[]): 'published' | 'predicted' | 'announced' | 'paid' {
  if (entries.some((e) => e.stage === 'paid')) return 'paid';
  if (entries.some((e) => e.stage === 'announced')) return 'announced';
  if (entries.some((e) => e.stage === 'predicted')) return 'predicted';
  return 'published';
}
