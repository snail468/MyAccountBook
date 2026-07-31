export const REWARD_METHODS = [
  { key: 'cash', label: '现金' },
  { key: 'jdcard', label: '京东卡' },
  { key: 'qcoin', label: 'Q币' },
  { key: 'carrotcoin', label: '萝卜币' },
  { key: 'merch', label: '周边' },
] as const;

export type RewardMethodKey = (typeof REWARD_METHODS)[number]['key'];

export const REWARD_METHOD_KEYS: RewardMethodKey[] = REWARD_METHODS.map((r) => r.key);

/**
 * 奖励的计量方式。**不是所有奖励都能用金额表示**：
 *
 *   money  现金、京东卡 —— 有明确面值，参与所有金额合计
 *   count  Q币、萝卜币 —— 按「个」发，个数不是钱，绝不能加进收入
 *   text   周边、自定义 —— 压根没有数量概念，只有"是什么"
 *
 * 这个区分是整条链路的分叉点：录入界面用哪种输入框、首页与统计页要不要计入
 * 金额合计、导出怎么写，全都看它。
 */
export type RewardValueKind = 'money' | 'count' | 'text';

/** 个数类奖励的单位，用于「Q币 200 个」这样的展示 */
export const COUNT_UNIT: Record<string, string> = {
  qcoin: '个',
  carrotcoin: '个',
};

export function rewardValueKind(method: string | null | undefined): RewardValueKind {
  if (!method) return 'money'; // 没选方式时按金额处理，与历史数据一致
  if (method.startsWith('custom:')) return 'text';
  if (method === 'qcoin' || method === 'carrotcoin') return 'count';
  if (method === 'merch') return 'text';
  // cash / jdcard 以及任何将来新增的未知 key 都按金额兜底 ——
  // 兜底成 money 是有意的：新增一种现金等价物时不改这里也不会算错账，
  // 而兜底成 text 会让它悄悄从收入里消失
  return 'money';
}

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

