import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireOwnedEvent } from '@/lib/ownership';

// 把子活动从父活动下摘出来
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOwnedEvent(id);
  if (ctx instanceof Response) return ctx;

  await prisma.event.update({ where: { id }, data: { parentId: null } });
  return NextResponse.json({ ok: true });
}
