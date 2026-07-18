'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatYuan } from '@/lib/money';

export default function EntryRow({
  id,
  category,
  direction,
  amountCents,
  note,
  reimbursable,
}: {
  id: string;
  category: string;
  direction: 'income' | 'expense';
  amountCents: number;
  note: string | null;
  reimbursable: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function del() {
    if (!confirm(`删除这笔 "${category}" ${formatYuan(amountCents)} 元？`)) return;
    setBusy(true);
    const res = await fetch(`/api/entries/${id}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
    else setBusy(false);
  }

  return (
    <div className="flex items-center gap-3 p-4 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700">
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate flex items-center gap-1.5">
          <span className="truncate">{category}</span>
          {reimbursable && (
            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
              报销
            </span>
          )}
        </div>
        {note && <div className="text-xs text-ink-500 truncate mt-0.5">{note}</div>}
      </div>
      <div
        className={`num text-base font-medium ${
          direction === 'expense'
            ? reimbursable
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-red-500'
            : 'text-emerald-600 dark:text-emerald-400'
        }`}
      >
        {direction === 'expense' ? '-' : '+'}
        {formatYuan(amountCents)}
      </div>
      <button
        onClick={del}
        disabled={busy}
        className="text-ink-300 hover:text-red-500 text-xs px-1 disabled:opacity-30"
        aria-label="删除"
      >
        ✕
      </button>
    </div>
  );
}
