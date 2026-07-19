import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';

// 把子活动从父活动下摘出来
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const { id } = await params;

  const ev = await prisma.event.findUnique({ where: { id }, select: { userId: true } });
  if (!ev || ev.userId !== user.id)
    return NextResponse.json({ error: '不存在' }, { status: 404 });
  await prisma.event.update({ where: { id }, data: { parentId: null } });
  return NextResponse.json({ ok: true });
}
