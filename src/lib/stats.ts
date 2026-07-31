// 统计页的纯计算层：月份分桶、类别占比、环比/同比。
// 取数在页面里（server component 直接查 prisma），这里不碰数据库。
//
// ---------------------------------------------------------------------------
// 为什么在 JS 里分桶，而不是像列表页那样把聚合下推到 SQL
//
// 列表页坚持 SQL 聚合是因为记录数**无上界** —— 记满几年后把全部条目拉进内存
// 是真实的问题。统计页不一样：它只看最近 12 个月，而且只取三列
// （时间、金额、方向）。个人账本这个量级下，一年的记录也就几千行。
//
// 而按月分桶如果要下推到 SQL，得写 strftime('%Y-%m', occurredAt/1000, 'unixepoch')
// 这类原生 SQL —— Prisma 在 SQLite 上把 DateTime 存成毫秒整数，这个除以 1000 的
// 细节是实现内部约定，Prisma 换个存储格式就会静默算错月份。用有界窗口 + JS 分桶
// 换掉这个隐患是划算的。

export type Direction = 'income' | 'expense';

/** 参与统计的一条记录，四个来源归一后的最小形状 */
export type StatRow = {
  occurredAt: Date;
  amountCents: number;
  direction: Direction;
  category: string;
  /** 来源标签，用于「按账本看占比」 */
  sourceLabel: string;
};

export type MonthBucket = {
  /** YYYY-MM */
  key: string;
  income: number;
  expense: number;
  /** 结余 = 收入 - 支出，可为负 */
  net: number;
};

/** 本地时区的 YYYY-MM。刻意不用 toISOString —— 那是 UTC，跨时区会把月初/月末算错 */
export function monthKeyOf(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * 从 `now` 往前数 count 个月的键，**升序**（最早的在前）。
 * 含当月，所以 count=12 表示「最近 12 个月」。
 */
export function recentMonthKeys(now: Date, count: number): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    // 用 1 号构造，避免 31 号往前推一个月落到"下个月"（JS Date 的经典陷阱：
    // new Date(2026, 2, 31) 减一个月 = 3月3日，因为 2 月没有 31 号）
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(monthKeyOf(d));
  }
  return keys;
}

/** 窗口起点：count 个月前的 1 号 00:00（本地时区） */
export function windowStart(now: Date, count: number): Date {
  return new Date(now.getFullYear(), now.getMonth() - (count - 1), 1, 0, 0, 0, 0);
}

/**
 * 把记录按月分桶。没有记录的月份也要出现（值为 0）——
 * 否则折线图会把空月份直接跳过，视觉上看不出"那个月没花钱"。
 */
export function bucketByMonth(rows: StatRow[], keys: string[]): MonthBucket[] {
  const map = new Map<string, MonthBucket>();
  for (const key of keys) map.set(key, { key, income: 0, expense: 0, net: 0 });

  for (const r of rows) {
    const b = map.get(monthKeyOf(r.occurredAt));
    if (!b) continue; // 落在窗口外的记录直接忽略
    if (r.direction === 'income') b.income += r.amountCents;
    else b.expense += r.amountCents;
  }
  for (const b of map.values()) b.net = b.income - b.expense;
  return keys.map((k) => map.get(k)!);
}

export type CategoryShare = {
  category: string;
  cents: number;
  /** 占比，0~100，保留一位小数 */
  percent: number;
};

/**
 * 类别占比，降序。超过 topN 的合并成「其他」。
 *
 * 百分比刻意**不做凑整到 100**：显示上宁可 99.9% 也不要为了凑数把某一项改掉，
 * 那会让用户拿计算器一算发现对不上。
 */
export function categoryShare(
  rows: StatRow[],
  direction: Direction,
  topN = 8,
): CategoryShare[] {
  const map = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    if (r.direction !== direction) continue;
    map.set(r.category, (map.get(r.category) ?? 0) + r.amountCents);
    total += r.amountCents;
  }
  if (total === 0) return [];

  const sorted = [...map.entries()]
    .map(([category, cents]) => ({ category, cents }))
    .sort((a, b) => b.cents - a.cents || (a.category < b.category ? -1 : 1));

  const head = sorted.slice(0, topN);
  const tail = sorted.slice(topN);
  const result = head.map((h) => ({
    ...h,
    percent: Math.round((h.cents / total) * 1000) / 10,
  }));
  if (tail.length > 0) {
    const cents = tail.reduce((a, t) => a + t.cents, 0);
    result.push({
      category: '其他',
      cents,
      percent: Math.round((cents / total) * 1000) / 10,
    });
  }
  return result;
}

export type Comparison = {
  /** 当期值 */
  current: number;
  /** 对比期值 */
  previous: number;
  /** 变化率（%）。对比期为 0 时为 null —— 除以 0 没有意义，界面显示"—" */
  changePercent: number | null;
};

function compare(current: number, previous: number): Comparison {
  if (previous === 0) return { current, previous, changePercent: null };
  return {
    current,
    previous,
    changePercent: Math.round(((current - previous) / previous) * 1000) / 10,
  };
}

/**
 * 环比：本月 vs 上月。
 * buckets 必须是升序连续月份（recentMonthKeys 的产物）。
 */
export function monthOverMonth(buckets: MonthBucket[]): {
  income: Comparison;
  expense: Comparison;
} | null {
  if (buckets.length < 2) return null;
  const cur = buckets[buckets.length - 1];
  const prev = buckets[buckets.length - 2];
  return {
    income: compare(cur.income, prev.income),
    expense: compare(cur.expense, prev.expense),
  };
}

/**
 * 同比：本月 vs 去年同月。
 *
 * 两种情况返回 null，界面显示「还没满一年」：
 *   1. 窗口不足 13 个月 —— 压根拿不到去年同月
 *   2. 去年同月**一条记录都没有** —— 说明用户那时还没开始用这个应用
 *
 * 第 2 条是有意的：那种情况下逐项算出来的都是 changePercent = null（除以 0），
 * 界面会显示两个「—」，读起来像"算过了但算不出来"，而事实是"没得算"。
 * 代价是把"去年同月真的一分钱没花"也归到这一类 —— 个人账本里这两者
 * 实际无法区分，而且后者远比前者罕见。
 */
export function yearOverYear(buckets: MonthBucket[]): {
  income: Comparison;
  expense: Comparison;
} | null {
  if (buckets.length < 13) return null;
  const cur = buckets[buckets.length - 1];
  const lastYear = buckets[buckets.length - 13];
  if (lastYear.income === 0 && lastYear.expense === 0) return null;
  return {
    income: compare(cur.income, lastYear.income),
    expense: compare(cur.expense, lastYear.expense),
  };
}

/** 折线图用：把桶映射成 0~1 的高度比例。全 0 时返回全 0，不做除零 */
export function normalizeSeries(values: number[]): number[] {
  const max = Math.max(...values, 0);
  if (max <= 0) return values.map(() => 0);
  return values.map((v) => Math.max(0, v) / max);
}

/** 汇总窗口内的总量，给顶部的概览卡片用 */
export function totals(buckets: MonthBucket[]): {
  income: number;
  expense: number;
  net: number;
  avgMonthlyExpense: number;
} {
  const income = buckets.reduce((a, b) => a + b.income, 0);
  const expense = buckets.reduce((a, b) => a + b.expense, 0);
  // 平均只算**有记录的月份**，否则新用户用了 2 个月却被 12 个月摊薄，数字没意义
  const activeMonths = buckets.filter((b) => b.income > 0 || b.expense > 0).length;
  return {
    income,
    expense,
    net: income - expense,
    avgMonthlyExpense: activeMonths > 0 ? Math.round(expense / activeMonths) : 0,
  };
}
