import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { issueSession, requireUserWithRole } from '@/lib/session';
import { assessPassword, PASSWORD_MIN_LENGTH } from '@/lib/passwordPolicy';
import { ensureUserSetup } from '@/lib/bootstrap';

const schema = z.object({
  username: z.string().trim().min(2).max(32),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(128),
});

// 公开注册仅允许：数据库里 0 用户时（首次 bootstrap）
// 其它情况下：必须 admin 登录，且不签发新 session（管理员为别人创建号）
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `用户名 2-32 字符，密码至少 ${PASSWORD_MIN_LENGTH} 字符` },
      { status: 400 },
    );
  }
  const { username, password } = parsed.data;

  const assessment = assessPassword(password, username);
  if (!assessment.acceptable) {
    return NextResponse.json({ error: assessment.reason }, { status: 400 });
  }

  const userCount = await prisma.user.count();
  const isBootstrap = userCount === 0;

  let creatorRole: 'admin' | 'user' | null = null;
  if (!isBootstrap) {
    const current = await requireUserWithRole();
    if (!current || current.role !== 'admin') {
      return NextResponse.json(
        { error: '自助注册已关闭，请联系管理员开号' },
        { status: 403 },
      );
    }
    creatorRole = current.role as 'admin' | 'user';
  }

  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) {
    return NextResponse.json({ error: '用户名已存在' }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: await hashPassword(password),
      // bootstrap 时首个用户自动 admin
      role: isBootstrap ? 'admin' : 'user',
    },
  });

  // 仅在 bootstrap 场景为该用户直接登录；管理员开号不改变自己 session
  if (isBootstrap) {
    await ensureUserSetup(user.id);
    await issueSession(user);
  }

  return NextResponse.json({
    ok: true,
    username: user.username,
    bootstrap: isBootstrap,
    createdBy: creatorRole,
  });
}
