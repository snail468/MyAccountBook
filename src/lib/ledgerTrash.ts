import { prisma } from '@/lib/db';
import { cleanupCollectedImages, collectLedgerImageUrls } from '@/lib/imageCleanup';
import { createLogger, errorFields } from '@/lib/logger';

const log = createLogger('ledgerTrash');

// 幂等：把 archived=true 的 Ledger 一次性搬进回收站（deletedAt = updatedAt）
// 再顺手清理 deletedAt 早于 60 天的 —— 真正硬删（对 general/travel 会级联清数据）
let migratedArchived = false;
let lastCleanupAt = 0;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1h 内不重复扫
const RETENTION_MS = 60 * 24 * 60 * 60 * 1000; // 60 天

export async function migrateArchivedIfNeeded() {
  if (migratedArchived) return;
  migratedArchived = true;
  try {
    const rows = await prisma.ledger.findMany({
      where: { archived: true, deletedAt: null },
      select: { id: true, updatedAt: true },
    });
    if (rows.length === 0) return;
    await prisma.$transaction(
      rows.map((r) =>
        prisma.ledger.update({
          where: { id: r.id },
          data: { deletedAt: r.updatedAt },
        }),
      ),
    );
  } catch (err) {
    log.warn('归档账本迁入回收站失败', errorFields(err));
    migratedArchived = false;
  }
}

export async function purgeExpiredTrash() {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;
  try {
    const cutoff = new Date(now - RETENTION_MS);
    const expired = await prisma.ledger.findMany({
      where: { deletedAt: { lt: cutoff } },
      select: { id: true },
    });
    if (expired.length === 0) return;

    // 硬删会级联清掉条目，图片文件不会自己消失 —— 先把 URL 收集出来
    const urls: string[] = [];
    for (const l of expired) {
      urls.push(...(await collectLedgerImageUrls(l.id)));
    }

    await prisma.ledger.deleteMany({
      where: { id: { in: expired.map((l) => l.id) } },
    });

    await cleanupCollectedImages([...new Set(urls)]);
  } catch (err) {
    log.warn('回收站过期清理失败', errorFields(err));
  }
}
