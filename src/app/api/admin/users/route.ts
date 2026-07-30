import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { requireUserWithRole } from '@/lib/session';
import { assessPassword, PASSWORD_MIN_LENGTH } from '@/lib/passwordPolicy';
import { ensureUserSetup } from '@/lib/bootstrap';

const createSchema = z.object({
  username: z.string().trim().min(2).max(32),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(128),
  role: z.enum(['admin', 'user']).default('user'),
});

export async function POST(req: Request) {
  const current = await requireUserWithRole();
  if (!current || current.role !== 'admin') {
    return NextResponse.json({ error: '仅管理员可操作' }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '参数错误' }, { status: 400 });
  const { username, password, role } = parsed.data;

  const assessment = assessPassword(password, username);
  if (!assessment.acceptable) {
    return NextResponse.json({ error: assessment.reason }, { status: 400 });
  }

  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) return NextResponse.json({ error: '用户名已存在' }, { status: 409 });

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: await hashPassword(password),
      role,
    },
    select: { id: true, username: true, role: true, createdAt: true },
  });
  // 新号立刻补齐 work/taoyuan 的 Ledger 元数据，用户首次登录就能看到入口
  await ensureUserSetup(user.id);
  return NextResponse.json({ ok: true, user });
}
