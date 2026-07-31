import { NextResponse } from 'next/server';
import { requireSessionUser } from '@/lib/ownership';
import { badRequest } from '@/lib/apiError';
import { hasAnyFilter, mergeAndSlice, parseSearchParams } from '@/lib/search';
import { runSearch } from '@/lib/searchExecute';

// GET /api/search?q=&from=&to=&minCents=&maxCents=&category=&tag=&direction=&sources=&cursor=&limit=
//
// 跨四个账本的全局搜索。参数语义与「哪些条件对哪个来源不适用」见 lib/search.ts。
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const url = new URL(req.url);
  const parsed = parseSearchParams(url.searchParams);
  if (!parsed.ok) return badRequest(parsed.reason);
  const filters = parsed.filters;

  // 一个条件都没有时返回空而不是把整个库倒出来 ——
  // 用户刚打开搜索页还没输入，不该触发四张全表扫描
  if (!hasAnyFilter(filters)) {
    return NextResponse.json({
      hits: [],
      nextCursor: null,
      empty: true,
      hint: '输入关键字或设置筛选条件后开始搜索',
    });
  }

  const { groups } = await runSearch(user.id, filters);
  const { items, nextCursor } = mergeAndSlice(groups, filters.limit);

  return NextResponse.json({
    hits: items.map((h) => ({
      ...h,
      occurredAt: h.occurredAt.toISOString(),
    })),
    nextCursor,
    empty: false,
  });
}
