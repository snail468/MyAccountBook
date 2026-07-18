import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

export type SessionData = {
  userId?: string;
  username?: string;
};

const secret = process.env.SESSION_SECRET;
if (!secret || secret.length < 32) {
  // 在开发时给出明确错误提示，避免默默使用弱密钥
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[session] SESSION_SECRET 缺失或太短，请检查 .env');
  }
}

// COOKIE_SECURE 显式指定；不设的话默认 false，避免 HTTP 部署下 secure cookie 被浏览器拒收
// HTTPS 上线后可以设 COOKIE_SECURE=true 提高安全性
const cookieSecure = process.env.COOKIE_SECURE === 'true';

export const sessionOptions: SessionOptions = {
  password: secret || 'dev-only-insecure-secret-please-change-me-now',
  cookieName: 'mab_session',
  cookieOptions: {
    secure: cookieSecure,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 天
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export async function requireUser() {
  const session = await getSession();
  if (!session.userId) return null;
  return { id: session.userId, username: session.username || '' };
}
