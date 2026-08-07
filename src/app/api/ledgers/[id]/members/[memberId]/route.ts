import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireOwnedLedger } from '@/lib/ownership';
import { badRequest, notFound } from '@/lib/apiError';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const { id, memberId } = await params;
  // 删除旅游同伴（TripMember）—— editor 起。归属先过 requireOwnedLedger，
  // 再查这个 memberId 是否属于本账本。要顺带取关联账目计数，走 findUnique。
  const ctx = await requireOwnedLedger(id, {
    kind: 'travel',
    kindMessage: '仅旅游账本可用',
    minRole: 'editor',
  });
  if (ctx instanceof Response) return ctx;

  const member = await prisma.tripMember.findUnique({
    where: { id: memberId },
    select: {
      ledgerId: true,
      _count: { select: { paidExpenses: true, splits: true } },
    },
  });
  if (!member || member.ledgerId !== id) return notFound();
  if (member._count.paidExpenses > 0 || member._count.splits > 0) {
    return badRequest('该成员有关联账目，不能删除。请先处理相关记录');
  }
  await prisma.tripMember.delete({ where: { id: memberId } });
  return NextResponse.json({ ok: true });
}

const patchSchema = z.object({ settled: z.boolean() });

// 切换成员"已结清"标记（C11 旅游打磨）。editor 起，复用同一套权限/404 口径。
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const { id, memberId } = await params;
  const ctx = await requireOwnedLedger(id, {
    kind: 'travel',
    kindMessage: '仅旅游账本可用',
    minRole: 'editor',
  });
  if (ctx instanceof Response) return ctx;

  const member = await prisma.tripMember.findUnique({
    where: { id: memberId },
    select: { ledgerId: true },
  });
  if (!member || member.ledgerId !== id) return notFound();

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return badRequest();
  await prisma.tripMember.update({
    where: { id: memberId },
    data: { settled: parsed.data.settled },
  });
  return NextResponse.json({ ok: true, settled: parsed.data.settled });
}

