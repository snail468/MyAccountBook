export type GeneralCategoryDirection = 'income' | 'expense';

export type GeneralCategory = {
  name: string;
  icon: string;
  direction: GeneralCategoryDirection;
};

// —— 预设类别 ——
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

// —— 图标库（用于自定义类别选择）——
export const ICON_LIBRARY: { group: string; icons: string[] }[] = [
  {
    group: '餐饮',
    icons: ['🍜', '🍚', '🍱', '🍔', '🍕', '🍣', '🍰', '☕', '🥤', '🍺', '🍷', '🍎', '🍇', '🥗', '🍳', '🥟'],
  },
  {
    group: '交通',
    icons: ['🚌', '🚗', '🚕', '🚇', '✈️', '🚄', '🛵', '🚲', '⛽', '🅿️', '🛴', '🚢'],
  },
  {
    group: '购物',
    icons: ['🛍️', '👗', '👟', '💄', '💍', '👜', '📱', '💻', '🎧', '⌚', '🧸', '🎮'],
  },
  {
    group: '居家',
    icons: ['🏠', '🛏️', '🛋️', '🍳', '🧴', '🧻', '💡', '🔧', '🧹', '🪴', '📦'],
  },
  {
    group: '娱乐',
    icons: ['🎬', '🎵', '🎤', '🎨', '🎭', '🎳', '🎲', '🎯', '🎪', '🏖️', '🌊', '⛰️', '🎢', '🎡', '🕹️'],
  },
  {
    group: '健康',
    icons: ['💊', '🏥', '🩺', '🦷', '👓', '🏋️', '🧘', '🚴', '⚽', '🏀', '🎾', '🧴'],
  },
  {
    group: '人情',
    icons: ['🎁', '💐', '🎂', '🎉', '💒', '👶', '🧧', '💌', '🥂'],
  },
  {
    group: '学习',
    icons: ['📚', '✏️', '🎓', '📖', '📝', '🎒', '🖥️', '📊', '🔬', '🎨'],
  },
  {
    group: '宠物',
    icons: ['🐶', '🐱', '🐰', '🐹', '🐦', '🐟', '🦴', '🥩'],
  },
  {
    group: '通讯',
    icons: ['📱', '📞', '📶', '📡', '💬', '📧', '📮'],
  },
  {
    group: '收入',
    icons: ['💰', '💵', '💴', '💶', '💷', '💳', '🏦', '📈', '💡', '🎊', '🧧', '🏆', '💎'],
  },
  {
    group: '其它',
    icons: ['💸', '📝', '🌟', '⭐', '❤️', '🔥', '⚡', '☔', '☀️', '🌙', '🌈', '🎯', '📌', '🔔'],
  },
];

// —— 用户自定义（存于 Ledger.customCategories JSON）——
export type CustomCategoriesJson = {
  added: GeneralCategory[];
  hidden: string[]; // 被隐藏的类别名（可含预设 or 自定义）
};

export function parseCustom(json: string | null | undefined): CustomCategoriesJson {
  if (!json) return { added: [], hidden: [] };
  try {
    const p = JSON.parse(json);
    return {
      added: Array.isArray(p.added) ? p.added : [],
      hidden: Array.isArray(p.hidden) ? p.hidden : [],
    };
  } catch {
    return { added: [], hidden: [] };
  }
}

export function stringifyCustom(c: CustomCategoriesJson): string {
  return JSON.stringify(c);
}

// —— 合并后的有效类别（预设 - 隐藏 + 新增）——
export function effectiveCategories(
  customJson: string | null | undefined,
  direction: GeneralCategoryDirection,
): GeneralCategory[] {
  const { added, hidden } = parseCustom(customJson);
  const presets =
    direction === 'expense' ? GENERAL_EXPENSE_CATEGORIES : GENERAL_INCOME_CATEGORIES;
  const hiddenSet = new Set(hidden);
  const kept = presets.filter((c) => !hiddenSet.has(c.name));
  const addedThis = added.filter((c) => c.direction === direction && !hiddenSet.has(c.name));
  // 去重（自定义名如果撞了预设名以自定义为准）
  const nameSet = new Set(kept.map((c) => c.name));
  const uniqAdded = addedThis.filter((c) => !nameSet.has(c.name));
  return [...kept, ...uniqAdded];
}

export function effectiveAll(customJson: string | null | undefined): GeneralCategory[] {
  return [
    ...effectiveCategories(customJson, 'expense'),
    ...effectiveCategories(customJson, 'income'),
  ];
}

// —— 查找 icon / 方向 ——
export function iconOf(name: string, customJson?: string | null): string {
  const all = customJson ? effectiveAll(customJson) : ALL_GENERAL_CATEGORIES;
  return all.find((c) => c.name === name)?.icon ?? '📝';
}

export function directionOfGeneral(
  name: string,
  customJson: string | null | undefined,
  fallback: GeneralCategoryDirection = 'expense',
): GeneralCategoryDirection {
  const all = customJson ? effectiveAll(customJson) : ALL_GENERAL_CATEGORIES;
  const p = all.find((c) => c.name === name);
  return p ? p.direction : fallback;
}
