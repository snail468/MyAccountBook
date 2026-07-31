import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { hashPassword, needsRehash, verifyPassword } from '@/lib/auth';
import { issueSession } from '@/lib/session';
import { checkLock, lockMessage, recordFailure, recordSuccess } from '@/lib/loginThrottle';
import { ensureUserSetup, runStartupTasks } from '@/lib/bootstrap';
import { badRequest, tooManyRequests, unauthorized } from '@/lib/apiError';
import { createLogger, errorFields } from '@/lib/logger';

const log = createLogger('auth');

const schema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return badRequest('请输入用户名和密码');
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
    return unauthorized('用户名或密码错误');
  }

  const lock = checkLock(user);
  if (lock.locked) {
    return tooManyRequests(lockMessage(lock.retryAfterSeconds), lock.retryAfterSeconds);
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const state = await recordFailure(user.id, user.failedLoginCount);
    if (state.locked) {
      return tooManyRequests(lockMessage(state.retryAfterSeconds), state.retryAfterSeconds);
    }
    return unauthorized('用户名或密码错误');
  }

  await recordSuccess(user.id, user.failedLoginCount > 0 || user.lockedUntil !== null);

  // 哈希格式升级（bcrypt → PBKDF2，或提高迭代次数）。
  // 只在登录成功后做，此时我们手里有明文。
  // 尽力而为：失败绝不影响本次登录 —— 下次登录还会再试一遍。
  if (needsRehash(user.passwordHash)) {
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(password) },
      });
    } catch (err) {
      log.warn('密码哈希升级失败，不影响登录', errorFields(err));
    }
  }

  // 老用户升级路径：补齐 work/taoyuan 的 Ledger 元数据（幂等，只在登录时跑）
  await ensureUserSetup(user.id);
  await issueSession(user);

  return NextResponse.json({ ok: true, username: user.username });
}
