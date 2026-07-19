'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PRESET_CATEGORIES, type Direction } from '@/lib/categories';
import { yuanToCents } from '@/lib/money';
import { localInputToISO, toLocalInput } from '@/lib/datetime';

type Step = 'closed' | 'category' | 'amount';

export default function NewEntryFlow({ yearMonth }: { yearMonth: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('closed');
  const [category, setCategory] = useState('');
  const [direction, setDirection] = useState<Direction>('income');
  const [customMode, setCustomMode] = useState(false);
  const [customName, setCustomName] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [occurredAt, setOccurredAt] = useState<string>(() => toLocalInput(new Date()));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function reset() {
    setStep('closed');
    setCategory('');
    setCustomMode(false);
    setCustomName('');
    setAmount('');
    setNote('');
    setOccurredAt(toLocalInput(new Date()));
    setError('');
  }

  function pickPreset(name: string, dir: Direction) {
    setCategory(name);
    setDirection(dir);
    setStep('amount');
  }

  function confirmCustom() {
    const name = customName.trim();
    if (!name) {
      setError('请输入类别名');
      return;
    }
    setError('');
    setCategory(name);
    setStep('amount');
  }

  async function save() {
    setError('');
    const cents = yuanToCents(amount);
    if (cents === null || cents === 0) {
      setError('金额格式不正确');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yearMonth,
          category,
          direction,
          amountCents: cents,
          note: note.trim() || null,
          occurredAt: localInputToISO(occurredAt),
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

  if (step === 'closed') {
    return (
      <button
        onClick={() => setStep('category')}
        className="mt-4 w-full py-4 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 text-base font-medium active:scale-[0.98] transition"
      >
        + 记一笔
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={reset}>
      <div
        className="w-full max-w-md bg-white dark:bg-ink-900 rounded-t-3xl sm:rounded-3xl p-6 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {step === 'category' && !customMode && (
          <>
            <h3 className="text-lg font-medium mb-4">选择类别</h3>
            <div className="space-y-2">
              <div className="text-xs text-ink-500 mb-1">进项</div>
              {PRESET_CATEGORIES.filter((c) => c.direction === 'income').map((c) => (
                <button
                  key={c.name}
                  onClick={() => pickPreset(c.name, 'income')}
                  className="w-full text-left p-4 rounded-2xl bg-ink-50 dark:bg-ink-800 hover:bg-ink-100 dark:hover:bg-ink-700 active:scale-[0.98] transition"
                >
                  {c.name}
                </button>
              ))}
              <div className="text-xs text-ink-500 mb-1 mt-4">出项</div>
              {PRESET_CATEGORIES.filter((c) => c.direction === 'expense').map((c) => (
                <button
                  key={c.name}
                  onClick={() => pickPreset(c.name, 'expense')}
                  className="w-full text-left p-4 rounded-2xl bg-ink-50 dark:bg-ink-800 hover:bg-ink-100 dark:hover:bg-ink-700 active:scale-[0.98] transition"
                >
                  {c.name}
                </button>
              ))}
              <button
                onClick={() => setCustomMode(true)}
                className="w-full text-left p-4 rounded-2xl border-2 border-dashed border-ink-300 dark:border-ink-600 text-ink-500 mt-4"
              >
                + 自定义类别
              </button>
            </div>
            <button onClick={reset} className="mt-4 w-full py-3 rounded-2xl text-ink-500">
              取消
            </button>
          </>
        )}

        {step === 'category' && customMode && (
          <>
            <h3 className="text-lg font-medium mb-4">自定义类别</h3>
            <input
              autoFocus
              placeholder="类别名"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-400"
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setDirection('income')}
                className={`flex-1 py-3 rounded-2xl ${direction === 'income' ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900' : 'bg-ink-50 dark:bg-ink-800'}`}
              >
                进项
              </button>
              <button
                onClick={() => setDirection('expense')}
                className={`flex-1 py-3 rounded-2xl ${direction === 'expense' ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900' : 'bg-ink-50 dark:bg-ink-800'}`}
              >
                出项
              </button>
            </div>
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button onClick={() => setCustomMode(false)} className="flex-1 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800">
                返回
              </button>
              <button onClick={confirmCustom} className="flex-1 py-3 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900">
                下一步
              </button>
            </div>
          </>
        )}

        {step === 'amount' && (
          <>
            <div className="text-xs text-ink-500 mb-1">
              {direction === 'income' ? '进项' : '出项'} · {category}
            </div>
            <h3 className="text-lg font-medium mb-4">金额 (元)</h3>
            <input
              autoFocus
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-4 py-4 text-3xl num rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-400"
            />
            <input
              placeholder="备注 (可选)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              className="mt-3 w-full px-4 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-400"
            />
            <label className="block mt-3 text-xs text-ink-500">操作时间</label>
            <input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="mt-1 w-full px-4 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-400"
            />
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button onClick={() => setStep('category')} className="flex-1 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800">
                返回
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 py-3 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 disabled:opacity-50"
              >
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
