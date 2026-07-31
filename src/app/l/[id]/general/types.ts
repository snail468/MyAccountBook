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
};
