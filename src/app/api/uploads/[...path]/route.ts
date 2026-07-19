import { NextResponse } from 'next/server';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, normalize, resolve, sep } from 'node:path';
import { requireUser } from '@/lib/session';
import type { Readable } from 'node:stream';

const UPLOAD_ROOT = process.env.UPLOAD_ROOT || join(process.cwd(), 'data', 'uploads');
const ROOT_RESOLVED = resolve(UPLOAD_ROOT);

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

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

  // 规范化路径并防目录穿越
  const rel = normalize(join(ownerId, ...rest));
  if (rel.includes(`..${sep}`) || rel.startsWith(`..${sep}`) || rel === '..') {
    return NextResponse.json({ error: 'bad path' }, { status: 400 });
  }
  const full = resolve(UPLOAD_ROOT, rel);
  if (!full.startsWith(ROOT_RESOLVED + sep) && full !== ROOT_RESOLVED) {
    return NextResponse.json({ error: 'bad path' }, { status: 400 });
  }

  const st = await stat(full).catch(() => null);
  if (!st || !st.isFile()) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const ext = full.split('.').pop()?.toLowerCase() ?? '';
  const type = MIME[ext] ?? 'application/octet-stream';

  const nodeStream = createReadStream(full);
  const webStream = nodeStreamToWebStream(nodeStream);

  return new Response(webStream, {
    headers: {
      'Content-Type': type,
      'Content-Length': String(st.size),
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}

function nodeStreamToWebStream(stream: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      stream.on('data', (chunk) => {
        controller.enqueue(chunk instanceof Buffer ? new Uint8Array(chunk) : chunk);
      });
      stream.on('end', () => controller.close());
      stream.on('error', (err) => controller.error(err));
    },
    cancel() {
      stream.destroy();
    },
  });
}
