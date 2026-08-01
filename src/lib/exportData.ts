// 统一的数据导出层 —— CSV 和 JSON 备份共用同一份采集逻辑，
// 保证两种格式永远覆盖同样的表，不会再出现"导出漏了普通/旅游账本"这类问题。
//
// 新增账本类型时，只需要在 collectUserData 里加一段查询 + 在 BACKUP_TABLES 里登记，
// CSV 和 JSON 会自动跟上。

import { prisma } from '@/lib/db';

// 版本号与表清单在 backupFormat.ts —— 那个模块不依赖 prisma，导入端的单测要用
export { BACKUP_TABLES, BACKUP_VERSION } from '@/lib/backupFormat';
import { BACKUP_VERSION } from '@/lib/backupFormat';

export type BackupLedger = {
  id: string;
  kind: string;
  name: string;
  icon: string | null;
  color: string | null;
  order: number;
  archived: boolean;
  deletedAt: string | null;
  budgetCents: number | null;
  customCategories: string | null;
  baseCurrency: string | null;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BackupEntry = {
  id: string;
  yearMonth: string;
  category: string;
  direction: string;
  amountCents: number;
  note: string | null;
  occurredAt: string;
  refundedAt: string | null;
  createdAt: string;
  // 软删。非空 = 备份时该条目在回收站；导入端会原样恢复到回收站状态
  deletedAt: string | null;
};

export type BackupEventAmount = {
  id: string;
  stage: string;
  cents: number;
  // 非金额奖励。可选字段 —— 老备份没有这两项，导入端按缺省处理
  quantity: number | null;
  itemDesc: string | null;
  note: string | null;
  rewardMethod: string | null;
  occurredAt: string;
  createdAt: string;
  deletedAt: string | null;
};

export type BackupEvent = {
  id: string;
  title: string;
  startAt: string | null;
  content: string | null;
  rewardMethod: string | null;
  rewardMethods: string | null;
  reward: string | null;
  topicTag: string | null;
  contentImages: string | null;
  publishedAt: string;
  participate: boolean;
  deadline: string | null;
  predictedCents: number | null;
  announcedCents: number | null;
  paidCents: number | null;
  predictedAt: string | null;
  announcedAt: string | null;
  paidAt: string | null;
  status: string;
  note: string | null;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  amounts: BackupEventAmount[];
};

export type BackupGeneralEntry = {
  id: string;
  ledgerId: string;
  direction: string;
  category: string;
  amountCents: number;
  tags: string | null;
  note: string | null;
  imageUrls: string | null;
  occurredAt: string;
  createdAt: string;
  deletedAt: string | null;
};

export type BackupTripMember = {
  id: string;
  ledgerId: string;
  userId: string | null;
  displayName: string;
  createdAt: string;
};

export type BackupTripSplit = {
  id: string;
  memberId: string;
  shareCents: number;
};

export type BackupTripExpense = {
  id: string;
  ledgerId: string;
  payerId: string;
  title: string;
  category: string;
  phase: string;
  currency: string;
  amountForeignCents: number;
  rate: number;
  amountBaseCents: number;
  note: string | null;
  imageUrls: string | null;
  occurredAt: string;
  createdAt: string;
  deletedAt: string | null;
  splits: BackupTripSplit[];
};

export type UserBackup = {
  version: number;
  exportedAt: string;
  user: { id: string; username: string; createdAt: string };
  ledgers: BackupLedger[];
  entries: BackupEntry[];
  events: BackupEvent[];
  generalEntries: BackupGeneralEntry[];
  tripMembers: BackupTripMember[];
  tripExpenses: BackupTripExpense[];
};

const iso = (d: Date | null | undefined): string | null => d?.toISOString() ?? null;

/**
 * 采集某个用户的全部业务数据。
 *
 * 注意：软删除（deletedAt 非空）的账本**也会**被导出 —— 备份的意义就是尽可能不丢东西，
 * 回收站里的账本还在 60 天保留期内，属于用户仍可恢复的数据。
 */
export async function collectUserData(userId: string): Promise<UserBackup> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, createdAt: true },
  });
  if (!user) throw new Error(`user not found: ${userId}`);

  const [ledgers, entries, events, generalEntries, tripMembers, tripExpenses] =
    await Promise.all([
      prisma.ledger.findMany({
        where: { userId },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.entry.findMany({
        where: { userId },
        orderBy: [{ yearMonth: 'asc' }, { occurredAt: 'asc' }],
      }),
      prisma.event.findMany({
        where: { userId },
        include: { amounts: { orderBy: { occurredAt: 'asc' } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.generalEntry.findMany({
        where: { ledger: { userId } },
        orderBy: [{ ledgerId: 'asc' }, { occurredAt: 'asc' }],
      }),
      prisma.tripMember.findMany({
        where: { ledger: { userId } },
        orderBy: [{ ledgerId: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.tripExpense.findMany({
        where: { ledger: { userId } },
        include: { splits: true },
        orderBy: [{ ledgerId: 'asc' }, { occurredAt: 'asc' }],
      }),
    ]);

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    user: {
      id: user.id,
      username: user.username,
      createdAt: user.createdAt.toISOString(),
    },
    ledgers: ledgers.map((l) => ({
      id: l.id,
      kind: l.kind,
      name: l.name,
      icon: l.icon,
      color: l.color,
      order: l.order,
      archived: l.archived,
      deletedAt: iso(l.deletedAt),
      budgetCents: l.budgetCents,
      customCategories: l.customCategories,
      baseCurrency: l.baseCurrency,
      startDate: iso(l.startDate),
      endDate: iso(l.endDate),
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
    })),
    entries: entries.map((e) => ({
      id: e.id,
      yearMonth: e.yearMonth,
      category: e.category,
      direction: e.direction,
      amountCents: e.amountCents,
      note: e.note,
      occurredAt: e.occurredAt.toISOString(),
      refundedAt: iso(e.refundedAt),
      createdAt: e.createdAt.toISOString(),
      deletedAt: iso(e.deletedAt),
    })),
    events: events.map((ev) => ({
      id: ev.id,
      title: ev.title,
      startAt: iso(ev.startAt),
      content: ev.content,
      rewardMethod: ev.rewardMethod,
      rewardMethods: ev.rewardMethods,
      reward: ev.reward,
      topicTag: ev.topicTag,
      contentImages: ev.contentImages,
      publishedAt: ev.publishedAt.toISOString(),
      participate: ev.participate,
      deadline: iso(ev.deadline),
      predictedCents: ev.predictedCents,
      announcedCents: ev.announcedCents,
      paidCents: ev.paidCents,
      predictedAt: iso(ev.predictedAt),
      announcedAt: iso(ev.announcedAt),
      paidAt: iso(ev.paidAt),
      status: ev.status,
      note: ev.note,
      parentId: ev.parentId,
      createdAt: ev.createdAt.toISOString(),
      updatedAt: ev.updatedAt.toISOString(),
      deletedAt: iso(ev.deletedAt),
      amounts: ev.amounts.map((a) => ({
        id: a.id,
        stage: a.stage,
        cents: a.cents,
        quantity: a.quantity,
        itemDesc: a.itemDesc,
        note: a.note,
        rewardMethod: a.rewardMethod,
        occurredAt: a.occurredAt.toISOString(),
        createdAt: a.createdAt.toISOString(),
        deletedAt: iso(a.deletedAt),
      })),
    })),
    generalEntries: generalEntries.map((g) => ({
      id: g.id,
      ledgerId: g.ledgerId,
      direction: g.direction,
      category: g.category,
      amountCents: g.amountCents,
      tags: g.tags,
      note: g.note,
      imageUrls: g.imageUrls,
      occurredAt: g.occurredAt.toISOString(),
      createdAt: g.createdAt.toISOString(),
      deletedAt: iso(g.deletedAt),
    })),
    tripMembers: tripMembers.map((m) => ({
      id: m.id,
      ledgerId: m.ledgerId,
      userId: m.userId,
      displayName: m.displayName,
      createdAt: m.createdAt.toISOString(),
    })),
    tripExpenses: tripExpenses.map((e) => ({
      id: e.id,
      ledgerId: e.ledgerId,
      payerId: e.payerId,
      title: e.title,
      category: e.category,
      phase: e.phase,
      currency: e.currency,
      amountForeignCents: e.amountForeignCents,
      rate: e.rate,
      amountBaseCents: e.amountBaseCents,
      note: e.note,
      imageUrls: e.imageUrls,
      occurredAt: e.occurredAt.toISOString(),
      createdAt: e.createdAt.toISOString(),
      deletedAt: iso(e.deletedAt),
      splits: e.splits.map((s) => ({
        id: s.id,
        memberId: s.memberId,
        shareCents: s.shareCents,
      })),
    })),
  };
}

/** 备份内容摘要，用于导出后给用户一个"到底备了多少东西"的确认 */
export function summarizeBackup(b: UserBackup): Record<string, number> {
  return {
    账本: b.ledgers.length,
    工作条目: b.entries.length,
    桃源活动: b.events.length,
    桃源金额: b.events.reduce((a, e) => a + e.amounts.length, 0),
    普通账本条目: b.generalEntries.length,
    旅游成员: b.tripMembers.length,
    旅游支出: b.tripExpenses.length,
  };
}
