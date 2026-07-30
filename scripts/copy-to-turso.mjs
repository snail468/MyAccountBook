// 把 Docker 部署的本地 SQLite 数据搬到 Turso（给 Cloudflare Worker 用）。
//
// 为什么不用 JSON 备份还原：
//   /api/export/json 刻意**不导出密码哈希**（备份文件落在用户手里，不该带哈希）。
//   用它还原的话所有人都得重设密码。而这里两边都是 SQLite 且 schema 同源，
//   直接逐表搬行最省事，密码哈希一并过去 —— 用户用原密码就能登录，
//   旧的 bcrypt 哈希会在首次登录时自动升级成 PBKDF2（见 lib/auth.ts）。
//
// 关键细节：源库可能比目标库旧。
//   Docker 上跑的老版本 User 表没有 sessionVersion / failedLoginCount /
//   lockedUntil 这三列。所以按**两边列的交集**搬，缺的列交给目标库的默认值。
//
// 用法（PowerShell）：
//   $env:SOURCE_DB           = "C:/path/to/app.db"     # 从服务器拷回来的文件
//   $env:TURSO_DATABASE_URL  = "libsql://xxx.turso.io"
//   $env:TURSO_AUTH_TOKEN    = "eyJhbGc..."
//   node scripts/copy-to-turso.mjs --dry-run   # 先看会搬多少行，不写入
//   node scripts/copy-to-turso.mjs             # 真正搬
//   node scripts/copy-to-turso.mjs --force     # 目标库已有数据时仍追加

import { createClient } from '@libsql/client';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const FORCE = args.has('--force');

function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

const sourcePath = process.env.SOURCE_DB;
const targetUrl = process.env.TURSO_DATABASE_URL;
const targetToken = process.env.TURSO_AUTH_TOKEN;

if (!sourcePath) fail('缺少 SOURCE_DB —— 指向从服务器拷回来的 app.db 文件');
if (!targetUrl) fail('缺少 TURSO_DATABASE_URL');

// 外键依赖顺序：被引用的表先搬
const TABLES = [
  'User',
  'Ledger',
  'Entry',
  'Event',
  'EventAmount',
  'GeneralEntry',
  'TripMember',
  'TripExpense',
  'TripSplit',
  'CurrencyRate',
];

const BATCH_SIZE = 100;

async function columnsOf(client, table) {
  const r = await client.execute(`SELECT name FROM pragma_table_info('${table}')`);
  return r.rows.map((x) => String(x.name));
}

async function countOf(client, table) {
  try {
    const r = await client.execute(`SELECT COUNT(*) AS n FROM "${table}"`);
    return Number(r.rows[0].n);
  } catch {
    return -1; // 表不存在
  }
}

const source = createClient({
  url: sourcePath.startsWith('file:') ? sourcePath : `file:${sourcePath.replace(/\\/g, '/')}`,
});
const target = createClient({ url: targetUrl, authToken: targetToken });

try {
  console.log(`\n源  ：${sourcePath}`);
  console.log(`目标：${targetUrl}\n`);

  // 目标库必须已经建好表（用 prisma/turso-setup.sql 或 npm run turso:migrate）
  const targetUsers = await countOf(target, 'User');
  if (targetUsers < 0) {
    fail(
      '目标库里没有 User 表。先建表：把 prisma/turso-setup.sql 粘进 Turso 面板的 SQL 控制台执行。',
    );
  }
  if (targetUsers > 0 && !FORCE && !DRY_RUN) {
    fail(
      `目标库已有 ${targetUsers} 个用户。搬数据前请先清空，或加 --force 追加\n` +
        '  （追加时如果 id 撞车会失败，因为主键唯一）',
    );
  }

  const plan = [];
  let grandTotal = 0;

  for (const table of TABLES) {
    const srcCount = await countOf(source, table);
    if (srcCount < 0) {
      console.log(`  ${table.padEnd(14)} 源库里没有这张表，跳过`);
      continue;
    }
    if (srcCount === 0) {
      console.log(`  ${table.padEnd(14)} 0 行，跳过`);
      continue;
    }

    const srcCols = await columnsOf(source, table);
    const tgtCols = await columnsOf(target, table);
    const shared = srcCols.filter((c) => tgtCols.includes(c));
    const onlyTarget = tgtCols.filter((c) => !srcCols.includes(c));

    if (shared.length === 0) fail(`${table}：源库与目标库没有共同列`);

    plan.push({ table, srcCount, shared });
    grandTotal += srcCount;

    let note = '';
    if (onlyTarget.length > 0) {
      // 老版本源库缺列很正常，目标库的默认值会补上
      note = `（目标库多出的列用默认值：${onlyTarget.join(', ')}）`;
    }
    console.log(`  ${table.padEnd(14)} ${String(srcCount).padStart(6)} 行  ${note}`);
  }

  console.log(`\n合计 ${grandTotal} 行`);

  if (DRY_RUN) {
    console.log('\n[dry-run] 没有写入任何数据。去掉 --dry-run 即真正执行。\n');
    process.exit(0);
  }
  if (grandTotal === 0) {
    console.log('\n源库是空的，无事可做。\n');
    process.exit(0);
  }

  console.log('\n开始搬运…\n');

  for (const { table, shared } of plan) {
    // Event 自引用 parentId：先全部按 parentId=NULL 插入，最后统一回填，
    // 免得因为父活动还没插入而触发外键错误
    const isEvent = table === 'Event';
    const insertCols = isEvent ? shared.filter((c) => c !== 'parentId') : shared;

    const quoted = insertCols.map((c) => `"${c}"`).join(', ');
    const placeholders = insertCols.map(() => '?').join(', ');
    const insertSql = `INSERT INTO "${table}" (${quoted}) VALUES (${placeholders})`;

    const rows = await source.execute(
      `SELECT ${shared.map((c) => `"${c}"`).join(', ')} FROM "${table}"`,
    );

    let done = 0;
    for (let i = 0; i < rows.rows.length; i += BATCH_SIZE) {
      const chunk = rows.rows.slice(i, i + BATCH_SIZE);
      await target.batch(
        chunk.map((row) => ({
          sql: insertSql,
          // 原样传值，不做任何转换 —— 两边都是 SQLite，表示形式一致
          args: insertCols.map((c) => row[c] ?? null),
        })),
        'write',
      );
      done += chunk.length;
      process.stdout.write(`\r  ${table.padEnd(14)} ${done}/${rows.rows.length}`);
    }
    console.log(`\r  ${table.padEnd(14)} ${done}/${rows.rows.length}  ok`);

    // 回填 Event.parentId
    if (isEvent && shared.includes('parentId')) {
      const withParent = rows.rows.filter((r) => r.parentId != null);
      if (withParent.length > 0) {
        for (let i = 0; i < withParent.length; i += BATCH_SIZE) {
          const chunk = withParent.slice(i, i + BATCH_SIZE);
          await target.batch(
            chunk.map((row) => ({
              sql: 'UPDATE "Event" SET "parentId" = ? WHERE "id" = ?',
              args: [row.parentId, row.id],
            })),
            'write',
          );
        }
        console.log(`  ${''.padEnd(14)} 回填 ${withParent.length} 条合并关系  ok`);
      }
    }
  }

  console.log('\n核对行数：\n');
  let mismatch = false;
  for (const table of TABLES) {
    const s = await countOf(source, table);
    if (s < 0) continue;
    const t = await countOf(target, table);
    const ok = s === t;
    if (!ok) mismatch = true;
    console.log(`  ${table.padEnd(14)} 源 ${String(s).padStart(6)}  目标 ${String(t).padStart(6)}  ${ok ? '✓' : '✗ 不一致'}`);
  }

  if (mismatch) {
    console.error('\n✗ 有表的行数不一致，请检查上面的输出。\n');
    process.exit(1);
  }

  console.log('\n✓ 迁移完成。用户可以用原来的密码登录。\n');
  console.log('提醒：图片文件不在数据库里。Docker 上的 data/uploads/ 需要单独上传到 R2，');
  console.log('      否则历史记录里的图片会显示不出来（其它数据不受影响）。\n');
} finally {
  source.close();
  target.close();
}
