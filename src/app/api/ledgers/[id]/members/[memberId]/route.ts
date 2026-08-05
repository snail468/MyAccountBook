import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSessionUser } from '@/lib/ownership';
import { badRequest, notFound } from '@/lib/apiError';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const { id, memberId } = await params;

  // 这条归属校验没抽进 lib/ownership：它要顺带取关联账目的计数，
  // 只有这一个调用点，抽出去反而要给 helper 加一个专用参数
  const member = await prisma.tripMember.findUnique({
    where: { id: memberId },
    select: {
      ledgerId: true,
      ledger: { select: { userId: true } },
      _count: { select: { paidExpenses: true, splits: true } },
    },
  });
  if (!member || member.ledgerId !== id || member.ledger.userId !== user.id) {
    return notFound();
  }
  if (member._count.paidExpenses > 0 || member._count.splits > 0) {
    return badRequest('该成员有关联账目，不能删除。请先处理相关记录');
  }
  await prisma.tripMember.delete({ where: { id: memberId } });
  return NextResponse.json({ ok: true });
}
