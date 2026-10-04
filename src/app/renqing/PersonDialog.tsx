'use client';

import { useState, useEffect } from 'react';
import { PERSON_GROUPS } from '@/lib/renqing';
import { useToast } from '@/components/ui/Dialog';

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editingPerson?: {
    id: string;
    name: string;
    relationship?: string | null;
    group: string;
    phone?: string | null;
    note?: string | null;
  } | null;
};

export default function PersonDialog({
  open,
  onClose,
  onSuccess,
  editingPerson,
}: Props) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [group, setGroup] = useState('other');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editingPerson) {
      setName(editingPerson.name);
      setRelationship(editingPerson.relationship || '');
      setGroup(editingPerson.group || 'other');
      setPhone(editingPerson.phone || '');
      setNote(editingPerson.note || '');
    } else {
      setName('');
      setRelationship('');
      setGroup('other');
      setPhone('');
      setNote('');
    }
  }, [open, editingPerson]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast({ message: '姓名必填', kind: 'error' });
      return;
    }

    setSubmitting(true);
    try {
      const url = editingPerson ? `/api/renqing/persons/${editingPerson.id}` : '/api/renqing/persons';
      const method = editingPerson ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          relationship: relationship.trim() || null,
          group,
          phone: phone.trim() || null,
          note: note.trim() || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '保存失败');
      }

      toast({ message: editingPerson ? '档案已更新' : '亲友档案已建立', kind: 'success' });
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
          <h2 className="text-lg font-semibold">{editingPerson ? '编辑亲友档案' : '新建亲友联系人'}</h2>
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
              亲友姓名 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="如：王大明"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-600 dark:text-ink-300 mb-1.5">称谓 / 关系</label>
              <input
                type="text"
                placeholder="如：二舅、发小"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-600 dark:text-ink-300 mb-1.5">分类分组</label>
              <select
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                {PERSON_GROUPS.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-600 dark:text-ink-300 mb-1.5">联系电话 (选填)</label>
            <input
              type="tel"
              placeholder="如：13800000000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-600 dark:text-ink-300 mb-1.5">备注说明 (选填)</label>
            <input
              type="text"
              placeholder="常住城市、工作单位或特征等"
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
