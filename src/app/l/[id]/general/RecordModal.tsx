'use client';

import { useState } from 'react';
import ModalShell from './ModalShell';
import EntryForm from './EntryForm';
import type { RecentUse } from './types';

export default function RecordModal({
  ledgerId,
  ledgerName,
  customCategoriesJson,
  recentUsage,
  onClose,
  onSaved,
  onManageCategories,
}: {
  ledgerId: string;
  ledgerName: string;
  customCategoriesJson: string | null;
  recentUsage: RecentUse[];
  onClose: () => void;
  onSaved: () => void;
  onManageCategories: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(data: Parameters<Parameters<typeof EntryForm>[0]['onSubmit']>[0]) {
    setError('');
    setSaving(true);
    try {
      const res = await fetch(`/api/ledgers/${ledgerId}/entries`, {
        method: 'POST',
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
        ledgerName={ledgerName}
        customCategoriesJson={customCategoriesJson}
        recentUsage={recentUsage}
        saving={saving}
        error={error}
        onSubmit={submit}
        onCancel={onClose}
        onManageCategories={onManageCategories}
        submitText="保存"
      />
    </ModalShell>
  );
}
