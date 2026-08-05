// 存储抽象：本地文件系统 vs S3 兼容对象存储
//   默认：写本地文件系统（不需要任何 env），随数据卷一起备份
//   可选：填齐 R2_ACCOUNT_ID / R2_ACCESS_KEY / R2_SECRET_KEY / R2_BUCKET 即切到对象存储
//     —— 自己签 SigV4 走 fetch，没有 aws-sdk 依赖。
//        MinIO / Backblaze B2 / Cloudflare R2 / AWS S3 都是这套协议。
//        变量名带 R2_ 前缀是历史原因，与服务商无关；换服务商改下面的 r2Endpoint()。
//
// 存储的 key 结构与文件系统一致：`<userId>/<yyyy-mm>/<hash>.<ext>`
// 上传后返回 URL 形如 `/api/uploads/<userId>/<yyyy-mm>/<hash>.<ext>` —— 前端不变

import { createHash, createHmac } from 'node:crypto';
import { createLogger, errorFields } from '@/lib/logger';

const log = createLogger('storage');

export type StoredFile = {
  key: string; // 相对路径 userId/yyyy-mm/xxx.ext
  bytes: number;
  contentType: string;
};

export function isR2Configured(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY &&
    process.env.R2_SECRET_KEY &&
    process.env.R2_BUCKET
  );
}

// ==== 写入 ====
export async function putObject(key: string, body: Uint8Array, contentType: string): Promise<void> {
  if (isR2Configured()) {
    await r2Put(key, body, contentType);
    return;
  }
  // 本地：写文件系统
  const { join, dirname } = await import('node:path');
  const { mkdir, writeFile } = await import('node:fs/promises');
  const root = process.env.UPLOAD_ROOT || join(process.cwd(), 'data', 'uploads');
  const full = join(root, key);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, body);
}

// ==== 读取 ====
export type ReadResult = {
  body: ReadableStream<Uint8Array>;
  size: number;
  contentType: string;
} | null;

export async function getObject(key: string): Promise<ReadResult> {
  if (isR2Configured()) {
    return r2Get(key);
  }
  const { join, resolve, sep, normalize } = await import('node:path');
  const { createReadStream } = await import('node:fs');
  const { stat } = await import('node:fs/promises');
  const root = process.env.UPLOAD_ROOT || join(process.cwd(), 'data', 'uploads');
  const rootResolved = resolve(root);
  const rel = normalize(key);
  if (rel.includes(`..${sep}`) || rel.startsWith(`..${sep}`) || rel === '..') return null;
  const full = resolve(root, rel);
  if (!full.startsWith(rootResolved + sep) && full !== rootResolved) return null;
  const st = await stat(full).catch(() => null);
  if (!st || !st.isFile()) return null;
  const stream = createReadStream(full);
  const web = new ReadableStream<Uint8Array>({
    start(ctrl) {
      stream.on('data', (chunk) => {
        // 不设 encoding 时 chunk 是 Buffer；转成 Uint8Array 视图入队
        const buf = chunk as Buffer;
        ctrl.enqueue(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
      });
      stream.on('end', () => ctrl.close());
      stream.on('error', (e) => ctrl.error(e));
    },
    cancel() {
      stream.destroy();
    },
  });
  return {
    body: web,
    size: st.size,
    contentType: guessContentType(key),
  };
}

// ==== 删除 ====
// 条目/活动/账本被硬删时调用，避免存储只增不减。
// 失败只记日志不抛错 —— 删业务数据是主操作，清图片是尽力而为的附带操作，
// 不能因为一张图删不掉就让用户的删除操作失败。
export async function deleteObject(key: string): Promise<boolean> {
  try {
    if (isR2Configured()) {
      return await r2Delete(key);
    }
    const { join, resolve, sep, normalize } = await import('node:path');
    const { unlink } = await import('node:fs/promises');
    const root = process.env.UPLOAD_ROOT || join(process.cwd(), 'data', 'uploads');
    const rootResolved = resolve(root);
    const rel = normalize(key);
    // 与 getObject 相同的穿越防护：绝不允许删到上传根目录之外
    if (rel.includes(`..${sep}`) || rel.startsWith(`..${sep}`) || rel === '..') return false;
    const full = resolve(root, rel);
    if (!full.startsWith(rootResolved + sep)) return false;
    await unlink(full);
    return true;
  } catch (err) {
    // ENOENT 属于正常情况（图片可能早就被删了 / 从没写成功过）
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      log.warn('删除对象失败', { key, ...errorFields(err) });
    }
    return false;
  }
}

/**
 * 把 `/api/uploads/<userId>/<...>` 形式的 URL 还原成存储 key。
 * 非本站上传的 URL（用户手填的外链）返回 null，调用方跳过即可。
 */
export function keyFromUploadUrl(url: string): string | null {
  const PREFIX = '/api/uploads/';
  if (!url.startsWith(PREFIX)) return null;
  const rest = url.slice(PREFIX.length).split('?')[0];
  if (!rest) return null;
  try {
    const key = rest
      .split('/')
      .map((s) => decodeURIComponent(s))
      .join('/');
    if (key.includes('..')) return null;
    return key;
  } catch {
    return null;
  }
}

/** 批量删除一组上传 URL 对应的对象，返回实际删掉的数量 */
export async function deleteUploadUrls(urls: string[]): Promise<number> {
  let n = 0;
  for (const u of urls) {
    const key = keyFromUploadUrl(u);
    if (!key) continue;
    if (await deleteObject(key)) n += 1;
  }
  return n;
}

// ==================== R2（S3 兼容 API）====================
// 用 AWS SigV4 手写签名，避免拉 aws-sdk 巨型依赖，Node/Workers 都能跑

function r2Endpoint(): string {
  const account = process.env.R2_ACCOUNT_ID!;
  return `https://${account}.r2.cloudflarestorage.com`;
}

async function r2Put(key: string, body: Uint8Array, contentType: string) {
  const bucket = process.env.R2_BUCKET!;
  const url = `${r2Endpoint()}/${bucket}/${key}`;
  const headers = await signR2Request('PUT', url, body, contentType);
  // TS 5.7+ 里 Uint8Array<ArrayBufferLike> 不再满足 BodyInit —— 拷成独立 ArrayBuffer
  const ab = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body: ab,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`R2 PUT failed: ${res.status} ${text}`);
  }
}

async function r2Get(key: string): Promise<ReadResult> {
  const bucket = process.env.R2_BUCKET!;
  const url = `${r2Endpoint()}/${bucket}/${key}`;
  const headers = await signR2Request('GET', url);
  const res = await fetch(url, { method: 'GET', headers });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return {
    body: res.body as ReadableStream<Uint8Array>,
    size: Number(res.headers.get('content-length') ?? 0),
    contentType: res.headers.get('content-type') ?? guessContentType(key),
  };
}

async function r2Delete(key: string): Promise<boolean> {
  const bucket = process.env.R2_BUCKET!;
  const url = `${r2Endpoint()}/${bucket}/${key}`;
  const headers = await signR2Request('DELETE', url);
  const res = await fetch(url, { method: 'DELETE', headers });
  // S3 语义：删不存在的对象也返回 204，这里一并当成功
  return res.ok || res.status === 404;
}

// —— SigV4 for R2（region=auto, service=s3）——
async function signR2Request(
  method: 'GET' | 'PUT' | 'DELETE',
  urlStr: string,
  body?: Uint8Array,
  contentType?: string,
): Promise<Record<string, string>> {
  const url = new URL(urlStr);
  const now = new Date();
  const amzDate = now
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const region = 'auto';
  const service = 's3';
  const accessKey = process.env.R2_ACCESS_KEY!;
  const secretKey = process.env.R2_SECRET_KEY!;

  const payloadHash = body
    ? bufToHex(await sha256(body))
    : 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const canonicalUri = url.pathname;
  const canonicalQuery = '';
  const host = url.host;
  const headers: Record<string, string> = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (contentType) headers['content-type'] = contentType;

  const sortedHeaderKeys = Object.keys(headers).sort();
  const canonicalHeaders =
    sortedHeaderKeys.map((k) => `${k}:${headers[k]}`).join('\n') + '\n';
  const signedHeaders = sortedHeaderKeys.join(';');

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    bufToHex(await sha256(new TextEncoder().encode(canonicalRequest))),
  ].join('\n');

  const kDate = await hmac(new TextEncoder().encode('AWS4' + secretKey), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = bufToHex(await hmac(kSigning, stringToSign));

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    ...headers,
    Authorization: authorization,
  };
}

// TS 5.7+：Uint8Array<ArrayBufferLike> 不满足 DOM BufferSource（可能背靠
// SharedArrayBuffer）。我们的数据都来自 TextEncoder/digest，实际都是普通
// ArrayBuffer —— 统一 cast 收敛类型
function asBufferSource(data: Uint8Array): BufferSource {
  return data as unknown as BufferSource;
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', asBufferSource(data));
    return new Uint8Array(buf);
  }
  return new Uint8Array(createHash('sha256').update(data).digest());
}

async function hmac(key: Uint8Array, msg: string): Promise<Uint8Array> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      asBufferSource(key),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const buf = await crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      asBufferSource(new TextEncoder().encode(msg)),
    );
    return new Uint8Array(buf);
  }
  return new Uint8Array(createHmac('sha256', key).update(msg).digest());
}

function bufToHex(buf: Uint8Array): string {
  let out = '';
  for (const b of buf) out += b.toString(16).padStart(2, '0');
  return out;
}

// ==================== 辅助 ====================
export function hashOf(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 24);
}

export function guessContentType(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
}

export function monthKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
