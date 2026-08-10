// 用户偏好（存 User.preferences JSON 列）。
//
// 使用原则：
//   * 缺字段 = 默认值 —— 让老用户零迁移进入新功能
//   * 坏 JSON 一律兜底成默认，不抛异常（否则一个手工写坏的字段能让整个
//     首页 500）
//   * 合并写入而不是覆盖：PATCH 只改传入的字段，其它偏好保留

/**
 * 首页"总收入 A"组成的开关。key 用**稳定字符串**做主键，不用字母 ——
 * 字母（B/C/D/E…）是渲染时按顺序算出来的展示层概念，会随账本增删漂移；
 * key 必须跟具体来源绑定：
 *   * 'work'                     → 工作账本进项 (+)
 *   * 'taoyuan:cash'             → 桃源现金奖励 (+)
 *   * 'taoyuan:jd'               → 桃源京东卡奖励 (+)
 *   * 'general:<id>'             → 具体一本普通账本的进项 (+)
 *   * 'general-expense:<id>'     → 具体一本普通账本的出项 (-)
 *   * 'travel-expense:<id>'      → 具体一本旅游账本的出项，基准币种累计 (-)
 *
 * 工作/桃源的出项**不出现**在这里：工作出项本质是垫款迟早回款，
 * 桃源没有出项概念（活动只有 predicted/announced/paid 三段进项）。
 *
 * 值缺失或 true 都视为启用（默认全开）；显式 false 才是禁用。这样新加一本
 * 账本、新加一个来源都会自动出现在 A 里 —— 不想要就手动 toggle 掉。
 *
 * 字段名沿用 incomeComponents 是历史包袱（v1 只有进项分量），如今它其实是
 * "A 的所有分量（进项与出项）"的 map。不改名避免老数据兼容判据变复杂。
 */
export type IncomeComponentKey =
  | 'work'
  | 'taoyuan:cash'
  | 'taoyuan:jd'
  | `general:${string}`
  | `general-expense:${string}`
  | `travel-expense:${string}`;

export type UserPrefs = {
  incomeComponents?: Record<string, boolean>;
  /**
   * 受邀注册的新用户：跳过自动建"工作账本 / 桃源账本"，只保留受邀协同的账本。
   * 缺省（undefined / false）仍按老逻辑补建默认账本。
   */
  skipDefaultLedgers?: boolean;
  /**
   * 由管理员直接添加（而非自行注册/受邀）的新用户：首次登录后应弹出「使用引导」。
   * 登录接口读到该标记为 true 时，会在本次响应里带上 needsOnboarding 并告知前端
   * 跳 `/?welcome=1`，同时把该标记清掉（一次性，避免每次登录都弹）。
   * 缺省 undefined / false 视为不需要。
   */
  needsOnboarding?: boolean;
};

const DEFAULT_PREFS: UserPrefs = {};

/** 从 DB 列（string | null）解析出 UserPrefs。坏数据兜底成 {}。 */
export function parsePrefs(json: string | null | undefined): UserPrefs {
  if (!json) return { ...DEFAULT_PREFS };
  try {
    const v = JSON.parse(json);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return v as UserPrefs;
    }
  } catch {
    /* 坏 JSON —— 老数据 / 手工改错，退回默认 */
  }
  return { ...DEFAULT_PREFS };
}

export function stringifyPrefs(p: UserPrefs): string {
  return JSON.stringify(p);
}

/** 判某个来源是否启用（缺失=启用；仅 false 才禁用）。 */
export function isIncomeComponentEnabled(
  prefs: UserPrefs,
  key: IncomeComponentKey,
): boolean {
  const m = prefs.incomeComponents;
  if (!m) return true;
  return m[key] !== false;
}

/**
 * 合并局部更新到现有 prefs。PATCH 语义 —— 传入的字段覆盖，未传的保留。
 * incomeComponents 内部也是浅合并，不是替换整个 map。
 */
export function mergePrefs(current: UserPrefs, patch: Partial<UserPrefs>): UserPrefs {
  const next: UserPrefs = { ...current };
  if (patch.incomeComponents) {
    next.incomeComponents = {
      ...(current.incomeComponents ?? {}),
      ...patch.incomeComponents,
    };
  }
  return next;
}

/**
 * 把索引（B 起）映射成字母。indexFromB=0 → 'B', 24 → 'Z', 25 → 'AA', 50 → 'AZ', 51 → 'BA'…
 *
 * 用的是电子表格 A/B/C…AA/AB… 的双射进制转换，只是起点偏移到 'B'（因为 A 已经被
 * 总收入本身占了）。个人账本极其罕见超过 22 本，AA+ 分支只是兜底。
 */
export function letterFor(indexFromB: number): string {
  // 想要的映射：indexFromB=0 → spreadsheet-column(2), 24 → col(26)='Z', 25 → col(27)='AA'
  let n = 2 + indexFromB;
  let s = '';
  while (n > 0) {
    n -= 1;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}
