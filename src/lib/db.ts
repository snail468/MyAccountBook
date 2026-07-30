import { PrismaClient } from '@prisma/client';

declare global {
  // dev 模式下 HMR 会反复求值模块，用 global 缓存实例避免连接数爆掉
  var prisma: PrismaClient | undefined;
  var __xydWalConfigured: boolean | undefined;
}

// 单一数据源：本地 SQLite 文件，路径由 DATABASE_URL 指定。
//   本地开发：file:./data/app.db（注意 Prisma 对相对路径是**相对 prisma/ 目录**
//             解析的，实际落在 prisma/data/app.db）
//   Docker  ：file:/data/app.db（绝对路径，挂载卷）
//
// 曾经这里有一套「TURSO_DATABASE_URL 存在则切到 libsql 驱动适配器」的双模式，
// 用于 Cloudflare Workers 部署。已整体移除 —— Prisma 5.x 的 @prisma/client
// 在 workerd 条件下解析到带 Rust 引擎的入口，实例化时就探测文件系统找引擎
// 二进制，报 "[unenv] fs.readdir is not implemented yet!"，且无法通过
// bundler 配置绕开（Next 把 @prisma/client 列为 server external package）。
// 详见 PROGRESS.md。
export const prisma =
  global.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

// 单次初始化：开 WAL + 设 busy timeout。让多人同时读写不互相锁死。
async function configureSqlite(client: PrismaClient) {
  if (global.__xydWalConfigured) return;
  try {
    // 必须用 $queryRawUnsafe 而不是 $executeRawUnsafe：
    // PRAGMA journal_mode=WAL 会返回一行结果（新的 journal 模式名），
    // 而 $executeRawUnsafe 在 SQLite 上遇到返回值会直接报
    // "Execute returned results, which is not allowed in SQLite"。
    // 这个错以前被 catch 吞掉只打了条 warn —— 结果 WAL 其实一直没开成。
    await client.$queryRawUnsafe('PRAGMA journal_mode=WAL');
    await client.$queryRawUnsafe('PRAGMA busy_timeout=5000');
    await client.$queryRawUnsafe('PRAGMA synchronous=NORMAL');
    global.__xydWalConfigured = true;
  } catch (err) {
    console.warn('[db] configure sqlite failed:', err);
  }
}

void configureSqlite(prisma);
