'use client';

// 普通账本主视图。
//
// 原本这个文件有 1150 行、塞了 8 个组件 —— 改一个 modal 会让整个 chunk 失效重下。
// 现在各组件拆到 ./general/ 下，本文件只负责状态编排与组装。
// 共享类型在 ./general/types.ts。

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Money from '@/components/ui/Money';
import Lightbox from '@/components/ui/Lightbox';
import { useConfirm } from '@/components/ui/Dialog';
import { iconOf } from '@/lib/generalCategories';
import { useOfflineQueue } from '@/lib/useOfflineQueue';
import EntryRow from './general/EntryRow';
import type { Entry, LedgerMeta, RecentUse } from './general/types';

// 四个弹窗按需加载：它们全是 `{open && <Modal/>}` 条件渲染，用户不点开就用不到，
// 静态 import 会把几百行表单代码塞进列表页的首屏 chunk。
// ssr:false 是安全的 —— 它们本来就不出现在服务端渲染的 HTML 里。
const RecordModal = dynamic(() => import('./general/RecordModal'), { ssr: false });
const EditEntryModal = dynamic(() => import('./general/EditEntryModal'), { ssr: false });
const CategoryManagerModal = dynamic(() => import('./general/CategoryManagerModal'), {
  ssr: false,
});
const SettingsModal = dynamic(() => import('./general/SettingsModal'), { ssr: false });

// 服务端 page.tsx 从这里导入，保持原有的 import 路径不变
export type { GeneralSummary } from './general/types';
import type { GeneralSummary } from './general/types';

export default function GeneralView({
  ledger,
  summary,
  initialEntries,
  initialCursor,
  recentUsage,
}: {
  ledger: LedgerMeta;
  /** 本月汇总由服务端用 SQL 聚合算好 —— 分页后客户端手里没有全量数据，算不出来 */
  summary: GeneralSummary;
  initialEntries: Entry[];
  initialCursor: string | null;
  /** 类别智能排序用：最近 N 条条目的方向 + 时间，直接透传给录入/编辑弹窗 */
  recentUsage: RecentUse[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [showRecord, setShowRecord] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [zoomImg, setZoomImg] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  // 离线队列：本页会展示"待同步 N 条"，同步成功后触发刷新让新条目出现在列表
  const { pending, syncing, sync } = useOfflineQueue();
  const confirm = useConfirm();

  // —— 分页 ——
  const [extraEntries, setExtraEntries] = useState<Entry[]>([]);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');

  // router.refresh() 后服务端会重新给第一页 —— 把已加载的后续页丢掉，
  // 否则新增/删除的条目会和旧的分页数据打架（重复或缺失）。
  const firstPageSig = initialEntries.map((e) => e.id).join(',');
  useEffect(() => {
    setExtraEntries([]);
    setCursor(initialCursor);
    setLoadError('');
  }, [firstPageSig, initialCursor]);

  // 挂着过夜时自动翻篇：到次日零点触发一次 refresh，让"本月"边界跟上
  useEffect(() => {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const ms = tomorrow.getTime() - now.getTime();
    const timer = setTimeout(() => router.refresh(), ms + 1000);
    return () => clearTimeout(timer);
  }, [router]);

  // 离线队列同步成功后：让服务端重发数据（新条目应该出现在列表里）
  const pendingForThisLedger = pending.filter((p) => p.ledgerId === ledger.id);
  const prevPendingCount = useRef(pendingForThisLedger.length);
  useEffect(() => {
    if (pendingForThisLedger.length < prevPendingCount.current) {
      // 有条目从队列消失了 → 说明同步成功，让服务端重发首屏数据
      startTransition(() => router.refresh());
    }
    prevPendingCount.current = pendingForThisLedger.length;
  }, [pendingForThisLedger.length, router, startTransition]);

  const entries = useMemo(
    () => [...initialEntries, ...extraEntries],
    [initialEntries, extraEntries],
  );

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setLoadError('');
    try {
      const res = await fetch(
        `/api/ledgers/${ledger.id}/entries?cursor=${encodeURIComponent(cursor)}`,
        { cache: 'no-store' },
      );
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '加载失败');
      setExtraEntries((prev) => [...prev, ...(j.entries as Entry[])]);
      setCursor(j.nextCursor ?? null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoadingMore(false);
    }
  }

  const monthStart = useMemo(() => new Date(summary.monthStartISO), [summary.monthStartISO]);
  const income = summary.income;
  const expense = summary.expense;
  const net = income - expense;
  const topCats: [string, number][] = summary.topCats.map((c) => [c.category, c.cents]);

  // 按天分组（只对已加载的条目分组）
  const grouped = new Map<string, Entry[]>();
  for (const e of entries) {
    const d = new Date(e.occurredAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const arr = grouped.get(key) ?? [];
    arr.push(e);
    grouped.set(key, arr);
  }
  const dayKeys = [...grouped.keys()].sort().reverse();

  const budgetPct = ledger.budgetCents && ledger.budgetCents > 0
    ? Math.min(100, Math.round((expense / ledger.budgetCents) * 100))
    : null;
  const budgetColor =
    budgetPct === null
      ? ''
      : expense > (ledger.budgetCents ?? 0)
        ? 'bg-red-500'
        : budgetPct >= 80
          ? 'bg-yellow-500'
          : 'bg-emerald-500';

  async function del(entry: Entry) {
    const ok = await confirm({
      title: `删除 "${entry.category}"？`,
      body: `${(entry.amountCents / 100).toFixed(2)} 元`,
      danger: true,
      confirmText: '删除',
    });
    if (!ok) return;
    const res = await fetch(`/api/ledgers/${ledger.id}/entries/${entry.id}`, {
      method: 'DELETE',
    });
    if (res.ok) startTransition(() => router.refresh());
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-ink-500 text-sm">‹ 返回</Link>
        <h1 className="text-2xl font-semibold flex-1 flex items-center gap-2 truncate">
          <span>{ledger.icon ?? '📒'}</span>
          <span className="truncate">{ledger.name}</span>
        </h1>
        <button
          onClick={() => setShowSettings(true)}
          className="text-ink-400 text-sm"
          aria-label="设置"
        >
          ⚙
        </button>
      </div>

      {pendingForThisLedger.length > 0 && (
        <div className="mb-3 flex items-center justify-between p-3 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs">
          <span className="text-amber-800 dark:text-amber-300">
            📶 有 {pendingForThisLedger.length} 笔待同步
            {pendingForThisLedger.some((p) => p.lastError) && (
              <span className="ml-1">（部分失败）</span>
            )}
          </span>
          <button
            onClick={() => void sync()}
            disabled={syncing}
            className="px-3 py-1 rounded-lg bg-amber-500 dark:bg-amber-600 text-white disabled:opacity-60"
          >
            {syncing ? '同步中…' : '立即同步'}
          </button>
        </div>
      )}

      <div className="rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 p-5">
        <div className="text-xs text-ink-500 mb-1">
          本月 {monthStart.getMonth() + 1} 月 · 结余 (元)
        </div>
        <div
          className={`num text-4xl font-bold ${net < 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}
        >
          <Money cents={net} sign />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded-lg bg-ink-50 dark:bg-ink-700">
            <div className="text-ink-500">收入</div>
            <div className="num font-medium mt-0.5 text-emerald-600 dark:text-emerald-400">
              <Money cents={income} />
            </div>
          </div>
          <div className="p-2 rounded-lg bg-ink-50 dark:bg-ink-700">
            <div className="text-ink-500">支出</div>
            <div className="num font-medium mt-0.5 text-red-500">
              <Money cents={expense} />
            </div>
          </div>
        </div>

        {ledger.budgetCents && ledger.budgetCents > 0 && (
          <div className="mt-4">
            <div className="flex items-baseline justify-between text-xs mb-1">
              <span className="text-ink-500">月度预算</span>
              <span className="num text-ink-700 dark:text-ink-300">
                <Money cents={expense} /> / <Money cents={ledger.budgetCents} />
              </span>
            </div>
            <div className="h-2 rounded-full bg-ink-100 dark:bg-ink-700 overflow-hidden">
              <div
                className={`h-full ${budgetColor} transition-[width]`}
                style={{ width: `${budgetPct}%` }}
              />
            </div>
            {expense > ledger.budgetCents && (
              <div className="text-[11px] text-red-500 mt-1">
                超支 <Money cents={expense - ledger.budgetCents} />
              </div>
            )}
          </div>
        )}
      </div>

      {(() => {
        // 类别行：topCats 已有的（排行前 5） + 有预算但不在前 5 的（0 花销也显示）。
        // 这样用户能看到自己设过预算的所有类别的状况，即使这个月还没花过
        const rows = new Map<string, { cents: number; budget: number | null }>();
        for (const [cat, cents] of topCats) {
          rows.set(cat, { cents, budget: summary.categoryBudgets[cat] ?? null });
        }
        for (const [cat, budget] of Object.entries(summary.categoryBudgets)) {
          if (!rows.has(cat)) rows.set(cat, { cents: 0, budget });
        }
        if (rows.size === 0) return null;
        const ordered = [...rows.entries()].sort((a, b) => b[1].cents - a[1].cents);
        return (
          <div className="mt-4 rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 p-5">
            <div className="text-xs text-ink-500 mb-3">本月类别 · 支出与预算</div>
            <div className="space-y-2">
              {ordered.map(([cat, { cents, budget }]) => {
                // 有预算：进度 = cents / budget（可超过 100%），颜色按 80% / 100% 分档
                // 无预算：进度 = cents / 总支出（占比展示，颜色始终中性）
                const hasBudget = budget !== null && budget > 0;
                const pct = hasBudget
                  ? Math.round((cents / budget!) * 100)
                  : expense > 0
                    ? Math.round((cents / expense) * 100)
                    : 0;
                const over = hasBudget && cents > budget!;
                const nearFull = hasBudget && pct >= 80 && !over;
                const barColor = over
                  ? 'bg-red-500'
                  : nearFull
                    ? 'bg-yellow-500'
                    : hasBudget
                      ? 'bg-emerald-500'
                      : 'bg-ink-500 dark:bg-ink-300';
                return (
                  <div key={cat}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="flex items-center gap-1.5">
                        <span>{iconOf(cat, ledger.customCategories)}</span>
                        <span>{cat}</span>
                      </span>
                      <span className="num text-ink-700 dark:text-ink-300">
                        <Money cents={cents} />
                        {hasBudget ? (
                          <span className="text-[10px] text-ink-500">
                            {' '}
                            / <Money cents={budget!} /> · {pct}%
                          </span>
                        ) : (
                          <span className="text-[10px] text-ink-500"> {pct}%</span>
                        )}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-ink-100 dark:bg-ink-700 mt-1 overflow-hidden">
                      <div
                        className={`h-full ${barColor} transition-[width]`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                    {over && (
                      <div className="text-[10px] text-red-500 mt-0.5">
                        超支 <Money cents={cents - budget!} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {Object.keys(summary.categoryBudgetsWeekly).length > 0 && (
        <div className="mt-4 rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 p-5">
          <div className="text-xs text-ink-500 mb-3">本周类别预算（周一起算）</div>
          <div className="space-y-2">
            {Object.entries(summary.categoryBudgetsWeekly).map(([cat, budget]) => {
              const spent = summary.weeklySpend[cat] ?? 0;
              const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
              const over = spent > budget;
              const nearFull = pct >= 80 && !over;
              const barColor = over ? 'bg-red-500' : nearFull ? 'bg-yellow-500' : 'bg-emerald-500';
              return (
                <div key={cat}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="flex items-center gap-1.5">
                      <span>{iconOf(cat, ledger.customCategories)}</span>
                      <span>{cat}</span>
                    </span>
                    <span className="num text-ink-700 dark:text-ink-300">
                      <Money cents={spent} />
                      <span className="text-[10px] text-ink-500">
                        {' '}
                        / <Money cents={budget} /> · {pct}%
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-ink-100 dark:bg-ink-700 mt-1 overflow-hidden">
                    <div
                      className={`h-full ${barColor} transition-[width]`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  {over && (
                    <div className="text-[10px] text-red-500 mt-0.5">
                      本周超支 <Money cents={spent - budget} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button
        onClick={() => setShowRecord(true)}
        className="mt-4 w-full py-4 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 text-base font-medium active:scale-[0.98]"
      >
        + 记一笔
      </button>

      <div className="mt-6 space-y-4">
        {dayKeys.length === 0 && (
          <div className="text-center text-sm text-ink-400 py-10">
            还没有记录，点击上方 + 开始
          </div>
        )}
        {dayKeys.map((day) => {
          const list = grouped.get(day) ?? [];
          const dayIncome = list
            .filter((e) => e.direction === 'income')
            .reduce((a, e) => a + e.amountCents, 0);
          const dayExpense = list
            .filter((e) => e.direction === 'expense')
            .reduce((a, e) => a + e.amountCents, 0);
          return (
            <section key={day}>
              <div className="flex items-baseline justify-between px-1 mb-2 text-xs text-ink-500">
                <span>{day}</span>
                <span className="num">
                  {dayIncome > 0 && <>入 <Money cents={dayIncome} /> </>}
                  出 <Money cents={dayExpense} />
                </span>
              </div>
              <div className="space-y-2">
                {list.map((e) => (
                  <EntryRow
                    key={e.id}
                    entry={e}
                    customCategoriesJson={ledger.customCategories}
                    onEdit={() => setEditing(e)}
                    onDelete={() => del(e)}
                    onZoomImage={setZoomImg}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {cursor && (
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="w-full py-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 text-sm text-ink-500 active:scale-[0.98] transition disabled:opacity-60"
          >
            {loadingMore ? '加载中…' : '加载更早的记录'}
          </button>
        )}
        {!cursor && entries.length > 0 && (
          <div className="text-center text-[11px] text-ink-400 py-2">已经到底了</div>
        )}
        {loadError && (
          <p className="text-red-500 text-xs text-center">{loadError}</p>
        )}
      </div>

      {showRecord && (
        <RecordModal
          ledgerId={ledger.id}
          ledgerName={ledger.name}
          customCategoriesJson={ledger.customCategories}
          recentUsage={recentUsage}
          onManageCategories={() => {
            setShowRecord(false);
            setShowCategoryManager(true);
          }}
          onClose={() => setShowRecord(false)}
          onSaved={() => {
            setShowRecord(false);
            startTransition(() => router.refresh());
          }}
        />
      )}

      {editing && (
        <EditEntryModal
          ledgerId={ledger.id}
          customCategoriesJson={ledger.customCategories}
          recentUsage={recentUsage}
          entry={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            startTransition(() => router.refresh());
          }}
        />
      )}

      {showSettings && (
        <SettingsModal
          ledger={ledger}
          onManageCategories={() => {
            setShowSettings(false);
            setShowCategoryManager(true);
          }}
          onClose={() => setShowSettings(false)}
          onSaved={() => {
            setShowSettings(false);
            startTransition(() => router.refresh());
          }}
        />
      )}

      {showCategoryManager && (
        <CategoryManagerModal
          ledgerId={ledger.id}
          customCategoriesJson={ledger.customCategories}
          onClose={() => setShowCategoryManager(false)}
          onSaved={() => {
            setShowCategoryManager(false);
            startTransition(() => router.refresh());
          }}
        />
      )}

      {zoomImg && <Lightbox src={zoomImg} onClose={() => setZoomImg(null)} />}
    </>
  );
}

