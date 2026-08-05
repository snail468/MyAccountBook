// 普通账本记账时的类别智能排序。
//
// 现在类别按 GENERAL_EXPENSE_CATEGORIES / GENERAL_INCOME_CATEGORIES 里的静态顺序
// 排列 —— 用户想记「餐饮」得每次滑到第一个，但常年不用「学习」的人却看着它排在
// 「其它支出」前面。
//
// 这里按 **最近使用的时间** 重新排序：最常用的沉在前面，从来没用过的沉在后面
// 但仍然可选。判定基于最近 N 条条目（默认 100），线性扫过一次 —— 数据量级是
// 个人账本，性能不是问题。

import type { GeneralCategory } from '@/lib/generalCategories';

/** 排序时看最近多少条条目 */
export const RECENCY_WINDOW = 100;

type EntryLike = { category: string; direction: string; occurredAt: Date };

/**
 * 按最近使用重新排序类别。
 *
 * 只看**同方向**的条目 —— 收入类别的排序不该被支出使用记录影响。
 * 参数 direction 是必填的，与 `effectiveCategories(json, direction)` 配对使用。
 *
 * 排序规则：
 *   1. 有过使用记录的按最近使用时间倒序（最近用过的排前面）
 *   2. 从没用过的按原始预设顺序垫在后面（保持发现性）
 *   3. 稳定：出现顺序相同就不动
 */
export function sortCategoriesByRecency(
  categories: GeneralCategory[],
  entries: EntryLike[],
  direction: 'income' | 'expense',
): GeneralCategory[] {
  // 每个类别名 -> 最新使用时间戳（毫秒）
  const lastUsed = new Map<string, number>();
  for (const e of entries) {
    if (e.direction !== direction) continue;
    const t = e.occurredAt.getTime();
    const prev = lastUsed.get(e.category);
    if (prev === undefined || t > prev) lastUsed.set(e.category, t);
  }

  // 原始位置 —— 稳定排序时的 tiebreaker
  const origIndex = new Map<string, number>();
  categories.forEach((c, i) => origIndex.set(c.name, i));

  return [...categories].sort((a, b) => {
    const ta = lastUsed.get(a.name);
    const tb = lastUsed.get(b.name);
    // 都有用过：新用的排前
    if (ta !== undefined && tb !== undefined) return tb - ta;
    // 只有 a 用过：a 排前
    if (ta !== undefined) return -1;
    if (tb !== undefined) return 1;
    // 都没用过：按原顺序
    return (origIndex.get(a.name) ?? 0) - (origIndex.get(b.name) ?? 0);
  });
}
