// 旅游账本「只读分享」的签名令牌。
//
// 设计取舍：用**无状态签名令牌**而不是新增一张数据库表。
//   - 生成：把 { ledgerId, exp } 做 base64url(JSON)，再用会话密钥做 HMAC-SHA256，
//     拼成 `<payload>.<sig>`。整个过程不需要落库，也不需要迁移 schema。
//   - 校验：重算 HMAC 做 timing-safe 比较，再校验过期时间。
//   - 安全性依赖 SESSION_SECRET（与 iron-session 同一个密钥），不暴露 ledgerId 以外
//     的任何信息，且无法被伪造。
//
// 代价：没有「单条撤回」能力 —— 要作废一个分享链接只能轮换 SESSION_SECRET
// （会让所有旧链接 + 所有会话同时失效）。对「便于分享阅读」这个场景，一年有效期
// 足够，撤回需求不迫切；真要做单条撤回，将来再加一张 LedgerShareToken 表即可。

import { createHmac, timingSafeEqual } from 'node:crypto';
import { requireSessionSecret } from '@/lib/env';

// 一年有效期。分享场景不需要永久有效，到期自动失效更安全。
const TTL_MS = 365 * 24 * 60 * 60 * 1000;

export function createShareToken(ledgerId: string): string {
  const secret = requireSessionSecret();
  const payload = Buffer.from(
    JSON.stringify({ v: 1, ledgerId, exp: Date.now() + TTL_MS }),
  ).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyShareToken(token: string): { ledgerId: string } | null {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const dot = token.indexOf('.');
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!payload || !sig) return null;

  const secret = requireSessionSecret();
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      v: number;
      ledgerId: string;
      exp: number;
    };
    if (data.v !== 1 || typeof data.ledgerId !== 'string') return null;
    if (typeof data.exp === 'number' && data.exp < Date.now()) return null;
    return { ledgerId: data.ledgerId };
  } catch {
    return null;
  }
}
