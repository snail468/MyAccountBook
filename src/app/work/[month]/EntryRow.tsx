'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { formatYuan } from '@/lib/money';
import { formatShort, localInputToISO, toLocalInput } from '@/lib/datetime';
import Money from '@/components/ui/Money';
import EditEntryModal from './EditEntryModal';

type Props = {
  id: string;
  category: string;
  direction: 'income' | 'expense';
  amountCents: number;
  note: string | null;
  occurredAt: string;
  refundedAt: string | null;
};

export default function EntryRow(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // 乐观 UI：本地状态先动，服务端确认后 router.refresh() 同步
  const [optimisticRefundedAt, setOptimisticRefundedAt] = useState<string | null>(
    props.refundedAt,
  );
  const [hidden, setHidden] = useState(false);
  const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [refundInput, setRefundInput] = useState<string>(() => toLocalInput(new Date()));
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  const refunded = !!optimisticRefundedAt;

  async function del() {
    if (!confirm(`删除这笔 "${props.category}" ${formatYuan(props.amountCents)} 元？`)) return;
    setHidden(true); // 乐观：立刻消失
    try {
      const res = await fetch(`/api/entries/${props.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      startTransition(() => router.refresh());
    } catch {
      setHidden(false);
    }
  }

  async function unrefund() {
    const prev = optimisticRefundedAt;
    setOptimisticRefundedAt(null);
    try {
      const res = await fetch(`/api/entries/${props.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unrefund' }),
      });
      if (!res.ok) throw new Error();
      startTransition(() => router.refresh());
    } catch {
      setOptimisticRefundedAt(prev);
    }
  }

  async function submitRefund() {
    setError('');
    const iso = localInputToISO(refundInput);
    if (!iso) {
      setError('时间格式不正确');
      return;
    }
    // 立刻关弹窗 + 乐观标记
    setShowRefundDialog(false);
    setOptimisticRefundedAt(iso);
    try {
      const res = await fetch(`/api/entries/${props.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refund', refundedAt: iso }),
      });
      if (!res.ok) throw new Error();
      startTransition(() => router.refresh());
    } catch {
      setOptimisticRefundedAt(props.refundedAt);
      setError('操作失败，请重试');
      setShowRefundDialog(true);
    }
  }

  if (hidden) return null;

  return (
    <div
      className={`flex items-center gap-3 p-4 rounded-2xl border transition ${
        refunded
          ? 'bg-ink-50 dark:bg-ink-800/60 border-ink-200 dark:border-ink-700 text-ink-400'
          : 'bg-white dark:bg-ink-800 border-ink-200 dark:border-ink-700'
      } ${pending ? 'opacity-80' : ''}`}
    >
      <div className="flex-1 min-w-0">
        <div className={`font-medium truncate ${refunded ? 'line-through' : ''}`}>
          {props.category}
        </div>
        <div className="text-[11px] text-ink-500 truncate mt-0.5">
          {formatShort(props.occurredAt)}
          {refunded && optimisticRefundedAt && (
            <> · 回款 {formatShort(optimisticRefundedAt)}</>
          )}
        </div>
        {props.note && (
          <div className={`text-xs truncate mt-0.5 ${refunded ? 'line-through text-ink-400' : 'text-ink-500'}`}>
            {props.note}
          </div>
        )}
      </div>

      <div
        className={`num text-base font-medium ${refunded ? 'line-through text-ink-400' : props.direction === 'expense' ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}
      >
        {props.direction === 'expense' ? '-' : '+'}
        <Money cents={props.amountCents} />
      </div>

      {props.direction === 'expense' && (
        <button
          onClick={() => (refunded ? unrefund() : setShowRefundDialog(true))}
          title={refunded ? '撤销回款' : '确认已回款'}
          className={`shrink-0 w-8 h-8 rounded-full text-xs ${
            refunded
              ? 'bg-ink-200 dark:bg-ink-700 text-ink-500'
              : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
          }`}
          aria-label={refunded ? '撤销回款' : '确认回款'}
        >
          {refunded ? '↺' : '✓'}
        </button>
      )}

      <button
        onClick={() => setEditing(true)}
        className="shrink-0 text-ink-400 hover:text-ink-700 dark:hover:text-ink-100 text-xs px-1"
        aria-label="编辑"
        title="编辑"
      >
        ✎
      </button>
      <button
        onClick={del}
        className="shrink-0 text-ink-300 hover:text-red-500 text-xs px-1"
        aria-label="删除"
      >
        ✕
      </button>

      {showRefundDialog && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
          onClick={() => setShowRefundDialog(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-ink-900 rounded-t-3xl sm:rounded-3xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-medium mb-1">确认回款</h3>
            <div className="text-xs text-ink-500 mb-4">
              {props.category} · <Money cents={props.amountCents} fallback="·····" />
            </div>
            <label className="block text-xs text-ink-500">回款时间</label>
            <input
              type="datetime-local"
              value={refundInput}
              onChange={(e) => setRefundInput(e.target.value)}
              className="mt-1 w-full px-4 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-400"
            />
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowRefundDialog(false)}
                className="flex-1 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800"
              >
                取消
              </button>
              <button
                onClick={submitRefund}
                className="flex-1 py-3 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <EditEntryModal
          entry={{
            id: props.id,
            category: props.category,
            direction: props.direction,
            amountCents: props.amountCents,
            note: props.note,
            occurredAt: props.occurredAt,
          }}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            startTransition(() => router.refresh());
          }}
        />
      )}
    </div>
  );
}
