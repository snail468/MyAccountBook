import Link from 'next/link';
import { prisma } from '@/lib/db';
import { buildEventTree } from '@/lib/taoyuanSerialize';
import { NOT_DELETED } from '@/lib/softDelete';
import { CREATED_DESC_ORDER, slicePageByCreated } from '@/lib/pagination';
import PendingBadge from '@/components/ui/PendingBadge';
import TaoyuanClient from '../TaoyuanClient';

// 桃源账本主 section。同 WorkMonthsSection：/taoyuan 与 /l/[id] (kind=taoyuan)
// 共用同一段。TaoyuanClient 内部的 NewEventButton / 加载更多都会带上 ledgerId。

const PAID_PAGE_SIZE = 20;

async function loadTaoyuan(ledgerId: string) {
  const include = {
    amounts: {
      where: { deletedAt: null },
      orderBy: { occurredAt: 'asc' as const },
    },
  };

  const [activeTop, paidTop] = await Promise.all([
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
  };
}

export default async function TaoyuanSection({
  ledgerId,
  ledgerName,
  backHref,
}: {
  ledgerId: string;
  ledgerName: string;
  backHref: string;
}) {
  const data = await loadTaoyuan(ledgerId);

  return (
    <div className="px-6 pt-14 pb-24">
      <div className="flex items-center gap-3 mb-6">
        <Link href={backHref} className="text-ink-500 text-sm">‹ 返回</Link>
        <h1 className="text-2xl font-semibold flex-1">{ledgerName}</h1>
        <Link
          href={`/l/${ledgerId}/collaborators`}
          className="text-ink-400 text-sm"
          aria-label="协作成员"
          title="协作成员"
        >
          👥
        </Link>
      </div>

      <PendingBadge kind="taoyuan" ledgerId={ledgerId} />

      <TaoyuanClient
        initialEvents={data.events}
        initialPaidCursor={data.paidCursor}
        ledgerId={ledgerId}
      />
    </div>
  );
}
