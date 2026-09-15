import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/ownership';
import { badRequest } from '@/lib/apiError';
import {
  getStoredWebdavConfig,
  saveStoredWebdavConfig,
  listWebdavBackups,
  uploadWebdavBackup,
  deleteWebdavBackup,
} from '@/lib/webdav';
import { createFullSystemBackup } from '@/lib/systemBackup';
import { createLogger, errorFields } from '@/lib/logger';

const log = createLogger('adminWebdavBackups');

export async function GET() {
  const current = await requireAdmin();
  if (current instanceof Response) return current;

  const config = await getStoredWebdavConfig();
  if (!config.url || !config.username) {
    return NextResponse.json({
      backups: [],
      configured: false,
      message: '尚未配置 WebDAV 服务器',
    });
  }

  try {
    const backups = await listWebdavBackups(config);
    return NextResponse.json({
      backups,
      configured: true,
      lastBackupAt: config.lastBackupAt,
      lastBackupStatus: config.lastBackupStatus,
    });
  } catch (err: any) {
    log.error('获取 WebDAV 备份列表失败', errorFields(err));
    return NextResponse.json(
      {
        backups: [],
        configured: true,
        error: err.message || '获取 WebDAV 备份列表失败',
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  const current = await requireAdmin();
  if (current instanceof Response) return current;

  const config = await getStoredWebdavConfig();
  if (!config.url || !config.username) {
    return badRequest('WebDAV 尚未配置，无法执行备份');
  }

  try {
    // 1. 生成全系统全量备份包（含全部用户、所有表数据及本地附件）
    const backup = await createFullSystemBackup();

    // 2. 上传至 WebDAV（自动滚动清理，仅保留最新的 7 份）
    const uploadResult = await uploadWebdavBackup(config, backup.filename, backup.buffer);

    // 3. 更新系统状态记录
    await saveStoredWebdavConfig({
      lastBackupAt: new Date().toISOString(),
      lastBackupStatus: 'success',
      lastBackupMessage: null,
    });

    return NextResponse.json({
      ok: true,
      filename: backup.filename,
      summary: backup.summary,
      deletedOldCount: uploadResult.deletedOldCount,
    });
  } catch (err: any) {
    log.error('执行全系统 WebDAV 备份失败', errorFields(err));

    await saveStoredWebdavConfig({
      lastBackupStatus: 'failed',
      lastBackupMessage: err.message || '备份上传失败',
    });

    return NextResponse.json(
      {
        ok: false,
        error: `备份失败: ${err.message || '未知错误'}`,
      },
      { status: 500 }
    );
  }
}

const deleteSchema = z.object({
  filename: z.string().trim().min(1),
});

export async function DELETE(req: Request) {
  const current = await requireAdmin();
  if (current instanceof Response) return current;

  const body = await req.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest('缺少要删除的文件名');
  }

  const { filename } = parsed.data;
  const config = await getStoredWebdavConfig();
  if (!config.url || !config.username) {
    return badRequest('WebDAV 尚未配置');
  }

  try {
    await deleteWebdavBackup(config, filename);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    log.error(`删除 WebDAV 备份失败: ${filename}`, errorFields(err));
    return NextResponse.json(
      { ok: false, error: err.message || '删除备份文件失败' },
      { status: 500 }
    );
  }
}
