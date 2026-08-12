import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSessionUser, resolveOwnLedgerId } from '@/lib/ownership';
import { badRequest, notFound } from '@/lib/apiError';
import { roleAtLeast, isLedgerRole } from '@/lib/ledgerRole';
import { PRESET_CATEGORIES } from '@/lib/categories';
import {
  cursorWhere,
  decodeCursor,
  parsePageSize,
  slicePage,
  TIME_DESC_ORDER,
} from '@/lib/pagination';
import { NOT_DELETED } from '@/lib/softDelete';

// GET /api/entries?direction=expense&cursor=<游标>&limit=50[&ledgerId=<id>]
//
// 兼容旧客户端："没带 ledgerId → 用当前用户 owner 的 work 账本"。带了 ledgerId
// 则必须是 work kind 且请求方是成员（viewer 起）。这一层策略与 GeneralEntry 的
// /api/ledgers/[id]/entries 一致：读用 viewer，写用 editor。
export async function GET(req: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const url = new URL(req.url);
  const explicitLedger = url.searchParams.get('ledgerId');
  const ledgerId = await resolveWorkLedger(user.id, explicitLedger, 'viewer');
  if (ledgerId instanceof Response) return ledgerId;

  const limit = parsePageSize(url.searchParams.get('limit'));
  const cursor = decodeCursor(url.searchParams.get('cursor'));
  const dirParam = url.searchParams.get('direction');
  const direction =
    dirParam === 'income' || dirParam === 'expense' ? dirParam : undefined;
  // 增量同步：?since=<ISO> 只返回水位之后的变更（新建/编辑/软删）。
  const sinceParam = url.searchParams.get('since');
  const since = sinceParam ? new Date(sinceParam) : null;

  const rows = await prisma.entry.findMany({
    where: {
      ledgerId,
      ...(since
        ? { OR: [{ updatedAt: { gt: since } }, { deletedAt: { gt: since } }] }
        : NOT_DELETED),
      ...(direction ? { direction } : {}),
      ...cursorWhere(since ? null : cursor),
    },
    orderBy: TIME_DESC_ORDER,
    take: since ? undefined : limit + 1,
  });

  const { items, nextCursor } = since
    ? { items: rows, nextCursor: null }
    : slicePage(rows, limit);

  return NextResponse.json({
    // 能力标志：客户端据此从「全量对账」切换为「增量应用」。
    incremental: true,
    entries: items.map((e) => ({
      id: e.id,
      yearMonth: e.yearMonth,
      category: e.category,
      direction: e.direction,
      amountCents: e.amountCents,
      note: e.note,
      occurredAt: e.occurredAt.toISOString(),
      refundedAt: e.refundedAt?.toISOString() ?? null,
      updatedAt: e.updatedAt.toISOString(),
      deletedAt: e.deletedAt?.toISOString() ?? null,
    })),
    nextCursor,
  });
}

const bodySchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  category: z.string().trim().min(1).max(32),
  direction: z.enum(['income', 'expense']),
  amountCents: z.number().int().positive().max(1_000_000_00),
  note: z.string().max(200).optional().nullable(),
  occurredAt: z.string().datetime().optional().nullable(),
  // 离线队列幂等键：同 (ledgerId, clientId) 直接返回已有 id。见 lib/offlineQueue.ts
  clientId: z.string().length(36).optional().nullable(),
  // 可选：显式指定写入哪个 work 账本。留空表示"我 owner 的那本"。
  // 显式传时后端会校验：账本存在、kind=work、请求方是 editor 起。
  ledgerId: z.string().min(1).optional().nullable(),
});

export async function POST(req: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest();
  const { yearMonth, category, direction, amountCents, note, occurredAt, clientId } = parsed.data;

  const ledgerId = await resolveWorkLedger(user.id, parsed.data.ledgerId ?? null, 'editor');
  if (ledgerId instanceof Response) return ledgerId;

  // 如果是预设类别，强制方向以预设为准
  const preset = PRESET_CATEGORIES.find((c) => c.name === category);
  const finalDirection = preset ? preset.direction : direction;

  // 幂等：客户端传了 clientId 时先查 —— 之前入过的直接返回原 id
  if (clientId) {
    const existing = await prisma.entry.findUnique({
      where: { ledgerId_clientId: { ledgerId, clientId } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ ok: true, id: existing.id, deduped: true });
    }
  }

  try {
    const entry = await prisma.entry.create({
      data: {
        userId: user.id,
        ledgerId,
        yearMonth,
        category,
        direction: finalDirection,
        amountCents,
        note: note?.trim() || null,
        occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
        clientId: clientId ?? null,
      },
    });
    return NextResponse.json({ ok: true, id: entry.id });
  } catch (err) {
    // UNIQUE 约束兜底：查完到 create 之间的竞态窗口
    if (
      clientId &&
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      const existing = await prisma.entry.findUnique({
        where: { ledgerId_clientId: { ledgerId, clientId } },
        select: { id: true },
      });
      if (existing) return NextResponse.json({ ok: true, id: existing.id, deduped: true });
    }
    throw err;
  }
}

// 解析要落到哪个 work Ledger：显式 ledgerId → 校验；没传 → 用户 owner 的那本
// （bootstrap 兜底）。返回 Response 表示校验失败，直接 return。
async function resolveWorkLedger(
  userId: string,
  explicit: string | null,
  minRole: 'viewer' | 'editor',
): Promise<string | Response> {
  if (!explicit) {
    return resolveOwnLedgerId(userId, 'work');
  }
  const ledger = await prisma.ledger.findUnique({
    where: { id: explicit },
    select: {
      kind: true,
      members: { where: { userId }, select: { role: true }, take: 1 },
    },
  });
  if (!ledger || ledger.kind !== 'work') return notFound('账本不存在');
  const rawRole = ledger.members[0]?.role;
  if (!rawRole || !isLedgerRole(rawRole)) return notFound('账本不存在');
  if (!roleAtLeast(rawRole, minRole)) return notFound('账本不存在');
  return explicit;
}
