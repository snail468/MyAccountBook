import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { issueSession, requireVerifiedUser } from '@/lib/session';
import { assessPassword } from '@/lib/passwordPolicy';
import { badRequest, forbidden, notFound, unauthorized } from '@/lib/apiError';

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
  if (!current) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return badRequest('新密码至少 8 个字符');
  }
  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: current.id },
    select: { id: true, username: true, passwordHash: true },
  });
  if (!user) return notFound('用户不存在');

  // 这里刻意用 403 而不是 401：会话本身是有效的，只是二次验证没过。
  // 返回 401 容易让客户端误判成会话失效而把人踢去登录页。
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    return forbidden('当前密码不正确');
  }

  if (currentPassword === newPassword) {
    return badRequest('新密码不能与当前密码相同');
  }

  const assessment = assessPassword(newPassword, user.username);
  if (!assessment.acceptable) {
    return badRequest(assessment.reason);
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
