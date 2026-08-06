import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSessionUser, resolveOwnLedgerId } from '@/lib/ownership';
import { badRequest } from '@/lib/apiError';
import { parseBackup, planImport, type ImportMode } from '@/lib/importData';
import { applyImport, existingBuiltinKinds } from '@/lib/importExecute';
import { createLogger } from '@/lib/logger';

const log = createLogger('import');

// POST /api/import —— 还原 /api/export/json 导出的完整备份
//
// body: { mode: 'replace' | 'merge', dryRun?: boolean, backup: <备份 JSON> }
//
//   replace  先清空当前账号的全部业务数据，再导入 —— 真正的"还原到备份那一刻"
//   merge    保留现有数据，把备份内容追加进来
//   dryRun   只校验并返回预览，不写任何东西
//
// 换服务器/换账号的正路是 replace + dryRun 先看一眼。

const bodySchema = z.object({
  mode: z.enum(['replace', 'merge']).default('merge'),
  dryRun: z.boolean().default(false),
  backup: z.unknown(),
});

export async function POST(req: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const body = await req.json().catch(() => null);
  if (body === null) return badRequest('请求体不是合法 JSON');

  const parsedBody = bodySchema.safeParse(body);
  if (!parsedBody.success) return badRequest('参数错误：mode 只能是 replace 或 merge');
  const { mode, dryRun } = parsedBody.data;

  const parsed = parseBackup(parsedBody.data.backup);
  if (!parsed.ok) return badRequest(parsed.reason);

  // merge 时要知道用户已有哪些内置账本；replace 会先清空，所以不用查
  const builtins =
    mode === 'merge' ? await existingBuiltinKinds(user.id) : new Set<string>();

  // Phase 2：Entry/Event 挂 ledgerId，merge 时需要知道现有 work/taoyuan 的 id
  // 才能把备份里孤儿条目重定向过去。replace 模式下 replace 分支删掉现有账本再
  // 从备份重建，所以不需要（planImport 里也会检测并按新建走）。
  const existingBuiltinLedgerIds: { work?: string; taoyuan?: string } = {};
  if (mode === 'merge') {
    if (builtins.has('work')) {
      existingBuiltinLedgerIds.work = await resolveOwnLedgerId(user.id, 'work');
    }
    if (builtins.has('taoyuan')) {
      existingBuiltinLedgerIds.taoyuan = await resolveOwnLedgerId(user.id, 'taoyuan');
    }
  }

  const plan = planImport(parsed.backup, {
    targetUserId: user.id,
    mode: mode as ImportMode,
    existingBuiltinKinds: builtins,
    existingBuiltinLedgerIds,
  });

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      mode,
      summary: plan.summary,
      skipped: plan.skipped,
      imageRefCount: plan.imageRefCount,
      exportedAt: parsed.backup.exportedAt,
      sourceUsername: parsed.backup.user.username,
    });
  }

  try {
    await applyImport(user.id, plan, mode as ImportMode);
  } catch (err) {
    // 事务已回滚，数据没被动过 —— 这一点要明确告诉用户，否则他不敢重试
    log.error('导入失败，事务已回滚', err, { userId: user.id, mode });
    return NextResponse.json(
      {
        error: '导入失败，数据库已回滚到导入前的状态，你的数据没有被改动',
        code: 'import_failed',
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    mode,
    summary: plan.summary,
    skipped: plan.skipped,
    imageRefCount: plan.imageRefCount,
  });
}
