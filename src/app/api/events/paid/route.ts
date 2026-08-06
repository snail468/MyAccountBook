import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSessionUser, resolveOwnLedgerId } from '@/lib/ownership';
import { badRequest, notFound } from '@/lib/apiError';
import { isLedgerRole, roleAtLeast } from '@/lib/ledgerRole';
import { buildEventTree } from '@/lib/taoyuanSerialize';
import {
  CREATED_DESC_ORDER,
  createdCursorWhere,
  decodeCursor,
  parsePageSize,
  slicePageByCreated,
} from '@/lib/pagination';
import { NOT_DELETED } from '@/lib/softDelete';

// GET /api/events/paid?cursor=<游标>&limit=20
//
// 只分页"已到账"归档 —— 这是桃源账本里唯一会无限增长的桶。
// published/predicted/announced 是用户正在跟踪的活跃项，数量天然有界，
// 由页面一次性加载，保证 MergeBar 合并操作能看到全部候选。
export async function GET(req: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const url = new URL(req.url);
  const limit = parsePageSize(url.searchParams.get('limit'));
  const cursor = decodeCursor(url.searchParams.get('cursor'));

  // Phase 2：读默认走"我 owner 的 taoyuan 账本"；显式带 ledgerId 走该账本（需 viewer 起）
  const ledgerId = await resolveTaoyuanRead(user.id, url.searchParams.get('ledgerId'));
  if (ledgerId instanceof Response) return ledgerId;

  const rows = await prisma.event.findMany({
    where: {
      ledgerId,
      ...NOT_DELETED,
      status: 'paid',
      parentId: null,
      ...createdCursorWhere(cursor),
    },
    include: {
      amounts: { where: { deletedAt: null }, orderBy: { occurredAt: 'asc' } },
    },
    orderBy: CREATED_DESC_ORDER,
    take: limit + 1,
  });

  const { items, nextCursor } = slicePageByCreated(rows, limit);

  // 子活动必须跟着父活动一起返回，否则合并过的卡片在列表里会散架
  const children =
    items.length > 0
      ? await prisma.event.findMany({
          where: {
            ledgerId,
            ...NOT_DELETED,
            parentId: { in: items.map((e) => e.id) },
          },
          include: {
            amounts: { where: { deletedAt: null }, orderBy: { occurredAt: 'asc' } },
          },
        })
      : [];

  return NextResponse.json({
    events: buildEventTree(items, children),
    nextCursor,
  });
}

async function resolveTaoyuanRead(
  userId: string,
  explicit: string | null,
): Promise<string | Response> {
  if (!explicit) return resolveOwnLedgerId(userId, 'taoyuan');
  const ledger = await prisma.ledger.findUnique({
    where: { id: explicit },
    select: {
      kind: true,
      members: { where: { userId }, select: { role: true }, take: 1 },
    },
  });
  if (!ledger || ledger.kind !== 'taoyuan') return notFound('账本不存在');
  const rawRole = ledger.members[0]?.role;
  if (!rawRole || !isLedgerRole(rawRole)) return notFound('账本不存在');
  if (!roleAtLeast(rawRole, 'viewer')) return notFound('账本不存在');
  return explicit;
}
void badRequest;
