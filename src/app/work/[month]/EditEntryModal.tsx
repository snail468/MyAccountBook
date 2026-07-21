'use client';

import { useState } from 'react';
import { PRESET_CATEGORIES, type Direction } from '@/lib/categories';
import { yuanToCents } from '@/lib/money';
import { localInputToISO, toLocalInput } from '@/lib/datetime';

type Props = {
  entry: {
    id: string;
    category: string;
    direction: 'income' | 'expense';
    amountCents: number;
    note: string | null;
    occurredAt: string;
  };
  onClose: () => void;
  onSaved: () => void;
};

export default function EditEntryModal({ entry, onClose, onSaved }: Props) {
  const [direction, setDirection] = useState<Direction>(entry.direction);
  const [category, setCategory] = useState(entry.category);
  const [customMode, setCustomMode] = useState(
    // 如果当前 category 不是预设，进入自定义模式
    !PRESET_CATEGORIES.some((c) => c.name === entry.category),
  );
  const [customName, setCustomName] = useState(
    !PRESET_CATEGORIES.some((c) => c.name === entry.category) ? entry.category : '',
  );
  const [amount, setAmount] = useState((entry.amountCents / 100).toFixed(2));
  const [note, setNote] = useState(entry.note ?? '');
  const [occurredAt, setOccurredAt] = useState(toLocalInput(entry.occurredAt));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function pickPreset(name: string, dir: Direction) {
    setCategory(name);
    setDirection(dir);
    setCustomMode(false);
  }

  function switchDirection(d: Direction) {
    if (d === direction) return;
    setDirection(d);
    // 切换方向后，如果当前类别不属于新方向的预设，就重置到该方向第一项
    const stillValid = PRESET_CATEGORIES.some(
      (c) => c.name === category && c.direction === d,
    );
    if (!stillValid && !customMode) {
      const first = PRESET_CATEGORIES.find((c) => c.direction === d);
      if (first) setCategory(first.name);
    }
  }

  async function save() {
    setError('');
    const cents = yuanToCents(amount);
    if (cents === null || cents === 0) {
      setError('金额格式不正确');
      return;
    }
    const finalCategory = customMode ? customName.trim() : category;
    if (!finalCategory) {
      setError('请选择或输入类别');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/entries/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'meta',
          category: finalCategory,
          direction,
          amountCents: cents,
          note: note.trim() || null,
          occurredAt: localInputToISO(occurredAt),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-ink-900 rounded-t-3xl sm:rounded-3xl p-6 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-medium mb-4">编辑记录</h3>

        <label className="block text-xs text-ink-500 mb-1">方向</label>
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => switchDirection('income')}
            className={`flex-1 py-2.5 rounded-2xl text-sm ${
              direction === 'income'
                ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
                : 'bg-ink-50 dark:bg-ink-800'
            }`}
          >
            进项
          </button>
          <button
            onClick={() => switchDirection('expense')}
            className={`flex-1 py-2.5 rounded-2xl text-sm ${
              direction === 'expense'
                ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
                : 'bg-ink-50 dark:bg-ink-800'
            }`}
          >
            出项
          </button>
        </div>

        <label className="block text-xs text-ink-500 mb-1">类别</label>
        {customMode ? (
          <div className="flex gap-2">
            <input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="自定义类别名"
              maxLength={32}
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => {
                setCustomMode(false);
                const first = PRESET_CATEGORIES.find((c) => c.direction === direction);
                if (first) setCategory(first.name);
              }}
              className="px-3 rounded-2xl bg-ink-50 dark:bg-ink-800 text-sm"
            >
              选预设
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_CATEGORIES.filter((c) => c.direction === direction).map((c) => (
                <button
                  key={c.name}
                  onClick={() => pickPreset(c.name, c.direction)}
                  className={`p-3 rounded-2xl text-sm text-left ${
                    category === c.name
                      ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
                      : 'bg-ink-50 dark:bg-ink-800'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setCustomMode(true);
                setCustomName('');
              }}
              className="mt-2 w-full p-2.5 rounded-2xl border-2 border-dashed border-ink-300 dark:border-ink-600 text-ink-500 text-sm"
            >
              + 自定义类别
            </button>
          </>
        )}

        <label className="block text-xs text-ink-500 mt-4 mb-1">金额（元）</label>
        <input
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full px-4 py-4 text-2xl num rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-400"
        />

        <label className="block text-xs text-ink-500 mt-3 mb-1">备注</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          className={inputCls}
        />

        <label className="block text-xs text-ink-500 mt-3 mb-1">操作时间</label>
        <input
          type="datetime-local"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
          className={inputCls}
        />

        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800">
            取消
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 py-3 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  'w-full px-4 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-400';
