import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { getObject, guessContentType } from '@/lib/storage';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const { path } = await params;
  if (!path || path.length === 0)
    return NextResponse.json({ error: 'bad path' }, { status: 400 });

  // 只允许访问自己上传目录下的文件
  const [ownerId, ...rest] = path;
  if (ownerId !== user.id) {
    return NextResponse.json({ error: '无权访问' }, { status: 403 });
  }
  // 防路径穿越
  if (rest.some((s) => s.includes('..'))) {
    return NextResponse.json({ error: 'bad path' }, { status: 400 });
  }

  const key = [ownerId, ...rest].map((s) => decodeURIComponent(s)).join('/');
  const obj = await getObject(key);
  if (!obj) return NextResponse.json({ error: 'not found' }, { status: 404 });

  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.contentType || guessContentType(key),
      'Content-Length': String(obj.size),
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}
