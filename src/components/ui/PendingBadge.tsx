'use client';

// 通用"待同步 N 条"提示条 —— 工作/桃源/旅游账本页共用。
// 普通账本页 (GeneralView) 里有内联版本，样式一致，保持不动避免多改一处。
//
// 使用：<PendingBadge kind="work" />  或  <PendingBadge kind="travel" ledgerId={ledger.id} />

import { useOfflineQueue } from '@/lib/useOfflineQueue';
import type { QueuedItem } from '@/lib/offlineQueue';

export default function PendingBadge({
  kind,
  ledgerId,
}: {
  kind: NonNullable<QueuedItem['kind']>;
  /** 只有 travel 需要 —— 多个旅游账本时区分是哪本的待同步 */
  ledgerId?: string;
}) {
  const { pending, syncing, sync } = useOfflineQueue();
  const list = pending.filter(
    (p) => (p.kind ?? 'general') === kind && (ledgerId ? p.ledgerId === ledgerId : true),
  );
  if (list.length === 0) return null;
  const hasError = list.some((p) => p.lastError);
  return (
    <div className="mb-3 flex items-center justify-between p-3 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs">
      <span className="text-amber-800 dark:text-amber-300">
        📶 有 {list.length} 笔待同步
        {hasError && <span className="ml-1">（部分失败）</span>}
      </span>
      <button
        onClick={() => void sync()}
        disabled={syncing}
        className="px-3 py-1 rounded-lg bg-amber-500 dark:bg-amber-600 text-white disabled:opacity-60"
      >
        {syncing ? '同步中…' : '立即同步'}
      </button>
    </div>
  );
}
