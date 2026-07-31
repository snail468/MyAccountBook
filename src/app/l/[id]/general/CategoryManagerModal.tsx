'use client';

import { useMemo, useState } from 'react';
import { useAlert, useConfirm, useToast } from '@/components/ui/Dialog';
import {
  effectiveCategories,
  parseCustom,
  type CustomCategoriesJson,
  type GeneralCategory,
  type GeneralCategoryDirection,
} from '@/lib/generalCategories';
import ModalShell from './ModalShell';
import AddCategoryModal from './AddCategoryModal';

export default function CategoryManagerModal({
  ledgerId,
  customCategoriesJson,
  onClose,
  onSaved,
}: {
  ledgerId: string;
  customCategoriesJson: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [state, setState] = useState<CustomCategoriesJson>(() =>
    parseCustom(customCategoriesJson),
  );
  const [tab, setTab] = useState<GeneralCategoryDirection>('expense');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();
  const alert = useAlert();
  const toast = useToast();

  const effective = useMemo(
    () => effectiveCategories(JSON.stringify(state), tab),
    [state, tab],
  );

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function batchDelete() {
    if (selected.size === 0) return;
    const names = [...selected];
    const ok = await confirm({
      title: `删除 ${names.length} 个类别？`,
      body: `${names.join('、')}\n\n已有的记账条目不会受影响，只是这些类别不再出现在选择列表里。`,
      danger: true,
      confirmText: '删除',
    });
    if (!ok) return;
    setState((prev) => {
      // 从 added 里过滤掉，同时把预设加入 hidden
      const addedFiltered = prev.added.filter((c) => !selected.has(c.name));
      const hidden = new Set(prev.hidden);
      for (const n of selected) hidden.add(n);
      return { added: addedFiltered, hidden: [...hidden] };
    });
    setSelected(new Set());
  }

  function addNew(cat: GeneralCategory) {
    setState((prev) => {
      // 如果之前是隐藏的同名，取消隐藏
      const hidden = prev.hidden.filter((h) => h !== cat.name);
      const withoutSame = prev.added.filter((a) => a.name !== cat.name);
      return { added: [...withoutSame, cat], hidden };
    });
    setShowAdd(false);
    toast({ message: `已添加类别 "${cat.name}"`, kind: 'success' });
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/ledgers/${ledgerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customCategories: state }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '保存失败');
      onSaved();
    } catch (e) {
      await alert({
        title: '保存失败',
        body: e instanceof Error ? e.message : '未知错误',
        danger: true,
      });
    } finally {
      setSaving(false);
    }
  }

  async function resetAll() {
    const ok = await confirm({
      title: '还原所有默认类别？',
      body: '会取消所有隐藏，但保留已添加的自定义类别。',
      confirmText: '还原',
    });
    if (!ok) return;
    setState((prev) => ({ ...prev, hidden: [] }));
    setSelected(new Set());
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-lg font-medium">管理类别</h3>
        <button onClick={resetAll} className="text-xs text-ink-500 underline">
          还原默认
        </button>
      </div>

      <div className="flex gap-2 mb-3">
        <button
          onClick={() => {
            setTab('expense');
            setSelected(new Set());
          }}
          className={`flex-1 py-2 rounded-2xl text-sm ${
            tab === 'expense'
              ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
              : 'bg-ink-50 dark:bg-ink-800'
          }`}
        >
          支出
        </button>
        <button
          onClick={() => {
            setTab('income');
            setSelected(new Set());
          }}
          className={`flex-1 py-2 rounded-2xl text-sm ${
            tab === 'income'
              ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
              : 'bg-ink-50 dark:bg-ink-800'
          }`}
        >
          收入
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        {effective.map((c) => {
          const isSel = selected.has(c.name);
          return (
            <button
              key={c.name}
              onClick={() => toggle(c.name)}
              className={`p-3 rounded-2xl text-center transition relative border-2 ${
                isSel
                  ? 'bg-red-50 dark:bg-red-950/40 border-red-400'
                  : 'bg-ink-50 dark:bg-ink-800 border-transparent'
              }`}
            >
              <div className="text-2xl leading-none">{c.icon}</div>
              <div className="text-[11px] mt-1 truncate">{c.name}</div>
              {isSel && (
                <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">
                  ✓
                </div>
              )}
            </button>
          );
        })}
        <button
          onClick={() => setShowAdd(true)}
          className="p-3 rounded-2xl border-2 border-dashed border-ink-300 dark:border-ink-600 text-ink-500 text-xs flex items-center justify-center min-h-[64px]"
        >
          + 新增
        </button>
      </div>

      {selected.size > 0 && (
        <button
          onClick={batchDelete}
          className="w-full py-2.5 rounded-2xl bg-red-500 text-white text-sm font-medium mb-3"
        >
          删除选中 ({selected.size})
        </button>
      )}

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

      {showAdd && (
        <AddCategoryModal
          direction={tab}
          existingNames={effective.map((c) => c.name)}
          onCancel={() => setShowAdd(false)}
          onAdd={addNew}
        />
      )}
    </ModalShell>
  );
}
