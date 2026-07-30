import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/health —— 给 docker healthcheck / 反代探活用。
//
// 刻意做一次真实的数据库往返：进程活着但数据库连不上（volume 没挂对、
// 文件权限错）时也要报不健康，否则容器一直显示 healthy 而应用其实是坏的。
//
// 不需要登录，但也不泄露任何业务信息 —— 只有状态和耗时。
export const dynamic = 'force-dynamic';

export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    return NextResponse.json(
      { status: 'ok', db: 'ok', latencyMs: Date.now() - started },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('[health] 数据库探测失败:', err);
    return NextResponse.json(
      { status: 'degraded', db: 'error', latencyMs: Date.now() - started },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
