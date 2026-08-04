// 普通账本视图的共享类型。拆分组件后由多个文件引用，放在这里避免循环 import。

export type Entry = {
  id: string;
  direction: string;
  category: string;
  amountCents: number;
  tags: string | null;
  note: string | null;
  imageUrls: string[];
  occurredAt: string;
};

export type LedgerMeta = {
  id: string;
  name: string;
  icon: string | null;
  budgetCents: number | null;
  customCategories: string | null;
};

export type GeneralSummary = {
  monthStartISO: string;
  monthEndISO: string;
  income: number;
  expense: number;
  topCats: { category: string; cents: number }[];
  // 分类别月预算：{ [category name]: cents }。服务端从 customCategories.budgets 抽出来，
  // 客户端不再解析 JSON 一次。空对象表示没设任何分类预算
  categoryBudgets: Record<string, number>;
  // 分类别周预算（可与月预算并存）
  categoryBudgetsWeekly: Record<string, number>;
  // 有周预算的类别本周花销（只查了这些类别，其它类别不在 map 里）
  weeklySpend: Record<string, number>;
  weekStartISO: string;
};

// 类别智能排序用的最近使用记录。见 lib/categoryOrder.ts。
export type RecentUse = {
  category: string;
  direction: string;
  occurredAt: string; // ISO，客户端会转回 Date
};
