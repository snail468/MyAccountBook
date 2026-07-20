import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; expenseId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const { id, expenseId } = await params;

  const exp = await prisma.tripExpense.findUnique({
    where: { id: expenseId },
    select: { ledgerId: true, ledger: { select: { userId: true } } },
  });
  if (!exp || exp.ledgerId !== id || exp.ledger.userId !== user.id) {
    return NextResponse.json({ error: '不存在' }, { status: 404 });
  }
  await prisma.tripExpense.delete({ where: { id: expenseId } });
  return NextResponse.json({ ok: true });
}
