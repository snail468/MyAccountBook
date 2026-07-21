// 存储抽象：文件系统 vs Cloudflare R2
//   本地/Docker：文件系统（沿用旧行为，不需要任何 env）
//   Cloudflare：设置 R2_ACCOUNT_ID / R2_ACCESS_KEY / R2_SECRET_KEY / R2_BUCKET 即启用 R2
//     —— 用 S3 兼容 API 走 fetch，Workers/Node 都能跑
//
// 存储的 key 结构与文件系统一致：`<userId>/<yyyy-mm>/<hash>.<ext>`
// 上传后返回 URL 形如 `/api/uploads/<userId>/<yyyy-mm>/<hash>.<ext>` —— 前端不变

import { createHash } from 'node:crypto';

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
      stream.on('data', (c) => ctrl.enqueue(c instanceof Buffer ? new Uint8Array(c) : c));
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
  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body,
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

// —— SigV4 for R2（region=auto, service=s3）——
async function signR2Request(
  method: 'GET' | 'PUT',
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

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return new Uint8Array(buf);
  }
  return new Uint8Array(createHash('sha256').update(data).digest());
}

async function hmac(key: Uint8Array, msg: string): Promise<Uint8Array> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const buf = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(msg));
    return new Uint8Array(buf);
  }
  const { createHmac } = require('node:crypto');
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
