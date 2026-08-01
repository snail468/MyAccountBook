import { NextResponse } from 'next/server';
import { requireSessionUser } from '@/lib/ownership';
import { badRequest, notFound } from '@/lib/apiError';
import { isTrashType } from '@/lib/softDelete';
import { isOwnedTrash, purgeOne, restoreOne } from '@/lib/recordTrash';
import { syncEventStatus } from '@/lib/eventStatus';

// POST /api/trash/<type>/<id> —— 恢复
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const { type, id } = await params;
  if (!isTrashType(type)) return badRequest('未知的记录类型');
  if (!(await isOwnedTrash(user.id, type, id))) return notFound();

  const { eventId } = await restoreOne(type, id);
  // 恢复金额或活动都要重算 status —— 空活动恢复后应回 published
  if (eventId) await syncEventStatus(eventId);
  return NextResponse.json({ ok: true });
}

// DELETE /api/trash/<type>/<id> —— 立即彻底删（跳过 60 天保留期）
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const { type, id } = await params;
  if (!isTrashType(type)) return badRequest('未知的记录类型');
  if (!(await isOwnedTrash(user.id, type, id))) return notFound();

  await purgeOne(type, id);
  return NextResponse.json({ ok: true });
}
