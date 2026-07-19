'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ClientEvent } from './types';

export default function MergeBar({
  selectedIds,
  events,
  onDone,
}: {
  selectedIds: string[];
  events: ClientEvent[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [parentId, setParentId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const selectedEvents = events.filter((e) => selectedIds.includes(e.id));
  const canMerge = selectedIds.length >= 2;

  function openConfirm() {
    setError('');
    setParentId(selectedIds[0] ?? '');
    setTitle(selectedEvents[0]?.title ?? '');
    setConfirmOpen(true);
  }

  async function submit() {
    setError('');
    if (!parentId) {
      setError('请选主活动');
      return;
    }
    const childIds = selectedIds.filter((id) => id !== parentId);
    if (childIds.length === 0) {
      setError('至少要有一个子活动');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/events/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId, childIds, title: title.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '合并失败');
      setConfirmOpen(false);
      onDone();
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : '合并失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="fixed left-0 right-0 bottom-0 px-6 pb-6 pointer-events-none">
        <div className="max-w-md mx-auto pointer-events-auto">
          <div className="rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 p-3 shadow-xl flex items-center gap-3">
            <div className="flex-1 text-sm">
              已选 {selectedIds.length} 项
              {!canMerge && <span className="opacity-60 ml-1">· 至少 2 项</span>}
            </div>
            <button
              onClick={openConfirm}
              disabled={!canMerge}
              className="px-4 py-2 rounded-xl bg-white text-ink-900 dark:bg-ink-900 dark:text-white text-sm font-medium disabled:opacity-40"
            >
              合并
            </button>
          </div>
        </div>
      </div>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-ink-900 rounded-t-3xl sm:rounded-3xl p-6 max-h-[90dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-medium mb-1">合并 {selectedIds.length} 个活动</h3>
            <p className="text-xs text-ink-500 mb-4">
              选一个作为主活动，其余的会挂在主活动下面。合并后金额直接相加。
            </p>

            <label className="block text-xs text-ink-500 mb-1">主活动</label>
            <div className="space-y-2">
              {selectedEvents.map((ev) => (
                <button
                  key={ev.id}
                  onClick={() => {
                    setParentId(ev.id);
                    setTitle(ev.title);
                  }}
                  className={`w-full text-left p-3 rounded-2xl ${
                    parentId === ev.id
                      ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
                      : 'bg-ink-50 dark:bg-ink-800'
                  }`}
                >
                  <div className="text-sm font-medium truncate">{ev.title}</div>
                  <div className="text-[11px] opacity-70">{ev.status}</div>
                </button>
              ))}
            </div>

            <label className="block text-xs text-ink-500 mt-4 mb-1">合并后的名字</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              className="w-full px-4 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-400"
            />

            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                className="flex-1 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800"
              >
                取消
              </button>
              <button
                onClick={submit}
                disabled={busy}
                className="flex-1 py-3 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 disabled:opacity-50"
              >
                {busy ? '合并中…' : '确认合并'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
