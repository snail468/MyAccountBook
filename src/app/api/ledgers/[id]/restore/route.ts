import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireOwnedLedger } from '@/lib/ownership';
import { conflict } from '@/lib/apiError';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await requireOwnedLedger(id);
  if (ctx instanceof Response) return ctx;
  const { user, ledger: l } = ctx;

  // 恢复一个没被删的账本 —— 请求本身合法，是与当前状态冲突，用 409
  if (!l.deletedAt) return conflict('该账本未删除');

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
      return conflict(
        `你已经有一个${l.kind === 'work' ? '工作账本' : '桃源账本'}了。请先删除它才能恢复此账本`,
      );
    }
  }

  await prisma.ledger.update({
    where: { id },
    data: { deletedAt: null, archived: false },
  });
  return NextResponse.json({ ok: true });
}
