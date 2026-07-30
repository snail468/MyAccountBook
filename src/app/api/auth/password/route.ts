import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { issueSession, requireVerifiedUser } from '@/lib/session';
import { assessPassword } from '@/lib/passwordPolicy';

// PATCH /api/auth/password —— 用户自助改密码
//
// 原来只有 /api/admin/users/[id] 的管理员重置路径，普通用户想改密码
// 必须找管理员。这既是功能缺口也是安全缺口。
//
// 改成功后 sessionVersion +1，其它设备上的旧会话立即失效；
// 当前设备重新签发一个新会话，避免自己被踢下线。
const schema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

export async function PATCH(req: Request) {
  const current = await requireVerifiedUser();
  if (!current) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '新密码至少 8 个字符' }, { status: 400 });
  }
  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: current.id },
    select: { id: true, username: true, passwordHash: true },
  });
  if (!user) return NextResponse.json({ error: '用户不存在' }, { status: 404 });

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    return NextResponse.json({ error: '当前密码不正确' }, { status: 403 });
  }

  if (currentPassword === newPassword) {
    return NextResponse.json({ error: '新密码不能与当前密码相同' }, { status: 400 });
  }

  const assessment = assessPassword(newPassword, user.username);
  if (!assessment.acceptable) {
    return NextResponse.json({ error: assessment.reason }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(newPassword),
      // 其它设备上的旧会话立即失效
      sessionVersion: { increment: 1 },
      failedLoginCount: 0,
      lockedUntil: null,
    },
    select: { id: true, username: true, sessionVersion: true },
  });

  // 当前设备换发新会话，不把自己踢下线
  await issueSession(updated);

  return NextResponse.json({ ok: true, otherSessionsRevoked: true });
}
