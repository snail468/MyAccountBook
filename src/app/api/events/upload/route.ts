import { NextResponse } from 'next/server';
import { requireSessionUser } from '@/lib/ownership';
import { badRequest, payloadTooLarge, unsupportedMediaType } from '@/lib/apiError';
import { hashOf, monthKey, putObject } from '@/lib/storage';
import { sniffImage } from '@/lib/imageSniff';

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const form = await req.formData().catch(() => null);
  if (!form) return badRequest('请求格式错误');

  const file = form.get('file');
  if (!(file instanceof Blob)) {
    return badRequest('缺少文件');
  }
  if (file.size > MAX_BYTES) {
    return payloadTooLarge('单张最大 8MB');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // 只认文件内容的魔数，不信任客户端声明的 MIME
  const sniffed = sniffImage(bytes);
  if (!sniffed) {
    return unsupportedMediaType('只支持 jpg/png/webp/gif 图片');
  }

  // 内容寻址：key = <userId>/<yyyy-mm>/<sha256 前 24 位>.<ext>
  //
  // 换掉了原来"清洗标题 + 扫描目录找下一个可用编号"的方案，那个方案有三个问题：
  //   * 并发上传会拿到同一个编号，后写覆盖先写
  //   * 本地模式最多要做 999 次 access 系统调用
  //   * 文件名带用户输入，需要额外清洗
  // 内容寻址天然幂等（同一张图重复上传不产生新文件）、无竞态、O(1)。
  const filename = `${hashOf(bytes)}.${sniffed.ext}`;
  const key = `${user.id}/${monthKey()}/${filename}`;

  await putObject(key, bytes, sniffed.mime);

  return NextResponse.json({
    ok: true,
    url: `/api/uploads/${key}`,
  });
}
