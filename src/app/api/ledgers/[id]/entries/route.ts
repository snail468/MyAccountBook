import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireOwnedLedger } from '@/lib/ownership';
import { badRequest } from '@/lib/apiError';
import { parseImageUrls } from '@/lib/imageCleanup';
import {
  cursorWhere,
  decodeCursor,
  parsePageSize,
  slicePage,
  TIME_DESC_ORDER,
} from '@/lib/pagination';
import { NOT_DELETED } from '@/lib/softDelete';

const bodySchema = z.object({
  direction: z.enum(['income', 'expense']),
  category: z.string().trim().min(1).max(32),
  amountCents: z.number().int().positive().max(1_000_000_00),
  tags: z.string().max(200).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
  imageUrls: z.array(z.string().max(500)).max(9).optional(),
  occurredAt: z.string().datetime().optional().nullable(),
  // 离线记账幂等键：客户端入队时生成 UUID，网络失败重试或联网补交时都用同一个值。
  // 服务端见到相同 (ledgerId, clientId) 就返回已有的 id —— 见 lib/offlineQueue.ts。
  // 格式限 UUID v4 长度，防止用户手工传"a"这种短字符串把 UNIQUE 索引空间用光
  clientId: z.string().length(36).optional().nullable(),
});

// GET /api/ledgers/<id>/entries?cursor=<游标>&limit=50
// 供客户端"加载更多"翻页。首屏那一页由 server component 直接查，不走这里。
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // GET 是只读列表 —— 协作者能看
  const ctx = await requireOwnedLedger(id, {
    kind: 'general',
    kindMessage: '仅普通账本可用',
    minRole: 'viewer',
  });
  if (ctx instanceof Response) return ctx;

  const url = new URL(req.url);
  const limit = parsePageSize(url.searchParams.get('limit'));
  const cursor = decodeCursor(url.searchParams.get('cursor'));
  // 增量同步：?since=<ISO> 只返回水位之后的变更（新建/编辑/软删）。
  const sinceParam = url.searchParams.get('since');
  const since = sinceParam ? new Date(sinceParam) : null;

  const rows = await prisma.generalEntry.findMany({
    where: {
      ledgerId: id,
      ...(since
        ? { OR: [{ updatedAt: { gt: since } }, { deletedAt: { gt: since } }] }
        : NOT_DELETED),
      ...cursorWhere(since ? null : cursor),
    },
    orderBy: TIME_DESC_ORDER,
    take: since ? undefined : limit + 1, // 增量模式不分页，全量返回变更
  });

  const { items, nextCursor } = since
    ? { items: rows, nextCursor: null }
    : slicePage(rows, limit);

  return NextResponse.json({
    // 能力标志：客户端据此从「全量对账」切换为「增量应用」（upsert 变更 + 标记软删）。
    incremental: true,
    entries: items.map((e) => ({
      id: e.id,
      direction: e.direction,
      category: e.category,
      amountCents: e.amountCents,
      tags: e.tags,
      note: e.note,
      imageUrls: parseImageUrls(e.imageUrls),
      occurredAt: e.occurredAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
      deletedAt: e.deletedAt?.toISOString() ?? null,
    })),
    nextCursor,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // 记账是写操作，editor 起
  const ctx = await requireOwnedLedger(id, {
    kind: 'general',
    kindMessage: '仅普通账本可用',
    minRole: 'editor',
  });
  if (ctx instanceof Response) return ctx;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest();
  const p = parsed.data;

  // 幂等：客户端传了 clientId 时先查 —— 之前入过的直接返回原 id，
  // 不再插一条重复。**不返回 409** —— 从调用方视角这就是"我的写入已被接受"。
  //
  // 竞态窗口：查完还没插入之前如果同一个 clientId 又来一次，会有 UNIQUE
  // 索引兜住，第二个 create 抛错。补一层 catch → 再查一遍返回它。
  if (p.clientId) {
    const existing = await prisma.generalEntry.findUnique({
      where: {
        ledgerId_clientId: { ledgerId: id, clientId: p.clientId },
      },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ ok: true, id: existing.id, deduped: true });
    }
  }

  try {
    const created = await prisma.generalEntry.create({
      data: {
        ledgerId: id,
        direction: p.direction,
        category: p.category,
        amountCents: p.amountCents,
        tags: p.tags?.trim() || null,
        note: p.note?.trim() || null,
        imageUrls: p.imageUrls && p.imageUrls.length > 0 ? JSON.stringify(p.imageUrls) : null,
        occurredAt: p.occurredAt ? new Date(p.occurredAt) : new Date(),
        clientId: p.clientId ?? null,
      },
    });
    return NextResponse.json({ ok: true, id: created.id });
  } catch (err) {
    // Prisma P2002 = 唯一约束冲突。只在带 clientId 时可能触发（历史行都是 null）
    if (
      p.clientId &&
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      const existing = await prisma.generalEntry.findUnique({
        where: { ledgerId_clientId: { ledgerId: id, clientId: p.clientId } },
        select: { id: true },
      });
      if (existing) {
        return NextResponse.json({ ok: true, id: existing.id, deduped: true });
      }
    }
    throw err;
  }
}
