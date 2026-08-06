import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { ensureLegacyMigrated } from '@/lib/legacyMigrate';
import { buildEventTree } from '@/lib/taoyuanSerialize';
import { NOT_DELETED } from '@/lib/softDelete';
import { CREATED_DESC_ORDER, slicePageByCreated } from '@/lib/pagination';
import { resolveOwnLedgerId } from '@/lib/ownership';
import Prefetcher from '@/components/ui/Prefetcher';
import PendingBadge from '@/components/ui/PendingBadge';
import TaoyuanClient from './TaoyuanClient';

export const dynamic = 'force-dynamic';

// 已完成归档每页条数。活跃项不分页，所以这里可以给得小一点。
const PAID_PAGE_SIZE = 20;

async function loadTaoyuan(userId: string) {
  // Phase 2：/taoyuan 与 /work 同思路 —— 展示"我 owner 的那本桃源账本"。
  // 共享的桃源账本走 /l/[id]。
  const ledgerId = await resolveOwnLedgerId(userId, 'taoyuan');

  // 展开金额时只带未删的金额行 —— 卡片上的三段金额（预测/公示/到账）
  // 就不会包含用户已经删掉的那些
  const include = {
    amounts: {
      where: { deletedAt: null },
      orderBy: { occurredAt: 'asc' as const },
    },
  };

  const [activeTop, paidTop] = await Promise.all([
    // 活跃项（未到账）全量加载：数量天然有界，且 MergeBar 合并需要看到全部候选
    prisma.event.findMany({
      where: {
        ledgerId,
        ...NOT_DELETED,
        parentId: null,
        status: { in: ['published', 'predicted', 'announced'] },
      },
      include,
      orderBy: CREATED_DESC_ORDER,
    }),
    // 已到账归档：只取第一页，其余靠 /api/events/paid 翻页
    prisma.event.findMany({
      where: { ledgerId, ...NOT_DELETED, parentId: null, status: 'paid' },
      include,
      orderBy: CREATED_DESC_ORDER,
      take: PAID_PAGE_SIZE + 1,
    }),
  ]);

  const paidPage = slicePageByCreated(paidTop, PAID_PAGE_SIZE);
  const loadedTop = [...activeTop, ...paidPage.items];

  const children =
    loadedTop.length > 0
      ? await prisma.event.findMany({
          where: { ledgerId, ...NOT_DELETED, parentId: { in: loadedTop.map((e) => e.id) } },
          include,
        })
      : [];

  return {
    events: buildEventTree(loadedTop, children),
    paidCursor: paidPage.nextCursor,
    activeCount: activeTop.length,
  };
}

export default async function TaoyuanPage() {
  const user = await requireUser();
  if (!user) redirect('/login');

  await ensureLegacyMigrated();

  const data = await loadTaoyuan(user.id);

  return (
    <div className="px-6 pt-14 pb-24">
      <Prefetcher routes={['/']} />
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-ink-500 text-sm">‹ 返回</Link>
        <h1 className="text-2xl font-semibold flex-1">桃源账本</h1>
      </div>

      <PendingBadge kind="taoyuan" />

      <TaoyuanClient initialEvents={data.events} initialPaidCursor={data.paidCursor} />
    </div>
  );
}
