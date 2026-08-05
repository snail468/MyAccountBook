// 图片生命周期：业务数据被删/被改时，顺手把不再被引用的上传文件清掉。
//
// 背景：v1 只写不删，R2 桶和 data/uploads 只增不减 —— 删掉一整个旅游账本，
// 几十张小票照片会永远留在存储里。
//
// 设计原则：
//   * 清理**永远不能**让主操作失败。所有函数吞掉异常，只记日志。
//   * 只删 `/api/uploads/` 前缀的自家文件；用户手填的外链一律跳过。
//   * 同一张图可能被多条记录引用（内容寻址后尤其如此），删之前先确认没有别人在用。

import { prisma } from '@/lib/db';
import { deleteUploadUrls, keyFromUploadUrl } from '@/lib/storage';
import { createLogger, errorFields } from '@/lib/logger';

const log = createLogger('imageCleanup');

/** 解析数据库里存的 imageUrls / contentImages（JSON 数组字符串） */
export function parseImageUrls(v: string | null | undefined): string[] {
  if (!v) return [];
  try {
    const arr = JSON.parse(v);
    if (Array.isArray(arr)) return arr.filter((x): x is string => typeof x === 'string');
  } catch {
    /* 老数据可能是逗号分隔或单个 URL */
    if (typeof v === 'string' && v.startsWith('/api/uploads/')) return [v];
  }
  return [];
}

/**
 * 过滤掉仍被其它记录引用的 URL，返回可以安全删除的那部分。
 *
 * 用 LIKE 在三张带图的表里扫一遍。数据量级是个人账本（几千条），
 * 全表扫可以接受；真到十万级需要改成单独的 ImageRef 表做引用计数。
 */
async function filterUnreferenced(urls: string[], excludeIds: {
  generalEntryId?: string;
  tripExpenseId?: string;
  eventId?: string;
}): Promise<string[]> {
  const safe: string[] = [];
  for (const url of urls) {
    if (!keyFromUploadUrl(url)) continue; // 外链，不归我们管

    const [g, t, e] = await Promise.all([
      prisma.generalEntry.count({
        where: {
          imageUrls: { contains: url },
          ...(excludeIds.generalEntryId ? { id: { not: excludeIds.generalEntryId } } : {}),
        },
      }),
      prisma.tripExpense.count({
        where: {
          imageUrls: { contains: url },
          ...(excludeIds.tripExpenseId ? { id: { not: excludeIds.tripExpenseId } } : {}),
        },
      }),
      prisma.event.count({
        where: {
          contentImages: { contains: url },
          ...(excludeIds.eventId ? { id: { not: excludeIds.eventId } } : {}),
        },
      }),
    ]);

    if (g + t + e === 0) safe.push(url);
  }
  return safe;
}

/**
 * 记录被删除后清理它引用的图片。
 * 必须在数据库删除**之后**调用，这样引用计数查询不会把自己算进去。
 */
export async function cleanupImagesAfterDelete(
  imageUrlsJson: string | null | undefined,
): Promise<void> {
  try {
    const urls = parseImageUrls(imageUrlsJson);
    if (urls.length === 0) return;
    const unreferenced = await filterUnreferenced(urls, {});
    if (unreferenced.length > 0) await deleteUploadUrls(unreferenced);
  } catch (err) {
    log.warn('删除后清理图片失败', errorFields(err));
  }
}

/**
 * 编辑时用户移掉了几张图 —— 把移掉的那些删掉。
 * 在数据库更新**之后**调用，excludeId 传被更新记录自己的 id 已无必要
 * （它的 imageUrls 已经是新值了），但保留参数以便调用方明确意图。
 */
export async function cleanupRemovedImages(
  beforeJson: string | null | undefined,
  afterUrls: string[],
): Promise<void> {
  try {
    const before = parseImageUrls(beforeJson);
    if (before.length === 0) return;
    const after = new Set(afterUrls);
    const removed = before.filter((u) => !after.has(u));
    if (removed.length === 0) return;
    const unreferenced = await filterUnreferenced(removed, {});
    if (unreferenced.length > 0) await deleteUploadUrls(unreferenced);
  } catch (err) {
    log.warn('清理被移除的图片失败', errorFields(err));
  }
}

/**
 * 账本被永久删除前，收集它下面所有记录的图片。
 * 必须在删除**之前**调用（拿 URL 列表），删除之后再执行实际的文件清理。
 */
export async function collectLedgerImageUrls(ledgerId: string): Promise<string[]> {
  try {
    const [entries, expenses] = await Promise.all([
      prisma.generalEntry.findMany({
        where: { ledgerId, imageUrls: { not: null } },
        select: { imageUrls: true },
      }),
      prisma.tripExpense.findMany({
        where: { ledgerId, imageUrls: { not: null } },
        select: { imageUrls: true },
      }),
    ]);
    const urls = new Set<string>();
    for (const r of [...entries, ...expenses]) {
      for (const u of parseImageUrls(r.imageUrls)) urls.add(u);
    }
    return [...urls];
  } catch (err) {
    log.warn('收集账本图片失败', errorFields(err));
    return [];
  }
}

/** 配合 collectLedgerImageUrls：账本删完后执行实际清理 */
export async function cleanupCollectedImages(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  try {
    const unreferenced = await filterUnreferenced(urls, {});
    if (unreferenced.length > 0) await deleteUploadUrls(unreferenced);
  } catch (err) {
    log.warn('清理已收集的图片失败', errorFields(err));
  }
}
