// 密码哈希：PBKDF2-SHA256（Web Crypto），默认 600,000 次迭代。
//
// 为什么从 bcryptjs 换过来：
//   bcryptjs 是纯 JS 实现，cost=10 约耗 70ms 纯 CPU（本机实测）；
//   PBKDF2 走 crypto.subtle 的原生实现，同样的 CPU 预算能做多得多的工作。
//   换算过来：现在默认的 600,000 次约 237ms —— 比原来的 bcrypt **更慢也更安全**，
//   这是正确的方向。登录是低频操作，237ms 完全可接受。
//
// 关于迭代次数的说明：
//   PBKDF2 的耗时与迭代次数成正比，调低它就是在降低安全强度，没有免费的午餐。
//   本机实测：10,000 次约 4.8ms，600,000 次（OWASP 推荐值）约 237ms。
//   PASSWORD_KDF_ITERATIONS 可以覆盖默认值，但**除非有明确的 CPU 约束，
//   否则不要往下调**。硬下限 10,000。
//
// 兼容性：迭代次数与盐都编码进哈希串本身，所以改配置**不会**让老密码失效。
// 旧的 bcrypt 哈希继续可验证，并在登录成功时自动升级到新格式。

import bcrypt from 'bcryptjs';

/** OWASP 对 PBKDF2-HMAC-SHA256 的推荐迭代次数 */
export const RECOMMENDED_ITERATIONS = 600_000;

/** 低于这个数就不值得叫密码哈希了，硬下限 */
const MIN_ITERATIONS = 10_000;
const MAX_ITERATIONS = 10_000_000;

const SALT_BYTES = 16;
const KEY_BITS = 256;
const PREFIX = 'pbkdf2-sha256';

/** 当前用于**新**哈希的迭代次数。验证时用的是哈希串里记录的值。 */
export function targetIterations(): number {
  const raw = Number(process.env.PASSWORD_KDF_ITERATIONS);
  if (!Number.isFinite(raw) || raw <= 0) return RECOMMENDED_ITERATIONS;
  return Math.min(MAX_ITERATIONS, Math.max(MIN_ITERATIONS, Math.floor(raw)));
}

// —— base64（不用 Node Buffer，Workers 里也能跑）——
function toB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function derive(
  plain: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(plain),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as unknown as BufferSource, iterations },
    key,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

/** 生成新哈希，格式：pbkdf2-sha256$<迭代次数>$<盐b64>$<派生b64> */
export async function hashPassword(plain: string): Promise<string> {
  const iterations = targetIterations();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await derive(plain, salt, iterations);
  return `${PREFIX}$${iterations}$${toB64(salt)}$${toB64(derived)}`;
}

/** 定长时间比较，避免通过响应耗时泄露前缀匹配长度 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function isBcryptHash(stored: string): boolean {
  return /^\$2[aby]?\$/.test(stored);
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (!stored) return false;

  if (stored.startsWith(`${PREFIX}$`)) {
    const parts = stored.split('$');
    // [prefix, iterations, salt, derived]
    if (parts.length !== 4) return false;
    const iterations = Number(parts[1]);
    if (!Number.isFinite(iterations) || iterations <= 0) return false;
    try {
      const salt = fromB64(parts[2]);
      const expected = fromB64(parts[3]);
      // 关键：用哈希串里记录的迭代次数，不是当前配置 ——
      // 否则改一次配置就会把所有老密码判为错误
      const actual = await derive(plain, salt, iterations);
      return timingSafeEqual(actual, expected);
    } catch {
      return false;
    }
  }

  // 老的 bcrypt 哈希（Docker 部署上的存量用户）
  if (isBcryptHash(stored)) {
    return bcrypt.compare(plain, stored);
  }

  return false;
}

/**
 * 这个哈希是否该在登录成功后重算一遍。
 *   * bcrypt 格式 → 该升级
 *   * PBKDF2 但迭代次数低于当前目标 → 该加固
 *
 * 注意调用方：重算会再花一份 CPU 预算。在 CF 免费套餐上这可能撑不住，
 * 所以升级必须是"尽力而为"，失败不能影响登录结果。
 */
export function needsRehash(stored: string): boolean {
  if (isBcryptHash(stored)) return true;
  if (!stored.startsWith(`${PREFIX}$`)) return false;
  const iterations = Number(stored.split('$')[1]);
  if (!Number.isFinite(iterations)) return true;
  return iterations < targetIterations();
}

/** 供诊断用：不暴露哈希内容，只说它是什么格式、多少强度 */
export function describeHash(stored: string): string {
  if (isBcryptHash(stored)) return 'bcrypt(legacy)';
  if (stored.startsWith(`${PREFIX}$`)) return `pbkdf2-sha256/${stored.split('$')[1]}`;
  return 'unknown';
}
