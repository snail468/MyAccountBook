// 记账类回收站的共用常量与工具。
//
// 覆盖范围（"记账类"）：Entry / GeneralEntry / TripExpense / Event / EventAmount。
// TripMember / BankCard / RecurringRule 维持硬删 —— 前者是账本结构，
// 后两者是本身就该由用户明确管理的配置。
//
// 使用规范：
//   * 所有读查询都必须带 { deletedAt: null }。为了让 grep 能一次找齐，
//     统一从这里导入 NOT_DELETED，不要在业务代码里散写字面量。
//   * 例外场景（**不加过滤**）：
//       - lib/imageCleanup.ts 的引用计数 —— 软删记录仍持有图片，
//         漏算会把还在回收站的图误删
//       - lib/exportData.ts 的完整导出 —— 与账本级软删的既有行为一致
//       - lib/legacyMigrate.ts 的一次性旧列搬运 —— 旧列不区分软删
//       - lib/ledgerBootstrap.ts 的 count —— 判断"用户是否用过某种账本"，
//         软删记录也算"用过"
//   * 恢复路径（trash API）**必须**能查到软删记录 —— 那里不能加 NOT_DELETED。

/**
 * where 片段：`deletedAt IS NULL`。散写 `{ deletedAt: null }` 会让 grep 找不齐。
 * 用法：`prisma.entry.findMany({ where: { userId, ...NOT_DELETED } })`。
 */
export const NOT_DELETED = { deletedAt: null } as const;

/** 保留期 —— 与账本级 lib/ledgerTrash.ts 保持一致。 */
export const RETENTION_DAYS = 60;
export const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** 回收站里的五种记录类型。 */
export const TRASH_TYPES = ['entry', 'generalEntry', 'tripExpense', 'event', 'eventAmount'] as const;
export type TrashType = (typeof TRASH_TYPES)[number];

export function isTrashType(v: unknown): v is TrashType {
  return typeof v === 'string' && (TRASH_TYPES as readonly string[]).includes(v);
}

export const TRASH_TYPE_LABEL: Record<TrashType, string> = {
  entry: '工作账本 · 条目',
  generalEntry: '普通账本 · 记录',
  tripExpense: '旅游账本 · 支出',
  event: '桃源账本 · 活动',
  eventAmount: '桃源账本 · 金额',
};

/** 距离硬删还剩几天（向下取整，最少 0）。 */
export function daysLeft(deletedAt: Date, now = new Date()): number {
  const elapsed = now.getTime() - deletedAt.getTime();
  const remainingMs = RETENTION_MS - elapsed;
  if (remainingMs <= 0) return 0;
  return Math.floor(remainingMs / (24 * 60 * 60 * 1000));
}

/** 硬删阈值：早于此时间的软删记录应被永久清除。 */
export function cutoffFor(now = new Date()): Date {
  return new Date(now.getTime() - RETENTION_MS);
}
