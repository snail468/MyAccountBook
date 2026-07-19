import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __xydWalConfigured: boolean | undefined;
}

function createPrisma() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma = global.prisma ?? createPrisma();

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

// 单次初始化：开 WAL + 设 busy timeout。让多人同时读写不互相锁死。
async function configureSqlite(client: PrismaClient) {
  if (global.__xydWalConfigured) return;
  try {
    // WAL：读写可并发（读不阻塞写、写不阻塞读）
    await client.$executeRawUnsafe('PRAGMA journal_mode=WAL');
    // 遇到锁最多等 5 秒再报错，避免瞬时冲突直接失败
    await client.$executeRawUnsafe('PRAGMA busy_timeout=5000');
    // 完全同步太慢，NORMAL 在 WAL 下已经很安全
    await client.$executeRawUnsafe('PRAGMA synchronous=NORMAL');
    global.__xydWalConfigured = true;
  } catch (err) {
    console.warn('[db] configure sqlite failed:', err);
  }
}

// 首次导入 db 时就跑一次
void configureSqlite(prisma);
