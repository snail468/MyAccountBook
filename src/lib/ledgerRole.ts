// 账本协作角色（B7）。
//
// 三档：owner > editor > viewer。字符串枚举，方便存 SQLite。
//
// 权限矩阵（对应到路由的最小门槛）：
//   viewer：GET 列表 / 详情 / 导出（自己作为成员的账本）
//   editor：viewer 全部 + 增删改条目、软删条目
//   owner ：editor 全部 + 改账本设置、邀请/踢人/改角色、软删/恢复/永删账本
//
// 老的"归属校验"语义 = owner。所以旧接口在过渡期都用 requireLedgerRole('owner')
// 来替换 requireOwnedLedger，行为不变；然后按业务需要放宽到 editor / viewer。
export const LEDGER_ROLES = ['owner', 'editor', 'viewer'] as const;
export type LedgerRole = (typeof LEDGER_ROLES)[number];

// 数值越大权限越高，比较时用 rank
const RANK: Record<LedgerRole, number> = { viewer: 1, editor: 2, owner: 3 };

export function isLedgerRole(x: unknown): x is LedgerRole {
  return typeof x === 'string' && (LEDGER_ROLES as readonly string[]).includes(x);
}

/** actualRole 是否满足 minRole 门槛 */
export function roleAtLeast(actualRole: LedgerRole, minRole: LedgerRole): boolean {
  return RANK[actualRole] >= RANK[minRole];
}

/**
 * 受邀者视角下，共享账本的显示名加上 owner 前缀，用来区分
 * "自己那本" 和 "别人分享给自己的同类型账本"。
 * A 把自己的"家庭账本"分给 B，B 侧就会看到 "A · 家庭账本"，
 * 和 B 自己那本"家庭账本"并排也不会混淆。
 *
 * 本人 owner 的账本不加前缀（首页/编辑等入口保持原样）。
 * ownerUsername 缺失时也不加 —— 避免出现 "· xxx" 这种断腿字符串。
 */
export function displaySharedLedgerName(
  name: string,
  ownerId: string,
  viewerId: string,
  ownerUsername: string | null | undefined,
): string {
  if (ownerId === viewerId) return name;
  if (!ownerUsername) return name;
  return `${ownerUsername} · ${name}`;
}
