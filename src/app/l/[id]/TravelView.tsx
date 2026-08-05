'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Money from '@/components/ui/Money';
import Lightbox from '@/components/ui/Lightbox';
import PendingBadge from '@/components/ui/PendingBadge';
import { formatShort } from '@/lib/datetime';
import type { NetBalance, Transfer } from '@/lib/settlement';
import { useConfirm } from '@/components/ui/Dialog';

// 三个弹窗按需加载。它们加起来 860 行，全是 `{open && <Modal/>}` 条件渲染 ——
// 静态 import 会让「只是看一眼账单」的用户也把整套表单、成员管理和趣味报告下下来。
// TripExpenseModal 是单个内聚组件（不像 GeneralView 有天然的组件边界可拆），
// 强行按行数切开只会切出互相依赖的碎片；按需加载才是对症的做法。
//
// **离线兼容**：mount 后 idle 时段主动 import 一次，让 chunk 落进浏览器缓存
// （SW 会用 cache-first 命中）。否则离线首次点"记一笔"会因 dynamic import
// 失败抛出 "Application error: a client-side exception has occurred"。
const TripExpenseModal = dynamic(() => import('./TripExpenseModal'), { ssr: false });
const TripMembersModal = dynamic(() => import('./TripMembersModal'), { ssr: false });
const TripFunReport = dynamic(() => import('./TripFunReport'), { ssr: false });

function warmTripModalChunks() {
  const run = () => {
    void import('./TripExpenseModal');
    void import('./TripMembersModal');
    void import('./TripFunReport');
  };
  if (typeof window === 'undefined') return;
  if ('requestIdleCallback' in window) {
    (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(
      run,
    );
  } else {
    setTimeout(run, 800);
  }
}

export type Member = { id: string; userId: string | null; displayName: string };

export type Expense = {
  id: string;
  title: string;
  category: string;
  phase: 'pre' | 'during';
  currency: string;
  amountForeignCents: number;
  rate: number;
  amountBaseCents: number;
  note: string | null;
  imageUrls: string[];
  occurredAt: string;
  payerId: string;
  payerName: string;
  splits: { memberId: string; shareCents: number }[];
};

type LedgerMeta = {
  id: string;
  name: string;
  icon: string | null;
  baseCurrency: string;
  startDate: string | null;
  endDate: string | null;
};

export default function TravelView({
  ledger,
  members,
  preTotal,
  duringTotal,
  balances,
  transfers,
  settlementError,
  preExpenses,
  preCursor,
  duringExpenses,
  duringCursor,
}: {
  ledger: LedgerMeta;
  members: Member[];
  /** 阶段合计、成员净额、最优结算全部由服务端聚合算好 ——
   *  结算必须基于全量数据，客户端分页后手里只有片段，算出来是错的 */
  preTotal: number;
  duringTotal: number;
  balances: NetBalance[];
  transfers: Transfer[];
  /** 老账本可能存了不守恒的分摊，此时结算无法计算，把原因显示出来 */
  settlementError: string | null;
  preExpenses: Expense[];
  preCursor: string | null;
  duringExpenses: Expense[];
  duringCursor: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [phase, setPhase] = useState<'pre' | 'during'>('during');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [zoomImg, setZoomImg] = useState<string | null>(null);
  const confirm = useConfirm();

  // —— 每个阶段各自一套分页状态 ——
  const [extra, setExtra] = useState<Record<'pre' | 'during', Expense[]>>({
    pre: [],
    during: [],
  });
  const [cursors, setCursors] = useState<Record<'pre' | 'during', string | null>>({
    pre: preCursor,
    during: duringCursor,
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');

  // 服务端重新给了首页 → 丢弃已加载的后续页，避免与新增/删除后的数据打架
  const firstPageSig =
    preExpenses.map((e) => e.id).join(',') + '|' + duringExpenses.map((e) => e.id).join(',');
  useEffect(() => {
    setExtra({ pre: [], during: [] });
    setCursors({ pre: preCursor, during: duringCursor });
    setLoadError('');
  }, [firstPageSig, preCursor, duringCursor]);

  // 预热弹窗 chunk（离线首次点"记一笔"不再抛 Application error）
  useEffect(() => {
    warmTripModalChunks();
  }, []);

  const phaseList = useMemo(
    () =>
      phase === 'pre'
        ? [...preExpenses, ...extra.pre]
        : [...duringExpenses, ...extra.during],
    [phase, preExpenses, duringExpenses, extra],
  );

  async function loadMore() {
    const cursor = cursors[phase];
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setLoadError('');
    try {
      const res = await fetch(
        `/api/ledgers/${ledger.id}/expenses?phase=${phase}&cursor=${encodeURIComponent(cursor)}`,
        { cache: 'no-store' },
      );
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '加载失败');
      setExtra((prev) => ({ ...prev, [phase]: [...prev[phase], ...(j.expenses as Expense[])] }));
      setCursors((prev) => ({ ...prev, [phase]: j.nextCursor ?? null }));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoadingMore(false);
    }
  }

  // 趣味报告要算"最烧钱的一天""恩格尔系数"这类跨全量的统计 ——
  // 打开弹窗时才按需拉全量，不拖慢列表首屏
  const [reportExpenses, setReportExpenses] = useState<Expense[] | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  async function openReport() {
    setReportLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`/api/ledgers/${ledger.id}/expenses?all=1`, {
        cache: 'no-store',
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '加载失败');
      setReportExpenses(j.expenses as Expense[]);
      setShowReport(true);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '报告生成失败');
    } finally {
      setReportLoading(false);
    }
  }

  async function del(exp: Expense) {
    const ok = await confirm({
      title: `删除 "${exp.title}"？`,
      body: `${(exp.amountBaseCents / 100).toFixed(2)} ${ledger.baseCurrency}`,
      danger: true,
      confirmText: '删除',
    });
    if (!ok) return;
    const res = await fetch(`/api/ledgers/${ledger.id}/expenses/${exp.id}`, {
      method: 'DELETE',
    });
    if (res.ok) startTransition(() => router.refresh());
  }

  const canRecord = members.length > 0;

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-ink-500 text-sm">‹ 返回</Link>
        <h1 className="text-2xl font-semibold flex-1 flex items-center gap-2 truncate">
          <span>{ledger.icon ?? '✈️'}</span>
          <span className="truncate">{ledger.name}</span>
        </h1>
        <button
          onClick={() => setShowMembers(true)}
          className="text-ink-500 text-sm underline"
        >
          成员
        </button>
      </div>

      <PendingBadge kind="travel" ledgerId={ledger.id} />

      <div className="rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 p-5">
        <div className="text-xs text-ink-500 mb-1">
          {ledger.baseCurrency} · 已花费
        </div>
        <div className="num text-4xl font-bold">
          <Money cents={preTotal + duringTotal} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded-lg bg-ink-50 dark:bg-ink-700">
            <div className="text-ink-500">行前</div>
            <div className="num font-medium mt-0.5">
              <Money cents={preTotal} />
            </div>
          </div>
          <div className="p-2 rounded-lg bg-ink-50 dark:bg-ink-700">
            <div className="text-ink-500">行中</div>
            <div className="num font-medium mt-0.5">
              <Money cents={duringTotal} />
            </div>
          </div>
        </div>
        <div className="mt-3 text-[11px] text-ink-500">
          {ledger.startDate && <>开始 {formatShort(ledger.startDate).slice(0, 10)}</>}
          {ledger.endDate && <> · 结束 {formatShort(ledger.endDate).slice(0, 10)}</>}
          <> · {members.length} 位成员</>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setPhase('pre')}
          className={`flex-1 py-2.5 rounded-2xl text-sm ${
            phase === 'pre'
              ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
              : 'bg-ink-50 dark:bg-ink-800'
          }`}
        >
          行前 · <Money cents={preTotal} />
        </button>
        <button
          onClick={() => setPhase('during')}
          className={`flex-1 py-2.5 rounded-2xl text-sm ${
            phase === 'during'
              ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
              : 'bg-ink-50 dark:bg-ink-800'
          }`}
        >
          行中 · <Money cents={duringTotal} />
        </button>
      </div>

      <button
        onClick={() => canRecord && setShowAdd(true)}
        disabled={!canRecord}
        className="mt-3 w-full py-4 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 text-base font-medium disabled:opacity-50"
      >
        {canRecord ? '+ 记一笔' : '请先添加成员'}
      </button>

      <div className="mt-6 space-y-2">
        {phaseList.length === 0 && (
          <div className="text-center text-sm text-ink-400 py-10">
            此阶段还没有记录
          </div>
        )}
        {phaseList.map((e) => (
          <ExpenseRow
            key={e.id}
            expense={e}
            baseCurrency={ledger.baseCurrency}
            members={members}
            onEdit={() => setEditing(e)}
            onDelete={() => del(e)}
            onZoomImage={setZoomImg}
          />
        ))}

        {cursors[phase] && (
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="w-full py-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 text-sm text-ink-500 active:scale-[0.98] transition disabled:opacity-60"
          >
            {loadingMore ? '加载中…' : '加载更早的记录'}
          </button>
        )}
        {loadError && <p className="text-red-500 text-xs text-center">{loadError}</p>}
      </div>

      {settlementError && (
        <div className="mt-6 rounded-3xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4">
          <div className="text-xs text-amber-800 dark:text-amber-300 font-medium mb-1">
            结算暂时算不出来
          </div>
          <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
            这个账本里有分摊金额之和与总额不一致的记录（早期版本的宽松校验留下的）。
            逐笔打开「编辑」再保存一次即可修正 —— 现在保存时分摊金额由服务端重算，不会再出现偏差。
          </p>
          <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-1.5 font-mono break-all">
            {settlementError}
          </p>
        </div>
      )}

      {transfers.length > 0 && (
        <div className="mt-6 rounded-3xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-4">
          <div className="text-xs text-emerald-800 dark:text-emerald-300 font-medium mb-2">
            最优结算（{transfers.length} 笔转账）
          </div>
          <div className="space-y-1.5 text-sm">
            {transfers.map((t, i) => (
              <div key={i} className="flex items-baseline justify-between">
                <span>
                  <span className="font-medium">{t.fromName}</span>
                  <span className="text-ink-500"> → </span>
                  <span className="font-medium">{t.toName}</span>
                </span>
                <span className="num">
                  <Money cents={t.amountCents} /> {ledger.baseCurrency}
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={openReport}
            disabled={reportLoading}
            className="mt-3 w-full py-2.5 rounded-xl bg-emerald-600 dark:bg-emerald-500 text-white text-sm font-medium disabled:opacity-60"
          >
            {reportLoading ? '生成中…' : '生成趣味报告'}
          </button>
        </div>
      )}

      {showAdd && (
        <TripExpenseModal
          ledgerId={ledger.id}
          baseCurrency={ledger.baseCurrency}
          members={members}
          defaultPhase={phase}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            startTransition(() => router.refresh());
          }}
        />
      )}

      {editing && (
        <TripExpenseModal
          ledgerId={ledger.id}
          baseCurrency={ledger.baseCurrency}
          members={members}
          defaultPhase={editing.phase}
          editing={{
            id: editing.id,
            title: editing.title,
            category: editing.category,
            phase: editing.phase,
            currency: editing.currency,
            amountForeignCents: editing.amountForeignCents,
            rate: editing.rate,
            amountBaseCents: editing.amountBaseCents,
            note: editing.note,
            imageUrls: editing.imageUrls,
            occurredAt: editing.occurredAt,
            payerId: editing.payerId,
            splits: editing.splits,
          }}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            startTransition(() => router.refresh());
          }}
        />
      )}

      {showMembers && (
        <TripMembersModal
          ledgerId={ledger.id}
          members={members}
          onClose={() => setShowMembers(false)}
          onChanged={() => startTransition(() => router.refresh())}
        />
      )}

      {showReport && reportExpenses && (
        <TripFunReport
          ledger={ledger}
          members={members}
          expenses={reportExpenses}
          balances={balances}
          transfers={transfers}
          onClose={() => setShowReport(false)}
        />
      )}

      {zoomImg && <Lightbox src={zoomImg} onClose={() => setZoomImg(null)} />}
    </>
  );
}

function ExpenseRow({
  expense,
  baseCurrency,
  members,
  onEdit,
  onDelete,
  onZoomImage,
}: {
  expense: Expense;
  baseCurrency: string;
  members: Member[];
  onEdit: () => void;
  onDelete: () => void;
  onZoomImage: (url: string) => void;
}) {
  const shareByMember = expense.splits
    .map((s) => {
      const m = members.find((x) => x.id === s.memberId);
      return m ? `${m.displayName} ${(s.shareCents / 100).toFixed(2)}` : null;
    })
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="p-3 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{expense.title}</div>
          <div className="text-[11px] text-ink-500 mt-0.5 truncate">
            {formatShort(expense.occurredAt)} · {expense.payerName} 垫付 · {expense.category}
          </div>
          <div className="text-[11px] text-ink-500 mt-0.5 break-all">
            分摊：{shareByMember}
          </div>
          {expense.note && (
            <div className="text-xs text-ink-500 mt-0.5 truncate">备注：{expense.note}</div>
          )}
          {expense.imageUrls.length > 0 && (
            <div className="mt-1 flex gap-1">
              {expense.imageUrls.map((url, i) => (
                <button
                  key={i}
                  onClick={() => onZoomImage(url)}
                  className="w-8 h-8 rounded overflow-hidden bg-ink-100 dark:bg-ink-700"
                  aria-label={`查看图 ${i + 1}`}
                >
                  { }
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="num text-sm font-medium">
            <Money cents={expense.amountBaseCents} /> {baseCurrency}
          </div>
          {expense.currency !== baseCurrency && (
            <div className="num text-[10px] text-ink-500 mt-0.5">
              {(expense.amountForeignCents / 100).toFixed(2)} {expense.currency}
              <br />
              @ {expense.rate.toFixed(4)}
            </div>
          )}
        </div>
        <button
          onClick={onEdit}
          className="text-ink-400 hover:text-ink-700 dark:hover:text-ink-100 text-xs px-1"
          aria-label="编辑"
          title="编辑"
        >
          ✎
        </button>
        <button
          onClick={onDelete}
          className="text-ink-300 hover:text-red-500 text-xs px-1"
          aria-label="删除"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
