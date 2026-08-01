'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Money from '@/components/ui/Money';
import { formatShort } from '@/lib/datetime';
import { daysSincePending, refundStatus } from '@/lib/refundStatus';

export type WorkExpense = {
  id: string;
  yearMonth: string;
  category: string;
  amountCents: number;
  note: string | null;
  occurredAt: string;
  refundedAt: string | null;
};

export default function ExpenseList({
  initialEntries,
  initialCursor,
}: {
  initialEntries: WorkExpense[];
  initialCursor: string | null;
}) {
  const [extra, setExtra] = useState<WorkExpense[]>([]);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 服务端重新给了第一页 → 丢掉已加载的后续页，避免重复/缺失
  const firstPageSig = initialEntries.map((e) => e.id).join(',');
  useEffect(() => {
    setExtra([]);
    setCursor(initialCursor);
    setError('');
  }, [firstPageSig, initialCursor]);

  const entries = useMemo(() => [...initialEntries, ...extra], [initialEntries, extra]);

  // 按月份分组展示（只对已加载的部分分组）
  const byMonth = useMemo(() => {
    const m = new Map<string, WorkExpense[]>();
    for (const e of entries) {
      const arr = m.get(e.yearMonth) ?? [];
      arr.push(e);
      m.set(e.yearMonth, arr);
    }
    return m;
  }, [entries]);
  const months = useMemo(() => [...byMonth.keys()].sort().reverse(), [byMonth]);

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/entries?direction=expense&cursor=${encodeURIComponent(cursor)}`,
        { cache: 'no-store' },
      );
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '加载失败');
      setExtra((prev) => [...prev, ...(j.entries as WorkExpense[])]);
      setCursor(j.nextCursor ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  if (entries.length === 0) {
    return <div className="text-center text-sm text-ink-400 py-8">还没有出项</div>;
  }

  return (
    <div className="space-y-6">
      {months.map((m) => {
        const list = byMonth.get(m) ?? [];
        const sum = list.reduce((a, e) => a + e.amountCents, 0);
        return (
          <section key={m}>
            <Link
              href={`/work/${m}`}
              className="flex items-baseline justify-between px-1 mb-2 hover:opacity-80"
            >
              <div className="text-sm font-medium">
                {m.split('-')[0]} 年 {Number(m.split('-')[1])} 月
              </div>
              <div className="text-xs text-ink-500 num">
                <Money cents={sum} />
              </div>
            </Link>
            <div className="space-y-2">
              {list.map((e) => {
                const status = refundStatus({
                  occurredAt: new Date(e.occurredAt),
                  refundedAt: e.refundedAt ? new Date(e.refundedAt) : null,
                });
                const refunded = status === 'refunded';
                const overdue = status === 'overdue';
                const overdueDays = overdue
                  ? daysSincePending({
                      occurredAt: new Date(e.occurredAt),
                      refundedAt: null,
                    })
                  : 0;
                return (
                  <div
                    key={e.id}
                    className={`flex items-center gap-3 p-3 rounded-2xl border ${
                      refunded
                        ? 'bg-ink-50 dark:bg-ink-800/60 border-ink-200 dark:border-ink-700 text-ink-400'
                        : overdue
                          ? 'bg-amber-50/60 dark:bg-amber-900/10 border-amber-300 dark:border-amber-800'
                          : 'bg-white dark:bg-ink-800 border-ink-200 dark:border-ink-700'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div
                        className={`text-sm font-medium truncate ${refunded ? 'line-through' : ''}`}
                      >
                        {e.category}
                        {overdue && (
                          <span className="ml-2 text-[10px] font-normal px-1.5 py-0.5 rounded-full bg-amber-200 dark:bg-amber-800/50 text-amber-900 dark:text-amber-200 align-middle">
                            未回款 {overdueDays} 天
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-ink-500 mt-0.5 leading-tight">
                        <div className="truncate">{formatShort(e.occurredAt)}</div>
                        {refunded && e.refundedAt && (
                          <div className="truncate text-emerald-600 dark:text-emerald-400">
                            回款于 {formatShort(e.refundedAt)}
                          </div>
                        )}
                      </div>
                      {e.note && (
                        <div
                          className={`text-xs mt-0.5 truncate ${
                            refunded ? 'line-through text-ink-400' : 'text-ink-500'
                          }`}
                        >
                          {e.note}
                        </div>
                      )}
                    </div>
                    <div
                      className={`num text-sm font-medium ${
                        refunded ? 'line-through text-ink-400' : 'text-red-500'
                      }`}
                    >
                      -<Money cents={e.amountCents} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {cursor && (
        <button
          onClick={loadMore}
          disabled={loading}
          className="w-full py-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 text-sm text-ink-500 active:scale-[0.98] transition disabled:opacity-60"
        >
          {loading ? '加载中…' : '加载更早的记录'}
        </button>
      )}
      {!cursor && <div className="text-center text-[11px] text-ink-400 py-2">已经到底了</div>}
      {error && <p className="text-red-500 text-xs text-center">{error}</p>}
    </div>
  );
}
