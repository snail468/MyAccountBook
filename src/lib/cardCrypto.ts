// 银行卡敏感字段的加密。AES-256-GCM，密钥由 CARD_SECRET 派生。
//
// ---------------------------------------------------------------------------
// 威胁模型：这一层防的是**数据库文件泄露**
//
// app.db 就是一个文件，会被备份、被 cp 到别的机器、可能进了某个网盘。
// 卡号以明文躺在里面是不可接受的。加密后即使拿到 db 文件，没有 CARD_SECRET
// 也读不出卡号。
//
// 它**防不住**应用被攻破 —— 进程内既有密钥又有数据。这不是本层的目标，
// 也不该假装能防。所以 CARD_SECRET 应当与数据库分开保管（环境变量 / secrets），
// 绝不要写进 .env 再跟 app.db 放同一个备份包里。
//
// ---------------------------------------------------------------------------
// 几条硬性规则
//
//   1. **绝不存 CVV 和取款密码**。它们不是"加密后就能存"的东西 ——
//      支付行业规范明确禁止存储 CVV（PCI DSS 3.2），本应用也没有任何场景需要它。
//      这条在 schema 里没有对应字段，从结构上杜绝。
//   2. 没配 CARD_SECRET 就是功能未启用，**不降级成明文** ——
//      降级会让用户以为存的是加密的。
//   3. 每条记录用独立的随机 IV。GCM 下 IV 重用会直接暴露明文异或值，
//      是这个模式最经典的致命错误。

import { getCardSecret } from '@/lib/env';

const IV_BYTES = 12; // GCM 推荐 96 位
const VERSION = 'v1';

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

// 显式基于 ArrayBuffer 构造：`new Uint8Array(n)` 在当前 TS lib 下推断成
// Uint8Array<ArrayBufferLike>，而 crypto.subtle 要的是 BufferSource（不接受 SharedArrayBuffer）
function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** 功能是否可用。UI 与路由据此决定是否放行，而不是各自读环境变量 */
export function cardEncryptionAvailable(): boolean {
  return getCardSecret() !== null;
}

/**
 * 从 CARD_SECRET 派生 AES 密钥。
 *
 * 用固定盐的 PBKDF2：这里的目的不是抗离线爆破（CARD_SECRET 本来就要求
 * 至少 32 字符的高熵串），而是把任意长度的口令规整成 256 位密钥。
 * 盐固定是必需的 —— 每次派生必须得到同一把钥匙，否则昨天加密的今天解不开。
 */
async function deriveKey(): Promise<CryptoKey> {
  const secret = getCardSecret();
  if (!secret) {
    throw new Error('CARD_SECRET 未配置，银行卡功能不可用');
  }
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode('mab-card-v1'),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * 加密。输出格式自描述：`v1$<iv-b64>$<密文+tag-b64>`
 *
 * 带版本前缀是为了将来换算法时能识别老数据 —— 密码哈希那边吃过这个亏
 * （见 lib/auth.ts），这次一开始就带上。
 */
export async function encryptField(plain: string): Promise<string> {
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plain),
  );
  return `${VERSION}$${toB64(iv)}$${toB64(new Uint8Array(cipher))}`;
}

/**
 * 解密。任何异常（格式不对、密钥换了、密文被改过）都抛错 ——
 * **不返回空字符串**：静默返回空会让界面显示一张"卡号为空"的卡片，
 * 用户以为数据没了，实际是密钥配错了。
 */
export async function decryptField(stored: string): Promise<string> {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== VERSION) {
    throw new Error('密文格式无法识别');
  }
  const key = await deriveKey();
  const iv = fromB64(parts[1]);
  const data = fromB64(parts[2]);
  // GCM 的认证标签校验失败会在这里抛 —— 密文被篡改过就解不出来，这是我们要的
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(plain);
}

// 纯格式化函数在 cardFormat.ts（客户端安全）。这里 re-export，
// 服务端调用点仍然只需 import cardCrypto 一个模块。
export {
  isPlausibleCardNumber,
  last4Of,
  maskCardNumber,
  normalizeCardNumber,
} from '@/lib/cardFormat';
