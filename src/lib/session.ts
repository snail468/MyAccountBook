import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { ensureAdminBootstrap } from '@/lib/adminBootstrap';
import { ensureLedgersForUser } from '@/lib/ledgerBootstrap';

export type SessionData = {
  userId?: string;
  username?: string;
};

const secret = process.env.SESSION_SECRET;
if (!secret || secret.length < 32) {
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[session] SESSION_SECRET 缺失或太短，请检查 .env');
  }
}

const cookieSecure = process.env.COOKIE_SECURE === 'true';

export const sessionOptions: SessionOptions = {
  password: secret || 'dev-only-insecure-secret-please-change-me-now',
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

// 只读会话字段（不查数据库）；调用方需要 role 时用 requireUserWithRole
export async function requireUser() {
  const session = await getSession();
  if (!session.userId) return null;
  return { id: session.userId, username: session.username || '' };
}

// 带 role 的当前用户，需要数据库查询一次
export async function requireUserWithRole(): Promise<
  { id: string; username: string; role: string } | null
> {
  const session = await getSession();
  if (!session.userId) return null;
  // 幂等：确保管理员机制已 bootstrap 过一次
  await ensureAdminBootstrap();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, username: true, role: true },
  });
  if (!user) return null;
  // 幂等：为该用户补齐 work/taoyuan 的 Ledger 元数据（老用户升级路径）
  await ensureLedgersForUser(user.id);
  return user;
}
