// 分摊金额的服务端权威计算。
//
// 为什么必须在服务端算：原来客户端算好 shareCents 提交，服务端只校验
// "和值差不超过 max(2, 人数) 分"。50 人时就允许 0.5 元的偏差落库，
// 长期累积会让账对不上。现在客户端只提交「谁参与 + 权重」，
// 金额由服务端用最大余额法分配，保证 sum(shares) 恒等于总额，一分不差。
//
// 三种 UI 模式都收敛到同一条路径：
//   全员平摊 → 所有成员权重 1
//   部分平摊 → 选中成员权重 1
//   按比例   → 各自的权重
//
// 分配算法（最大余额法 / Hare quota）：
//   1. 理论值 exact_i = total * w_i / sum(w)
//   2. 先各取 floor(exact_i)
//   3. 剩下的 total - sum(floor) 分，按小数部分从大到小逐一发放
//   4. 小数部分相同时按 memberId 字典序，保证同样输入永远得到同样输出（幂等）

export type WeightEntry = { memberId: string; weight: number };
export type ShareEntry = { memberId: string; shareCents: number };

export class SplitAllocationError extends Error {}

/**
 * 按权重把 totalCents 分配给各成员。
 *
 * @throws SplitAllocationError 权重非法（空、负数、含 NaN、总和为 0）
 * 保证：返回结果的 shareCents 之和严格等于 totalCents。
 */
export function allocateByWeight(totalCents: number, entries: WeightEntry[]): ShareEntry[] {
  if (!Number.isInteger(totalCents)) {
    throw new SplitAllocationError('总额必须是整数分');
  }
  if (entries.length === 0) {
    throw new SplitAllocationError('至少要有一个分摊成员');
  }

  const seen = new Set<string>();
  for (const e of entries) {
    if (seen.has(e.memberId)) {
      throw new SplitAllocationError(`成员重复：${e.memberId}`);
    }
    seen.add(e.memberId);
    if (!Number.isFinite(e.weight) || e.weight < 0) {
      throw new SplitAllocationError('权重必须是非负有限数');
    }
  }

  const totalWeight = entries.reduce((a, e) => a + e.weight, 0);
  if (totalWeight <= 0) {
    throw new SplitAllocationError('权重总和必须大于 0');
  }

  // 负总额（理论上不会出现，但别让它悄悄算错）
  const sign = totalCents < 0 ? -1 : 1;
  const abs = Math.abs(totalCents);

  const computed = entries.map((e) => {
    const exact = (abs * e.weight) / totalWeight;
    const base = Math.floor(exact);
    return { memberId: e.memberId, base, frac: exact - base };
  });

  let remainder = abs - computed.reduce((a, c) => a + c.base, 0);

  // 小数部分大的先拿；完全相同时按 memberId 排序保证确定性
  const order = [...computed].sort((a, b) => {
    if (b.frac !== a.frac) return b.frac - a.frac;
    return a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0;
  });

  const bonus = new Map<string, number>();
  for (const c of order) {
    if (remainder <= 0) break;
    bonus.set(c.memberId, 1);
    remainder -= 1;
  }

  const result = computed.map((c) => ({
    memberId: c.memberId,
    shareCents: sign * (c.base + (bonus.get(c.memberId) ?? 0)),
  }));

  // 守恒断言：算法保证成立，不成立说明实现被改坏了，宁可炸掉也不要写错账
  const sum = result.reduce((a, r) => a + r.shareCents, 0);
  if (sum !== totalCents) {
    throw new SplitAllocationError(
      `分摊结果不守恒：${sum} !== ${totalCents}（这是实现 bug，请报告）`,
    );
  }

  return result;
}

/**
 * 校验客户端直接给定的精确金额（老接口 / "各自指定金额"场景）。
 * 与权重模式不同，这里**不给任何容差** —— 要么正好对上，要么拒绝。
 */
export function validateExactShares(
  totalCents: number,
  shares: ShareEntry[],
): { ok: true } | { ok: false; reason: string } {
  if (shares.length === 0) return { ok: false, reason: '至少要有一个分摊成员' };
  const seen = new Set<string>();
  for (const s of shares) {
    if (seen.has(s.memberId)) return { ok: false, reason: `成员重复：${s.memberId}` };
    seen.add(s.memberId);
    if (!Number.isInteger(s.shareCents)) {
      return { ok: false, reason: '分摊金额必须是整数分' };
    }
  }
  const sum = shares.reduce((a, s) => a + s.shareCents, 0);
  if (sum !== totalCents) {
    return {
      ok: false,
      reason: `分摊之和 ${(sum / 100).toFixed(2)} 与总额 ${(totalCents / 100).toFixed(2)} 不一致`,
    };
  }
  return { ok: true };
}

/** 等权分摊的便捷入口（全员平摊 / 部分平摊） */
export function allocateEvenly(totalCents: number, memberIds: string[]): ShareEntry[] {
  return allocateByWeight(
    totalCents,
    memberIds.map((memberId) => ({ memberId, weight: 1 })),
  );
}
