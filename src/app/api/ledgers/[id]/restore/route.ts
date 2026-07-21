import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const { id } = await params;

  const l = await prisma.ledger.findUnique({
    where: { id },
    select: { userId: true, kind: true, deletedAt: true },
  });
  if (!l || l.userId !== user.id)
    return NextResponse.json({ error: '不存在' }, { status: 404 });
  if (!l.deletedAt) return NextResponse.json({ error: '该账本未删除' }, { status: 400 });

  // 内置账本恢复时：如果用户已经又创建了一个同类型的活跃账本，禁止恢复
  if (l.kind === 'work' || l.kind === 'taoyuan') {
    const exists = await prisma.ledger.findFirst({
      where: {
        userId: user.id,
        kind: l.kind,
        deletedAt: null,
        id: { not: id },
      },
    });
    if (exists) {
      return NextResponse.json(
        {
          error: `你已经有一个${l.kind === 'work' ? '工作账本' : '桃源账本'}了。请先删除它才能恢复此账本`,
        },
        { status: 409 },
      );
    }
  }

  await prisma.ledger.update({
    where: { id },
    data: { deletedAt: null, archived: false },
  });
  return NextResponse.json({ ok: true });
}
