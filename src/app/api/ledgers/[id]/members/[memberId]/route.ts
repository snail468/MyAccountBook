import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const { id, memberId } = await params;

  const member = await prisma.tripMember.findUnique({
    where: { id: memberId },
    select: {
      ledgerId: true,
      ledger: { select: { userId: true } },
      _count: { select: { paidExpenses: true, splits: true } },
    },
  });
  if (!member || member.ledgerId !== id || member.ledger.userId !== user.id) {
    return NextResponse.json({ error: '不存在' }, { status: 404 });
  }
  if (member._count.paidExpenses > 0 || member._count.splits > 0) {
    return NextResponse.json(
      { error: '该成员有关联账目，不能删除。请先处理相关记录' },
      { status: 400 },
    );
  }
  await prisma.tripMember.delete({ where: { id: memberId } });
  return NextResponse.json({ ok: true });
}
