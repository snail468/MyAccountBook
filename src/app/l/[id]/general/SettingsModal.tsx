'use client';

import { useState } from 'react';
import ModalShell from './ModalShell';
import type { LedgerMeta } from './types';
import { inputCls } from './styles';

export default function SettingsModal({
  ledger,
  onClose,
  onSaved,
  onManageCategories,
}: {
  ledger: LedgerMeta;
  onClose: () => void;
  onSaved: () => void;
  onManageCategories: () => void;
}) {
  const [name, setName] = useState(ledger.name);
  const [budgetYuan, setBudgetYuan] = useState(
    ledger.budgetCents ? (ledger.budgetCents / 100).toFixed(2) : '',
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setError('');
    if (!name.trim()) {
      setError('名称不能为空');
      return;
    }
    const body: Record<string, unknown> = { name: name.trim() };
    if (budgetYuan.trim()) {
      const cents = Math.round(Number(budgetYuan) * 100);
      if (!Number.isFinite(cents) || cents < 0) {
        setError('预算格式不正确');
        return;
      }
      body.budgetCents = cents;
    } else {
      body.budgetCents = null;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/ledgers/${ledger.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <h3 className="text-lg font-medium mb-4">账本设置</h3>

      <label className="block text-xs text-ink-500 mb-1">名称</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={50}
        className={inputCls}
      />

      <label className="block text-xs text-ink-500 mt-3 mb-1">月度预算（元，留空关闭）</label>
      <input
        inputMode="decimal"
        value={budgetYuan}
        onChange={(e) => setBudgetYuan(e.target.value)}
        placeholder="0"
        className={inputCls}
      />

      <button
        onClick={onManageCategories}
        className="mt-4 w-full py-3 rounded-2xl bg-ink-50 dark:bg-ink-800 text-sm text-left px-4 flex items-center justify-between"
      >
        <span>管理类别</span>
        <span className="text-ink-400">›</span>
      </button>

      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button onClick={onClose} className="flex-1 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800">
          取消
        </button>
        <button
          onClick={save}
          disabled={busy}
          className="flex-1 py-3 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 disabled:opacity-50"
        >
          {busy ? '保存中…' : '保存'}
        </button>
      </div>
      <p className="mt-3 text-[11px] text-ink-400 text-center">
        删除操作已迁移到「添加 / 删除账本」页面
      </p>
    </ModalShell>
  );
}

