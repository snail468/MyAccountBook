import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSessionUser } from '@/lib/ownership';
import { badRequest, notFound } from '@/lib/apiError';
import { NOT_DELETED } from '@/lib/softDelete';

// 一次性大金额回款：8 张单据合计 3200 元，公司一次转账过来 3200 元。
// 之前只能一笔一笔标已回款，很烦。这里接受一个 ids 数组，事务里给它们
// 打同样的 refundedAt。
//
// 归属校验：所有 id 必须属于当前用户、未软删、且当前为未回款。任意一条
// 不符就整体拒绝（400），不做部分成功 —— 那会让"批量已回款"和"某几条实际
// 状态"打架，用户没法解释。
//
// 幂等性：既然要求所有 ids 都必须"当前为未回款"，重放同一个请求会得到
// 404（因为已经被标过），这是有意的 —— 明确"这次没生效"胜过静默成功。
const bodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  refundedAt: z.string().datetime().optional().nullable(),
});

export async function POST(req: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest();
  const { ids, refundedAt } = parsed.data;

  const uniqueIds = [...new Set(ids)];

  // 一次查询确认：属于该用户、未软删、当前未回款
  const rows = await prisma.entry.findMany({
    where: {
      id: { in: uniqueIds },
      userId: user.id,
      ...NOT_DELETED,
      refundedAt: null,
    },
    select: { id: true, amountCents: true },
  });

  if (rows.length !== uniqueIds.length) {
    return notFound(
      `${uniqueIds.length - rows.length} 条不属于你 / 已在回收站 / 已被标过`,
    );
  }

  const at = refundedAt ? new Date(refundedAt) : new Date();
  const totalCents = rows.reduce((a, r) => a + r.amountCents, 0);

  await prisma.entry.updateMany({
    where: {
      id: { in: uniqueIds },
      userId: user.id,
      // 双保险：即便并发下有一条刚被标过，updateMany 也不会覆盖它 ——
      // where 里带 refundedAt: null 只更新还没标的
      refundedAt: null,
    },
    data: { refundedAt: at },
  });

  return NextResponse.json({
    ok: true,
    count: rows.length,
    totalCents,
    refundedAt: at.toISOString(),
  });
}
