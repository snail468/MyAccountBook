'use client';

import { useState } from 'react';
import ModalShell from './ModalShell';
import EntryForm from './EntryForm';
import type { RecentUse } from './types';
import { enqueue } from '@/lib/offlineQueue';
import { useToast } from '@/components/ui/Dialog';

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
  const toast = useToast();

  async function submit(data: Parameters<Parameters<typeof EntryForm>[0]['onSubmit']>[0]) {
    setError('');
    setSaving(true);
    // 生成 clientId：正常路径直接传给后端做去重键；网络失败入队时同一 clientId
    // 让后端下次也识别为同一笔
    const clientId = crypto.randomUUID();
    try {
      const res = await fetch(`/api/ledgers/${ledgerId}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, clientId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 服务端**明确**拒绝（4xx）—— 数据本身有问题，不该入队
        if (res.status >= 400 && res.status < 500) {
          throw new Error(j.error || `HTTP ${res.status}`);
        }
        // 5xx —— 服务端出问题了，也入队等下次
        throw Object.assign(new Error(j.error || `HTTP ${res.status}`), { queue: true });
      }
      onSaved();
    } catch (e) {
      // 网络错误（fetch 抛 TypeError）或 5xx（我们打了 queue 标）→ 入队
      const shouldQueue =
        e instanceof TypeError ||
        (e && typeof e === 'object' && 'queue' in e && (e as { queue?: boolean }).queue);
      if (shouldQueue) {
        try {
          await enqueue({
            ledgerId,
            direction: data.direction,
            category: data.category,
            amountCents: data.amountCents,
            tags: data.tags,
            note: data.note,
            imageUrls: data.imageUrls,
            occurredAt: data.occurredAt ?? new Date().toISOString(),
          });
          toast({
            message: '已存到本地，联网后自动同步',
            kind: 'info',
          });
          onSaved();
          return;
        } catch (qErr) {
          setError(
            '本地存储失败：' +
              (qErr instanceof Error ? qErr.message : '无法访问 IndexedDB'),
          );
        }
      } else {
        setError(e instanceof Error ? e.message : '保存失败');
      }
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
