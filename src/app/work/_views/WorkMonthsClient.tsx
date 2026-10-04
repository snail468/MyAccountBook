'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Money from '@/components/ui/Money';
import { formatShort } from '@/lib/datetime';

export type MonthItem = {
  month: string;
  isCurrent: boolean;
  income: number;
  expense: number;
  count: number;
};

type SearchEntry = {
  id: string;
  yearMonth: string;
  category: string;
  direction: 'income' | 'expense';
  amountCents: number;
  note: string | null;
  occurredAt: string;
};

export default function WorkMonthsClient({
  ledgerId,
  ledgerName,
  backHref,
  monthHrefPrefix,
  expensesHref,
  months,
}: {
  ledgerId: string;
  ledgerName: string;
  backHref: string;
  monthHrefPrefix: string;
  expensesHref: string;
  months: MonthItem[];
}) {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showSearch) {
      searchInputRef.current?.focus();
    }
  }, [showSearch]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/entries?ledgerId=${ledgerId}&q=${encodeURIComponent(q)}`,
          { cache: 'no-store' },
        );
        if (res.ok) {
          const j = await res.json();
          setSearchResults((j.entries as SearchEntry[]) || []);
        }
      } catch {
        // error handled quietly
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, ledgerId]);

  return (
    <div className="px-6 pt-14 pb-20">
      <div className="flex items-center gap-3 mb-6">
        <Link href={backHref} className="text-ink-500 text-sm">
          ‹ 返回
        </Link>
        <h1 className="text-2xl font-semibold flex-1 truncate">{ledgerName}</h1>
        {/* 搜索按钮 */}
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
          title="搜索工作账本记账"
        >
          🔍
        </button>
        <Link
          href={`/l/${ledgerId}/collaborators`}
          className="text-ink-400 text-sm"
          aria-label="协作成员"
          title="协作成员"
        >
          👥
        </Link>
      </div>

      {/* 展开式搜索框 */}
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
              placeholder="搜索工作账本记录（类别、备注、金额）…"
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
            <div className="mt-1.5 px-1 text-xs text-ink-500 flex items-center justify-between">
              <span>
                {searching ? '正在全量搜索…' : `找到 ${searchResults.length} 条相关记账`}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 搜索结果视图 */}
      {searchQuery.trim() ? (
        <div className="space-y-3">
          {searchResults.length === 0 && !searching && (
            <div className="text-center text-sm text-ink-400 py-12">
              未找到与 “{searchQuery}” 相关的记账内容
            </div>
          )}
          {searchResults.map((e) => (
            <Link
              key={e.id}
              href={`${monthHrefPrefix}/${e.yearMonth}`}
              className="block p-4 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 active:scale-[0.98] transition shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-ink-100 dark:bg-ink-700 text-ink-600 dark:text-ink-300 font-medium">
                      {e.yearMonth}
                    </span>
                    <span className="font-semibold text-ink-900 dark:text-ink-100 text-sm">
                      {e.category}
                    </span>
                  </div>
                  {e.note && (
                    <div className="text-xs text-ink-500 mt-1 line-clamp-2">
                      {e.note}
                    </div>
                  )}
                  <div className="text-[11px] text-ink-400 mt-1">
                    {formatShort(e.occurredAt)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div
                    className={`num font-semibold text-base ${
                      e.direction === 'income'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-ink-900 dark:text-ink-100'
                    }`}
                  >
                    {e.direction === 'income' ? '+' : '-'}
                    <Money cents={e.amountCents} />
                  </div>
                  <span className="text-[10px] text-ink-400">
                    {e.direction === 'income' ? '进项' : '出项'} ›
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <>
          {/* 原月份概览与出项汇总视图 */}
          <Link
            href={expensesHref}
            className="flex items-center justify-between p-5 rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 active:scale-[0.98] transition mb-3"
          >
            <div>
              <div className="text-base font-medium">出项汇总</div>
              <div className="text-xs text-ink-500 mt-0.5">
                应收出项 · 回款进度 · 批量回款
              </div>
            </div>
            <span className="text-ink-400">›</span>
          </Link>

          <div className="space-y-3">
            {months.map((m) => {
              return (
                <Link
                  key={m.month}
                  href={`${monthHrefPrefix}/${m.month}`}
                  className={`block p-5 rounded-3xl border transition active:scale-[0.98] ${
                    m.isCurrent
                      ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 border-transparent shadow-lg'
                      : 'bg-white dark:bg-ink-800 border-ink-200 dark:border-ink-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs opacity-70">
                        {m.month.split('-')[0]} 年
                      </div>
                      <div className="text-3xl font-semibold mt-0.5">
                        {Number(m.month.split('-')[1])} 月
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="num text-2xl font-medium">
                        <Money cents={m.income} />
                      </div>
                      <div className="text-xs opacity-70 mt-1">
                        {m.count > 0 ? `${m.count} 条` : '点击记账'}
                      </div>
                    </div>
                  </div>
                  {m.count > 0 && (
                    <div className="mt-3 flex gap-4 text-xs opacity-80 num">
                      <span>
                        进 <Money cents={m.income} />
                      </span>
                      <span>
                        出 <Money cents={m.expense} />
                      </span>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
