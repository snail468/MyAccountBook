import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireOwnedLedger } from '@/lib/ownership';
import { badRequest, conflict, notFound } from '@/lib/apiError';

const bodySchema = z.object({
  // 二选一：填 username 邀请已注册用户；填 displayName 添加纯名字占位
  username: z.string().trim().min(1).max(32).optional(),
  displayName: z.string().trim().min(1).max(32).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // 增删旅游成员（TripMember，即"付款人 / 分摊人"占位）—— editor 起
  const ctx = await requireOwnedLedger(id, {
    kind: 'travel',
    kindMessage: '仅旅游账本可用',
    minRole: 'editor',
  });
  if (ctx instanceof Response) return ctx;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest();
  const p = parsed.data;

  if (p.username) {
    const target = await prisma.user.findUnique({
      where: { username: p.username },
      select: { id: true, username: true },
    });
    if (!target) return notFound('用户不存在');
    // 幂等：同一 userId 不重复加
    const exists = await prisma.tripMember.findFirst({
      where: { ledgerId: id, userId: target.id },
    });
    if (exists) return conflict('该用户已在名单里');
    const created = await prisma.tripMember.create({
      data: { ledgerId: id, userId: target.id, displayName: target.username },
    });
    return NextResponse.json({ ok: true, id: created.id });
  }

  if (p.displayName) {
    const created = await prisma.tripMember.create({
      data: { ledgerId: id, displayName: p.displayName },
    });
    return NextResponse.json({ ok: true, id: created.id });
  }

  return badRequest('需要 username 或 displayName');
}
