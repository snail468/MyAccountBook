// 把 prisma/migrations 合成一份可以直接粘进 Turso 网页 SQL 控制台的脚本，
// 输出到 prisma/turso-setup.sql。
//
// 目的：让完全不碰命令行的人也能建库 —— 复制文件内容，粘到 Turso 面板的
// SQL 输入框里执行即可。
//
// 生成的脚本会同时写入 _prisma_migrations 记录（含与 Prisma 一致的
// SHA-256 校验和），所以之后用 `npm run turso:status` 或 Prisma 检查都能对上，
// 不会被当成"未应用的迁移"而重复执行。
//
// 改动过 prisma/migrations 之后要重新生成：
//   npm run turso:gen-sql

import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'prisma', 'migrations');
const OUT_FILE = join(process.cwd(), 'prisma', 'turso-setup.sql');

const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
const names = entries
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

if (names.length === 0) {
  console.error('✗ prisma/migrations 下没有迁移');
  process.exit(1);
}

const chunks = [];
chunks.push(`-- ============================================================
-- MyAccountBook · Turso 一次性建库脚本（自动生成，请勿手改）
--
-- 由 scripts/gen-turso-sql.mjs 从 prisma/migrations 生成。
-- 迁移目录有变动后请重新跑：npm run turso:gen-sql
--
-- 用法：把本文件全部内容复制，粘贴到 Turso 面板的 SQL 控制台执行。
--       只需在**全新的空库**上执行一次。
--
-- 包含的迁移（${names.length} 个）：
${names.map((n) => `--   ${n}`).join('\n')}
-- ============================================================

-- Prisma 的迁移记录表。有了它，以后用 npm run turso:status 或
-- prisma migrate status 检查时才不会认为这些迁移"尚未应用"。
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
);
`);

let index = 0;
for (const name of names) {
  const sql = await readFile(join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8');
  const checksum = createHash('sha256').update(sql).digest('hex');
  index += 1;

  chunks.push(`
-- ------------------------------------------------------------
-- 迁移 ${index}/${names.length}：${name}
-- ------------------------------------------------------------
${sql.trim()}

-- 登记这个迁移已应用
INSERT INTO "_prisma_migrations"
  ("id", "checksum", "migration_name", "started_at", "finished_at", "applied_steps_count")
VALUES
  ('${deterministicId(name)}', '${checksum}', '${name}', current_timestamp, current_timestamp, 1);
`);
}

chunks.push(`
-- ============================================================
-- 执行完毕。可以用下面这句确认表都建好了：
--   SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
-- 应该能看到 User / Entry / Event / EventAmount / Ledger /
-- GeneralEntry / TripMember / TripExpense / TripSplit / CurrencyRate
-- 以及 _prisma_migrations。
-- ============================================================
`);

/** 从迁移名派生一个稳定的 id，避免每次生成的文件都在 diff 里变动 */
function deterministicId(name) {
  const h = createHash('sha256').update(`mab:${name}`).digest('hex');
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    h.slice(12, 16),
    h.slice(16, 20),
    h.slice(20, 32),
  ].join('-');
}

await writeFile(OUT_FILE, chunks.join('\n'), 'utf8');
console.log(`✓ 已生成 ${OUT_FILE}（${names.length} 个迁移）`);
