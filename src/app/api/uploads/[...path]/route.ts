import { requireSessionUser } from '@/lib/ownership';
import { badRequest, notFound } from '@/lib/apiError';
import { getObject, guessContentType } from '@/lib/storage';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const { path } = await params;
  if (!path || path.length === 0) return badRequest('路径不合法');

  // 只允许访问自己上传目录下的文件。
  // 这里返回 404 而不是 403 —— 别人的文件对你来说就该"不存在"，
  // 403 等于确认了这个 key 有效
  const [ownerId, ...rest] = path;
  if (ownerId !== user.id) {
    return notFound();
  }
  // 防路径穿越
  if (rest.some((s) => s.includes('..'))) {
    return badRequest('路径不合法');
  }

  const key = [ownerId, ...rest].map((s) => decodeURIComponent(s)).join('/');
  const obj = await getObject(key);
  if (!obj) return notFound();

  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.contentType || guessContentType(key),
      'Content-Length': String(obj.size),
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}
