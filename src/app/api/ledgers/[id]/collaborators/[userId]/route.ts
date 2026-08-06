import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireOwnedLedger } from '@/lib/ownership';
import { badRequest, conflict, notFound } from '@/lib/apiError';
import { isLedgerRole } from '@/lib/ledgerRole';

// PATCH /api/ledgers/<id>/collaborators/<userId>  { role: 'editor' | 'viewer' }
// owner 改成员角色。**不能把 owner 降级**（一个账本至少要保留一个 owner），
// 也不能通过这个接口给自己升成 owner —— 会出现多 owner 场景，转让所有权应该
// 是独立操作（当前不支持，owner 想让位需要先加对方为 owner 再自己退出；
// 这个接口本身也没允许把别人升到 owner，所以现阶段实际上没有多 owner 的路径）。
const patchBody = z.object({ role: z.enum(['editor', 'viewer']) });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const { id, userId: targetUserId } = await params;
  const ctx = await requireOwnedLedger(id);
  if (ctx instanceof Response) return ctx;

  const body = await req.json().catch(() => null);
  const parsed = patchBody.safeParse(body);
  if (!parsed.success) return badRequest();

  if (targetUserId === ctx.user.id) return badRequest('不能改自己的角色');

  const target = await prisma.ledgerMember.findUnique({
    where: { ledgerId_userId: { ledgerId: id, userId: targetUserId } },
    select: { role: true },
  });
  if (!target) return notFound('成员不存在');
  if (target.role === 'owner') return badRequest('不能降级 owner');
  if (!isLedgerRole(parsed.data.role)) return badRequest();

  await prisma.ledgerMember.update({
    where: { ledgerId_userId: { ledgerId: id, userId: targetUserId } },
    data: { role: parsed.data.role },
  });
  return NextResponse.json({ ok: true });
}

// DELETE /api/ledgers/<id>/collaborators/<userId>
// owner 踢人；成员自己主动退出用同一个入口（targetUserId === self）。
// 不能踢最后一个 owner —— 会让账本没人管，UI 上应该走"删除账本"而不是踢自己。
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const { id, userId: targetUserId } = await params;

  // 权限规则：owner 能踢任何人；非 owner 只能踢自己（主动退出）。
  // 先按 viewer 门槛拿身份，然后手动判断是不是 owner 或 self-exit。
  const ctx = await requireOwnedLedger(id, { minRole: 'viewer' });
  if (ctx instanceof Response) return ctx;
  const isSelfExit = ctx.user.id === targetUserId;
  if (ctx.role !== 'owner' && !isSelfExit) return notFound();

  const target = await prisma.ledgerMember.findUnique({
    where: { ledgerId_userId: { ledgerId: id, userId: targetUserId } },
    select: { role: true },
  });
  if (!target) return notFound('成员不存在');

  if (target.role === 'owner') {
    const ownerCount = await prisma.ledgerMember.count({
      where: { ledgerId: id, role: 'owner' },
    });
    if (ownerCount <= 1) return conflict('不能移除最后一个 owner，请先转让或删除账本');
  }

  await prisma.ledgerMember.delete({
    where: { ledgerId_userId: { ledgerId: id, userId: targetUserId } },
  });
  return NextResponse.json({ ok: true, exited: isSelfExit });
}
