'use client';

import { useState } from 'react';
import { yuanToCents } from '@/lib/money';
import { localInputToISO, toLocalInput } from '@/lib/datetime';
import { friendlyFetchError } from '@/lib/netError';

export default function AmountEditor({
  title,
  initialAmountCents,
  initialAt,
  onCancel,
  onSubmit,
}: {
  title: string;
  initialAmountCents?: number | null;
  initialAt?: string | null;
  onCancel: () => void;
  onSubmit: (cents: number, atISO: string | null) => Promise<void>;
}) {
  // formatYuan 会带千分位逗号，input 的 yuanToCents 不接受逗号 → 用纯数字字符串
  const [amount, setAmount] = useState(
    initialAmountCents !== null && initialAmountCents !== undefined
      ? (initialAmountCents / 100).toFixed(2)
      : '',
  );
  const [at, setAt] = useState(initialAt ? toLocalInput(initialAt) : toLocalInput(new Date()));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError('');
    const cents = yuanToCents(amount);
    if (cents === null || cents === 0) {
      setError('金额格式不正确');
      return;
    }
    setBusy(true);
    try {
      await onSubmit(cents, localInputToISO(at));
    } catch (err) {
      setError(friendlyFetchError(err) ?? (err instanceof Error ? err.message : '失败'));
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-ink-900 rounded-t-3xl sm:rounded-3xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-xs text-ink-500 mb-2">{title}</div>
        <input
          autoFocus
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full px-4 py-4 text-3xl num rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-400"
        />
        <label className="block mt-3 text-xs text-ink-500">操作时间</label>
        <input
          type="datetime-local"
          value={at}
          onChange={(e) => setAt(e.target.value)}
          className="mt-1 w-full px-4 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-400"
        />
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button onClick={onCancel} className="flex-1 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800">
            取消
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="flex-1 py-3 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 disabled:opacity-50"
          >
            {busy ? '…' : '确定'}
          </button>
        </div>
      </div>
    </div>
  );
}
