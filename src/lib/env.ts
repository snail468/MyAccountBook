// 启动期环境变量校验。
//
// 原来 SESSION_SECRET 缺失时会**静默回退**到一个硬编码默认值，
// 生产环境下等于所有人的会话 cookie 都能被伪造，而日志里只有一行 warn。
// 现在生产环境直接抛错拒绝启动 —— 配错了要立刻炸，不能带病上线。

const MIN_SECRET_LENGTH = 32;

const DEV_FALLBACK_SECRET = 'dev-only-insecure-secret-please-change-me-now';

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** 会话密钥。生产环境缺失或过短直接抛错。 */
export function requireSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    const reason = !secret
      ? 'SESSION_SECRET 未设置'
      : `SESSION_SECRET 只有 ${secret.length} 个字符，至少需要 ${MIN_SECRET_LENGTH}`;

    if (isProduction()) {
      throw new Error(
        `[env] ${reason}。生产环境拒绝启动 —— 用 openssl rand -base64 32 生成一个填进环境变量。`,
      );
    }
    console.warn(`[env] ${reason}。开发环境暂用不安全的默认值，上线前务必替换。`);
    return DEV_FALLBACK_SECRET;
  }

  if (isProduction() && secret === DEV_FALLBACK_SECRET) {
    throw new Error('[env] SESSION_SECRET 还是开发用的默认值，生产环境拒绝启动。');
  }

  return secret;
}

/**
 * 银行卡加密密钥。没配就表示该功能未启用（而不是降级成明文存储）。
 * 见 lib/cardCrypto.ts。
 */
export function getCardSecret(): string | null {
  const s = process.env.CARD_SECRET;
  if (!s || s.length < MIN_SECRET_LENGTH) return null;
  return s;
}
