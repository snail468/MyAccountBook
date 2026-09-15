import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/ownership';
import { badRequest } from '@/lib/apiError';
import { getStoredWebdavConfig, downloadWebdavBackup } from '@/lib/webdav';
import { restoreFullSystemBackup } from '@/lib/systemBackup';
import { createLogger, errorFields } from '@/lib/logger';

const log = createLogger('adminWebdavRestore');

const restoreSchema = z.object({
  filename: z.string().trim().min(1, '请提供要恢复的备份文件名'),
});

export async function POST(req: Request) {
  const current = await requireAdmin();
  if (current instanceof Response) return current;

  const body = await req.json().catch(() => null);
  const parsed = restoreSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.errors[0]?.message || '请求参数有误');
  }

  const { filename } = parsed.data;
  const config = await getStoredWebdavConfig();
  if (!config.url || !config.username) {
    return badRequest('WebDAV 尚未配置');
  }

  log.warn(`管理员 [${current.username}] 发起全系统数据还原，选用备份: ${filename}`);

  try {
    // 1. 从 WebDAV 下载备份包
    const buffer = await downloadWebdavBackup(config, filename);

    // 2. 解压校验并在事务中全量恢复
    const result = await restoreFullSystemBackup(buffer);

    return NextResponse.json({
      ok: true,
      filename,
      summary: result.summary,
      restoredAt: result.restoredAt,
    });
  } catch (err: any) {
    log.error(`全系统数据还原失败: ${filename}`, errorFields(err));
    return NextResponse.json(
      {
        ok: false,
        error: `数据恢复失败: ${err.message || '未知错误'}`,
      },
      { status: 500 }
    );
  }
}
