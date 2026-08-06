// 记账类回收站的服务端逻辑：列出、恢复、彻底删除、过期清理。
//
// 与账本级 lib/ledgerTrash.ts 的区别：
//   * 账本级软删是原来就有的，只覆盖 Ledger 一张表
//   * 这里覆盖 Entry / GeneralEntry / TripExpense / Event / EventAmount 五张表
//   * 归属校验统一走 ledger.members —— B7 Phase 2 之后 Entry/Event 都
//     ledger-scoped。回收站里只有 role >= editor 的成员能恢复/彻底删。
//
// 常量与用户面向的过滤在 lib/softDelete.ts；这里只承担"操作数据库"的部分。

import { prisma } from '@/lib/db';
import { parseImageUrls, cleanupCollectedImages } from '@/lib/imageCleanup';
import { deleteUploadUrls, keyFromUploadUrl } from '@/lib/storage';
import { createLogger, errorFields } from '@/lib/logger';
import { type TrashType, cutoffFor, daysLeft } from '@/lib/softDelete';

const log = createLogger('recordTrash');

/** 一条回收站条目（列表展示用） */
export type TrashRecord = {
  type: TrashType;
  id: string;
  label: string; // 显示用的标题
  amountCents: number | null; // 金额（分）；非金额或不适用时 null
  deletedAt: string; // ISO
  daysLeft: number;
  context: string | null; // 所属账本 / 活动名，方便识别
};

// ============ 列表 ============

export async function listTrash(userId: string): Promise<TrashRecord[]> {
  const now = new Date();
  // Phase 2：五张表统一按 "ledger 上有当前 user 成员身份" 过滤 —— 与写路径口径一致。
  const memberLedger = { members: { some: { userId } } };
  const [entries, generals, trips, events, amounts] = await Promise.all([
    prisma.entry.findMany({
      where: { deletedAt: { not: null }, ledger: memberLedger },
      select: {
        id: true,
        category: true,
        amountCents: true,
        yearMonth: true,
        deletedAt: true,
        ledger: { select: { name: true } },
      },
      orderBy: { deletedAt: 'desc' },
    }),
    prisma.generalEntry.findMany({
      where: { deletedAt: { not: null }, ledger: memberLedger },
      select: {
        id: true,
        category: true,
        amountCents: true,
        deletedAt: true,
        ledger: { select: { name: true } },
      },
      orderBy: { deletedAt: 'desc' },
    }),
    prisma.tripExpense.findMany({
      where: { deletedAt: { not: null }, ledger: memberLedger },
      select: {
        id: true,
        title: true,
        amountBaseCents: true,
        deletedAt: true,
        ledger: { select: { name: true } },
      },
      orderBy: { deletedAt: 'desc' },
    }),
    prisma.event.findMany({
      where: { deletedAt: { not: null }, ledger: memberLedger },
      select: {
        id: true,
        title: true,
        deletedAt: true,
        ledger: { select: { name: true } },
      },
      orderBy: { deletedAt: 'desc' },
    }),
    prisma.eventAmount.findMany({
      where: { deletedAt: { not: null }, event: { ledger: memberLedger } },
      select: {
        id: true,
        stage: true,
        cents: true,
        quantity: true,
        itemDesc: true,
        deletedAt: true,
        event: { select: { title: true } },
      },
      orderBy: { deletedAt: 'desc' },
    }),
  ]);

  const rows: TrashRecord[] = [
    ...entries.map((e) => ({
      type: 'entry' as const,
      id: e.id,
      label: e.category,
      amountCents: e.amountCents,
      deletedAt: e.deletedAt!.toISOString(),
      daysLeft: daysLeft(e.deletedAt!, now),
      context: `${e.ledger.name} · ${e.yearMonth}`,
    })),
    ...generals.map((g) => ({
      type: 'generalEntry' as const,
      id: g.id,
      label: g.category,
      amountCents: g.amountCents,
      deletedAt: g.deletedAt!.toISOString(),
      daysLeft: daysLeft(g.deletedAt!, now),
      context: g.ledger.name,
    })),
    ...trips.map((t) => ({
      type: 'tripExpense' as const,
      id: t.id,
      label: t.title,
      amountCents: t.amountBaseCents,
      deletedAt: t.deletedAt!.toISOString(),
      daysLeft: daysLeft(t.deletedAt!, now),
      context: t.ledger.name,
    })),
    ...events.map((ev) => ({
      type: 'event' as const,
      id: ev.id,
      label: ev.title,
      amountCents: null,
      deletedAt: ev.deletedAt!.toISOString(),
      daysLeft: daysLeft(ev.deletedAt!, now),
      context: ev.ledger.name,
    })),
    ...amounts.map((a) => {
      const desc =
        a.itemDesc ??
        (a.quantity !== null ? `${a.quantity} 个` : null);
      return {
        type: 'eventAmount' as const,
        id: a.id,
        label: `${stageLabel(a.stage)}${desc ? ` · ${desc}` : ''}`,
        amountCents: a.cents > 0 ? a.cents : null,
        deletedAt: a.deletedAt!.toISOString(),
        daysLeft: daysLeft(a.deletedAt!, now),
        context: a.event.title,
      };
    }),
  ];

  rows.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  return rows;
}

function stageLabel(s: string) {
  return s === 'predicted' ? '预测' : s === 'announced' ? '公示' : s === 'paid' ? '到账' : s;
}

// ============ 归属校验 ============

/**
 * 确认某条软删记录属于该用户。返回 true 才能恢复/彻底删。
 * 未软删的记录也返回 false —— 恢复/彻底删只对回收站里的东西有意义。
 */
export async function isOwnedTrash(
  userId: string,
  type: TrashType,
  id: string,
): Promise<boolean> {
  // 五张表的归属统一走 ledger.members —— editor+ 才有权恢复/彻底删。
  // 列表页 (listTrash) 允许 viewer 也看：能看但不能改。
  switch (type) {
    case 'entry': {
      const r = await prisma.entry.findUnique({
        where: { id },
        select: { deletedAt: true, ledger: { select: { members: { where: { userId, role: { in: ['owner', 'editor'] } }, select: { role: true }, take: 1 } } } },
      });
      return !!r && r.deletedAt !== null && r.ledger.members.length > 0;
    }
    case 'generalEntry': {
      const r = await prisma.generalEntry.findUnique({
        where: { id },
        select: { deletedAt: true, ledger: { select: { members: { where: { userId, role: { in: ['owner', 'editor'] } }, select: { role: true }, take: 1 } } } },
      });
      return !!r && r.deletedAt !== null && r.ledger.members.length > 0;
    }
    case 'tripExpense': {
      const r = await prisma.tripExpense.findUnique({
        where: { id },
        select: { deletedAt: true, ledger: { select: { members: { where: { userId, role: { in: ['owner', 'editor'] } }, select: { role: true }, take: 1 } } } },
      });
      return !!r && r.deletedAt !== null && r.ledger.members.length > 0;
    }
    case 'event': {
      const r = await prisma.event.findUnique({
        where: { id },
        select: { deletedAt: true, ledger: { select: { members: { where: { userId, role: { in: ['owner', 'editor'] } }, select: { role: true }, take: 1 } } } },
      });
      return !!r && r.deletedAt !== null && r.ledger.members.length > 0;
    }
    case 'eventAmount': {
      const r = await prisma.eventAmount.findUnique({
        where: { id },
        select: {
          deletedAt: true,
          event: { select: { ledger: { select: { members: { where: { userId, role: { in: ['owner', 'editor'] } }, select: { role: true }, take: 1 } } } } },
        },
      });
      return !!r && r.deletedAt !== null && r.event.ledger.members.length > 0;
    }
  }
}

// ============ 恢复 ============

/** 拿到恢复后该同步刷新的 eventId —— 恢复 eventAmount 或 event 时需要 */
export async function restoreOne(type: TrashType, id: string): Promise<{ eventId: string | null }> {
  switch (type) {
    case 'entry':
      await prisma.entry.update({ where: { id }, data: { deletedAt: null } });
      return { eventId: null };
    case 'generalEntry':
      await prisma.generalEntry.update({ where: { id }, data: { deletedAt: null } });
      return { eventId: null };
    case 'tripExpense':
      await prisma.tripExpense.update({ where: { id }, data: { deletedAt: null } });
      return { eventId: null };
    case 'event':
      await prisma.event.update({ where: { id }, data: { deletedAt: null } });
      return { eventId: id };
    case 'eventAmount': {
      const row = await prisma.eventAmount.update({
        where: { id },
        data: { deletedAt: null },
        select: { eventId: true },
      });
      return { eventId: row.eventId };
    }
  }
}

// ============ 彻底删除 ============

/**
 * 彻底删。图片按引用计数清理（软删记录仍算引用者 —— 见 imageCleanup.filterUnreferenced）。
 * 只有硬删把它从库里除掉后，别的记录才可能真正释放它引用的图片。
 */
export async function purgeOne(type: TrashType, id: string): Promise<void> {
  switch (type) {
    case 'entry':
      await prisma.entry.delete({ where: { id } });
      return;
    case 'generalEntry': {
      const row = await prisma.generalEntry.findUnique({
        where: { id },
        select: { imageUrls: true },
      });
      await prisma.generalEntry.delete({ where: { id } });
      await cleanupUrlsIfSafe(parseImageUrls(row?.imageUrls));
      return;
    }
    case 'tripExpense': {
      const row = await prisma.tripExpense.findUnique({
        where: { id },
        select: { imageUrls: true },
      });
      await prisma.tripExpense.delete({ where: { id } });
      await cleanupUrlsIfSafe(parseImageUrls(row?.imageUrls));
      return;
    }
    case 'event': {
      // Event 下有金额行，级联删；contentImages 也是自家上传，收一下
      const row = await prisma.event.findUnique({
        where: { id },
        select: { contentImages: true },
      });
      await prisma.event.delete({ where: { id } });
      await cleanupUrlsIfSafe(parseImageUrls(row?.contentImages));
      return;
    }
    case 'eventAmount':
      await prisma.eventAmount.delete({ where: { id } });
      return;
  }
}

async function cleanupUrlsIfSafe(urls: string[]) {
  if (urls.length === 0) return;
  try {
    // 只处理自家上传的 URL；用户手填的外链跳过
    const own = urls.filter((u) => keyFromUploadUrl(u));
    if (own.length === 0) return;
    // 简易引用计数：直接调 collect + cleanup 的组合太重。这里手工数一次。
    const stillReferenced: string[] = [];
    for (const url of own) {
      const [g, t, e] = await Promise.all([
        prisma.generalEntry.count({ where: { imageUrls: { contains: url } } }),
        prisma.tripExpense.count({ where: { imageUrls: { contains: url } } }),
        prisma.event.count({ where: { contentImages: { contains: url } } }),
      ]);
      if (g + t + e === 0) stillReferenced.push(url);
    }
    if (stillReferenced.length > 0) await deleteUploadUrls(stillReferenced);
  } catch (err) {
    log.warn('彻底删记录时清图失败（不影响主删除）', errorFields(err));
  }
}

// ============ 过期清理 ============

let lastCleanupAt = 0;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 小时节流

/** 由 bootstrap 的 maintenanceTick 触发。失败只记日志，绝不抛。 */
export async function purgeExpiredRecords() {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;
  try {
    const cutoff = cutoffFor(new Date(now));

    // 先收集要删的记录 —— 图片清理要在硬删之后，且要拿到 imageUrls
    const [generals, trips, events, entries, amounts] = await Promise.all([
      prisma.generalEntry.findMany({
        where: { deletedAt: { lt: cutoff } },
        select: { id: true, imageUrls: true },
      }),
      prisma.tripExpense.findMany({
        where: { deletedAt: { lt: cutoff } },
        select: { id: true, imageUrls: true },
      }),
      prisma.event.findMany({
        where: { deletedAt: { lt: cutoff } },
        select: { id: true, contentImages: true },
      }),
      prisma.entry.findMany({
        where: { deletedAt: { lt: cutoff } },
        select: { id: true },
      }),
      prisma.eventAmount.findMany({
        where: { deletedAt: { lt: cutoff } },
        select: { id: true },
      }),
    ]);

    if (
      entries.length === 0 &&
      generals.length === 0 &&
      trips.length === 0 &&
      events.length === 0 &&
      amounts.length === 0
    ) return;

    // 图片 URL：普通条目 + 旅游支出的 imageUrls，加上活动的 contentImages
    const urls = new Set<string>();
    for (const r of generals) for (const u of parseImageUrls(r.imageUrls)) urls.add(u);
    for (const r of trips) for (const u of parseImageUrls(r.imageUrls)) urls.add(u);
    for (const r of events) for (const u of parseImageUrls(r.contentImages)) urls.add(u);

    // 硬删。Event 会级联清 EventAmount，无需单独删被级联走的那部分。
    // 独立软删的 EventAmount 单独硬删（其父 event 仍在，级联不会触发）
    if (entries.length > 0)
      await prisma.entry.deleteMany({ where: { id: { in: entries.map((r) => r.id) } } });
    if (generals.length > 0)
      await prisma.generalEntry.deleteMany({ where: { id: { in: generals.map((r) => r.id) } } });
    if (trips.length > 0)
      await prisma.tripExpense.deleteMany({ where: { id: { in: trips.map((r) => r.id) } } });
    if (events.length > 0)
      await prisma.event.deleteMany({ where: { id: { in: events.map((r) => r.id) } } });
    if (amounts.length > 0)
      await prisma.eventAmount.deleteMany({ where: { id: { in: amounts.map((r) => r.id) } } });

    // 硬删完再清图。此时引用计数天然把已删记录排除在外（它们已经不在库里了）
    if (urls.size > 0) await cleanupCollectedImages([...urls]);
  } catch (err) {
    log.warn('回收站过期记录清理失败', errorFields(err));
  }
}

