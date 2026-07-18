import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const { id } = await params;

  const entry = await prisma.entry.findUnique({ where: { id }, select: { userId: true } });
  if (!entry || entry.userId !== user.id) {
    return NextResponse.json({ error: '不存在' }, { status: 404 });
  }
  await prisma.entry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
