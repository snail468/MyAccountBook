'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import Money from '@/components/ui/Money';
import PendingBadge from '@/components/ui/PendingBadge';
import NewEntryFlow from '../[month]/NewEntryFlow';
import EntryRow from '../[month]/EntryRow';

export type MonthEntryItem = {
  id: string;
  category: string;
  direction: 'income' | 'expense';
  amountCents: number;
  note: string | null;
  occurredAt: string;
  refundedAt: string | null;
};

export default function WorkMonthClient({
  ledgerId,
  ledgerName,
  month,
  backHref,
  canEdit = true,
  income,
  expense,
  initialEntries,
}: {
  ledgerId: string;
  ledgerName: string;
  month: string;
  backHref: string;
  canEdit?: boolean;
  income: number;
  expense: number;
  initialEntries: MonthEntryItem[];
}) {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showSearch) {
      searchInputRef.current?.focus();
    }
  }, [showSearch]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return initialEntries;

    return initialEntries.filter((e) => {
      const catMatch = e.category.toLowerCase().includes(q);
      const noteMatch = (e.note || '').toLowerCase().includes(q);
      const yuanStr = (e.amountCents / 100).toFixed(2);
      const amtMatch = yuanStr.includes(q) || String(e.amountCents / 100).includes(q);
      return catMatch || noteMatch || amtMatch;
    });
  }, [initialEntries, searchQuery]);

  return (
    <div className="px-6 pt-14 pb-20">
      <div className="flex items-center gap-3 mb-6">
        <Link href={backHref} className="text-ink-500 text-sm flex-1 truncate">
          ‹ {ledgerName}
        </Link>
        <button
          onClick={() => {
            setShowSearch((prev) => {
              const next = !prev;
              if (!next) setSearchQuery('');
              return next;
            });
          }}
          className={`text-sm p-1.5 rounded-lg transition ${
            showSearch || searchQuery
              ? 'text-ink-900 dark:text-ink-100 bg-ink-100 dark:bg-ink-700'
              : 'text-ink-400 hover:text-ink-600 dark:hover:text-ink-200'
          }`}
          aria-label="搜索"
          title="搜索当月记账"
        >
          🔍
        </button>
      </div>

      {showSearch && (
        <div className="mb-4">
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 text-sm pointer-events-none">
              🔍
            </span>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索当月记账（类别、备注、金额）…"
              className="w-full pl-9 pr-16 py-2.5 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 text-sm focus:outline-none focus:ring-2 focus:ring-ink-400 dark:focus:ring-ink-500 transition shadow-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-12 top-1/2 -translate-y-1/2 text-xs text-ink-400 hover:text-ink-600 dark:hover:text-ink-200 px-1"
                aria-label="清空搜索"
              >
                ✕
              </button>
            )}
            <button
              onClick={() => {
                setShowSearch(false);
                setSearchQuery('');
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-500 hover:text-ink-700 dark:hover:text-ink-300"
            >
              取消
            </button>
          </div>
          {searchQuery && (
            <div className="mt-1.5 px-1 text-xs text-ink-500">
              找到 {filteredEntries.length} 条相关记账
            </div>
          )}
        </div>
      )}

      <PendingBadge kind="work" ledgerId={ledgerId} />

      <div className="rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 p-5">
        <div className="text-xs text-ink-500">
          {month.split('-')[0]} 年 {Number(month.split('-')[1])} 月
        </div>
        <div className="num text-3xl font-semibold mt-1">
          进项 <Money cents={income} />
        </div>
        <div className="mt-2 text-xs text-ink-500 num">
          出项 <Money cents={expense} />
        </div>
      </div>

      {canEdit && !searchQuery.trim() && (
        <NewEntryFlow yearMonth={month} ledgerId={ledgerId} />
      )}

      <div className="mt-6 space-y-2">
        {filteredEntries.length === 0 && (
          <div className="text-center text-sm text-ink-400 py-8">
            {searchQuery.trim()
              ? `未找到与 “${searchQuery}” 相关的记账内容`
              : '还没有记录，点击上方 + 开始'}
          </div>
        )}
        {filteredEntries.map((e) => (
          <EntryRow
            key={e.id}
            id={e.id}
            category={e.category}
            direction={e.direction}
            amountCents={e.amountCents}
            note={e.note}
            occurredAt={e.occurredAt}
            refundedAt={e.refundedAt}
            canEdit={canEdit}
          />
        ))}
      </div>
    </div>
  );
}
