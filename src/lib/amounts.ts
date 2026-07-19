// 兼容层：把新表 EventAmount 与旧列 (predictedCents / announcedCents / paidCents) 统一成一个"金额条目"列表

export type Stage = 'predicted' | 'announced' | 'paid';

export type AmountEntry = {
  id: string;
  stage: Stage;
  cents: number;
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

export function sumByStage(entries: AmountEntry[], stage: Stage): number {
  return entries.filter((e) => e.stage === stage).reduce((a, b) => a + b.cents, 0);
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
