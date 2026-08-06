'use client';

// 通用"待同步 N 条"提示条 —— 工作/桃源/旅游账本页共用。
// 普通账本页 (GeneralView) 里有内联版本，样式一致，保持不动避免多改一处。
//
// 使用：<PendingBadge kind="work" ledgerId={workLedgerId} />
//      <PendingBadge kind="travel" ledgerId={ledger.id} />

import { useOfflineQueue } from '@/lib/useOfflineQueue';
import type { QueuedItem } from '@/lib/offlineQueue';

export default function PendingBadge({
  kind,
  ledgerId,
}: {
  kind: NonNullable<QueuedItem['kind']>;
  /**
   * Phase 3 之后 work/taoyuan 也可能多账本（自己 owner + 共享），传 ledgerId 精确过滤。
   * 老队列条目 (B8) 用占位符 'work'/'taoyuan' 存 ledgerId —— 为兼容，
   * 老占位符匹配 kind 时也算命中，避免旧条目在页面上不显示。
   */
  ledgerId?: string;
}) {
  const { pending, syncing, sync } = useOfflineQueue();
  const list = pending.filter((p) => {
    const pKind = p.kind ?? 'general';
    if (pKind !== kind) return false;
    if (!ledgerId) return true;
    if (p.ledgerId === ledgerId) return true;
    // 老占位符（B8 用 kind 名当 ledgerId）兼容路径
    if (p.ledgerId === kind) return true;
    return false;
  });
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
