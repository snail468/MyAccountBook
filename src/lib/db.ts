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
// 用 Function('return require')() 绕开 webpack 静态分析 ——
// 让 Docker 构建即便没装 @prisma/adapter-libsql / @libsql/client 也不会
// 产生 "Module not found" 警告；CF 构建时才真正 require 到。
function opaqueRequire(id: string): unknown {
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const req = Function('return require')() as NodeJS.Require;
    return req(id);
  } catch {
    return null;
  }
}

function createPrisma(): PrismaClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  if (tursoUrl) {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const adapterMod = opaqueRequire('@prisma/adapter-libsql') as any;
    const clientMod = opaqueRequire('@libsql/client') as any;
    if (adapterMod?.PrismaLibSQL && clientMod?.createClient) {
      try {
        const libsql = clientMod.createClient({
          url: tursoUrl,
          authToken: process.env.TURSO_AUTH_TOKEN,
        });
        const adapter = new adapterMod.PrismaLibSQL(libsql);
        return new PrismaClient({
          adapter,
          log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
        } as any);
      } catch (err) {
        console.error('[db] 初始化 libsql 适配器失败，回退本地 SQLite:', err);
      }
    } else {
      console.error(
        '[db] TURSO_DATABASE_URL 已设置但 @prisma/adapter-libsql / @libsql/client 未安装。' +
          '请先跑 npm run cf:setup。回退到本地 SQLite。',
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
