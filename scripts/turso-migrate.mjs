// 把 prisma/migrations 应用到 Turso（远端 SQLite）。
//
// 为什么需要这个脚本：
//   `prisma migrate deploy` 不认 libsql:// 协议，会直接报
//     P1012 the URL must start with the protocol `file:`
//   driver adapter 只在**运行时**生效，Prisma CLI 走的是另一条路。
//   官方做法是用 `turso db shell` 灌 SQL，但 turso CLI 在 Windows 上要 WSL。
//   这个脚本用 @libsql/client 做同样的事，跨平台、无额外依赖。
//
// 它维护的 _prisma_migrations 表与 Prisma 自己的结构一致（含 SHA-256 校验和），
// 所以记录是可互认的 —— 以后若改用官方工具链也不会冲突。
//
// 用法（PowerShell）：
//   $env:TURSO_DATABASE_URL = "libsql://xxx.turso.io"
//   $env:TURSO_AUTH_TOKEN   = "eyJhbGc..."
//   node scripts/turso-migrate.mjs            # 应用未执行的迁移
//   node scripts/turso-migrate.mjs --status   # 只看状态，不改动
//   node scripts/turso-migrate.mjs --baseline # 只登记不执行（表已存在的老库）

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@libsql/client';

const MIGRATIONS_DIR = join(process.cwd(), 'prisma', 'migrations');

const args = new Set(process.argv.slice(2));
const STATUS_ONLY = args.has('--status');
const BASELINE = args.has('--baseline');

function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url) fail('缺少 TURSO_DATABASE_URL 环境变量');
// file: 是给本地自测用的（libsql 客户端同样支持），远端一律 libsql://
const isLocalFile = url.startsWith('file:');
if (!isLocalFile && !url.startsWith('libsql://') && !url.startsWith('https://')) {
  fail(`TURSO_DATABASE_URL 应以 libsql:// 开头，当前是：${url}`);
}
if (!isLocalFile && !authToken) fail('缺少 TURSO_AUTH_TOKEN 环境变量');

// Prisma 的 _prisma_migrations 结构，保持一致以便互认
const CREATE_TRACKING_TABLE = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
)`;

async function loadLocalMigrations() {
  let entries;
  try {
    entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  } catch {
    fail(`找不到迁移目录：${MIGRATIONS_DIR}`);
  }
  const dirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    // 迁移目录名以时间戳开头，字典序即执行序
    .sort();

  const out = [];
  for (const name of dirs) {
    const file = join(MIGRATIONS_DIR, name, 'migration.sql');
    let sql;
    try {
      sql = await readFile(file, 'utf8');
    } catch {
      console.warn(`  ! 跳过 ${name}：没有 migration.sql`);
      continue;
    }
    out.push({
      name,
      sql,
      checksum: createHash('sha256').update(sql).digest('hex'),
    });
  }
  if (out.length === 0) fail('迁移目录里没有任何迁移');
  return out;
}

const client = createClient({ url, authToken });

try {
  const local = await loadLocalMigrations();
  await client.execute(CREATE_TRACKING_TABLE);

  const applied = await client.execute(
    'SELECT migration_name, checksum, finished_at FROM "_prisma_migrations" ORDER BY started_at',
  );
  const appliedMap = new Map(applied.rows.map((r) => [String(r.migration_name), r]));

  console.log(`\n数据库：${url}`);
  console.log(`本地迁移：${local.length} 个，已应用：${appliedMap.size} 个\n`);

  let drift = false;
  for (const m of local) {
    const rec = appliedMap.get(m.name);
    if (!rec) {
      console.log(`  待应用   ${m.name}`);
    } else if (String(rec.checksum) !== m.checksum) {
      console.log(`  ⚠ 校验和不符 ${m.name}`);
      console.log(`      远端 ${String(rec.checksum).slice(0, 16)}… / 本地 ${m.checksum.slice(0, 16)}…`);
      drift = true;
    } else {
      console.log(`  已应用   ${m.name}`);
    }
  }

  const pending = local.filter((m) => !appliedMap.has(m.name));

  if (drift) {
    console.error(
      '\n✗ 有迁移文件在应用之后被改过。这意味着远端表结构与仓库里的 SQL 不再对应，\n' +
        '  自动应用会产出无法预期的结果。请人工核对后再处理。\n',
    );
    process.exit(1);
  }

  if (STATUS_ONLY) {
    console.log(
      pending.length === 0 ? '\n✓ 数据库已是最新\n' : `\n还有 ${pending.length} 个迁移待应用\n`,
    );
    process.exit(0);
  }

  if (pending.length === 0) {
    console.log('\n✓ 无需操作，数据库已是最新\n');
    process.exit(0);
  }

  if (BASELINE) {
    console.log(`\n[baseline] 只登记不执行 —— 假定这些表在库里已经存在\n`);
  }

  for (const m of pending) {
    process.stdout.write(`  ${BASELINE ? '登记' : '应用'} ${m.name} … `);
    const startedAt = new Date().toISOString();
    try {
      if (!BASELINE) {
        // executeMultiple 让 libsql 自己处理多语句，
        // 免得我们用朴素的 ';' 切分踩到字符串字面量里的分号
        await client.executeMultiple(m.sql);
      }
      await client.execute({
        sql: `INSERT INTO "_prisma_migrations"
                (id, checksum, migration_name, started_at, finished_at, applied_steps_count, logs)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          crypto.randomUUID(),
          m.checksum,
          m.name,
          startedAt,
          new Date().toISOString(),
          BASELINE ? 0 : 1,
          BASELINE ? 'baselined by scripts/turso-migrate.mjs' : null,
        ],
      });
      console.log('ok');
    } catch (err) {
      console.log('失败');
      const msg = err?.message ?? String(err);
      console.error(`\n✗ ${m.name} 执行失败：\n  ${msg}\n`);
      if (/already exists/i.test(msg)) {
        console.error(
          '  看起来这些表已经存在（大概是 v1 时期用 db push 建的库）。\n' +
            '  用 --baseline 只登记不执行：\n' +
            '      node scripts/turso-migrate.mjs --baseline\n',
        );
      }
      process.exit(1);
    }
  }

  console.log(`\n✓ 完成，共处理 ${pending.length} 个迁移\n`);
} finally {
  client.close();
}
