// 全量 JSON 备份的还原端。与 lib/exportData.ts 严格配对。
//
// 分三层，中间两层是纯函数（可进单测，符合 vitest.config.ts 里"只测纯函数"的约定）：
//
//   parseBackup(raw)          校验：JSON 结构、版本、字段类型
//   planImport(backup, opts)  计划：重映射所有 id 与外键，算出要写哪些行
//   applyImport(...)          执行：一个事务里落库（在 importExecute.ts，碰 prisma）
//
// ---------------------------------------------------------------------------
// 为什么一律重映射 id，而不是沿用备份里的原 id
//
// 备份里的 id 是原库里的 cuid。直接沿用看起来更"还原"，但有两个坑：
//   1. 同一份备份被两个账号导入 → 第二次撞主键，整个事务失败
//   2. merge 模式下与现有数据撞 id
// 重映射一次性解决这两个问题，代价只是"还原后 id 变了" —— 而 id 从不对用户可见，
// 也不出现在任何外部引用里。
//
// ---------------------------------------------------------------------------
// 图片的处理
//
// **JSON 备份不含图片文件本身**，只含它们的引用 URL（/api/uploads/<userId>/...）。
// 而上传接口只允许访问自己 id 目录下的文件，所以原样保留 URL 必然 404。
// 这里把 URL 里的 owner 段改写成导入者的 id：如果用户同时把 data/uploads 目录
// 也一起搬过来（并把目录改名），图片就能对上；没搬的话反正都是 404，不会更糟。

import { z } from 'zod';
import { BACKUP_VERSION } from '@/lib/backupFormat';

// ---------------------------------------------------------------------------
// 校验
// ---------------------------------------------------------------------------

const isoString = z.string().min(1);
const nullableIso = isoString.nullable();

const ledgerSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  name: z.string(),
  icon: z.string().nullable(),
  color: z.string().nullable(),
  order: z.number().int(),
  archived: z.boolean(),
  deletedAt: nullableIso,
  budgetCents: z.number().int().nullable(),
  customCategories: z.string().nullable(),
  baseCurrency: z.string().nullable(),
  startDate: nullableIso,
  endDate: nullableIso,
  createdAt: isoString,
  updatedAt: isoString,
});

const entrySchema = z.object({
  id: z.string().min(1),
  // Phase 2 之后 Entry 挂 Ledger；老备份没有 ledgerId，用 optional 兼容 ——
  // 缺失时 planImport 会 fallback 到 existingBuiltinLedgerIds.work
  ledgerId: z.string().min(1).nullable().optional(),
  yearMonth: z.string(),
  category: z.string(),
  direction: z.string(),
  amountCents: z.number().int(),
  note: z.string().nullable(),
  occurredAt: isoString,
  refundedAt: nullableIso,
  createdAt: isoString,
  // 老备份没有，用 optional 兜底。BACKUP_VERSION 不必 +1
  deletedAt: nullableIso.optional(),
});

const eventAmountSchema = z.object({
  id: z.string().min(1),
  stage: z.string(),
  cents: z.number().int(),
  // 老备份没有这两个字段，用 optional 兼容 —— 加的是可选字段，
  // 结构没有不兼容变更，所以 BACKUP_VERSION 不必 +1
  quantity: z.number().int().nullable().optional(),
  itemDesc: z.string().nullable().optional(),
  note: z.string().nullable(),
  rewardMethod: z.string().nullable(),
  occurredAt: isoString,
  createdAt: isoString,
  deletedAt: nullableIso.optional(),
});

const eventSchema = z.object({
  id: z.string().min(1),
  // Phase 2；同 entrySchema
  ledgerId: z.string().min(1).nullable().optional(),
  title: z.string(),
  startAt: nullableIso,
  content: z.string().nullable(),
  rewardMethod: z.string().nullable(),
  rewardMethods: z.string().nullable(),
  reward: z.string().nullable(),
  topicTag: z.string().nullable(),
  contentImages: z.string().nullable(),
  publishedAt: isoString,
  participate: z.boolean(),
  deadline: nullableIso,
  predictedCents: z.number().int().nullable(),
  announcedCents: z.number().int().nullable(),
  paidCents: z.number().int().nullable(),
  predictedAt: nullableIso,
  announcedAt: nullableIso,
  paidAt: nullableIso,
  status: z.string(),
  note: z.string().nullable(),
  parentId: z.string().nullable(),
  createdAt: isoString,
  updatedAt: isoString,
  deletedAt: nullableIso.optional(),
  amounts: z.array(eventAmountSchema),
});

const generalEntrySchema = z.object({
  id: z.string().min(1),
  ledgerId: z.string().min(1),
  direction: z.string(),
  category: z.string(),
  amountCents: z.number().int(),
  tags: z.string().nullable(),
  note: z.string().nullable(),
  imageUrls: z.string().nullable(),
  occurredAt: isoString,
  createdAt: isoString,
  deletedAt: nullableIso.optional(),
});

const tripMemberSchema = z.object({
  id: z.string().min(1),
  ledgerId: z.string().min(1),
  userId: z.string().nullable(),
  displayName: z.string(),
  createdAt: isoString,
});

const tripExpenseSchema = z.object({
  id: z.string().min(1),
  ledgerId: z.string().min(1),
  payerId: z.string().min(1),
  title: z.string(),
  category: z.string(),
  phase: z.string(),
  currency: z.string(),
  amountForeignCents: z.number().int(),
  rate: z.number(),
  amountBaseCents: z.number().int(),
  note: z.string().nullable(),
  imageUrls: z.string().nullable(),
  occurredAt: isoString,
  createdAt: isoString,
  deletedAt: nullableIso.optional(),
  splits: z.array(
    z.object({
      id: z.string().min(1),
      memberId: z.string().min(1),
      shareCents: z.number().int(),
    }),
  ),
});

export const backupSchema = z.object({
  version: z.number().int(),
  exportedAt: z.string(),
  user: z.object({
    id: z.string().min(1),
    username: z.string(),
    createdAt: z.string(),
  }),
  ledgers: z.array(ledgerSchema),
  entries: z.array(entrySchema),
  events: z.array(eventSchema),
  generalEntries: z.array(generalEntrySchema),
  tripMembers: z.array(tripMemberSchema),
  tripExpenses: z.array(tripExpenseSchema),
});

export type ParsedBackup = z.infer<typeof backupSchema>;

export type ParseResult =
  | { ok: true; backup: ParsedBackup }
  | { ok: false; reason: string };

/**
 * 校验一份来路不明的 JSON 是不是本应用的备份。
 *
 * 版本策略：只接受 <= 当前版本。更高的版本意味着这份备份是新版程序导出的，
 * 结构可能有本程序不认识的字段 —— 强行导入会静默丢数据，不如直接拒绝。
 */
export function parseBackup(raw: unknown): ParseResult {
  if (raw === null || typeof raw !== 'object') {
    return { ok: false, reason: '不是有效的备份文件（顶层不是对象）' };
  }
  const version = (raw as { version?: unknown }).version;
  if (typeof version !== 'number') {
    return { ok: false, reason: '不是有效的备份文件（缺少 version 字段）' };
  }
  if (version > BACKUP_VERSION) {
    return {
      ok: false,
      reason: `备份版本 ${version} 高于本程序支持的 ${BACKUP_VERSION}，请先升级程序再导入`,
    };
  }

  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path.join('.') || '(顶层)';
    return { ok: false, reason: `备份文件结构不对：${path} ${first?.message ?? ''}`.trim() };
  }
  return { ok: true, backup: parsed.data };
}

// ---------------------------------------------------------------------------
// 计划
// ---------------------------------------------------------------------------

export type ImportMode = 'replace' | 'merge';

export type ImportOptions = {
  /** 导入到哪个用户 */
  targetUserId: string;
  mode: ImportMode;
  /**
   * merge 模式下，该用户已有的内置账本类型（work / taoyuan）。
   * 内置账本每人只能有一个活跃的，已经有了就不再建第二个。
   * replace 模式会先清空，所以传空集合即可。
   */
  existingBuiltinKinds?: ReadonlySet<string>;
  /**
   * Phase 2：merge 模式下"已存在的 built-in Ledger id"。
   * planImport 用它把备份里指向旧 work/taoyuan 账本的 Entry/Event 重定向到
   * 现有账本上，避免"丢掉了新账本行、条目也就找不着家"。缺失时按新建走。
   */
  existingBuiltinLedgerIds?: Partial<Record<'work' | 'taoyuan', string>>;
  /** 生成新 id 的函数。默认 crypto.randomUUID，单测里可注入确定性实现 */
  newId?: () => string;
};

export type PlannedLedger = {
  id: string;
  userId: string;
  kind: string;
  name: string;
  icon: string | null;
  color: string | null;
  order: number;
  archived: boolean;
  deletedAt: Date | null;
  budgetCents: number | null;
  customCategories: string | null;
  baseCurrency: string | null;
  startDate: Date | null;
  endDate: Date | null;
  createdAt: Date;
};

export type PlannedEntry = {
  id: string;
  userId: string;
  ledgerId: string;
  yearMonth: string;
  category: string;
  direction: string;
  amountCents: number;
  note: string | null;
  occurredAt: Date;
  refundedAt: Date | null;
  createdAt: Date;
  deletedAt: Date | null;
};

export type PlannedEvent = {
  id: string;
  userId: string;
  ledgerId: string;
  title: string;
  startAt: Date | null;
  content: string | null;
  rewardMethod: string | null;
  rewardMethods: string | null;
  reward: string | null;
  topicTag: string | null;
  contentImages: string | null;
  publishedAt: Date;
  participate: boolean;
  deadline: Date | null;
  predictedCents: number | null;
  announcedCents: number | null;
  paidCents: number | null;
  predictedAt: Date | null;
  announcedAt: Date | null;
  paidAt: Date | null;
  status: string;
  note: string | null;
  parentId: string | null;
  createdAt: Date;
  deletedAt: Date | null;
};

export type PlannedEventAmount = {
  id: string;
  eventId: string;
  stage: string;
  cents: number;
  quantity: number | null;
  itemDesc: string | null;
  note: string | null;
  rewardMethod: string | null;
  occurredAt: Date;
  createdAt: Date;
  deletedAt: Date | null;
};

export type PlannedGeneralEntry = {
  id: string;
  ledgerId: string;
  direction: string;
  category: string;
  amountCents: number;
  tags: string | null;
  note: string | null;
  imageUrls: string | null;
  occurredAt: Date;
  createdAt: Date;
  deletedAt: Date | null;
};

export type PlannedTripMember = {
  id: string;
  ledgerId: string;
  userId: string | null;
  displayName: string;
  createdAt: Date;
};

export type PlannedTripExpense = {
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
  occurredAt: Date;
  createdAt: Date;
  deletedAt: Date | null;
};

export type PlannedTripSplit = {
  id: string;
  expenseId: string;
  memberId: string;
  shareCents: number;
};

export type ImportPlan = {
  ledgers: PlannedLedger[];
  entries: PlannedEntry[];
  events: PlannedEvent[];
  eventAmounts: PlannedEventAmount[];
  generalEntries: PlannedGeneralEntry[];
  tripMembers: PlannedTripMember[];
  tripExpenses: PlannedTripExpense[];
  tripSplits: PlannedTripSplit[];
  /** 给用户看的条数摘要 */
  summary: Record<string, number>;
  /** 被跳过的东西，导入后如实告诉用户 */
  skipped: string[];
  /** 带图片引用的记录数 —— 提醒用户图片文件不在 JSON 备份里 */
  imageRefCount: number;
};

const toDate = (s: string): Date => new Date(s);
const toDateOrNull = (s: string | null): Date | null => (s === null ? null : new Date(s));

// ledgerId 解析辅助：先看 map，再看兜底
function eventLedgerIdOrFallback(
  oldId: string,
  map: Map<string, string>,
  fallback: string | undefined,
): string | null {
  return map.get(oldId) ?? fallback ?? null;
}

/** 把 /api/uploads/<旧userId>/... 里的 owner 段换成导入者的 id */
export function rewriteImageOwner(raw: string | null, targetUserId: string): string | null {
  if (!raw) return raw;
  let urls: unknown;
  try {
    urls = JSON.parse(raw);
  } catch {
    return raw; // 老数据可能不是 JSON，原样保留
  }
  if (!Array.isArray(urls)) return raw;
  const PREFIX = '/api/uploads/';
  const rewritten = urls.map((u) => {
    if (typeof u !== 'string' || !u.startsWith(PREFIX)) return u;
    const rest = u.slice(PREFIX.length).split('/');
    if (rest.length < 2) return u;
    rest[0] = targetUserId;
    return PREFIX + rest.join('/');
  });
  return JSON.stringify(rewritten);
}

/**
 * 把一份备份翻译成"要插入哪些行"。纯函数，不碰数据库。
 *
 * 外键处理：所有 id 重新生成，引用按 旧id→新id 的映射改写。
 * 指向备份之外的引用（比如父活动被删过、成员不在名单里）一律置空或丢弃 ——
 * 宁可少一条关联，也不能插入一条悬空外键让整个事务炸掉。
 */
export function planImport(backup: ParsedBackup, opts: ImportOptions): ImportPlan {
  const newId = opts.newId ?? (() => crypto.randomUUID());
  const existingBuiltins = opts.existingBuiltinKinds ?? new Set<string>();
  const existingBuiltinIds = opts.existingBuiltinLedgerIds ?? {};
  const uid = opts.targetUserId;
  const skipped: string[] = [];
  let imageRefCount = 0;

  // ---- 账本 ----
  const ledgerIdMap = new Map<string, string>();
  const ledgers: PlannedLedger[] = [];
  let skippedBuiltin = 0;

  for (const l of backup.ledgers) {
    const isBuiltin = l.kind === 'work' || l.kind === 'taoyuan';
    if (isBuiltin && existingBuiltins.has(l.kind)) {
      // 已经有一个同类型的了。备份里旧 built-in 的 id 映射到"现有 built-in 的 id"，
      // 这样 Entry/Event 里带的旧 ledgerId 会重定向到用户现有的 built-in 上，
      // 而不是丢失。Phase 2 之前的行为（"元数据丢掉、数据挂 userId"）已经失效了。
      const targetId = existingBuiltinIds[l.kind as 'work' | 'taoyuan'];
      if (targetId) ledgerIdMap.set(l.id, targetId);
      skippedBuiltin += 1;
      continue;
    }
    const id = newId();
    ledgerIdMap.set(l.id, id);
    ledgers.push({
      id,
      userId: uid,
      kind: l.kind,
      name: l.name,
      icon: l.icon,
      color: l.color,
      order: l.order,
      archived: l.archived,
      deletedAt: toDateOrNull(l.deletedAt),
      budgetCents: l.budgetCents,
      customCategories: l.customCategories,
      baseCurrency: l.baseCurrency,
      startDate: toDateOrNull(l.startDate),
      endDate: toDateOrNull(l.endDate),
      createdAt: toDate(l.createdAt),
    });
  }
  if (skippedBuiltin > 0) {
    skipped.push(`${skippedBuiltin} 个内置账本（你已经有同类型的了，其中的数据仍会导入）`);
  }

  // ---- 工作账本条目 ----
  // Phase 2 之后 Entry.ledgerId 必填。解析优先级：
  //   1) e.ledgerId 存在 → 走 ledgerIdMap（新导入的 ledger 或已 merge 的 built-in）
  //   2) 存在但映射不到（备份里的 ledger 被 skip 又没提供 built-in fallback）→ existingBuiltinLedgerIds.work
  //   3) 都失败 → 丢弃这一条，累计到 skipped 提示用户
  //
  // 老备份（Phase 1 及以前）没有 e.ledgerId 字段，走 fallback。
  const entries: PlannedEntry[] = [];
  let orphanEntries = 0;
  for (const e of backup.entries) {
    let ledgerId: string | null = null;
    if (e.ledgerId) {
      ledgerId = ledgerIdMap.get(e.ledgerId) ?? existingBuiltinIds.work ?? null;
    } else {
      ledgerId = existingBuiltinIds.work ?? null;
    }
    if (!ledgerId) {
      orphanEntries += 1;
      continue;
    }
    entries.push({
      id: newId(),
      userId: uid,
      ledgerId,
      yearMonth: e.yearMonth,
      category: e.category,
      direction: e.direction,
      amountCents: e.amountCents,
      note: e.note,
      occurredAt: toDate(e.occurredAt),
      refundedAt: toDateOrNull(e.refundedAt),
      createdAt: toDate(e.createdAt),
      deletedAt: toDateOrNull(e.deletedAt ?? null),
    });
  }
  if (orphanEntries > 0) {
    skipped.push(`${orphanEntries} 条工作条目找不到目标账本（且无 work 兜底）`);
  }

  // ---- 桃源活动（parentId 自引用，先全部建映射再改写）----
  const eventIdMap = new Map<string, string>();
  for (const ev of backup.events) eventIdMap.set(ev.id, newId());

  const events: PlannedEvent[] = [];
  const eventAmounts: PlannedEventAmount[] = [];
  let orphanParents = 0;
  let orphanEvents = 0;

  for (const ev of backup.events) {
    const id = eventIdMap.get(ev.id)!;
    let parentId: string | null = null;
    if (ev.parentId) {
      const mapped = eventIdMap.get(ev.parentId);
      if (mapped) parentId = mapped;
      else orphanParents += 1; // 父活动不在备份里 → 摘成顶层活动，不丢数据
    }
    // Phase 2 ledgerId 解析，与 Entry 同规则
    let ledgerId: string | null = null;
    if (ev.ledgerId) {
      ledgerId = eventLedgerIdOrFallback(ev.ledgerId, ledgerIdMap, existingBuiltinIds.taoyuan);
    } else {
      ledgerId = existingBuiltinIds.taoyuan ?? null;
    }
    if (!ledgerId) {
      orphanEvents += 1;
      continue;
    }
    const contentImages = rewriteImageOwner(ev.contentImages, uid);
    if (contentImages) imageRefCount += 1;

    events.push({
      id,
      userId: uid,
      ledgerId,
      title: ev.title,
      startAt: toDateOrNull(ev.startAt),
      content: ev.content,
      rewardMethod: ev.rewardMethod,
      rewardMethods: ev.rewardMethods,
      reward: ev.reward,
      topicTag: ev.topicTag,
      contentImages,
      publishedAt: toDate(ev.publishedAt),
      participate: ev.participate,
      deadline: toDateOrNull(ev.deadline),
      predictedCents: ev.predictedCents,
      announcedCents: ev.announcedCents,
      paidCents: ev.paidCents,
      predictedAt: toDateOrNull(ev.predictedAt),
      announcedAt: toDateOrNull(ev.announcedAt),
      paidAt: toDateOrNull(ev.paidAt),
      status: ev.status,
      note: ev.note,
      parentId,
      createdAt: toDate(ev.createdAt),
      deletedAt: toDateOrNull(ev.deletedAt ?? null),
    });

    for (const a of ev.amounts) {
      eventAmounts.push({
        id: newId(),
        eventId: id,
        stage: a.stage,
        cents: a.cents,
        quantity: a.quantity ?? null,
        itemDesc: a.itemDesc ?? null,
        note: a.note,
        rewardMethod: a.rewardMethod,
        occurredAt: toDate(a.occurredAt),
        createdAt: toDate(a.createdAt),
        deletedAt: toDateOrNull(a.deletedAt ?? null),
      });
    }
  }
  if (orphanParents > 0) {
    skipped.push(`${orphanParents} 个活动的父活动不在备份里，已摘成顶层活动`);
  }
  if (orphanEvents > 0) {
    skipped.push(`${orphanEvents} 个桃源活动找不到目标账本（且无 taoyuan 兜底）`);
  }

  // ---- 普通账本条目 ----
  const generalEntries: PlannedGeneralEntry[] = [];
  let orphanGeneral = 0;
  for (const g of backup.generalEntries) {
    const ledgerId = ledgerIdMap.get(g.ledgerId);
    if (!ledgerId) {
      orphanGeneral += 1;
      continue;
    }
    const imageUrls = rewriteImageOwner(g.imageUrls, uid);
    if (imageUrls) imageRefCount += 1;
    generalEntries.push({
      id: newId(),
      ledgerId,
      direction: g.direction,
      category: g.category,
      amountCents: g.amountCents,
      tags: g.tags,
      note: g.note,
      imageUrls,
      occurredAt: toDate(g.occurredAt),
      createdAt: toDate(g.createdAt),
      deletedAt: toDateOrNull(g.deletedAt ?? null),
    });
  }
  if (orphanGeneral > 0) {
    skipped.push(`${orphanGeneral} 条普通账本记录找不到所属账本`);
  }

  // ---- 旅游成员 ----
  const memberIdMap = new Map<string, string>();
  const tripMembers: PlannedTripMember[] = [];
  let orphanMembers = 0;
  for (const m of backup.tripMembers) {
    const ledgerId = ledgerIdMap.get(m.ledgerId);
    if (!ledgerId) {
      orphanMembers += 1;
      continue;
    }
    const id = newId();
    memberIdMap.set(m.id, id);
    tripMembers.push({
      id,
      ledgerId,
      // 原备份里指向导出者自己的关联，改指到导入者；指向别人的一律断开
      // （那个用户在这个实例上不一定存在，留着就是悬空外键）
      userId: m.userId === backup.user.id ? uid : null,
      displayName: m.displayName,
      createdAt: toDate(m.createdAt),
    });
  }
  if (orphanMembers > 0) {
    skipped.push(`${orphanMembers} 个旅游成员找不到所属账本`);
  }

  // ---- 旅游支出 + 分摊 ----
  const tripExpenses: PlannedTripExpense[] = [];
  const tripSplits: PlannedTripSplit[] = [];
  let orphanExpenses = 0;
  let orphanSplits = 0;

  for (const e of backup.tripExpenses) {
    const ledgerId = ledgerIdMap.get(e.ledgerId);
    const payerId = memberIdMap.get(e.payerId);
    // 付款人是必填外键，缺了这条支出就没法插入
    if (!ledgerId || !payerId) {
      orphanExpenses += 1;
      continue;
    }
    const id = newId();
    const imageUrls = rewriteImageOwner(e.imageUrls, uid);
    if (imageUrls) imageRefCount += 1;
    tripExpenses.push({
      id,
      ledgerId,
      payerId,
      title: e.title,
      category: e.category,
      phase: e.phase,
      currency: e.currency,
      amountForeignCents: e.amountForeignCents,
      rate: e.rate,
      amountBaseCents: e.amountBaseCents,
      note: e.note,
      imageUrls,
      occurredAt: toDate(e.occurredAt),
      createdAt: toDate(e.createdAt),
      deletedAt: toDateOrNull(e.deletedAt ?? null),
    });
    for (const s of e.splits) {
      const memberId = memberIdMap.get(s.memberId);
      if (!memberId) {
        orphanSplits += 1;
        continue;
      }
      tripSplits.push({
        id: newId(),
        expenseId: id,
        memberId,
        shareCents: s.shareCents,
      });
    }
  }
  if (orphanExpenses > 0) {
    skipped.push(`${orphanExpenses} 笔旅游支出找不到所属账本或付款人`);
  }
  if (orphanSplits > 0) {
    skipped.push(`${orphanSplits} 条分摊找不到对应成员 —— 这些支出的分摊金额会对不上总额`);
  }

  return {
    ledgers,
    entries,
    events,
    eventAmounts,
    generalEntries,
    tripMembers,
    tripExpenses,
    tripSplits,
    summary: {
      账本: ledgers.length,
      工作条目: entries.length,
      桃源活动: events.length,
      桃源金额: eventAmounts.length,
      普通账本条目: generalEntries.length,
      旅游成员: tripMembers.length,
      旅游支出: tripExpenses.length,
      旅游分摊: tripSplits.length,
    },
    skipped,
    imageRefCount,
  };
}
