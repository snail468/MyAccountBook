import { prisma } from '@/lib/db';
import { requireUser, requireUserWithRole } from '@/lib/session';
import { forbidden, notFound, unauthorized } from '@/lib/apiError';
import { isLedgerRole, roleAtLeast, type LedgerRole } from '@/lib/ledgerRole';

// **软删记录一律按不存在处理**：编辑/删除/PATCH 路径都不能操作回收站里的东西，
// 否则会出现"用户以为删掉的记录还能被 API 改回来"这种诡异体验。
// 恢复路径必须绕过这套助手，直接查 { id, deletedAt: { not: null } }。
// 见 src/lib/softDelete.ts。

// 「取当前用户 → 查资源 → 校验归属」这套前导，改造前在每个 route handler 里
// 手写一遍，7 个文件各有一份 ownLedger/ensureOwn（其中 4 份逐字相同），
// 活动相关的路由甚至连函数都没抽，直接内联在 handler 里。
//
// 收敛到这里的好处不只是少写几行：归属校验失败该返回什么状态码、要不要区分
// 「不存在」和「不属于你」，这类决定散在 30 个文件里就一定会走样 ——
// 事实上改造前就已经有 '不存在' / '账本不存在' / 'not found' 三种说法了。
// 判定规则见 lib/apiError.ts 顶部。
//
// B7 之后：账本归属从 "Ledger.userId === user.id" 换成 "LedgerMember 里有你"。
// 三档角色 owner/editor/viewer 见 lib/ledgerRole.ts。requireOwnedLedger 保留
// 名字与旧签名，多一个 minRole 参数（默认 owner，与老行为一致），存量调用
// 无需改。要放宽给协作者调用的路由，显式传 { minRole: 'editor' | 'viewer' }。
//
// 用法：返回值要么是拿到的上下文，要么是**已经构造好的错误响应**，直接 return。
//
//   const ctx = await requireOwnedLedger(id, { kind: 'travel' });
//   if (ctx instanceof Response) return ctx;
//   const { user, ledger, role } = ctx;
//
// NextResponse 继承自 Response，所以 instanceof 这一句同时兜住 401 和 404。

/** 账本类型。schema 里是自由 String，取值在这四个之内。 */
export type LedgerKind = 'work' | 'taoyuan' | 'general' | 'travel';

export type SessionUser = { id: string; username: string };

export type OwnedLedger = {
  id: string;
  userId: string;
  kind: string;
  /** 软删除的账本仍然算"属于你"，回收站相关路由要用它判断 */
  deletedAt: Date | null;
};

/** 只要登录态，不涉及具体资源 */
export async function requireSessionUser(): Promise<SessionUser | Response> {
  const user = await requireUser();
  if (!user) return unauthorized();
  return user;
}

/**
 * 管理员接口用。走 requireUserWithRole（会查库校验 sessionVersion），
 * 比 requireUser 重一次查询，但权限判断这种场合不能省。
 *
 * 未登录和非管理员都返回 403：这里不适用「不泄露存在性」那套 ——
 * 路径本身是公开的 /api/admin/*，藏不住，返回 401 反而会让已登录的
 * 普通用户被客户端误判成会话失效。
 */
export async function requireAdmin(): Promise<
  { id: string; username: string; role: string } | Response
> {
  const current = await requireUserWithRole();
  if (!current || current.role !== 'admin') return forbidden('仅管理员可操作');
  return current;
}

type LedgerOptions = {
  /** 限定账本类型；类型不符按 404 处理，理由见 apiError.ts */
  kind?: LedgerKind;
  /** 类型不符时的提示文案，例如「仅旅游账本可用」 */
  kindMessage?: string;
  /** 账本不存在/不属于你时的提示文案 */
  message?: string;
  /**
   * 最低角色门槛。默认 owner —— 保持与 B7 之前 "只有本人能动" 的语义一致。
   * 明确开放给协作者的路由（如"看一眼账本"、"记一笔"）传 'viewer' / 'editor'。
   *
   * 权限不足时也返回 404 而不是 403：路径本身是有效的，只是这个人碰不到，
   * 与"不存在 / 不属于你"应该给相同的信号，不让攻击者拿状态码枚举成员身份。
   */
  minRole?: LedgerRole;
};

export async function requireOwnedLedger(
  ledgerId: string,
  opts: LedgerOptions = {},
): Promise<{ user: SessionUser; ledger: OwnedLedger; role: LedgerRole } | Response> {
  const user = await requireUser();
  if (!user) return unauthorized();

  // 一次查询把 ledger 元数据 + 当前用户的成员行拿回来。
  // members: 只匹配当前 userId 的这一行（LedgerMember 上有 UNIQUE(ledgerId,userId)，
  // 最多一条）—— 用 where 过滤而不是全拉出来 filter，避免大账本上无谓的 O(n)。
  const ledger = await prisma.ledger.findUnique({
    where: { id: ledgerId },
    select: {
      id: true,
      userId: true,
      kind: true,
      deletedAt: true,
      members: {
        where: { userId: user.id },
        select: { role: true },
        take: 1,
      },
    },
  });

  const notMember = !ledger || ledger.members.length === 0;
  if (notMember) return notFound(opts.message ?? '账本不存在');
  if (opts.kind && ledger.kind !== opts.kind) return notFound(opts.kindMessage ?? '账本类型不符');

  const rawRole = ledger.members[0]!.role;
  // 数据库里的 role 理论上受插入路径约束，出现越界字符串意味着数据被人手动改坏了。
  // 保守起见按"不是成员"处理，避免赋予未知权限。
  if (!isLedgerRole(rawRole)) return notFound(opts.message ?? '账本不存在');

  const minRole = opts.minRole ?? 'owner';
  if (!roleAtLeast(rawRole, minRole)) return notFound(opts.message ?? '账本不存在');

  return {
    user,
    ledger: { id: ledger.id, userId: ledger.userId, kind: ledger.kind, deletedAt: ledger.deletedAt },
    role: rawRole,
  };
}

/**
 * 解析当前用户 owner 身份下的 work / taoyuan 账本 id。
 *
 * 用途：POST /api/entries、POST /api/events、/work 页面、/taoyuan 页面 —— 这些
 * 老入口没有 URL 里的 ledgerId 参数，语义上是"我的工作/桃源"，所以需要一个
 * 稳定入口拿到"我 owner 的那一本"。共享账本走 /l/[id]/... 路径，那边显式带
 * ledgerId 参数，不会调这个函数。
 *
 * 幂等：没有账本时补建（ledgerBootstrap 逻辑内联），保证任何时刻返回值非空。
 * 用 upsert 兜住并发 —— 两个请求同一时刻 miss，只有一条会写进去。
 */
export async function resolveOwnLedgerId(
  userId: string,
  kind: 'work' | 'taoyuan',
): Promise<string> {
  const existing = await prisma.ledger.findFirst({
    where: {
      kind,
      archived: false,
      deletedAt: null,
      members: { some: { userId, role: 'owner' } },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (existing) return existing.id;

  // 兜底：老用户 / 迁移遗漏。用一个短事务把 Ledger + LedgerMember 一起落下。
  const name = kind === 'work' ? '工作账本' : '桃源账本';
  const icon = kind === 'work' ? '💼' : '🌸';
  const created = await prisma.ledger.create({
    data: {
      userId,
      kind,
      name,
      icon,
      order: 0,
      members: { create: { userId, role: 'owner' } },
    },
    select: { id: true },
  });
  return created.id;
}

export type OwnedGeneralEntry = { ledgerId: string; imageUrls: string | null };

/** 普通账本下的一条记账。imageUrls 一并取出：删除/改图时要清理不再被引用的文件 */
export async function requireOwnedGeneralEntry(
  ledgerId: string,
  entryId: string,
  opts: { minRole?: LedgerRole } = {},
): Promise<{ user: SessionUser; entry: OwnedGeneralEntry; role: LedgerRole } | Response> {
  const user = await requireUser();
  if (!user) return unauthorized();

  const entry = await prisma.generalEntry.findUnique({
    where: { id: entryId },
    select: {
      ledgerId: true,
      imageUrls: true,
      deletedAt: true,
      ledger: {
        select: {
          members: { where: { userId: user.id }, select: { role: true }, take: 1 },
        },
      },
    },
  });
  if (!entry || entry.ledgerId !== ledgerId || entry.deletedAt !== null) return notFound();

  const rawRole = entry.ledger.members[0]?.role;
  if (!rawRole || !isLedgerRole(rawRole)) return notFound();
  const minRole = opts.minRole ?? 'editor';
  if (!roleAtLeast(rawRole, minRole)) return notFound();

  return {
    user,
    entry: { ledgerId: entry.ledgerId, imageUrls: entry.imageUrls },
    role: rawRole,
  };
}

export type OwnedTripExpense = { ledgerId: string; imageUrls: string | null };

/** 旅游账本下的一笔开支 */
export async function requireOwnedTripExpense(
  ledgerId: string,
  expenseId: string,
  opts: { minRole?: LedgerRole } = {},
): Promise<{ user: SessionUser; expense: OwnedTripExpense; role: LedgerRole } | Response> {
  const user = await requireUser();
  if (!user) return unauthorized();

  const expense = await prisma.tripExpense.findUnique({
    where: { id: expenseId },
    select: {
      ledgerId: true,
      imageUrls: true,
      deletedAt: true,
      ledger: {
        select: {
          members: { where: { userId: user.id }, select: { role: true }, take: 1 },
        },
      },
    },
  });
  if (!expense || expense.ledgerId !== ledgerId || expense.deletedAt !== null) return notFound();

  const rawRole = expense.ledger.members[0]?.role;
  if (!rawRole || !isLedgerRole(rawRole)) return notFound();
  const minRole = opts.minRole ?? 'editor';
  if (!roleAtLeast(rawRole, minRole)) return notFound();

  return {
    user,
    expense: { ledgerId: expense.ledgerId, imageUrls: expense.imageUrls },
    role: rawRole,
  };
}

/**
 * 工作账本的一条 Entry。Phase 2 之后 Entry.ledgerId 必填，权限走 LedgerMember。
 * 默认门槛 editor：所有调用点（PATCH/DELETE）都是写操作。
 * entry.userId 仍存但只是"创建者"，不再是归属判定字段。
 */
export async function requireOwnedEntry(
  entryId: string,
  opts: { minRole?: LedgerRole } = {},
): Promise<
  { user: SessionUser; entry: { id: string; ledgerId: string }; role: LedgerRole } | Response
> {
  const user = await requireUser();
  if (!user) return unauthorized();

  const entry = await prisma.entry.findUnique({
    where: { id: entryId },
    select: {
      id: true,
      ledgerId: true,
      deletedAt: true,
      ledger: {
        select: {
          members: { where: { userId: user.id }, select: { role: true }, take: 1 },
        },
      },
    },
  });
  if (!entry || entry.deletedAt !== null) return notFound();
  const rawRole = entry.ledger.members[0]?.role;
  if (!rawRole || !isLedgerRole(rawRole)) return notFound();
  const minRole = opts.minRole ?? 'editor';
  if (!roleAtLeast(rawRole, minRole)) return notFound();

  return { user, entry: { id: entry.id, ledgerId: entry.ledgerId }, role: rawRole };
}

export type OwnedEvent = { id: string; ledgerId: string };

/**
 * 桃源账本的活动。同 Entry —— ledgerId-scoped，权限走 LedgerMember。
 */
export async function requireOwnedEvent(
  eventId: string,
  opts: { minRole?: LedgerRole } = {},
): Promise<{ user: SessionUser; event: OwnedEvent; role: LedgerRole } | Response> {
  const user = await requireUser();
  if (!user) return unauthorized();

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      ledgerId: true,
      deletedAt: true,
      ledger: {
        select: {
          members: { where: { userId: user.id }, select: { role: true }, take: 1 },
        },
      },
    },
  });
  if (!event || event.deletedAt !== null) return notFound();
  const rawRole = event.ledger.members[0]?.role;
  if (!rawRole || !isLedgerRole(rawRole)) return notFound();
  const minRole = opts.minRole ?? 'editor';
  if (!roleAtLeast(rawRole, minRole)) return notFound();

  return { user, event: { id: event.id, ledgerId: event.ledgerId }, role: rawRole };
}

/** 活动下的一条金额 */
export async function requireOwnedEventAmount(
  eventId: string,
  amountId: string,
  opts: { minRole?: LedgerRole } = {},
): Promise<
  { user: SessionUser; amount: { eventId: string }; role: LedgerRole } | Response
> {
  const user = await requireUser();
  if (!user) return unauthorized();

  const amount = await prisma.eventAmount.findUnique({
    where: { id: amountId },
    select: {
      eventId: true,
      deletedAt: true,
      event: {
        select: {
          deletedAt: true,
          ledger: {
            select: {
              members: { where: { userId: user.id }, select: { role: true }, take: 1 },
            },
          },
        },
      },
    },
  });
  if (
    !amount ||
    amount.eventId !== eventId ||
    amount.deletedAt !== null ||
    amount.event.deletedAt !== null
  ) {
    return notFound();
  }
  const rawRole = amount.event.ledger.members[0]?.role;
  if (!rawRole || !isLedgerRole(rawRole)) return notFound();
  const minRole = opts.minRole ?? 'editor';
  if (!roleAtLeast(rawRole, minRole)) return notFound();

  return { user, amount: { eventId: amount.eventId }, role: rawRole };
}
