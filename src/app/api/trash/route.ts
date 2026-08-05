import { NextResponse } from 'next/server';
import { requireSessionUser } from '@/lib/ownership';
import { listTrash } from '@/lib/recordTrash';

// GET /api/trash —— 列出当前用户回收站里的所有记账类记录
export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const rows = await listTrash(user.id);
  return NextResponse.json({ items: rows });
}
