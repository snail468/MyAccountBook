'use client';

import { useState } from 'react';
import ModalShell from './ModalShell';
import EntryForm from './EntryForm';
import type { Entry, RecentUse } from './types';

export default function EditEntryModal({
  ledgerId,
  customCategoriesJson,
  recentUsage,
  entry,
  onClose,
  onSaved,
}: {
  ledgerId: string;
  customCategoriesJson: string | null;
  recentUsage: RecentUse[];
  entry: Entry;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(data: Parameters<Parameters<typeof EntryForm>[0]['onSubmit']>[0]) {
    setError('');
    setSaving(true);
    try {
      const res = await fetch(`/api/ledgers/${ledgerId}/entries/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '保存失败');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <EntryForm
        ledgerName="编辑记录"
        customCategoriesJson={customCategoriesJson}
        recentUsage={recentUsage}
        initial={entry}
        saving={saving}
        error={error}
        onSubmit={submit}
        onCancel={onClose}
        submitText="保存修改"
      />
    </ModalShell>
  );
}

// ==================== 类别管理 ====================
