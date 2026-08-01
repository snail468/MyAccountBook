'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useAlert, useConfirm } from '@/components/ui/Dialog';
import Money from '@/components/ui/Money';
import { TRASH_TYPE_LABEL, type TrashType } from '@/lib/softDelete';

type Item = {
  type: TrashType;
  id: string;
  label: string;
  amountCents: number | null;
  deletedAt: string;
  daysLeft: number;
  context: string | null;
};

export default function TrashList({ items }: { items: Item[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const confirm = useConfirm();
  const alert = useAlert();

  async function restore(item: Item) {
    const res = await fetch(`/api/trash/${item.type}/${item.id}`, { method: 'POST' });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      await alert({ title: '恢复失败', body: b.error ?? `HTTP ${res.status}` });
      return;
    }
    startTransition(() => router.refresh());
  }

  async function purge(item: Item) {
    const ok = await confirm({
      title: `永久删除 "${item.label}"？`,
      body: '这一步不可撤销，跳过 60 天保留期，立刻从数据库抹掉。',
      danger: true,
      confirmText: '彻底删除',
    });
    if (!ok) return;
    const res = await fetch(`/api/trash/${item.type}/${item.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      await alert({ title: '删除失败', body: b.error ?? `HTTP ${res.status}` });
      return;
    }
    startTransition(() => router.refresh());
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-ink-400 py-12 text-center">回收站是空的</p>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={`${item.type}:${item.id}`}
          className="p-4 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700"
        >
          <div className="flex items-baseline justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{item.label}</div>
              <div className="text-[11px] text-ink-500 mt-0.5 truncate">
                {TRASH_TYPE_LABEL[item.type]}
                {item.context ? ` · ${item.context}` : ''}
              </div>
            </div>
            {item.amountCents !== null && (
              <span className="num text-sm font-semibold shrink-0">
                <Money cents={item.amountCents} />
              </span>
            )}
          </div>
          <div className="flex items-center justify-between mt-3">
            <span className="text-[11px] text-ink-400">
              还剩 {item.daysLeft} 天自动清除
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => restore(item)}
                className="text-xs px-3 py-1.5 rounded-lg border border-ink-300 dark:border-ink-600 hover:bg-ink-50 dark:hover:bg-ink-700 transition"
              >
                恢复
              </button>
              <button
                onClick={() => purge(item)}
                className="text-xs px-3 py-1.5 rounded-lg text-red-500 border border-red-300 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950 transition"
              >
                彻底删除
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
