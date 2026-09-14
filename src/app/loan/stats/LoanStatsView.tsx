'use client';

import { useState } from 'react';
import Link from 'next/link';

type StatsData = {
  month: string;
  summary: {
    newIntentionCount: number;
    loanedCount: number;
    totalLoanedCents: number;
    mortgageLoanedCents: number;
    mortgageCount: number;
    mortgageRatio: string;
    totalServiceFeeCents: number;
    totalBrokerCommissionCents: number;
    totalCardCommissionCents: number;
    totalNetIncomeCents: number;
  };
  brokerStats: Array<{
    brokerId: string;
    brokerName: string;
    company: string | null;
    rateNote: string | null;
    accountInfo: string | null;
    count: number;
    totalAmountCents: number;
    totalCommissionCents: number;
    orders: Array<{ id: string; orderNo: string; borrowerName: string; amountCents: number | null; commissionCents: number | null }>;
  }>;
  cardStaffStats: Array<{
    cardStaffId: string;
    cardStaffName: string;
    workNo: string;
    branch: string | null;
    count: number;
    totalAmountCents: number;
    totalCommissionCents: number;
    orders: Array<{ id: string; orderNo: string; borrowerName: string; amountCents: number | null; commissionCents: number | null }>;
  }>;
};

export default function LoanStatsView({ initialData }: { initialData: StatsData }) {
  const [data, setData] = useState<StatsData>(initialData);
  const [month, setMonth] = useState(initialData.month);
  const [loading, setLoading] = useState(false);

  async function fetchMonth(m: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/loan/stats?month=${m}`);
      const json = await res.json();
      if (json.ok) {
        setData(json);
        setMonth(m);
      }
    } finally {
      setLoading(false);
    }
  }

  function changeMonth(delta: number) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    fetchMonth(next);
  }

  const { summary, brokerStats, cardStaffStats } = data;

  return (
    <div className="space-y-6">
      {/* 月份切换器 */}
      <div className="flex items-center justify-between p-3 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 shadow-sm">
        <button
          onClick={() => changeMonth(-1)}
          className="px-3 py-1 text-sm text-ink-500 hover:text-ink-800 dark:hover:text-ink-200"
        >
          ‹ 上月
        </button>
        <span className="font-bold text-base font-mono">
          {month} {loading && <span className="text-xs font-normal text-ink-400">(加载中...)</span>}
        </span>
        <button
          onClick={() => changeMonth(1)}
          className="px-3 py-1 text-sm text-ink-500 hover:text-ink-800 dark:hover:text-ink-200"
        >
          下月 ›
        </button>
      </div>

      {/* 核心大盘 */}
      <div className="rounded-3xl bg-gradient-to-br from-blue-700 to-indigo-800 text-white p-6 shadow-md space-y-4">
        <div>
          <span className="text-xs text-blue-200">本月放款总额</span>
          <div className="text-3xl font-black font-mono mt-0.5">
            ¥{(summary.totalLoanedCents / 1000000).toFixed(2)}{' '}
            <span className="text-sm font-normal">万元</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/15 text-xs">
          <div className="p-2.5 rounded-xl bg-white/10">
            <span className="text-blue-200 block">🏠 房按揭放款</span>
            <span className="text-sm font-bold font-mono">
              {(summary.mortgageLoanedCents / 1000000).toFixed(2)} 万元
            </span>
            <div className="text-[10px] text-blue-300 mt-0.5">
              占比: {summary.mortgageRatio} ({summary.mortgageCount}单)
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-white/10">
            <span className="text-blue-200 block">💰 个人净提成</span>
            <span className="text-sm font-bold font-mono text-emerald-300">
              ¥{(summary.totalNetIncomeCents / 100).toFixed(2)} 元
            </span>
            <div className="text-[10px] text-blue-300 mt-0.5">
              总服务费: ¥{(summary.totalServiceFeeCents / 100).toFixed(0)}
            </div>
          </div>
        </div>
      </div>

      {/* 1. 经纪人月度返佣明细对账表 */}
      <div className="rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-1.5">
            <span>🤝</span>
            <span>经纪人渠道返佣对账 ({brokerStats.length} 人)</span>
          </h3>
          <span className="text-xs text-amber-600 dark:text-amber-400 font-mono font-medium">
            应付总返佣: ¥{(summary.totalBrokerCommissionCents / 100).toFixed(2)}
          </span>
        </div>

        {brokerStats.length === 0 ? (
          <div className="text-center py-6 text-xs text-ink-400">本月暂无经纪人推单放款</div>
        ) : (
          <div className="space-y-3">
            {brokerStats.map((b) => (
              <div
                key={b.brokerId || b.brokerName}
                className="p-3.5 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/60 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-sm text-ink-900 dark:text-ink-100">{b.brokerName}</span>
                    {b.company && <span className="ml-2 text-ink-500">({b.company})</span>}
                  </div>
                  <span className="font-bold font-mono text-amber-700 dark:text-amber-300">
                    返佣: ¥{(b.totalCommissionCents / 100).toFixed(2)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-ink-500 text-[11px]">
                  <span>累计放款: {b.count} 笔 · 共 {(b.totalAmountCents / 1000000).toFixed(2)} 万元</span>
                  {b.rateNote && <span>约定: {b.rateNote}</span>}
                </div>

                {b.accountInfo && (
                  <div className="text-[11px] text-ink-400 truncate">打款账号: {b.accountInfo}</div>
                )}

                <div className="pt-1 border-t border-amber-200/50 dark:border-amber-800/50 space-y-1">
                  {b.orders.map((o) => (
                    <Link
                      key={o.id}
                      href={`/loan/${o.id}`}
                      className="flex items-center justify-between text-[11px] text-ink-600 dark:text-ink-300 hover:text-blue-600"
                    >
                      <span className="truncate">单号 {o.orderNo} · {o.borrowerName}</span>
                      <span className="font-mono shrink-0">
                        {o.amountCents ? (o.amountCents / 1000000).toFixed(2) + '万' : ''} (返¥
                        {((o.commissionCents || 0) / 100).toFixed(0)}) ›
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. 卡部工号协同业绩对账表 */}
      <div className="rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-1.5">
            <span>💳</span>
            <span>卡部工号挂号协同表 ({cardStaffStats.length} 人)</span>
          </h3>
          <span className="text-xs text-blue-600 dark:text-blue-400 font-mono font-medium">
            卡部激励支出: ¥{(summary.totalCardCommissionCents / 100).toFixed(2)}
          </span>
        </div>

        {cardStaffStats.length === 0 ? (
          <div className="text-center py-6 text-xs text-ink-400">本月暂无卡部挂号协同放款</div>
        ) : (
          <div className="space-y-3">
            {cardStaffStats.map((cs) => (
              <div
                key={cs.cardStaffId || cs.workNo}
                className="p-3.5 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/60 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-sm text-ink-900 dark:text-ink-100">{cs.cardStaffName}</span>
                    <span className="ml-2 font-mono font-semibold text-blue-600 dark:text-blue-400">
                      [{cs.workNo}]
                    </span>
                    {cs.branch && <span className="ml-1 text-ink-500">· {cs.branch}</span>}
                  </div>
                  <span className="font-bold font-mono text-blue-700 dark:text-blue-300">
                    激励: ¥{(cs.totalCommissionCents / 100).toFixed(2)}
                  </span>
                </div>

                <div className="text-ink-500 text-[11px]">
                  协同放款: {cs.count} 笔 · 共 {(cs.totalAmountCents / 1000000).toFixed(2)} 万元
                </div>

                <div className="pt-1 border-t border-blue-200/50 dark:border-blue-800/50 space-y-1">
                  {cs.orders.map((o) => (
                    <Link
                      key={o.id}
                      href={`/loan/${o.id}`}
                      className="flex items-center justify-between text-[11px] text-ink-600 dark:text-ink-300 hover:text-blue-600"
                    >
                      <span className="truncate">单号 {o.orderNo} · {o.borrowerName}</span>
                      <span className="font-mono shrink-0">
                        {o.amountCents ? (o.amountCents / 1000000).toFixed(2) + '万' : ''} ›
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
