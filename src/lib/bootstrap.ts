// 一次性初始化逻辑的归集处。
//
// 这些原来挂在 requireUserWithRole() 里 —— 首页每次渲染都要串行跑四件事
// （adminBootstrap → 查用户 → ensureLedgers → 回收站迁移/清理）。
// 现在分两类：
//   * 全局一次性：首次请求时跑（runStartupTasks，进程级 flag 去重）
//   * 每用户一次性：登录成功时跑（ensureUserSetup）
//
// 这样会话校验回归成一条纯查询。
//
// 为什么不用 Next 的 instrumentation.ts 钩子：它会被同时打进 edge runtime
// 包，而本模块间接引用了使用 node:path / node:fs 的 storage.ts，
// webpack 打 edge 包时会报 UnhandledSchemeError。用 flag 守卫的懒初始化
// 效果等价 —— 第一个请求付一次代价，之后只是一次布尔判断。

import { prisma } from '@/lib/db';
import { ensureAdminBootstrap } from '@/lib/adminBootstrap';
import { ensureLedgersForUser } from '@/lib/ledgerBootstrap';
import { migrateArchivedIfNeeded, purgeExpiredTrash } from '@/lib/ledgerTrash';

let startupDone = false;

/** 进程启动时跑一次。失败只记日志 —— 不能因为维护任务挂了就起不来。 */
export async function runStartupTasks(): Promise<void> {
  if (startupDone) return;
  startupDone = true;
  try {
    await ensureAdminBootstrap();
  } catch (err) {
    console.error('[bootstrap] adminBootstrap 失败:', err);
  }
  try {
    await migrateArchivedIfNeeded();
  } catch (err) {
    console.error('[bootstrap] 归档迁移失败:', err);
  }
  try {
    await purgeExpiredTrash();
  } catch (err) {
    console.error('[bootstrap] 回收站清理失败:', err);
  }
}

/**
 * 登录成功时为该用户补齐 work/taoyuan 的 Ledger 元数据（老用户升级路径）。
 * 幂等，失败不阻断登录。
 */
export async function ensureUserSetup(userId: string): Promise<void> {
  try {
    await ensureLedgersForUser(userId);
  } catch (err) {
    console.error('[bootstrap] ensureLedgersForUser 失败:', err);
  }
}

/**
 * 兜底：万一某个用户的 Ledger 元数据还是缺的（比如是在本次升级之前登录、
 * 会话一直没过期的用户），首页渲染时补一次。用进程级集合去重，
 * 保证每个用户每次进程生命周期内最多跑一次，而不是每次渲染都跑。
 */
const ensuredUsers = new Set<string>();

export async function ensureUserSetupOnce(userId: string): Promise<void> {
  if (ensuredUsers.has(userId)) return;
  ensuredUsers.add(userId);
  await ensureUserSetup(userId);
}

/** 回收站维护的定期触发点 —— 由首页渲染顺带调用，内部有 1 小时节流 */
export async function maintenanceTick(): Promise<void> {
  try {
    await purgeExpiredTrash();
  } catch {
    /* 已在内部记日志 */
  }
}

export { prisma };
