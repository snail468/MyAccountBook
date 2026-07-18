export type Direction = 'income' | 'expense';

export type PresetCategory = { name: string; direction: Direction };

export const PRESET_CATEGORIES: PresetCategory[] = [
  { name: '月工资', direction: 'income' },
  { name: '奖金', direction: 'income' },
  { name: '协同', direction: 'income' },
  { name: '房贷垫款', direction: 'expense' },
  { name: '消费贷垫款', direction: 'expense' },
  { name: '存款垫款', direction: 'expense' },
];

export function directionOf(category: string, fallback: Direction = 'income'): Direction {
  const p = PRESET_CATEGORIES.find((c) => c.name === category);
  return p ? p.direction : fallback;
}
