// 全局搜索的查库层。纯逻辑（参数解析、跨来源归并）在 lib/search.ts。
//
// 每个来源单独发一条查询，各取 limit+1 条，再交给 mergeAndSlice 归并。
// 理由见 lib/search.ts 顶部。
//
// ---------------------------------------------------------------------------
// 「筛选条件对某个来源不适用」怎么办
//
// 四个来源的字段不整齐，有些条件天然对不上：
//   * 旅游支出没有 direction —— 它永远是支出。所以筛"收入"时整个来源都不该出现
//   * 桃源活动没有 category —— 按类别筛时它不该出现
//   * 桃源活动没有 tags，但有 topicTag，语义相近，映射过去
//
// 处理方式是**整体跳过该来源**，而不是"忽略这个条件照查不误"。
// 后者会让用户筛"收入"却搜出一堆支出，比少几条结果糟糕得多。

import { prisma } from '@/lib/db';
import { decodeCursor } from '@/lib/pagination';
import type { SearchFilters, SearchHit } from '@/lib/search';

/** 时间区间的 where 片段 */
function timeRange(from: Date | null, to: Date | null) {
  if (!from && !to) return undefined;
  return { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
}

function centsRange(min: number | null, max: number | null) {
  if (min === null && max === null) return undefined;
  return { ...(min !== null ? { gte: min } : {}), ...(max !== null ? { lte: max } : {}) };
}

/**
 * 游标条件。字段名可变是因为桃源活动用 createdAt 做时间轴，其余用 occurredAt。
 *
 * SQLite 下 Prisma 的 contains 生成 LIKE，对 ASCII 大小写不敏感，中文本来就没有
 * 大小写问题 —— 所以不需要（SQLite 也不支持）Prisma 的 mode: 'insensitive'。
 */
function cursorFilter(field: 'occurredAt' | 'createdAt', cursor: string | null) {
  const c = decodeCursor(cursor);
  if (!c) return undefined;
  return {
    OR: [
      { [field]: { lt: c.occurredAt } },
      { [field]: c.occurredAt, id: { lt: c.id } },
    ],
  } as Record<string, unknown>;
}


export async function runSearch(
  userId: string,
  f: SearchFilters,
): Promise<{ groups: SearchHit[][]; truncatedSources: string[] }> {
  const take = f.limit + 1;
  const groups: SearchHit[][] = [];
  const truncated: string[] = [];

  const occurred = timeRange(f.from, f.to);
  const cents = centsRange(f.minCents, f.maxCents);

  // ---------------- 工作账本 ----------------
  // 工作条目没有 tags 字段，按标签筛时整个来源跳过
  if (f.sources.includes('work') && !f.tag) {
    const cur = cursorFilter('occurredAt', f.cursor);
    const rows = await prisma.entry.findMany({
      where: {
        userId,
        ...(occurred ? { occurredAt: occurred } : {}),
        ...(cents ? { amountCents: cents } : {}),
        ...(f.direction ? { direction: f.direction } : {}),
        ...(f.category ? { category: { contains: f.category } } : {}),
        ...(f.q ? { OR: [{ note: { contains: f.q } }, { category: { contains: f.q } }] } : {}),
        ...(cur ?? {}),
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take,
    });
    groups.push(
      rows.map((e) => ({
        source: 'work' as const,
        id: e.id,
        ledgerId: null,
        ledgerName: '工作账本',
        title: e.category,
        category: e.category,
        direction: e.direction === 'income' ? ('income' as const) : ('expense' as const),
        amountCents: e.amountCents,
        note: e.note,
        tags: null,
        occurredAt: e.occurredAt,
        href: `/work/${e.yearMonth}`,
      })),
    );
    if (rows.length > f.limit) truncated.push('work');
  }

  // ---------------- 普通账本 ----------------
  if (f.sources.includes('general')) {
    const cur = cursorFilter('occurredAt', f.cursor);
    const rows = await prisma.generalEntry.findMany({
      where: {
        // 回收站里的账本不参与搜索 —— 搜到一条点进去发现账本已删除，体验很差
        ledger: { userId, deletedAt: null },
        ...(occurred ? { occurredAt: occurred } : {}),
        ...(cents ? { amountCents: cents } : {}),
        ...(f.direction ? { direction: f.direction } : {}),
        ...(f.category ? { category: { contains: f.category } } : {}),
        ...(f.tag ? { tags: { contains: f.tag } } : {}),
        ...(f.q
          ? {
              OR: [
                { note: { contains: f.q } },
                { category: { contains: f.q } },
                { tags: { contains: f.q } },
              ],
            }
          : {}),
        ...(cur ?? {}),
      },
      include: { ledger: { select: { id: true, name: true } } },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take,
    });
    groups.push(
      rows.map((g) => ({
        source: 'general' as const,
        id: g.id,
        ledgerId: g.ledgerId,
        ledgerName: g.ledger.name,
        title: g.category,
        category: g.category,
        direction: g.direction === 'income' ? ('income' as const) : ('expense' as const),
        amountCents: g.amountCents,
        note: g.note,
        tags: g.tags,
        occurredAt: g.occurredAt,
        href: `/l/${g.ledgerId}`,
      })),
    );
    if (rows.length > f.limit) truncated.push('general');
  }

  // ---------------- 旅游账本 ----------------
  // 旅游支出恒为支出，筛"收入"时整个来源跳过；它也没有 tags
  if (f.sources.includes('travel') && f.direction !== 'income' && !f.tag) {
    const cur = cursorFilter('occurredAt', f.cursor);
    const rows = await prisma.tripExpense.findMany({
      where: {
        ledger: { userId, deletedAt: null },
        ...(occurred ? { occurredAt: occurred } : {}),
        // 金额用本币（amountBaseCents），与列表页显示的口径一致
        ...(cents ? { amountBaseCents: cents } : {}),
        ...(f.category ? { category: { contains: f.category } } : {}),
        ...(f.q
          ? {
              OR: [
                { title: { contains: f.q } },
                { note: { contains: f.q } },
                { category: { contains: f.q } },
              ],
            }
          : {}),
        ...(cur ?? {}),
      },
      include: { ledger: { select: { id: true, name: true } } },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take,
    });
    groups.push(
      rows.map((t) => ({
        source: 'travel' as const,
        id: t.id,
        ledgerId: t.ledgerId,
        ledgerName: t.ledger.name,
        title: t.title,
        category: t.category,
        direction: 'expense' as const,
        amountCents: t.amountBaseCents,
        note: t.note,
        tags: null,
        occurredAt: t.occurredAt,
        href: `/l/${t.ledgerId}`,
      })),
    );
    if (rows.length > f.limit) truncated.push('travel');
  }

  // ---------------- 桃源账本 ----------------
  // 活动没有 category 也没有 direction 概念，这两个条件一旦设置就跳过该来源
  if (f.sources.includes('taoyuan') && !f.category && !f.direction) {
    const cur = cursorFilter('createdAt', f.cursor);
    const rows = await prisma.event.findMany({
      where: {
        userId,
        ...(occurred ? { createdAt: occurred } : {}),
        // 金额语义：有任意一笔阶段金额落在区间内
        ...(cents ? { amounts: { some: { cents } } } : {}),
        // 活动没有 tags，但 topicTag 语义相近
        ...(f.tag ? { topicTag: { contains: f.tag } } : {}),
        ...(f.q
          ? {
              OR: [
                { title: { contains: f.q } },
                { content: { contains: f.q } },
                { note: { contains: f.q } },
                { reward: { contains: f.q } },
                { topicTag: { contains: f.q } },
              ],
            }
          : {}),
        ...(cur ?? {}),
      },
      include: { amounts: { select: { stage: true, cents: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    });
    groups.push(
      rows.map((ev) => {
        // 展示金额取最靠后的阶段：到账 > 公示 > 预测，与列表页口径一致
        const byStage = (s: string) =>
          ev.amounts.filter((a) => a.stage === s).reduce((sum, a) => sum + a.cents, 0);
        const paid = byStage('paid');
        const announced = byStage('announced');
        const predicted = byStage('predicted');
        const amount = paid || announced || predicted || null;
        return {
          source: 'taoyuan' as const,
          id: ev.id,
          ledgerId: null,
          ledgerName: '桃源账本',
          title: ev.title,
          category: null,
          direction: 'income' as const,
          amountCents: amount,
          note: ev.note,
          tags: ev.topicTag,
          occurredAt: ev.createdAt,
          href: '/taoyuan',
        };
      }),
    );
    if (rows.length > f.limit) truncated.push('taoyuan');
  }

  return { groups, truncatedSources: truncated };
}
