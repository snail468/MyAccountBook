import { prisma } from '@/lib/db';
import { requireUser, requireUserWithRole } from '@/lib/session';
import { forbidden, notFound, unauthorized } from '@/lib/apiError';

// 「取当前用户 → 查资源 → 校验归属」这套前导，改造前在每个 route handler 里
// 手写一遍，7 个文件各有一份 ownLedger/ensureOwn（其中 4 份逐字相同），
// 活动相关的路由甚至连函数都没抽，直接内联在 handler 里。
//
// 收敛到这里的好处不只是少写几行：归属校验失败该返回什么状态码、要不要区分
// 「不存在」和「不属于你」，这类决定散在 30 个文件里就一定会走样 ——
// 事实上改造前就已经有 '不存在' / '账本不存在' / 'not found' 三种说法了。
// 判定规则见 lib/apiError.ts 顶部。
//
// 用法：返回值要么是拿到的上下文，要么是**已经构造好的错误响应**，直接 return。
//
//   const ctx = await requireOwnedLedger(id, { kind: 'travel' });
//   if (ctx instanceof Response) return ctx;
//   const { user, ledger } = ctx;
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
};

export async function requireOwnedLedger(
  ledgerId: string,
  opts: LedgerOptions = {},
): Promise<{ user: SessionUser; ledger: OwnedLedger } | Response> {
  const user = await requireUser();
  if (!user) return unauthorized();

  const ledger = await prisma.ledger.findUnique({
    where: { id: ledgerId },
    select: { id: true, userId: true, kind: true, deletedAt: true },
  });
  // 不存在与不属于你走同一个分支 —— 区别对待等于泄露 id 是否存在
  if (!ledger || ledger.userId !== user.id) return notFound(opts.message ?? '账本不存在');
  if (opts.kind && ledger.kind !== opts.kind) return notFound(opts.kindMessage ?? '账本类型不符');

  return { user, ledger };
}

export type OwnedGeneralEntry = { ledgerId: string; imageUrls: string | null };

/** 普通账本下的一条记账。imageUrls 一并取出：删除/改图时要清理不再被引用的文件 */
export async function requireOwnedGeneralEntry(
  ledgerId: string,
  entryId: string,
): Promise<{ user: SessionUser; entry: OwnedGeneralEntry } | Response> {
  const user = await requireUser();
  if (!user) return unauthorized();

  const entry = await prisma.generalEntry.findUnique({
    where: { id: entryId },
    select: { ledgerId: true, imageUrls: true, ledger: { select: { userId: true } } },
  });
  if (!entry || entry.ledgerId !== ledgerId || entry.ledger.userId !== user.id) {
    return notFound();
  }
  return { user, entry: { ledgerId: entry.ledgerId, imageUrls: entry.imageUrls } };
}

export type OwnedTripExpense = { ledgerId: string; imageUrls: string | null };

/** 旅游账本下的一笔开支 */
export async function requireOwnedTripExpense(
  ledgerId: string,
  expenseId: string,
): Promise<{ user: SessionUser; expense: OwnedTripExpense } | Response> {
  const user = await requireUser();
  if (!user) return unauthorized();

  const expense = await prisma.tripExpense.findUnique({
    where: { id: expenseId },
    select: { ledgerId: true, imageUrls: true, ledger: { select: { userId: true } } },
  });
  if (!expense || expense.ledgerId !== ledgerId || expense.ledger.userId !== user.id) {
    return notFound();
  }
  return { user, expense: { ledgerId: expense.ledgerId, imageUrls: expense.imageUrls } };
}

/** 工作账本的条目直接挂在 user 下，没有中间的 ledger */
export async function requireOwnedEntry(
  entryId: string,
): Promise<{ user: SessionUser; entry: { id: string } } | Response> {
  const user = await requireUser();
  if (!user) return unauthorized();

  const entry = await prisma.entry.findUnique({
    where: { id: entryId },
    select: { id: true, userId: true },
  });
  if (!entry || entry.userId !== user.id) return notFound();
  return { user, entry: { id: entry.id } };
}

export type OwnedEvent = { id: string; userId: string };

/** 桃源账本的活动 */
export async function requireOwnedEvent(
  eventId: string,
): Promise<{ user: SessionUser; event: OwnedEvent } | Response> {
  const user = await requireUser();
  if (!user) return unauthorized();

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, userId: true },
  });
  if (!event || event.userId !== user.id) return notFound();
  return { user, event };
}

/** 活动下的一条金额 */
export async function requireOwnedEventAmount(
  eventId: string,
  amountId: string,
): Promise<{ user: SessionUser; amount: { eventId: string } } | Response> {
  const user = await requireUser();
  if (!user) return unauthorized();

  const amount = await prisma.eventAmount.findUnique({
    where: { id: amountId },
    select: { eventId: true, event: { select: { userId: true } } },
  });
  if (!amount || amount.eventId !== eventId || amount.event.userId !== user.id) {
    return notFound();
  }
  return { user, amount: { eventId: amount.eventId } };
}
