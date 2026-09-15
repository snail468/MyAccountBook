import { NextResponse } from 'next/server';
import { checkAndRunScheduledBackup } from '@/lib/webdavScheduler';
import { requireAdmin } from '@/lib/ownership';

export async function GET(req: Request) {
  // 允许两种授权方式：
  // 1. 管理员 Session（Web 界面或已登录管理员手动触发检查）
  // 2. Authorization: Bearer <CRON_SECRET> 环境变量（外部定时任务或 webhook）
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  let isAuthorized = false;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    isAuthorized = true;
  } else {
    const current = await requireAdmin();
    if (!(current instanceof Response)) {
      isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    return NextResponse.json({ error: '未授权访问' }, { status: 401 });
  }

  const result = await checkAndRunScheduledBackup();
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  return GET(req);
}
