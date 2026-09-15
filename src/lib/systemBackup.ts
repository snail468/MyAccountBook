import { join, dirname, relative } from 'node:path';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { prisma } from '@/lib/db';
import { getBeijingParts } from '@/lib/datetime';
import { createLogger, errorFields } from '@/lib/logger';

const log = createLogger('systemBackup');

export type BackupSummary = {
  userCount: number;
  ledgerCount: number;
  entryCount: number;
  eventCount: number;
  cardCount: number;
  loanOrderCount: number;
  fileCount: number;
  totalSizeBytes?: number;
};

export type FullBackupPayload = {
  format: 'MY_ACCOUNT_BOOK_FULL_SYSTEM_BACKUP';
  version: number;
  exportedAt: string;
  database: Record<string, any[]>;
  files: Array<{ path: string; dataBase64: string }>;
  summary: BackupSummary;
};

function getUploadRoot(): string {
  return process.env.UPLOAD_ROOT || join(process.cwd(), 'data', 'uploads');
}

/** 递归收集指定目录下的所有文件相对路径 */
async function collectFilesRecursive(dir: string, baseDir: string): Promise<string[]> {
  const result: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        const sub = await collectFilesRecursive(full, baseDir);
        result.push(...sub);
      } else if (ent.isFile()) {
        result.push(relative(baseDir, full).replace(/\\/g, '/'));
      }
    }
  } catch {
    // 目录可能不存在，直接返回空
  }
  return result;
}

/** 生成标准备份包文件名（采用北京时间 UTC+8 时间戳） */
export function generateBackupFilename(date: Date = new Date()): string {
  const p = getBeijingParts(date);
  const y = p ? p.year : date.getFullYear();
  const m = String(p ? p.month : date.getMonth() + 1).padStart(2, '0');
  const d = String(p ? p.day : date.getDate()).padStart(2, '0');
  const hh = String(p ? p.hour : date.getHours()).padStart(2, '0');
  const mm = String(p ? p.minute : date.getMinutes()).padStart(2, '0');
  const ss = String(p ? p.second : date.getSeconds()).padStart(2, '0');

  return `MyAccountBook_backup_${y}${m}${d}_${hh}${mm}${ss}.json.gz`;
}

/** 递归恢复 Date 类型对象 */
function reviveDates(row: any): any {
  if (!row || typeof row !== 'object') return row;
  const copy: any = { ...row };
  for (const k of Object.keys(copy)) {
    const v = copy[k];
    if (v && typeof v === 'string' && (k.endsWith('At') || k.endsWith('Date') || k.endsWith('Until'))) {
      const parsed = new Date(v);
      if (!isNaN(parsed.getTime())) {
        copy[k] = parsed;
      }
    }
  }
  return copy;
}

/** 分块执行 createMany 避免 SQLite 参数数量限制 */
async function chunkedCreateMany(
  delegate: { createMany: (args: { data: any[] }) => Promise<any> },
  rows: any[],
  chunkSize: number = 80
): Promise<void> {
  if (!rows || rows.length === 0) return;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize).map(reviveDates);
    await delegate.createMany({ data: chunk });
  }
}

/**
 * 创建全系统全量备份
 * 导出全部用户的全部数据（19张数据库表）及 data/uploads 下的全部附件
 */
export async function createFullSystemBackup(): Promise<{
  filename: string;
  buffer: Buffer;
  summary: BackupSummary;
}> {
  log.info('开始创建全系统全量备份...');

  // 1. 并发查询所有 19 张业务与配置表
  const [
    users,
    ledgers,
    ledgerMembers,
    ledgerInvites,
    entries,
    events,
    eventAmounts,
    generalEntries,
    tripMembers,
    tripExpenses,
    tripSplits,
    currencyRates,
    bankCards,
    recurringRules,
    brokers,
    cardStaffs,
    loanOrders,
    loanOrderLogs,
    loanOrderAttachments,
    systemSettings,
  ] = await Promise.all([
    prisma.user.findMany(),
    prisma.ledger.findMany(),
    prisma.ledgerMember.findMany(),
    prisma.ledgerInvite.findMany(),
    prisma.entry.findMany(),
    prisma.event.findMany(),
    prisma.eventAmount.findMany(),
    prisma.generalEntry.findMany(),
    prisma.tripMember.findMany(),
    prisma.tripExpense.findMany(),
    prisma.tripSplit.findMany(),
    prisma.currencyRate.findMany(),
    prisma.bankCard.findMany(),
    prisma.recurringRule.findMany(),
    prisma.broker.findMany(),
    prisma.cardStaff.findMany(),
    prisma.loanOrder.findMany(),
    prisma.loanOrderLog.findMany(),
    prisma.loanOrderAttachment.findMany(),
    prisma.systemSetting.findMany(),
  ]);

  // 2. 收集 data/uploads 本地附件
  const uploadRoot = getUploadRoot();
  const fileRelPaths = await collectFilesRecursive(uploadRoot, uploadRoot);
  const files: Array<{ path: string; dataBase64: string }> = [];

  for (const relPath of fileRelPaths) {
    try {
      const fullPath = join(uploadRoot, relPath);
      const content = await readFile(fullPath);
      files.push({
        path: relPath,
        dataBase64: content.toString('base64'),
      });
    } catch (err) {
      log.warn(`备份附件读取失败，已跳过: ${relPath}`, errorFields(err));
    }
  }

  const summary: BackupSummary = {
    userCount: users.length,
    ledgerCount: ledgers.length,
    entryCount: entries.length,
    eventCount: events.length,
    cardCount: bankCards.length,
    loanOrderCount: loanOrders.length,
    fileCount: files.length,
  };

  const payload: FullBackupPayload = {
    format: 'MY_ACCOUNT_BOOK_FULL_SYSTEM_BACKUP',
    version: 1,
    exportedAt: new Date().toISOString(),
    database: {
      users,
      ledgers,
      ledgerMembers,
      ledgerInvites,
      entries,
      events,
      eventAmounts,
      generalEntries,
      tripMembers,
      tripExpenses,
      tripSplits,
      currencyRates,
      bankCards,
      recurringRules,
      brokers,
      cardStaffs,
      loanOrders,
      loanOrderLogs,
      loanOrderAttachments,
      systemSettings,
    },
    files,
    summary,
  };

  const jsonStr = JSON.stringify(payload);
  const uncompressedBuf = Buffer.from(jsonStr, 'utf-8');
  const compressedBuf = gzipSync(uncompressedBuf, { level: 6 });
  const filename = generateBackupFilename();

  summary.totalSizeBytes = compressedBuf.length;
  log.info(`全系统备份打包完成: ${filename}, 大小: ${compressedBuf.length} 字节`);

  return {
    filename,
    buffer: compressedBuf,
    summary,
  };
}

/**
 * 从备份归档恢复全系统数据
 * 事务内安全替换全表数据并还原附件
 */
export async function restoreFullSystemBackup(gzippedBuffer: Buffer): Promise<{
  ok: boolean;
  summary: BackupSummary;
  restoredAt: string;
}> {
  log.info('开始解压与校验全系统备份数据...');

  let jsonStr: string;
  try {
    const uncompressed = gunzipSync(gzippedBuffer);
    jsonStr = uncompressed.toString('utf-8');
  } catch (err: any) {
    throw new Error(`备份解压失败：无效的 Gzip 归档文件 (${err.message})`);
  }

  let payload: FullBackupPayload;
  try {
    payload = JSON.parse(jsonStr);
  } catch (err: any) {
    throw new Error(`备份解析失败：无效的 JSON 格式 (${err.message})`);
  }

  if (payload.format !== 'MY_ACCOUNT_BOOK_FULL_SYSTEM_BACKUP') {
    throw new Error('无效的备份文件：格式标识不匹配，请确保是由本系统生成的全量备份');
  }

  const db = payload.database;
  if (!db) {
    throw new Error('备份文件内容损坏：缺少数据库表集合');
  }

  log.info('备份校验通过，开始在数据库事务中恢复数据...');

  // 在单事务中安全替换全部数据
  await prisma.$transaction(
    async (tx) => {
      // 临时关闭外键约束以支持平滑批量清空与恢复
      await tx.$executeRawUnsafe('PRAGMA foreign_keys = OFF;');

      // 1. 清空所有 19 张表
      await tx.loanOrderAttachment.deleteMany();
      await tx.loanOrderLog.deleteMany();
      await tx.loanOrder.deleteMany();
      await tx.cardStaff.deleteMany();
      await tx.broker.deleteMany();
      await tx.recurringRule.deleteMany();
      await tx.bankCard.deleteMany();
      await tx.currencyRate.deleteMany();
      await tx.tripSplit.deleteMany();
      await tx.tripExpense.deleteMany();
      await tx.tripMember.deleteMany();
      await tx.generalEntry.deleteMany();
      await tx.eventAmount.deleteMany();
      await tx.event.deleteMany();
      await tx.entry.deleteMany();
      await tx.ledgerInvite.deleteMany();
      await tx.ledgerMember.deleteMany();
      await tx.ledger.deleteMany();
      await tx.user.deleteMany();
      // 注意：保留当次活跃的 systemSetting，避免覆盖当前的 webdav_config；如果备份包里有别的配置则并入
      if (db.systemSettings) {
        for (const s of db.systemSettings) {
          if (s.key !== 'webdav_config') {
            await tx.systemSetting.upsert({
              where: { key: s.key },
              create: reviveDates(s),
              update: reviveDates(s),
            });
          }
        }
      }

      // 2. 依次批量插入恢复数据
      if (db.users) await chunkedCreateMany(tx.user, db.users);
      if (db.ledgers) await chunkedCreateMany(tx.ledger, db.ledgers);
      if (db.ledgerMembers) await chunkedCreateMany(tx.ledgerMember, db.ledgerMembers);
      if (db.ledgerInvites) await chunkedCreateMany(tx.ledgerInvite, db.ledgerInvites);
      if (db.entries) await chunkedCreateMany(tx.entry, db.entries);
      if (db.events) await chunkedCreateMany(tx.event, db.events);
      if (db.eventAmounts) await chunkedCreateMany(tx.eventAmount, db.eventAmounts);
      if (db.generalEntries) await chunkedCreateMany(tx.generalEntry, db.generalEntries);
      if (db.tripMembers) await chunkedCreateMany(tx.tripMember, db.tripMembers);
      if (db.tripExpenses) await chunkedCreateMany(tx.tripExpense, db.tripExpenses);
      if (db.tripSplits) await chunkedCreateMany(tx.tripSplit, db.tripSplits);
      if (db.currencyRates) await chunkedCreateMany(tx.currencyRate, db.currencyRates);
      if (db.bankCards) await chunkedCreateMany(tx.bankCard, db.bankCards);
      if (db.recurringRules) await chunkedCreateMany(tx.recurringRule, db.recurringRules);
      if (db.brokers) await chunkedCreateMany(tx.broker, db.brokers);
      if (db.cardStaffs) await chunkedCreateMany(tx.cardStaff, db.cardStaffs);
      if (db.loanOrders) await chunkedCreateMany(tx.loanOrder, db.loanOrders);
      if (db.loanOrderLogs) await chunkedCreateMany(tx.loanOrderLog, db.loanOrderLogs);
      if (db.loanOrderAttachments) await chunkedCreateMany(tx.loanOrderAttachment, db.loanOrderAttachments);

      // 恢复外键约束
      await tx.$executeRawUnsafe('PRAGMA foreign_keys = ON;');
    },
    {
      maxWait: 20000,
      timeout: 60000,
    }
  );

  // 3. 恢复本地文件附件
  const uploadRoot = getUploadRoot();
  if (Array.isArray(payload.files)) {
    for (const f of payload.files) {
      try {
        if (!f.path || !f.dataBase64) continue;
        const full = join(uploadRoot, f.path);
        await mkdir(dirname(full), { recursive: true });
        await writeFile(full, Buffer.from(f.dataBase64, 'base64'));
      } catch (fErr) {
        log.warn(`恢复文件写入异常: ${f.path}`, errorFields(fErr));
      }
    }
  }

  log.info('全系统数据与附件已成功还原！');

  return {
    ok: true,
    summary: payload.summary,
    restoredAt: new Date().toISOString(),
  };
}
