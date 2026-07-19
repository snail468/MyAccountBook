import { NextResponse } from 'next/server';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { requireUser } from '@/lib/session';

// 上传目录：Docker 里挂到 /data/uploads；本地开发用 process.cwd()/data/uploads
const UPLOAD_ROOT = process.env.UPLOAD_ROOT || join(process.cwd(), 'data', 'uploads');

const ALLOWED_MIME = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/jpg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]);

const MAX_BYTES = 8 * 1024 * 1024; // 8MB

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: '请求格式错误' }, { status: 400 });

  const file = form.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: '缺少文件' }, { status: 400 });
  }
  const type = (file as unknown as File).type || '';
  const ext = ALLOWED_MIME.get(type);
  if (!ext) {
    return NextResponse.json({ error: '只支持 jpg/png/webp/gif' }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: '单张最大 8MB' }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const userDir = join(UPLOAD_ROOT, user.id);
  await mkdir(userDir, { recursive: true });
  const filename = `${randomUUID()}.${ext}`;
  await writeFile(join(userDir, filename), buf);

  return NextResponse.json({ ok: true, url: `/api/uploads/${user.id}/${filename}` });
}
