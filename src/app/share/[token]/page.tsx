import Link from 'next/link';
import { prisma } from '@/lib/db';
import { loadTravel } from '@/lib/travelData';
import { verifyShareToken } from '@/lib/shareToken';
import TravelView from '@/app/l/[id]/TravelView';

export const dynamic = 'force-dynamic';

// 旅游账本的「只读分享」公开页。不调用 requireUser —— 任何拿到分享链接的人都能看。
// 数据由服务端用签名 token 解析出 ledgerId 后直接聚合，再传给 TravelView 的
// readOnly 模式渲染（隐藏所有写操作，报告/结算单用服务端预拉的全量数据）。
export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const verified = verifyShareToken(token);
  if (!verified) return <Invalid message="分享链接无效或已过期" />;

  const ledger = await prisma.ledger.findUnique({
    where: { id: verified.ledgerId },
    select: {
      id: true,
      name: true,
      icon: true,
      kind: true,
      deletedAt: true,
      archived: true,
      baseCurrency: true,
      startDate: true,
      endDate: true,
      tripBudget: true,
    },
  });
  if (!ledger || ledger.deletedAt || ledger.archived) {
    return <Invalid message="该账本已不可访问" />;
  }
  if (ledger.kind !== 'travel') {
    return <Invalid message="仅旅游账本支持只读分享" />;
  }

  const data = await loadTravel(ledger.id, { includeAllExpenses: true });
  const all = data.allExpenses ?? [];
  // 把全量支出按阶段拆好直接喂给列表（只读页不依赖登录态的分页加载）
  const preExpenses = all.filter((e) => e.phase === 'pre');
  const duringExpenses = all.filter((e) => e.phase === 'during');

  return (
    <div className="px-6 pt-14 pb-24">
      <div className="mb-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 px-4 py-2 text-xs text-ink-500 flex items-center justify-between gap-2">
        <span>🔗 只读分享页 · 数据仅供查看，无法修改</span>
        <Link href="/" className="underline shrink-0">
          打开心愿便利贴
        </Link>
      </div>
      <TravelView
        ledger={{
          id: ledger.id,
          name: ledger.name,
          icon: ledger.icon,
          baseCurrency: ledger.baseCurrency ?? 'CNY',
          startDate: ledger.startDate?.toISOString() ?? null,
          endDate: ledger.endDate?.toISOString() ?? null,
          tripBudget: ledger.tripBudget ?? null,
        }}
        currentUserId={null}
        readOnly
        initialAllExpenses={all}
        members={data.members}
        preTotal={data.preTotal}
        duringTotal={data.duringTotal}
        balances={data.balances}
        transfers={data.transfers}
        settlementError={data.settlementError}
        preExpenses={preExpenses}
        preCursor={null}
        duringExpenses={duringExpenses}
        duringCursor={null}
        daily={data.daily}
        currencyTotals={data.currencyTotals}
      />
    </div>
  );
}

function Invalid({ message }: { message: string }) {
  return (
    <div className="px-6 pt-20 pb-24 text-center">
      <div className="text-4xl mb-4">🔗</div>
      <div className="text-lg font-medium">{message}</div>
      <div className="text-sm text-ink-500 mt-2">链接可能已过期或被撤销</div>
      <Link
        href="/"
        className="inline-block mt-6 px-4 py-2 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 text-sm"
      >
        前往心愿便利贴
      </Link>
    </div>
  );
}
