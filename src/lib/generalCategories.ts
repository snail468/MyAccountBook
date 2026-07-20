export type GeneralCategoryDirection = 'income' | 'expense';

export type GeneralCategory = {
  name: string;
  icon: string;
  direction: GeneralCategoryDirection;
};

export const GENERAL_EXPENSE_CATEGORIES: GeneralCategory[] = [
  { name: '餐饮', icon: '🍜', direction: 'expense' },
  { name: '交通', icon: '🚌', direction: 'expense' },
  { name: '购物', icon: '🛍️', direction: 'expense' },
  { name: '居住', icon: '🏠', direction: 'expense' },
  { name: '娱乐', icon: '🎬', direction: 'expense' },
  { name: '医疗', icon: '💊', direction: 'expense' },
  { name: '人情', icon: '🎁', direction: 'expense' },
  { name: '学习', icon: '📚', direction: 'expense' },
  { name: '其它支出', icon: '💸', direction: 'expense' },
];

export const GENERAL_INCOME_CATEGORIES: GeneralCategory[] = [
  { name: '工资', icon: '💰', direction: 'income' },
  { name: '奖金', icon: '🎊', direction: 'income' },
  { name: '副业', icon: '💡', direction: 'income' },
  { name: '理财', icon: '📈', direction: 'income' },
  { name: '红包', icon: '🧧', direction: 'income' },
  { name: '其它收入', icon: '💵', direction: 'income' },
];

export const ALL_GENERAL_CATEGORIES: GeneralCategory[] = [
  ...GENERAL_EXPENSE_CATEGORIES,
  ...GENERAL_INCOME_CATEGORIES,
];

export function iconOf(name: string): string {
  return ALL_GENERAL_CATEGORIES.find((c) => c.name === name)?.icon ?? '📝';
}

export function directionOfGeneral(
  name: string,
  fallback: GeneralCategoryDirection = 'expense',
): GeneralCategoryDirection {
  const p = ALL_GENERAL_CATEGORIES.find((c) => c.name === name);
  return p ? p.direction : fallback;
}
