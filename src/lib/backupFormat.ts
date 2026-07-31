// 备份格式的元信息。**刻意不 import prisma** ——
// 导出端（exportData.ts）和导入端（importData.ts）都要用这两个常量，
// 而导入端的纯函数是进单测的；如果常量放在 exportData.ts 里，
// 单测就会顺着 import 把 PrismaClient 拉起来去连数据库（vitest.config.ts 里
// 说明了纯函数测试不该碰运行时依赖）。

/** 备份格式版本。导入端据此判断兼容性；结构不兼容时 +1。 */
export const BACKUP_VERSION = 1;

/** 备份包含的表清单 —— 加新表时同步登记 */
export const BACKUP_TABLES = [
  'ledgers',
  'entries',
  'events',
  'generalEntries',
  'tripMembers',
  'tripExpenses',
] as const;
