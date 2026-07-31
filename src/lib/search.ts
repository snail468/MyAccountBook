// 跨账本全局搜索的纯逻辑层：参数解析 + 跨来源结果归并。
// 真正查库的部分在 lib/searchExecute.ts。
//
// ---------------------------------------------------------------------------
// 四个来源的字段并不整齐，搜索层要先做一次归一：
//
//   来源      模型           时间轴       金额              可搜文本                 类别    标签
//   work      Entry          occurredAt   amountCents       note                     ✓       —
//   general   GeneralEntry   occurredAt   amountCents       note                     ✓       ✓
//   travel    TripExpense    occurredAt   amountBaseCents   title, note              ✓       —
//   taoyuan   Event          createdAt    （见下）          title, content, note...  —       topicTag
//
// 桃源活动没有单一金额字段（预测/公示/到账是三个阶段），所以金额区间筛选对它的
// 语义定为「**有任意一笔阶段金额**落在区间内」。这比硬选某一个阶段更符合直觉，
// 也是唯一能用一条 Prisma 查询表达的语义。
//
// ---------------------------------------------------------------------------
// 分页：每个来源各自按 (时间, id) 倒序取 limit+1 条，再归并排序裁剪。
//
// 为什么这样是对的：每个来源返回的都是「严格早于游标」的集合，合并后整体排序，
// 取前 limit 条 —— 与「把四张表 UNION 后排序」等价。代价是每翻一页要发 4 条查询，
// 对个人账本这个量级完全可以接受，换来的是不需要写原生 UNION SQL（SQLite 下
// Prisma 表达不了），也不需要维护物化的搜索表。

export const SEARCH_SOURCES = ['work', 'general', 'travel', 'taoyuan'] as const;
export type SearchSource = (typeof SEARCH_SOURCES)[number];

export const SOURCE_LABEL: Record<SearchSource, string> = {
  work: '工作账本',
  general: '普通账本',
  travel: '旅游账本',
  taoyuan: '桃源账本',
};

export type SearchFilters = {
  /** 关键字，已 trim；空串表示不按关键字过滤 */
  q: string;
  /** 起始时间（含） */
  from: Date | null;
  /** 结束时间（含当天 23:59:59.999，见 parseSearchParams） */
  to: Date | null;
  minCents: number | null;
  maxCents: number | null;
  category: string;
  tag: string;
  direction: 'income' | 'expense' | null;
  sources: SearchSource[];
  limit: number;
  cursor: string | null;
};

export type ParseResult =
  | { ok: true; filters: SearchFilters }
  | { ok: false; reason: string };

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

function parseIntOrNull(raw: string | null): number | null | 'bad' {
  if (raw === null || raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 'bad';
  return Math.round(n);
}

/**
 * 把 URL 查询参数解析成规范化的过滤条件。
 *
 * 设计原则：**能忽略的就忽略，不能忽略的就明确报错**。
 * 空参数、多余空格、乱七八糟的 source 名字一律当作"没填"；
 * 而金额/日期填了但不合法必须报错 —— 静默忽略会让用户以为筛了其实没筛，
 * 拿到一堆不符合预期的结果还不知道为什么。
 */
export function parseSearchParams(sp: URLSearchParams): ParseResult {
  const q = (sp.get('q') ?? '').trim();

  const rawFrom = (sp.get('from') ?? '').trim();
  const rawTo = (sp.get('to') ?? '').trim();
  let from: Date | null = null;
  let to: Date | null = null;

  if (rawFrom) {
    const d = new Date(rawFrom);
    if (Number.isNaN(d.getTime())) return { ok: false, reason: '开始日期格式不对' };
    from = d;
  }
  if (rawTo) {
    const d = new Date(rawTo);
    if (Number.isNaN(d.getTime())) return { ok: false, reason: '结束日期格式不对' };
    // 只给了日期（YYYY-MM-DD）时补到当天末尾 —— 否则"到 7月31日"会把 31 号当天全漏掉
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawTo)) {
      d.setHours(23, 59, 59, 999);
    }
    to = d;
  }
  if (from && to && from > to) {
    return { ok: false, reason: '开始日期晚于结束日期' };
  }

  const minCents = parseIntOrNull(sp.get('minCents'));
  if (minCents === 'bad') return { ok: false, reason: '最小金额不是数字' };
  const maxCents = parseIntOrNull(sp.get('maxCents'));
  if (maxCents === 'bad') return { ok: false, reason: '最大金额不是数字' };
  if (minCents !== null && minCents < 0) return { ok: false, reason: '最小金额不能为负' };
  if (maxCents !== null && maxCents < 0) return { ok: false, reason: '最大金额不能为负' };
  if (minCents !== null && maxCents !== null && minCents > maxCents) {
    return { ok: false, reason: '最小金额大于最大金额' };
  }

  const dirRaw = (sp.get('direction') ?? '').trim();
  const direction = dirRaw === 'income' || dirRaw === 'expense' ? dirRaw : null;

  // sources=work,general —— 无法识别的名字直接丢掉；一个都没剩就当成"全选"
  const rawSources = (sp.get('sources') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is SearchSource => (SEARCH_SOURCES as readonly string[]).includes(s));
  const sources = rawSources.length > 0 ? [...new Set(rawSources)] : [...SEARCH_SOURCES];

  const rawLimit = Number(sp.get('limit'));
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), MAX_LIMIT)
      : DEFAULT_LIMIT;

  return {
    ok: true,
    filters: {
      q,
      from,
      to,
      minCents: minCents ?? null,
      maxCents: maxCents ?? null,
      category: (sp.get('category') ?? '').trim(),
      tag: (sp.get('tag') ?? '').trim(),
      direction,
      sources,
      limit,
      cursor: sp.get('cursor'),
    },
  };
}

/** 一条搜索结果。四个来源归一成同一形状，前端只渲染一种卡片。 */
export type SearchHit = {
  source: SearchSource;
  id: string;
  /** 所属账本；工作/桃源是内置账本，没有具体 ledgerId */
  ledgerId: string | null;
  ledgerName: string | null;
  /** 主标题：类别或活动标题 */
  title: string;
  category: string | null;
  direction: 'income' | 'expense' | null;
  /** 本币金额（分）。桃源活动可能没有金额 */
  amountCents: number | null;
  note: string | null;
  tags: string | null;
  /** 排序与游标用的时间 */
  occurredAt: Date;
  /** 点进去跳哪 */
  href: string;
};

/**
 * 判断某个过滤条件是否为"空"（等价于没填）。
 * UI 用它决定要不要显示"已筛选 N 项"的角标。
 */
export function activeFilterCount(f: SearchFilters): number {
  let n = 0;
  if (f.q) n += 1;
  if (f.from) n += 1;
  if (f.to) n += 1;
  if (f.minCents !== null) n += 1;
  if (f.maxCents !== null) n += 1;
  if (f.category) n += 1;
  if (f.tag) n += 1;
  if (f.direction) n += 1;
  if (f.sources.length !== SEARCH_SOURCES.length) n += 1;
  return n;
}

/** 有没有任何有效条件 —— 全空时不该把整个库倒出来 */
export function hasAnyFilter(f: SearchFilters): boolean {
  return activeFilterCount(f) > 0;
}

/**
 * 把各来源的结果归并成一页。
 *
 * 输入是每个来源各自取的 limit+1 条（已按时间倒序）。合并后整体重排，
 * 裁到 limit 条，并算出下一页游标。
 *
 * 排序键与游标严格一致：(occurredAt desc, id desc)。不一致会导致翻页时
 * 漏记录或重复 —— 游标是"严格早于最后一条"，排序若不同就对不上。
 */
export function mergeAndSlice(
  groups: SearchHit[][],
  limit: number,
): { items: SearchHit[]; nextCursor: string | null } {
  const all = groups.flat().sort((a, b) => {
    const t = b.occurredAt.getTime() - a.occurredAt.getTime();
    if (t !== 0) return t;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });

  if (all.length <= limit) return { items: all, nextCursor: null };
  const items = all.slice(0, limit);
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: `${last.occurredAt.toISOString()}~${last.id}`,
  };
}

/** 把逗号分隔的 tags 字段切成数组，顺便去空 */
export function splitTags(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}
