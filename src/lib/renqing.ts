export const RENQING_CATEGORIES = [
  '婚礼',
  '生子满月',
  '寿诞过寿',
  '乔迁暖房',
  '升学金榜',
  '白事慰问',
  '探病慰问',
  '过年拜年',
  '其他',
] as const;

export const PERSON_GROUPS = [
  { key: 'relative', label: '亲戚' },
  { key: 'friend', label: '朋友' },
  { key: 'colleague', label: '同事' },
  { key: 'classmate', label: '同学' },
  { key: 'other', label: '其他' },
] as const;

export function getGroupLabel(groupKey: string): string {
  const g = PERSON_GROUPS.find((item) => item.key === groupKey);
  return g ? g.label : '其他';
}

export function formatCents(cents: number): string {
  return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
}
