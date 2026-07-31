// 活动金额的输入归一化：把「三种计量方式共用一个接口」的入参
// 收敛成落库用的三个字段。纯函数，进单测。
//
// 放在 lib 而不是 route 文件里，一是因为 POST 与 PATCH 都要用，
// 二是 Next 的 App Router 只允许 route.ts 导出 HTTP handler，
// 从里面 export 工具函数会被路由类型校验拒绝。

import { rewardValueKind } from '@/lib/rewardMethod';

export type AmountInput = {
  cents?: number | null;
  quantity?: number | null;
  itemDesc?: string | null;
  rewardMethod?: string | null;
};

export type NormalizedAmount = {
  cents: number;
  quantity: number | null;
  itemDesc: string | null;
};

/**
 * 按 rewardMethod 决定的计量方式校验并归一。
 *
 * 关键约束：**非金额条目的 cents 必须置 0**，且另外两个字段互斥置 null。
 * 所有既有的金额聚合都建立在"cents 就是钱"这个前提上 ——
 * 让 Q币的个数漏进 cents 会直接把账算错，而残留的旧值会让一条记录
 * 同时带着金额和个数，之后没人说得清哪个是对的。
 */
export function normalizeAmountInput(
  p: AmountInput,
): { ok: true; value: NormalizedAmount } | { ok: false; reason: string } {
  const kind = rewardValueKind(p.rewardMethod);

  if (kind === 'money') {
    const cents = p.cents ?? 0;
    if (cents <= 0) return { ok: false, reason: '请填写金额' };
    return { ok: true, value: { cents, quantity: null, itemDesc: null } };
  }

  if (kind === 'count') {
    const q = p.quantity ?? 0;
    if (q <= 0) return { ok: false, reason: '请填写个数' };
    return { ok: true, value: { cents: 0, quantity: q, itemDesc: null } };
  }

  const desc = p.itemDesc?.trim();
  if (!desc) return { ok: false, reason: '请填写奖励内容' };
  return { ok: true, value: { cents: 0, quantity: null, itemDesc: desc } };
}
