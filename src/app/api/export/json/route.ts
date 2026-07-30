import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { ensureLegacyMigrated } from '@/lib/legacyMigrate';
import { collectUserData, summarizeBackup } from '@/lib/exportData';

// GET /api/export/json → 完整结构化备份，可被 POST /api/import 还原
//
// 与 CSV 的区别：CSV 是给人看的（Excel 打开），JSON 是给机器看的（迁移/还原）。
// 两者共用 collectUserData，覆盖的表完全一致。
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  await ensureLegacyMigrated();
  const backup = await collectUserData(user.id);

  const filename = `account-book-backup-${backup.user.username}-${backup.exportedAt.slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      'Cache-Control': 'no-store',
      // 让前端不用解析整个 body 就能显示"备份了多少条"
      'X-Backup-Summary': encodeURIComponent(JSON.stringify(summarizeBackup(backup))),
    },
  });
}
