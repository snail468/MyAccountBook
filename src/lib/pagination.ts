// 游标分页 —— 用 (occurredAt, id) 复合游标，而不是 offset。
//
// 为什么不用 offset：账本列表按时间倒序，用户一边翻页一边记账时 offset 会错位
// （新记录插到前面，第二页会重复第一页的末尾）。复合游标不受插入影响。
//
// 为什么要带 id：occurredAt 是 datetime-local 精度，同一秒内很容易有多条
// （批量导入尤其明显）。只用时间做游标会漏记录或死循环。

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export type TimeCursor = { occurredAt: Date; id: string };

/** 把游标编码成 URL 安全的字符串 */
export function encodeCursor(c: TimeCursor): string {
  return `${c.occurredAt.toISOString()}~${c.id}`;
}

/** 解析游标；格式不对返回 null（当作从头开始，而不是报错） */
export function decodeCursor(raw: string | null | undefined): TimeCursor | null {
  if (!raw) return null;
  const idx = raw.indexOf('~');
  if (idx <= 0) return null;
  const iso = raw.slice(0, idx);
  const id = raw.slice(idx + 1);
  if (!id) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return { occurredAt: d, id };
}

/**
 * 生成"严格早于游标"的 where 片段，配合
 * orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }] 使用。
 */
export function cursorWhere(c: TimeCursor | null) {
  if (!c) return {};
  return {
    OR: [
      { occurredAt: { lt: c.occurredAt } },
      { occurredAt: c.occurredAt, id: { lt: c.id } },
    ],
  };
}

/** 统一的倒序排序，所有分页列表共用，保证游标语义一致 */
export const TIME_DESC_ORDER = [
  { occurredAt: 'desc' as const },
  { id: 'desc' as const },
];

export function parsePageSize(raw: string | null | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(n), MAX_PAGE_SIZE);
}

/**
 * 多取一条来判断有没有下一页 —— 比额外发一次 count 查询便宜。
 * 传入 limit+1 条结果，返回裁剪后的页面和下一页游标。
 */
export function slicePage<T extends { id: string; occurredAt: Date }>(
  rows: T[],
  limit: number,
): { items: T[]; nextCursor: string | null } {
  if (rows.length <= limit) return { items: rows, nextCursor: null };
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return { items, nextCursor: encodeCursor({ occurredAt: last.occurredAt, id: last.id }) };
}

// ==================== 按 createdAt 排序的变体 ====================
// Event 没有 occurredAt，用 createdAt 做时间轴。语义与上面完全一致，
// 只是字段名不同 —— 单独导出而不是加参数，是为了让 Prisma 的
// where/orderBy 字面量保持可推断的类型。

export const CREATED_DESC_ORDER = [
  { createdAt: 'desc' as const },
  { id: 'desc' as const },
];

export function createdCursorWhere(c: TimeCursor | null) {
  if (!c) return {};
  return {
    OR: [
      { createdAt: { lt: c.occurredAt } },
      { createdAt: c.occurredAt, id: { lt: c.id } },
    ],
  };
}

export function slicePageByCreated<T extends { id: string; createdAt: Date }>(
  rows: T[],
  limit: number,
): { items: T[]; nextCursor: string | null } {
  if (rows.length <= limit) return { items: rows, nextCursor: null };
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return { items, nextCursor: encodeCursor({ occurredAt: last.createdAt, id: last.id }) };
}
