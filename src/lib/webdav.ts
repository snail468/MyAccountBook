import { prisma } from '@/lib/db';
import { createLogger, errorFields } from '@/lib/logger';

const log = createLogger('webdav');

export type WebdavConfig = {
  url: string;
  username: string;
  password?: string;
  remotePath: string;
  autoBackupEnabled: boolean;
  scheduleTime: string; // 北京时间 "HH:mm"，如 "03:00"
  lastBackupAt?: string | null;
  lastBackupStatus?: 'success' | 'failed' | null;
  lastBackupMessage?: string | null;
};

export type WebdavFileItem = {
  name: string;
  href: string;
  sizeBytes: number;
  lastModified: string; // ISO 格式
  isCollection: boolean;
};

export const DEFAULT_WEBDAV_CONFIG: WebdavConfig = {
  url: '',
  username: '',
  password: '',
  remotePath: '/MyAccountBook',
  autoBackupEnabled: false,
  scheduleTime: '03:00',
  lastBackupAt: null,
  lastBackupStatus: null,
  lastBackupMessage: null,
};

/** 从数据库读取 WebDAV 配置 */
export async function getStoredWebdavConfig(): Promise<WebdavConfig> {
  const row = await prisma.systemSetting.findUnique({
    where: { key: 'webdav_config' },
  });
  if (!row) return { ...DEFAULT_WEBDAV_CONFIG };
  try {
    const parsed = JSON.parse(row.value);
    return { ...DEFAULT_WEBDAV_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_WEBDAV_CONFIG };
  }
}

/** 持久化 WebDAV 配置到数据库 */
export async function saveStoredWebdavConfig(config: Partial<WebdavConfig>): Promise<WebdavConfig> {
  const current = await getStoredWebdavConfig();
  const next: WebdavConfig = {
    ...current,
    ...config,
    password: config.password !== undefined && config.password !== '' ? config.password : current.password,
  };

  await prisma.systemSetting.upsert({
    where: { key: 'webdav_config' },
    create: {
      key: 'webdav_config',
      value: JSON.stringify(next),
    },
    update: {
      value: JSON.stringify(next),
    },
  });

  return next;
}

/** 组装规范化的 WebDAV 基础目标目录 URL */
export function getWebdavDirectoryUrl(url: string, remotePath: string): string {
  const base = url.trim().replace(/\/+$/, '');
  const cleanPath = remotePath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  return cleanPath ? `${base}/${cleanPath}/` : `${base}/`;
}

/** 生成 HTTP Basic Auth 头部 */
export function getAuthHeader(username: string, password?: string): string {
  const token = Buffer.from(`${username}:${password || ''}`).toString('base64');
  return `Basic ${token}`;
}

/**
 * 健壮解析 WebDAV PROPFIND XML 多状态响应 (RFC 4918 Multi-Status)
 * 使用通用正则提取，避免复杂 XML 解析库在不同环境下的依赖问题
 */
export function parseWebdavPropfindXml(xml: string): WebdavFileItem[] {
  const items: WebdavFileItem[] = [];
  const responseRegex = /<(?:[a-zA-Z0-9_-]+:)?response>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?response>/gi;
  let respMatch: RegExpExecArray | null;

  while ((respMatch = responseRegex.exec(xml)) !== null) {
    const chunk = respMatch[1];

    // 提取 href
    const hrefMatch = /<(?:[a-zA-Z0-9_-]+:)?href>([^<]+)<\/(?:[a-zA-Z0-9_-]+:)?href>/i.exec(chunk);
    if (!hrefMatch) continue;
    const rawHref = hrefMatch[1].trim();

    // 判断是否为目录 (collection)
    const isCollection =
      /<(?:[a-zA-Z0-9_-]+:)?collection\s*\/>/i.test(chunk) ||
      /<(?:[a-zA-Z0-9_-]+:)?resourcetype>[\s\S]*?collection[\s\S]*?<\/(?:[a-zA-Z0-9_-]+:)?resourcetype>/i.test(chunk);

    // 提取文件大小
    const lengthMatch = /<(?:[a-zA-Z0-9_-]+:)?getcontentlength>([^<]+)<\/(?:[a-zA-Z0-9_-]+:)?getcontentlength>/i.exec(chunk);
    const sizeBytes = lengthMatch ? parseInt(lengthMatch[1].trim(), 10) || 0 : 0;

    // 提取最后修改时间
    const modMatch = /<(?:[a-zA-Z0-9_-]+:)?getlastmodified>([^<]+)<\/(?:[a-zA-Z0-9_-]+:)?getlastmodified>/i.exec(chunk);
    let lastModified = new Date().toISOString();
    if (modMatch) {
      const parsed = new Date(modMatch[1].trim());
      if (!isNaN(parsed.getTime())) {
        lastModified = parsed.toISOString();
      }
    }

    // 提取显示名 / 文件名
    const decodedHref = decodeURIComponent(rawHref).replace(/\/+$/, '');
    const parts = decodedHref.split('/');
    const name = parts[parts.length - 1] || '';

    if (name) {
      items.push({
        name,
        href: rawHref,
        sizeBytes,
        lastModified,
        isCollection,
      });
    }
  }

  return items;
}

/** 确保 WebDAV 目录存在，若不存在则逐级 MKCOL 创建 */
export async function ensureWebdavDirectory(config: WebdavConfig): Promise<void> {
  const base = config.url.trim().replace(/\/+$/, '');
  const path = config.remotePath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  const segments = path.split('/').filter(Boolean);

  let currentUrl = base;
  for (const seg of segments) {
    currentUrl += `/${encodeURIComponent(seg)}`;
    try {
      const headRes = await fetch(currentUrl, {
        method: 'PROPFIND',
        headers: {
          Authorization: getAuthHeader(config.username, config.password),
          Depth: '0',
        },
      });
      if (headRes.status === 404) {
        await fetch(currentUrl, {
          method: 'MKCOL',
          headers: {
            Authorization: getAuthHeader(config.username, config.password),
          },
        });
      }
    } catch {
      // ignore
    }
  }
}

/** 测试 WebDAV 连通性 */
export async function testWebdavConnection(
  config: WebdavConfig
): Promise<{ ok: boolean; message: string; details?: unknown }> {
  if (!config.url || !config.username) {
    return { ok: false, message: '请填写 WebDAV 服务器地址和用户名' };
  }

  const dirUrl = getWebdavDirectoryUrl(config.url, config.remotePath);

  try {
    const res = await fetch(dirUrl, {
      method: 'PROPFIND',
      headers: {
        Authorization: getAuthHeader(config.username, config.password),
        Depth: '0',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 401) {
      return { ok: false, message: 'WebDAV 认证失败：用户名或密码不正确' };
    }
    if (res.status === 403) {
      return { ok: false, message: 'WebDAV 访问受限：无访问权限 (403 Forbidden)' };
    }
    if (res.status === 404) {
      // 目录不存在，尝试自动创建
      try {
        await ensureWebdavDirectory(config);
        return { ok: true, message: 'WebDAV 连通成功（已自动初始化备份目录）' };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, message: `目录不存在且自动创建失败: ${msg}` };
      }
    }

    if (res.status >= 200 && res.status < 300) {
      return { ok: true, message: 'WebDAV 连通成功！可正常读写备份。' };
    }

    return { ok: false, message: `WebDAV 响应异常 (HTTP ${res.status}): ${res.statusText}` };
  } catch (err: unknown) {
    log.error('WebDAV 连接测试异常', errorFields(err));
    const msg = err instanceof Error ? err.message : '网络连接超时';
    return { ok: false, message: `无法连接到 WebDAV 服务器：${msg}` };
  }
}

/** 列出 WebDAV 备份目录中的所有备份文件 */
export async function listWebdavBackups(config: WebdavConfig): Promise<WebdavFileItem[]> {
  const dirUrl = getWebdavDirectoryUrl(config.url, config.remotePath);

  const res = await fetch(dirUrl, {
    method: 'PROPFIND',
    headers: {
      Authorization: getAuthHeader(config.username, config.password),
      Depth: '1',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    if (res.status === 404) {
      return [];
    }
    throw new Error(`获取 WebDAV 文件列表失败 (HTTP ${res.status}): ${res.statusText}`);
  }

  const xml = await res.text();
  const allItems = parseWebdavPropfindXml(xml);

  // 过滤：仅保留匹配备份归档包特征的文件，排除目录自身与非备份文件
  const backupFiles = allItems.filter((item) => {
    if (item.isCollection) return false;
    return (
      item.name.startsWith('MyAccountBook_backup_') ||
      item.name.endsWith('.json.gz') ||
      item.name.endsWith('.tar.gz')
    );
  });

  // 按文件名（包含时间戳 YYYYMMDD_HHmmss）或修改时间倒序排列（最新在前）
  backupFiles.sort((a, b) => {
    if (a.name !== b.name) {
      return b.name.localeCompare(a.name);
    }
    return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
  });

  return backupFiles;
}

/**
 * 执行保留策略：最多保留 7 份备份，超出自动清理最旧的备份
 */
export async function enforceBackupRetention(config: WebdavConfig): Promise<number> {
  try {
    const backups = await listWebdavBackups(config);
    if (backups.length <= 7) {
      return 0;
    }

    // 多于 7 份时，取第 7 份之后的旧备份（按时间倒序排序后超出部分为最旧）
    const excess = backups.slice(7);
    let deletedCount = 0;

    for (const oldFile of excess) {
      try {
        await deleteWebdavBackup(config, oldFile.name);
        deletedCount++;
        log.info(`WebDAV 自动清理旧备份: ${oldFile.name}`);
      } catch (delErr) {
        log.warn(`清理旧备份失败: ${oldFile.name}`, errorFields(delErr));
      }
    }

    return deletedCount;
  } catch (err) {
    log.warn('执行备份保留清理策略失败', errorFields(err));
    return 0;
  }
}

/** 上传备份到 WebDAV 并触发 7 份滚动清理 */
export async function uploadWebdavBackup(
  config: WebdavConfig,
  filename: string,
  content: Buffer
): Promise<{ ok: boolean; filename: string; deletedOldCount: number }> {
  await ensureWebdavDirectory(config);

  const dirUrl = getWebdavDirectoryUrl(config.url, config.remotePath);
  const fileUrl = `${dirUrl}${encodeURIComponent(filename)}`;

  const res = await fetch(fileUrl, {
    method: 'PUT',
    headers: {
      Authorization: getAuthHeader(config.username, config.password),
      'Content-Type': 'application/gzip',
    },
    body: new Uint8Array(content),
    signal: AbortSignal.timeout(60000), // 60s
  });

  if (!res.ok) {
    throw new Error(`上传备份到 WebDAV 失败 (HTTP ${res.status}): ${res.statusText}`);
  }

  // 上传成功后，自动执行保留 7 份策略
  const deletedOldCount = await enforceBackupRetention(config);

  return { ok: true, filename, deletedOldCount };
}

/** 从 WebDAV 下载指定备份文件 */
export async function downloadWebdavBackup(config: WebdavConfig, filename: string): Promise<Buffer> {
  const dirUrl = getWebdavDirectoryUrl(config.url, config.remotePath);
  const fileUrl = `${dirUrl}${encodeURIComponent(filename)}`;

  const res = await fetch(fileUrl, {
    method: 'GET',
    headers: {
      Authorization: getAuthHeader(config.username, config.password),
    },
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    throw new Error(`从 WebDAV 下载备份失败 (HTTP ${res.status}): ${res.statusText}`);
  }

  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

/** 删除 WebDAV 上的单个指定备份文件 */
export async function deleteWebdavBackup(config: WebdavConfig, filename: string): Promise<{ ok: boolean }> {
  const dirUrl = getWebdavDirectoryUrl(config.url, config.remotePath);
  const fileUrl = `${dirUrl}${encodeURIComponent(filename)}`;

  const res = await fetch(fileUrl, {
    method: 'DELETE',
    headers: {
      Authorization: getAuthHeader(config.username, config.password),
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok && res.status !== 404) {
    throw new Error(`从 WebDAV 删除备份失败 (HTTP ${res.status}): ${res.statusText}`);
  }

  return { ok: true };
}
