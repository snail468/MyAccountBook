'use client';

import Money from '@/components/ui/Money';
import type { Expense, Member } from './TravelView';
import type { NetBalance, Transfer } from '@/lib/settlement';

export default function TripFunReport({
  ledger,
  members,
  expenses,
  balances,
  transfers,
  onClose,
}: {
  ledger: { name: string; baseCurrency: string };
  members: Member[];
  expenses: Expense[];
  balances: NetBalance[];
  transfers: Transfer[];
  onClose: () => void;
}) {
  const total = expenses.reduce((a, e) => a + e.amountBaseCents, 0);

  // 各成员总"分摊"金额（真实花费）
  const paidByMember = new Map<string, number>();
  for (const m of members) paidByMember.set(m.id, 0);
  for (const e of expenses) {
    for (const s of e.splits) {
      paidByMember.set(s.memberId, (paidByMember.get(s.memberId) ?? 0) + s.shareCents);
    }
  }
  const sortedByPaid = [...paidByMember.entries()]
    .map(([id, cents]) => ({
      id,
      name: members.find((m) => m.id === id)?.displayName ?? '?',
      cents,
    }))
    .sort((a, b) => b.cents - a.cents);
  const bigSpender = sortedByPaid[0];
  const cheapSkate = sortedByPaid[sortedByPaid.length - 1];

  // 最贵一笔
  const priciest = [...expenses].sort((a, b) => b.amountBaseCents - a.amountBaseCents)[0];

  // 最烧钱的一天
  const byDay = new Map<string, number>();
  for (const e of expenses) {
    const d = new Date(e.occurredAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    byDay.set(key, (byDay.get(key) ?? 0) + e.amountBaseCents);
  }
  const [hottestDay, hottestDayCents] =
    [...byDay.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];

  // 恩格尔系数：餐饮 / 总
  const foodSum = expenses
    .filter((e) => e.category === '餐饮')
    .reduce((a, e) => a + e.amountBaseCents, 0);
  const engel = total > 0 ? Math.round((foodSum / total) * 100) : 0;

  // 类别分布
  const byCat = new Map<string, number>();
  for (const e of expenses) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amountBaseCents);
  const catRank = [...byCat.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-ink-900 rounded-t-3xl sm:rounded-3xl p-6 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <span>🎉</span>
            {ledger.name} · 复盘报告
          </h3>
          <button onClick={onClose} className="text-ink-400 text-xl" aria-label="关闭">
            ✕
          </button>
        </div>

        <div className="rounded-3xl bg-gradient-to-br from-pink-100 via-purple-100 to-yellow-100 dark:from-pink-900/40 dark:via-purple-900/40 dark:to-yellow-900/30 p-5 mb-4">
          <div className="text-xs text-ink-600 dark:text-ink-300">这次旅行总花费</div>
          <div className="num text-4xl font-bold text-ink-900 dark:text-white mt-1">
            <Money cents={total} /> {ledger.baseCurrency}
          </div>
          <div className="text-xs text-ink-600 dark:text-ink-300 mt-2">
            {expenses.length} 笔账目 · {members.length} 位同伴
          </div>
        </div>

        <div className="space-y-3">
          {bigSpender && bigSpender.cents > 0 && (
            <ReportCard emoji="💸" title="散财童子">
              <span className="font-medium">{bigSpender.name}</span> · 承担了{' '}
              <Money cents={bigSpender.cents} /> {ledger.baseCurrency}，占总花费的{' '}
              <span className="font-medium">
                {total > 0 ? Math.round((bigSpender.cents / total) * 100) : 0}%
              </span>
            </ReportCard>
          )}

          {cheapSkate && cheapSkate.id !== bigSpender?.id && cheapSkate.cents >= 0 && (
            <ReportCard emoji="🐔" title="铁公鸡">
              <span className="font-medium">{cheapSkate.name}</span> · 只承担了{' '}
              <Money cents={cheapSkate.cents} /> {ledger.baseCurrency}，超会省
            </ReportCard>
          )}

          {priciest && (
            <ReportCard emoji="👑" title="最贵一笔">
              <span className="font-medium">{priciest.title}</span> ·{' '}
              <Money cents={priciest.amountBaseCents} /> {ledger.baseCurrency}
              <div className="text-[11px] text-ink-500 mt-0.5">
                {priciest.payerName} 垫付 · {priciest.category}
              </div>
            </ReportCard>
          )}

          {hottestDay && (
            <ReportCard emoji="🔥" title="最烧钱的一天">
              <span className="font-medium">{hottestDay}</span> · 一天花掉{' '}
              <Money cents={hottestDayCents} /> {ledger.baseCurrency}
            </ReportCard>
          )}

          {foodSum > 0 && (
            <ReportCard emoji="🍜" title="恩格尔系数">
              餐饮占比 <span className="font-medium">{engel}%</span>（<Money cents={foodSum} />{' '}
              {ledger.baseCurrency}）
            </ReportCard>
          )}

          {catRank.length > 0 && (
            <div className="rounded-2xl bg-ink-50 dark:bg-ink-800 p-3">
              <div className="text-xs text-ink-500 mb-2">💼 花在哪儿</div>
              <div className="space-y-1">
                {catRank.map(([cat, cents]) => {
                  const pct = total > 0 ? Math.round((cents / total) * 100) : 0;
                  return (
                    <div key={cat} className="flex items-baseline justify-between text-sm">
                      <span>{cat}</span>
                      <span className="num text-ink-500">
                        <Money cents={cents} /> · {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {transfers.length > 0 && (
          <div className="mt-4 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 p-3">
            <div className="text-xs text-emerald-800 dark:text-emerald-300 font-medium mb-2">
              🧾 结算清单
            </div>
            <div className="space-y-1 text-sm">
              {transfers.map((t, i) => (
                <div key={i} className="flex items-baseline justify-between">
                  <span>
                    {t.fromName} → {t.toName}
                  </span>
                  <span className="num font-medium">
                    <Money cents={t.amountCents} /> {ledger.baseCurrency}
                  </span>
                </div>
              ))}
            </div>
            <div className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-2">
              截图发到群里 · 收钱找轻松些
            </div>
          </div>
        )}

        {balances.length > 0 && (
          <div className="mt-4 rounded-2xl bg-ink-50 dark:bg-ink-800 p-3">
            <div className="text-xs text-ink-500 mb-2">明细净额</div>
            <div className="space-y-1 text-sm">
              {balances
                .sort((a, b) => b.netCents - a.netCents)
                .map((b) => (
                  <div key={b.memberId} className="flex items-baseline justify-between">
                    <span>{b.name}</span>
                    <span
                      className={`num ${
                        b.netCents > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : b.netCents < 0
                            ? 'text-red-500'
                            : 'text-ink-400'
                      }`}
                    >
                      <Money cents={b.netCents} sign />
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-5 w-full py-3 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 font-medium"
        >
          完成
        </button>
      </div>
    </div>
  );
}

function ReportCard({
  emoji,
  title,
  children,
}: {
  emoji: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-3 rounded-2xl bg-ink-50 dark:bg-ink-800 flex items-start gap-3">
      <span className="text-2xl leading-none shrink-0">{emoji}</span>
      <div className="text-sm min-w-0 flex-1">
        <div className="text-xs text-ink-500 mb-0.5">{title}</div>
        <div>{children}</div>
      </div>
    </div>
  );
}
