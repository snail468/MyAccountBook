import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
// 必须从 /web 导入，不能用默认入口：
//   * 默认入口在 Node 下解析到 lib-esm/node.js，它依赖原生的 libsql/index.node，
//     会被 Next 的 standalone 追踪进 Docker 产物
//   * /web 是纯 JS、基于 fetch 的实现，Workers 和 Node 都能跑
//   * 我们只在 TURSO_DATABASE_URL 存在时用它，那一定是远端 libsql:// 地址，
//     不需要 /web 不支持的 file: 能力
import { createClient } from '@libsql/client/web';

declare global {
  // dev 模式下 HMR 会反复求值模块，用 global 缓存实例避免连接数爆掉
  var prisma: PrismaClient | undefined;
  var __xydWalConfigured: boolean | undefined;
}

// —— 双模式 ——
//   Docker / 本地：TURSO_DATABASE_URL 未设 → 走 file:./data/app.db
//   Cloudflare / 远端 SQLite：TURSO_DATABASE_URL 设了 → 用 libsql 驱动适配器
//
// 这里曾经用 Function('return require')() 动态加载适配器，绕开 webpack 静态分析。
// 那个写法在 Cloudflare Workers 上是**坏的**：Workers 是 ESM 环境，没有 require，
// 取 require 会抛异常、被 catch 吞掉，于是静默回退成普通 PrismaClient，
// 接着 Prisma 去文件系统找原生查询引擎，报
//     prisma:error [unenv] fs.readdir is not implemented yet!
// 症状是任何需要查库的页面 500（首页因为未登录时不查库，反而看起来正常）。
// 现在改成静态 ESM 导入 —— 这两个包已在 devDependencies 里，不存在解析不到的问题。

function createPrisma(): PrismaClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL;

  if (tursoUrl) {
    const libsql = createClient({
      url: tursoUrl,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    const adapter = new PrismaLibSQL(libsql);
    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
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
