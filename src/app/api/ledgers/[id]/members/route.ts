import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';

const bodySchema = z.object({
  // 二选一：填 username 邀请已注册用户；填 displayName 添加纯名字占位
  username: z.string().trim().min(1).max(32).optional(),
  displayName: z.string().trim().min(1).max(32).optional(),
});

async function ownLedger(id: string, userId: string) {
  const l = await prisma.ledger.findUnique({
    where: { id },
    select: { userId: true, kind: true },
  });
  if (!l || l.userId !== userId) return null;
  return l;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const { id } = await params;
  const own = await ownLedger(id, user.id);
  if (!own) return NextResponse.json({ error: '账本不存在' }, { status: 404 });
  if (own.kind !== 'travel') {
    return NextResponse.json({ error: '仅旅游账本可用' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '参数错误' }, { status: 400 });
  const p = parsed.data;

  if (p.username) {
    const target = await prisma.user.findUnique({
      where: { username: p.username },
      select: { id: true, username: true },
    });
    if (!target) return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    // 幂等：同一 userId 不重复加
    const exists = await prisma.tripMember.findFirst({
      where: { ledgerId: id, userId: target.id },
    });
    if (exists) return NextResponse.json({ error: '该用户已在名单里' }, { status: 409 });
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

  return NextResponse.json({ error: '需要 username 或 displayName' }, { status: 400 });
}
