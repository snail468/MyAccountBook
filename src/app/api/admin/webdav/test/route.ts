import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/ownership';
import { badRequest } from '@/lib/apiError';
import { getStoredWebdavConfig, testWebdavConnection } from '@/lib/webdav';

const testSchema = z.object({
  url: z.string().trim().min(1, 'WebDAV 服务器地址不能为空'),
  username: z.string().trim().min(1, '用户名不能为空'),
  password: z.string().optional(),
  remotePath: z.string().trim().default('/MyAccountBook'),
});

export async function POST(req: Request) {
  const current = await requireAdmin();
  if (current instanceof Response) return current;

  const body = await req.json().catch(() => null);
  const parsed = testSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.errors[0]?.message || '请求参数有误');
  }

  const { url, username, password, remotePath } = parsed.data;

  // 如果前端没有输入新密码（留空），尝试使用数据库中保存的历史密码
  let effectivePassword = password;
  if (!effectivePassword) {
    const stored = await getStoredWebdavConfig();
    if (stored.username === username && stored.password) {
      effectivePassword = stored.password;
    }
  }

  const result = await testWebdavConnection({
    url,
    username,
    password: effectivePassword,
    remotePath,
    autoBackupEnabled: false,
    scheduleTime: '03:00',
  });

  return NextResponse.json(result);
}
