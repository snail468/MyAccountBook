import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { requireSessionSecret } from '@/lib/env';

export type SessionData = {
  userId?: string;
  username?: string;
  // 签发时用户的 sessionVersion。与数据库当前值不符 → 会话作废。
  sv?: number;
};

const cookieSecure = process.env.COOKIE_SECURE === 'true';

export const sessionOptions: SessionOptions = {
  // 生产环境缺失/过短会在这里直接抛错，不再静默回退到硬编码默认值
  password: requireSessionSecret(),
  cookieName: 'mab_session',
  cookieOptions: {
    secure: cookieSecure,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

/** 登录成功后写入会话，带上当前 sessionVersion */
export async function issueSession(user: {
  id: string;
  username: string;
  sessionVersion: number;
}) {
  const session = await getSession();
  session.userId = user.id;
  session.username = user.username;
  session.sv = user.sessionVersion;
  await session.save();
}

/**
 * 当前用户（带 role），并校验 sessionVersion。
 *
 * 会话校验必须查一次库 —— 这是让"改密码后旧会话立即失效"成立的代价。
 * 之前这里还顺带跑 adminBootstrap / ensureLedgers / 回收站维护，
 * 每次页面渲染都要过一遍；那些逻辑已挪到 lib/bootstrap.ts，
 * 由启动期和登录时各触发一次。
 */
export async function requireUserWithRole(): Promise<
  { id: string; username: string; role: string } | null
> {
  const session = await getSession();
  if (!session.userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, username: true, role: true, sessionVersion: true },
  });
  if (!user) return null;

  // 改密码 / 管理员重置 / 强制下线后，旧 cookie 里的 sv 会落后。
  //
  // 这里**只返回 null，不销毁 cookie** —— 本函数会在页面渲染（RSC）里被调用，
  // 而 Next 只允许在 Route Handler / Server Action 里改 cookie，
  // 在渲染期调 session.destroy() 会抛
  // "Cookies can only be modified in a Server Action or Route Handler"。
  // 返回 null 就够了：页面会跳登录，失效的 cookie 下次登录时被覆盖。
  if ((session.sv ?? 0) !== user.sessionVersion) return null;

  return { id: user.id, username: user.username, role: user.role };
}

/**
 * 只读会话字段的轻量版本，供大量 API 路由使用。
 *
 * 注意：它**不校验** sessionVersion（那需要查库）。用于纯数据读写路由是可以的
 * —— 这些路由拿到的 userId 一定属于某个真实用户，最坏情况是一个刚被改过密码的
 * 会话还能多活一次请求。涉及权限判断（admin）或安全敏感操作时用
 * requireUserWithRole / requireVerifiedUser。
 */
export async function requireUser() {
  const session = await getSession();
  if (!session.userId) return null;
  return { id: session.userId, username: session.username || '' };
}

/** 安全敏感操作用：校验 sessionVersion 的版本 */
export async function requireVerifiedUser(): Promise<
  { id: string; username: string; role: string } | null
> {
  return requireUserWithRole();
}
