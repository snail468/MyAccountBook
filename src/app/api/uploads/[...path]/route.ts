import { requireSessionUser } from '@/lib/ownership';
import { badRequest, notFound } from '@/lib/apiError';
import { getObject, guessContentType } from '@/lib/storage';
import { prisma } from '@/lib/db';
import { NOT_DELETED } from '@/lib/softDelete';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const { path } = await params;
  if (!path || path.length === 0) return badRequest('路径不合法');

  // 防路径穿越（路径里出现 .. 一律拒绝，早于任何其它解析）
  if (path.some((s) => s.includes('..'))) {
    return badRequest('路径不合法');
  }

  const key = path.map((s) => decodeURIComponent(s)).join('/');

  // 图片 key 结构是 <userId>/<yyyy-mm>/<hash>.<ext>，第一段是上传者。
  //
  // 历史上这里只允许「第一段 userId === 当前登录用户」才放行，理由是隐私——
  // 别人的文件对你来说就该"不存在"，返回 404 而非 403（后者会泄露 key 有效）。
  //
  // 但 B7 之后账本支持共享协作：桃源/工作/旅游账本里的图片可能由协作成员上传，
  // 于是落在「上传者的 userId 目录」下。账本 owner 看成员传的图、成员互相看对方的图，
  // 都会命中 ownerId !== user.id 被 404 挡掉 —— 表现就是"活动内容上传的图片全点不开"。
  //
  // 修正：上传者本人仍直接放行；否则只要这张图被「当前用户有权访问的账本」里的
  // 记录（活动 contentImages / 普通账本 imageUrls / 旅游支出 imageUrls）引用，就允许查看。
  // 未被你任何账本引用的别人的图，依旧返回 404，不泄露存在性。
  const ownerId = path[0];
  if (ownerId !== user.id) {
    const allowed = await isReferencedInMyLedger(user.id, `/api/uploads/${key}`);
    if (!allowed) return notFound();
  }

  const obj = await getObject(key);
  if (!obj) return notFound();

  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.contentType || guessContentType(key),
      'Content-Length': String(obj.size),
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}

/**
 * 判断指定上传 URL 是否被「userId 有权访问的账本」内的记录引用。
 * 任一角色（owner/editor/viewer）的成员身份都算"有权访问"——
 * 共享账本里协作者本就该能看到彼此上传的活动图片与票据。
 *
 * 三张带图表的引用查询与 lib/imageCleanup.ts 的引用计数保持一致（都用 contains 做子串匹配）。
 */
async function isReferencedInMyLedger(userId: string, url: string): Promise<boolean> {
  const ledgers = await prisma.ledger.findMany({
    where: { members: { some: { userId } }, ...NOT_DELETED },
    select: { id: true },
  });
  const ids = ledgers.map((l) => l.id);
  if (ids.length === 0) return false;

  const [ev, ge, te] = await Promise.all([
    prisma.event.findFirst({
      where: { ledgerId: { in: ids }, ...NOT_DELETED, contentImages: { contains: url } },
      select: { id: true },
    }),
    prisma.generalEntry.findFirst({
      where: { ledgerId: { in: ids }, ...NOT_DELETED, imageUrls: { contains: url } },
      select: { id: true },
    }),
    prisma.tripExpense.findFirst({
      where: { ledgerId: { in: ids }, ...NOT_DELETED, imageUrls: { contains: url } },
      select: { id: true },
    }),
  ]);

  return Boolean(ev || ge || te);
}
