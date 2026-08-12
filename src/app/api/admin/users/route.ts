import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { requireAdmin } from '@/lib/ownership';
import { badRequest, conflict } from '@/lib/apiError';
import { assessPassword, PASSWORD_MIN_LENGTH } from '@/lib/passwordPolicy';
import { ensureUserSetup } from '@/lib/bootstrap';
import { stringifyPrefs } from '@/lib/userPrefs';

const createSchema = z.object({
  username: z.string().trim().min(2).max(32),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(128),
  role: z.enum(['admin', 'user']).default('user'),
});

export async function POST(req: Request) {
  const current = await requireAdmin();
  if (current instanceof Response) return current;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return badRequest();
  const { username, password, role } = parsed.data;

  const assessment = assessPassword(password, username);
  if (!assessment.acceptable) {
    return badRequest(assessment.reason);
  }

  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) return conflict('用户名已存在');

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: await hashPassword(password),
      role,
      // 管理员直接添加的新用户：默认不建任何账本（连 work/taoyuan 都跳过），
      // 并标记首次登录弹「使用引导」。
      preferences: stringifyPrefs({ skipDefaultLedgers: true, needsOnboarding: true }),
    },
    select: { id: true, username: true, role: true, createdAt: true },
  });
  // 幂等补齐账本元数据：skipDefaultLedgers=true 时不会建默认账本，故该用户零账本。
  await ensureUserSetup(user.id);
  return NextResponse.json({ ok: true, user });
}

/// GET /api/admin/users —— 返回全部用户（id / username / role / createdAt）。
///
/// 对齐网页端 AdminUserList：管理员进入用户管理即可看到所有用户。移动端
/// [UsersPage] 在线时调用此端点，把服务端用户落地到本地 [family_members]（按
/// username 去重），从而补全省份/角色信息并支持本地角色切换与重置密码。[#6]
export async function GET() {
  const current = await requireAdmin();
  if (current instanceof Response) return current;

  const users = await prisma.user.findMany({
    select: { id: true, username: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      joinedAt: u.createdAt.toISOString(),
    })),
  });
}
