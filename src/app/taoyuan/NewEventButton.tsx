'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewEventButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState('');
  const [participate, setParticipate] = useState(true);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function reset() {
    setOpen(false);
    setTitle('');
    setDeadline('');
    setParticipate(true);
    setNote('');
    setError('');
  }

  async function save() {
    setError('');
    if (!title.trim()) {
      setError('请输入活动名');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          participate,
          // datetime-local 值当作本地时间，转成 ISO
          deadline: deadline ? new Date(deadline).toISOString() : null,
          note: note.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-4 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 text-base font-medium active:scale-[0.98] transition"
      >
        + 新活动
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={reset}>
      <div
        className="w-full max-w-md bg-white dark:bg-ink-900 rounded-t-3xl sm:rounded-3xl p-6 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-medium mb-4">新活动</h3>
        <input
          autoFocus
          placeholder="活动名"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          className="w-full px-4 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-400"
        />
        <label className="block mt-3 text-xs text-ink-500">活动结束/预测截止时间 (可选)</label>
        <input
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className="w-full mt-1 px-4 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-400"
        />
        <label className="flex items-center gap-2 mt-3 text-sm text-ink-600 dark:text-ink-300">
          <input
            type="checkbox"
            checked={participate}
            onChange={(e) => setParticipate(e.target.checked)}
            className="w-4 h-4"
          />
          参与并在首页提醒
        </label>
        <input
          placeholder="备注 (可选)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          className="mt-3 w-full px-4 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-400"
        />
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button onClick={reset} className="flex-1 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800">
            取消
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 py-3 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 disabled:opacity-50"
          >
            {saving ? '保存中…' : '发布'}
          </button>
        </div>
      </div>
    </div>
  );
}
