import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSessionUser } from '@/lib/ownership';
import { badRequest, notFound } from '@/lib/apiError';
import { NOT_DELETED } from '@/lib/softDelete';

const bodySchema = z.object({
  // 主活动（合并后作为父）；其余会挂到它下面
  parentId: z.string().min(1),
  // 要合并到父下面的子活动 ids（不能包含 parentId 自身）
  childIds: z.array(z.string().min(1)).min(1).max(50),
  // 合并后可以顺便改个新名字
  title: z.string().trim().min(1).max(80).optional(),
});

export async function POST(req: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest();
  const { parentId, childIds, title } = parsed.data;

  if (childIds.includes(parentId)) {
    return badRequest('父活动不能同时是子活动');
  }

  const uniqueChildIds = [...new Set(childIds)];

  const parent = await prisma.event.findUnique({ where: { id: parentId } });
  if (!parent || parent.userId !== user.id || parent.deletedAt !== null) {
    return notFound('主活动不存在');
  }
  if (parent.parentId) {
    return badRequest('主活动本身已被合并，请选顶层活动');
  }

  const children = await prisma.event.findMany({
    where: { id: { in: uniqueChildIds }, userId: user.id, ...NOT_DELETED },
  });
  if (children.length !== uniqueChildIds.length) {
    return badRequest('存在不属于当前用户或已在回收站的活动');
  }

  await prisma.$transaction(async (tx) => {
    if (title && title !== parent.title) {
      await tx.event.update({ where: { id: parentId }, data: { title } });
    }
    // 如果被选为子的活动本身就是别的父（有 children），把它现有的 children 一起转到新父下面（避免层级）
    for (const c of children) {
      const grandchildren = await tx.event.findMany({
        where: { parentId: c.id },
        select: { id: true },
      });
      if (grandchildren.length > 0) {
        await tx.event.updateMany({
          where: { id: { in: grandchildren.map((g) => g.id) } },
          data: { parentId },
        });
      }
      await tx.event.update({
        where: { id: c.id },
        data: { parentId },
      });
    }
  });

  return NextResponse.json({ ok: true });
}
