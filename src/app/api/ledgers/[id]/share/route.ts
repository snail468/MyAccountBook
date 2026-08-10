import { NextResponse } from 'next/server';
import { requireOwnedLedger } from '@/lib/ownership';
import { createShareToken } from '@/lib/shareToken';

// 生成旅游账本的「只读分享」链接。
// 仅 owner 可生成；返回签名 token 与可分享的页面地址 /share/<token>。
// token 由服务端用会话密钥签名，无法伪造，且无需落库。
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await requireOwnedLedger(id, { kind: 'travel', minRole: 'owner' });
  if (ctx instanceof Response) return ctx;

  const token = createShareToken(id);
  return NextResponse.json({ ok: true, token, url: `/share/${token}` });
}
