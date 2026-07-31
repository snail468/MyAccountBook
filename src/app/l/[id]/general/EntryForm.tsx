'use client';

import { useState } from 'react';
import { localInputToISO, toLocalInput } from '@/lib/datetime';
import { yuanToCents } from '@/lib/money';
import { effectiveCategories } from '@/lib/generalCategories';
import ImageUploader from '@/app/taoyuan/ImageUploader';
import type { Entry } from './types';
import { inputCls } from './styles';

export default function EntryForm({
  ledgerName,
  customCategoriesJson,
  initial,
  saving,
  error,
  onSubmit,
  onCancel,
  onManageCategories,
  submitText,
}: {
  ledgerName: string;
  customCategoriesJson: string | null;
  initial?: Partial<Entry>;
  saving: boolean;
  error: string;
  onSubmit: (data: {
    direction: 'income' | 'expense';
    category: string;
    amountCents: number;
    tags: string | null;
    note: string | null;
    imageUrls: string[];
    occurredAt: string | null;
  }) => void;
  onCancel: () => void;
  onManageCategories?: () => void;
  submitText: string;
}) {
  const initialDir = (initial?.direction as 'income' | 'expense') ?? 'expense';
  const [direction, setDirection] = useState<'expense' | 'income'>(initialDir);
  const expenseCats = effectiveCategories(customCategoriesJson, 'expense');
  const incomeCats = effectiveCategories(customCategoriesJson, 'income');
  const options = direction === 'expense' ? expenseCats : incomeCats;
  const initialCategory =
    initial?.category ??
    (direction === 'expense'
      ? expenseCats[0]?.name ?? '其它支出'
      : incomeCats[0]?.name ?? '其它收入');
  const [category, setCategory] = useState<string>(initialCategory);
  const [amount, setAmount] = useState(
    initial?.amountCents ? (initial.amountCents / 100).toFixed(2) : '',
  );
  const [tags, setTags] = useState(initial?.tags ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [imageUrls, setImageUrls] = useState<string[]>(initial?.imageUrls ?? []);
  const [occurredAt, setOccurredAt] = useState(
    toLocalInput(initial?.occurredAt ? new Date(initial.occurredAt) : new Date()),
  );

  function submit() {
    const cents = yuanToCents(amount);
    if (cents === null || cents === 0) return;
    if (!category) return;
    onSubmit({
      direction,
      category,
      amountCents: cents,
      tags: tags.trim() || null,
      note: note.trim() || null,
      imageUrls,
      occurredAt: localInputToISO(occurredAt),
    });
  }

  return (
    <>
      <h3 className="text-lg font-medium mb-4">{ledgerName} · {submitText}</h3>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => {
            setDirection('expense');
            setCategory(expenseCats[0]?.name ?? '其它支出');
          }}
          className={`flex-1 py-2.5 rounded-2xl text-sm ${
            direction === 'expense'
              ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
              : 'bg-ink-50 dark:bg-ink-800'
          }`}
        >
          支出
        </button>
        <button
          onClick={() => {
            setDirection('income');
            setCategory(incomeCats[0]?.name ?? '其它收入');
          }}
          className={`flex-1 py-2.5 rounded-2xl text-sm ${
            direction === 'income'
              ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
              : 'bg-ink-50 dark:bg-ink-800'
          }`}
        >
          收入
        </button>
      </div>

      <div className="flex items-baseline justify-between mb-1">
        <label className="text-xs text-ink-500">类别</label>
        {onManageCategories && (
          <button
            onClick={onManageCategories}
            className="text-[11px] text-ink-500 underline"
          >
            管理类别
          </button>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {options.map((c) => (
          <button
            key={c.name}
            onClick={() => setCategory(c.name)}
            className={`p-2 rounded-2xl text-center transition ${
              category === c.name
                ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
                : 'bg-ink-50 dark:bg-ink-800'
            }`}
          >
            <div className="text-lg leading-none">{c.icon}</div>
            <div className="text-[10px] mt-1 truncate">{c.name}</div>
          </button>
        ))}
      </div>

      <label className="block text-xs text-ink-500 mt-4 mb-1">金额（元）</label>
      <input
        inputMode="decimal"
        placeholder="0.00"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-full px-4 py-4 text-2xl num rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-400"
      />

      <label className="block text-xs text-ink-500 mt-3 mb-1">标签（逗号分隔）</label>
      <input
        value={tags ?? ''}
        onChange={(e) => setTags(e.target.value)}
        maxLength={200}
        placeholder="午饭, 同事"
        className={inputCls}
      />

      <label className="block text-xs text-ink-500 mt-3 mb-1">备注</label>
      <input
        value={note ?? ''}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        className={inputCls}
      />

      <div className="mt-3">
        <label className="block text-xs text-ink-500 mb-1">小票/图片</label>
        <ImageUploader
          value={imageUrls}
          onChange={setImageUrls}
          namePrefix={ledgerName}
          max={4}
        />
      </div>

      <label className="block text-xs text-ink-500 mt-3 mb-1">发生时间</label>
      <input
        type="datetime-local"
        value={occurredAt}
        onChange={(e) => setOccurredAt(e.target.value)}
        className={inputCls}
      />

      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button onClick={onCancel} className="flex-1 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800">
          取消
        </button>
        <button
          onClick={submit}
          disabled={saving}
          className="flex-1 py-3 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 disabled:opacity-50"
        >
          {saving ? '保存中…' : submitText}
        </button>
      </div>
    </>
  );
}
