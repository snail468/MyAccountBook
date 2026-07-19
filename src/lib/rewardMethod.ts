export const REWARD_METHODS = [
  { key: 'cash', label: '现金' },
  { key: 'jdcard', label: '京东卡' },
  { key: 'qcoin', label: 'Q币' },
  { key: 'carrotcoin', label: '萝卜币' },
  { key: 'merch', label: '周边' },
] as const;

export type RewardMethodKey = (typeof REWARD_METHODS)[number]['key'];

export const REWARD_METHOD_KEYS: RewardMethodKey[] = REWARD_METHODS.map((r) => r.key);

export function rewardMethodLabel(key: string | null | undefined): string {
  if (!key) return '';
  return REWARD_METHODS.find((r) => r.key === key)?.label ?? key;
}
