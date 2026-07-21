import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __xydWalConfigured: boolean | undefined;
}

// —— 双模式 ——
//   Docker / 本地：TURSO_DATABASE_URL 未设 → 走 file:./data/app.db（保持不变）
//   Cloudflare / 远端 SQLite：TURSO_DATABASE_URL 设了 → 用 libsql 适配器
function createPrisma(): PrismaClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  if (tursoUrl) {
    // 动态导入 —— libsql 依赖只在 CF 部署时需要安装
    // 使用 require 保证不会被 Next.js 打包到主 bundle 里
    /* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */
    try {
      const { PrismaLibSQL } = require('@prisma/adapter-libsql');
      const { createClient } = require('@libsql/client');
      const libsql = createClient({
        url: tursoUrl,
        authToken: process.env.TURSO_AUTH_TOKEN,
      });
      const adapter = new PrismaLibSQL(libsql);
      return new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
      } as any);
    } catch (err) {
      console.error(
        '[db] TURSO_DATABASE_URL 已设置但未能加载 @prisma/adapter-libsql / @libsql/client。' +
          '请 npm i @prisma/adapter-libsql @libsql/client 后重试。回退到本地 SQLite。',
        err,
      );
    }
    /* eslint-enable */
  }
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma = global.prisma ?? createPrisma();

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

// 单次初始化：开 WAL + 设 busy timeout。让多人同时读写不互相锁死。
// Turso 是远端服务不需要 PRAGMA，跳过。
async function configureSqlite(client: PrismaClient) {
  if (global.__xydWalConfigured) return;
  if (process.env.TURSO_DATABASE_URL) {
    global.__xydWalConfigured = true;
    return;
  }
  try {
    await client.$executeRawUnsafe('PRAGMA journal_mode=WAL');
    await client.$executeRawUnsafe('PRAGMA busy_timeout=5000');
    await client.$executeRawUnsafe('PRAGMA synchronous=NORMAL');
    global.__xydWalConfigured = true;
  } catch (err) {
    console.warn('[db] configure sqlite failed:', err);
  }
}

void configureSqlite(prisma);
