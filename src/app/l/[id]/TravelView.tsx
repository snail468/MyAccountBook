'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Money from '@/components/ui/Money';
import Lightbox from '@/components/ui/Lightbox';
import { formatShort } from '@/lib/datetime';
import { computeSettlement } from '@/lib/settlement';
import TripExpenseModal from './TripExpenseModal';
import TripMembersModal from './TripMembersModal';
import TripFunReport from './TripFunReport';

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
  expenses,
}: {
  ledger: LedgerMeta;
  members: Member[];
  expenses: Expense[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [phase, setPhase] = useState<'pre' | 'during'>('during');
  const [showAdd, setShowAdd] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [zoomImg, setZoomImg] = useState<string | null>(null);

  const phaseList = expenses.filter((e) => e.phase === phase);
  const preTotal = expenses
    .filter((e) => e.phase === 'pre')
    .reduce((a, e) => a + e.amountBaseCents, 0);
  const duringTotal = expenses
    .filter((e) => e.phase === 'during')
    .reduce((a, e) => a + e.amountBaseCents, 0);

  // 净额（本币）
  const balances = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of members) map.set(m.id, 0);
    for (const e of expenses) {
      // 付款人 +total；每个分摊成员 -share
      map.set(e.payerId, (map.get(e.payerId) ?? 0) + e.amountBaseCents);
      for (const s of e.splits) {
        map.set(s.memberId, (map.get(s.memberId) ?? 0) - s.shareCents);
      }
    }
    return [...map.entries()].map(([id, net]) => ({
      memberId: id,
      name: members.find((m) => m.id === id)?.displayName ?? '?',
      netCents: net,
    }));
  }, [members, expenses]);

  const transfers = useMemo(() => computeSettlement(balances), [balances]);

  async function del(exp: Expense) {
    if (!confirm(`删除 "${exp.title}" ${(exp.amountBaseCents / 100).toFixed(2)} ${ledger.baseCurrency}？`))
      return;
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
            onDelete={() => del(e)}
            onZoomImage={setZoomImg}
          />
        ))}
      </div>

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
            onClick={() => setShowReport(true)}
            className="mt-3 w-full py-2.5 rounded-xl bg-emerald-600 dark:bg-emerald-500 text-white text-sm font-medium"
          >
            生成趣味报告
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

      {showMembers && (
        <TripMembersModal
          ledgerId={ledger.id}
          members={members}
          onClose={() => setShowMembers(false)}
          onChanged={() => startTransition(() => router.refresh())}
        />
      )}

      {showReport && (
        <TripFunReport
          ledger={ledger}
          members={members}
          expenses={expenses}
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
  onDelete,
  onZoomImage,
}: {
  expense: Expense;
  baseCurrency: string;
  members: Member[];
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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
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
