import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/ownership';
import { badRequest } from '@/lib/apiError';
import { getStoredWebdavConfig, saveStoredWebdavConfig } from '@/lib/webdav';

const configSchema = z.object({
  url: z.string().trim(),
  username: z.string().trim(),
  password: z.string().optional(),
  remotePath: z.string().trim().default('/MyAccountBook'),
  autoBackupEnabled: z.boolean().default(false),
  scheduleTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: '定时格式应为 HH:mm (如 03:00)' })
    .default('03:00'),
});

export async function GET() {
  const current = await requireAdmin();
  if (current instanceof Response) return current;

  const config = await getStoredWebdavConfig();

  return NextResponse.json({
    config: {
      ...config,
      password: config.password ? '******' : '',
      hasPassword: Boolean(config.password),
    },
  });
}

export async function PUT(req: Request) {
  const current = await requireAdmin();
  if (current instanceof Response) return current;

  const body = await req.json().catch(() => null);
  const parsed = configSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.errors[0]?.message || '请求参数有误');
  }

  const { url, username, password, remotePath, autoBackupEnabled, scheduleTime } = parsed.data;

  if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
    return badRequest('WebDAV 服务器地址必须以 http:// 或 https:// 开头');
  }

  const updated = await saveStoredWebdavConfig({
    url,
    username,
    password: password !== undefined && password !== '' ? password : undefined,
    remotePath: remotePath || '/MyAccountBook',
    autoBackupEnabled,
    scheduleTime,
  });

  return NextResponse.json({
    ok: true,
    config: {
      ...updated,
      password: updated.password ? '******' : '',
      hasPassword: Boolean(updated.password),
    },
  });
}
