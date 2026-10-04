'use client';

import { useState, useEffect } from 'react';
import { RENQING_CATEGORIES } from '@/lib/renqing';
import { useToast } from '@/components/ui/Dialog';

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editingEvent?: {
    id: string;
    title: string;
    category: string;
    eventDate: string;
    banquetCostCents?: number | null;
    note?: string | null;
  } | null;
};

export default function EventDialog({
  open,
  onClose,
  onSuccess,
  editingEvent,
}: Props) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string>('婚礼');
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [banquetCostYuan, setBanquetCostYuan] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editingEvent) {
      setTitle(editingEvent.title);
      setCategory(editingEvent.category);
      setEventDate(editingEvent.eventDate.slice(0, 10));
      setBanquetCostYuan(
        editingEvent.banquetCostCents ? (editingEvent.banquetCostCents / 100).toString() : ''
      );
      setNote(editingEvent.note || '');
    } else {
      setTitle('');
      setCategory('婚礼');
      setEventDate(new Date().toISOString().slice(0, 10));
      setBanquetCostYuan('');
      setNote('');
    }
  }, [open, editingEvent]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast({ message: '标题必填', kind: 'error' });
      return;
    }

    let banquetCostCents: number | null = null;
    if (banquetCostYuan.trim()) {
      const parsed = parseFloat(banquetCostYuan);
      if (!isNaN(parsed) && parsed >= 0) {
        banquetCostCents = Math.round(parsed * 100);
      }
    }

    setSubmitting(true);
    try {
      const url = editingEvent ? `/api/renqing/events/${editingEvent.id}` : '/api/renqing/events';
      const method = editingEvent ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          category,
          eventDate: new Date(eventDate).toISOString(),
          banquetCostCents,
          note: note.trim() || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '保存失败');
      }

      toast({ message: editingEvent ? '礼簿已更新' : '大事件礼簿已创建', kind: 'success' });
      onSuccess();
      onClose();
    } catch (err: any) {
      toast({ message: err.message || '操作失败', kind: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-ink-850 w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-ink-100 dark:border-ink-800">
        <div className="flex items-center justify-between pb-3 border-b border-ink-100 dark:border-ink-800">
          <h2 className="text-lg font-semibold">{editingEvent ? '编辑礼簿设置' : '办喜事 · 新建礼簿'}</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-600 dark:text-ink-300 mb-1.5">
              礼簿名称 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="如：2026年婚礼、宝宝满月宴"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-600 dark:text-ink-300 mb-1.5">宴席事由</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                {RENQING_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-600 dark:text-ink-300 mb-1.5">举办日期</label>
              <input
                type="date"
                required
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-600 dark:text-ink-300 mb-1.5">
              酒席开销总预算/支出 (元，选填)
            </label>
            <input
              type="number"
              step="any"
              placeholder="如酒席场地、伴手礼、烟酒开销"
              value={banquetCostYuan}
              onChange={(e) => setBanquetCostYuan(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            <p className="text-[11px] text-ink-400 mt-1">用于系统自动核算本场宴席礼金收支净结余</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-600 dark:text-ink-300 mb-1.5">备注信息 (选填)</label>
            <input
              type="text"
              placeholder="酒楼地址、桌数等说明"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-ink-500 hover:text-ink-800 dark:hover:text-ink-200"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium transition shadow-sm disabled:opacity-50"
            >
              {submitting ? '保存中...' : '确认保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
