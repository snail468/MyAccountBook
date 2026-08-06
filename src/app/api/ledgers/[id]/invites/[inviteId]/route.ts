import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireOwnedLedger } from '@/lib/ownership';
import { notFound } from '@/lib/apiError';

// DELETE /api/ledgers/<id>/invites/<inviteId>
// owner 撤回一个未使用的邀请。已被接受的邀请无法撤回 —— 那时该走踢人流程。
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; inviteId: string }> },
) {
  const { id, inviteId } = await params;
  const ctx = await requireOwnedLedger(id);
  if (ctx instanceof Response) return ctx;

  const invite = await prisma.ledgerInvite.findUnique({
    where: { id: inviteId },
    select: { ledgerId: true, acceptedByUserId: true },
  });
  if (!invite || invite.ledgerId !== id) return notFound();
  if (invite.acceptedByUserId) {
    return notFound('邀请已被接受，无法撤回');
  }
  await prisma.ledgerInvite.delete({ where: { id: inviteId } });
  return NextResponse.json({ ok: true });
}
