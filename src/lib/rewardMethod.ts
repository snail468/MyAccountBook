export const REWARD_METHODS = [
  { key: 'cash', label: '现金' },
  { key: 'jdcard', label: '京东卡' },
  { key: 'qcoin', label: 'Q币' },
  { key: 'carrotcoin', label: '萝卜币' },
  { key: 'merch', label: '周边' },
] as const;

export type RewardMethodKey = (typeof REWARD_METHODS)[number]['key'];

export const REWARD_METHOD_KEYS: RewardMethodKey[] = REWARD_METHODS.map((r) => r.key);

// 自定义方式用 "custom:名字" 表示
export function rewardMethodLabel(key: string | null | undefined): string {
  if (!key) return '';
  if (key.startsWith('custom:')) return key.slice('custom:'.length);
  return REWARD_METHODS.find((r) => r.key === key)?.label ?? key;
}

// 把 rewardMethods JSON 字符串反序列化；异常时降级为单值 rewardMethod
export function parseRewardMethods(
  rewardMethods: string | null | undefined,
  legacyRewardMethod: string | null | undefined = null,
): string[] {
  if (rewardMethods) {
    try {
      const arr = JSON.parse(rewardMethods);
      if (Array.isArray(arr)) return arr.filter((x) => typeof x === 'string');
    } catch {
      // 忽略
    }
  }
  return legacyRewardMethod ? [legacyRewardMethod] : [];
}

export function stringifyRewardMethods(methods: string[]): string | null {
  const cleaned = methods.map((m) => m.trim()).filter(Boolean);
  return cleaned.length > 0 ? JSON.stringify(cleaned) : null;
}

