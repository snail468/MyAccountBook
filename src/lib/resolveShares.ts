// 把请求里的 allocation（权重）或 splits（精确金额）统一解析成最终分摊金额。
// POST 和 PATCH 两个旅游支出路由共用，避免两处各写一份校验导致行为不一致
// —— 原来 PATCH 就有自己一份带容差的校验，等于给绕过留了后门。

import {
  allocateByWeight,
  SplitAllocationError,
  validateExactShares,
  type ShareEntry,
  type WeightEntry,
} from '@/lib/splitAllocation';

export type ResolveResult =
  | { ok: true; shares: ShareEntry[] }
  | { ok: false; reason: string };

export function resolveShares(
  totalCents: number,
  allocation: WeightEntry[] | undefined,
  splits: ShareEntry[] | undefined,
): ResolveResult {
  // 首选权重模式：服务端算金额，天然守恒
  if (allocation && allocation.length > 0) {
    try {
      return { ok: true, shares: allocateByWeight(totalCents, allocation) };
    } catch (err) {
      if (err instanceof SplitAllocationError) return { ok: false, reason: err.message };
      throw err;
    }
  }

  // 兼容路径：客户端给精确金额，零容差校验
  if (splits && splits.length > 0) {
    const v = validateExactShares(totalCents, splits);
    if (!v.ok) return { ok: false, reason: v.reason };
    return { ok: true, shares: splits };
  }

  return { ok: false, reason: '缺少分摊信息' };
}
