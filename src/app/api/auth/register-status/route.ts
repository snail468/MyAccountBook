import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// 注册是否开放：仅当数据库里 0 用户时（首次 bootstrap）开放自助注册。
// 移动端注册页据此在服务端已有用户时显示「注册已关闭」（对齐网页端
// src/app/register/page.tsx 的 userCount === 0 判断）。
export async function GET() {
  const userCount = await prisma.user.count();
  return NextResponse.json({ open: userCount === 0 });
}
