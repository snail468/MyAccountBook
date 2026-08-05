// 登录限流 —— 原来登录接口完全没有限制，公网部署下可以无限试密码，
// 而密码策略只有 min(6)。
//
// 策略：按用户名累计连续失败次数，分档锁定，成功即清零。
//   5 次  → 锁 1 分钟
//   10 次 → 锁 5 分钟
//   15 次 → 锁 15 分钟
//   20 次+→ 锁 1 小时
//
// 为什么用递增锁而不是一次性永久锁：永久锁会让攻击者只要知道用户名
// 就能把人锁在门外（拒绝服务）。递增窗口把爆破速度压到无意义的程度，
// 同时正常用户等一下就能继续。
//
// 状态落在 User 表而不是内存：Docker 重启不能重置计数，
// Cloudflare Workers 每个请求是独立实例，内存计数根本不存在。

import { prisma } from '@/lib/db';

const LOCK_TIERS: { threshold: number; lockMs: number }[] = [
  { threshold: 20, lockMs: 60 * 60 * 1000 },
  { threshold: 15, lockMs: 15 * 60 * 1000 },
  { threshold: 10, lockMs: 5 * 60 * 1000 },
  { threshold: 5, lockMs: 60 * 1000 },
];

export type ThrottleState = {
  locked: boolean;
  retryAfterSeconds: number;
};

/** 当前是否处于锁定期 */
export function checkLock(user: {
  lockedUntil: Date | null;
}): ThrottleState {
  if (!user.lockedUntil) return { locked: false, retryAfterSeconds: 0 };
  const remaining = user.lockedUntil.getTime() - Date.now();
  if (remaining <= 0) return { locked: false, retryAfterSeconds: 0 };
  return { locked: true, retryAfterSeconds: Math.ceil(remaining / 1000) };
}

/**
 * 记一次失败。返回新的锁定状态。
 * 达到档位阈值时设置 lockedUntil；否则只累加计数。
 */
export async function recordFailure(userId: string, currentCount: number): Promise<ThrottleState> {
  const next = currentCount + 1;
  const tier = LOCK_TIERS.find((t) => next >= t.threshold);

  const lockedUntil = tier ? new Date(Date.now() + tier.lockMs) : null;

  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginCount: next,
      // 没到阈值就不动 lockedUntil，避免把上一次的锁提前解掉
      ...(lockedUntil ? { lockedUntil } : {}),
    },
  });

  if (!tier) return { locked: false, retryAfterSeconds: 0 };
  return { locked: true, retryAfterSeconds: Math.ceil(tier.lockMs / 1000) };
}

/** 登录成功 —— 清零计数和锁 */
export async function recordSuccess(userId: string, hadFailures: boolean): Promise<void> {
  // 绝大多数登录是成功且此前没失败过的，省掉一次无意义的写
  if (!hadFailures) return;
  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: 0, lockedUntil: null },
  });
}

export function lockMessage(retryAfterSeconds: number): string {
  if (retryAfterSeconds >= 60) {
    return `尝试次数过多，请 ${Math.ceil(retryAfterSeconds / 60)} 分钟后再试`;
  }
  return `尝试次数过多，请 ${retryAfterSeconds} 秒后再试`;
}
