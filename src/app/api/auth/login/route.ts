import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { verifyPassword } from '@/lib/auth';
import { issueSession } from '@/lib/session';
import { checkLock, lockMessage, recordFailure, recordSuccess } from '@/lib/loginThrottle';
import { ensureUserSetup, runStartupTasks } from '@/lib/bootstrap';

const schema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '请输入用户名和密码' }, { status: 400 });
  }
  const { username, password } = parsed.data;

  // 首个请求可能就是登录 —— 保证 admin bootstrap 已经跑过
  await runStartupTasks();

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      passwordHash: true,
      sessionVersion: true,
      failedLoginCount: true,
      lockedUntil: true,
    },
  });

  // 用户名不存在时也走一次 bcrypt 比较，避免通过响应耗时区分
  // "用户不存在" 和 "密码错误"（用户名枚举）
  if (!user) {
    await verifyPassword(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');
    return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
  }

  const lock = checkLock(user);
  if (lock.locked) {
    return NextResponse.json(
      { error: lockMessage(lock.retryAfterSeconds) },
      { status: 429, headers: { 'Retry-After': String(lock.retryAfterSeconds) } },
    );
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const state = await recordFailure(user.id, user.failedLoginCount);
    if (state.locked) {
      return NextResponse.json(
        { error: lockMessage(state.retryAfterSeconds) },
        { status: 429, headers: { 'Retry-After': String(state.retryAfterSeconds) } },
      );
    }
    return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
  }

  await recordSuccess(user.id, user.failedLoginCount > 0 || user.lockedUntil !== null);
  // 老用户升级路径：补齐 work/taoyuan 的 Ledger 元数据（幂等，只在登录时跑）
  await ensureUserSetup(user.id);
  await issueSession(user);

  return NextResponse.json({ ok: true, username: user.username });
}
