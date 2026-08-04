'use client';

// 客户端 hook：把 offlineQueue 的状态暴露给组件。
//
// 触发同步的场景：
//   * 挂载：可能上次离开时还有残留
//   * 'online' 事件：断网重连
//   * 页面从后台切回前台（visibilitychange）—— iOS Safari 上 'online'
//     事件不总是触发
//   * 有新入队 —— 立即试一次

import { useCallback, useEffect, useState } from 'react';
import { listPending, syncAll, type QueuedEntry, type SyncResult } from '@/lib/offlineQueue';

export function useOfflineQueue() {
  const [pending, setPending] = useState<QueuedEntry[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);

  const refresh = useCallback(async () => {
    setPending(await listPending());
  }, []);

  const sync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const r = await syncAll();
      setLastResult(r);
      await refresh();
    } finally {
      setSyncing(false);
    }
  }, [syncing, refresh]);

  useEffect(() => {
    void refresh();
    // 首次挂载就试一次同步 —— 只要联网有残留就打
    void sync();

    const onOnline = () => void sync();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void sync();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { pending, syncing, lastResult, refresh, sync };
}
