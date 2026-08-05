'use client';

// 全局离线队列同步器。挂在 layout.tsx 里，让"恢复网络后自动同步"
// 不再依赖用户打开某个特定账本页。
//
// 触发时机（与 useOfflineQueue 一致，但作用域是整个 app）：
//   * 首次挂载：可能上次离开时还有残留
//   * 'online' 事件：断网重连
//   * visibilitychange → visible：iOS Safari 上 'online' 事件不总是触发，
//     用户切回前台也是一次很自然的重试时机
//
// 无 UI，只跑逻辑。各账本页里的 useOfflineQueue 依然存在，负责
// 展示"待同步 N 条"badge 与手动"立即同步"按钮，因此本组件
// 和它并存并不会重复触发 —— syncAll 里 for 循环遇到相同 clientId
// 已被删除的行会自然跳过。

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { syncAll } from '@/lib/offlineQueue';

export default function OfflineSync() {
  const router = useRouter();
  useEffect(() => {
    let running = false;
    const run = async () => {
      if (running) return;
      running = true;
      try {
        const r = await syncAll();
        // 通知同页的 useOfflineQueue 刷新它的 pending 列表 ——
        // 全局跑完可能删掉了它手里那份数据的行，不刷新会看到"幽灵"badge
        if (r.synced > 0 || r.failed > 0) {
          window.dispatchEvent(new CustomEvent('xyd:offline-synced'));
        }
        // 有条目真的同步成功了 → 让当前页面重新拉服务端数据，把补上的记录展示出来
        if (r.synced > 0) router.refresh();
      } catch {
        // syncAll 内部已把每条的失败原因写回 IndexedDB，
        // 全局层无 UI 展示错误 —— 静默忽略即可
      } finally {
        running = false;
      }
    };

    void run(); // 首次

    const onOnline = () => void run();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void run();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router]);

  return null;
}
