'use client';

// 首页挂载时把用户所有普通/旅游账本的 HTML 主动拉进 SW 的 NAV_CACHE，
// 并把账本清单持久化到 localStorage —— /offline-record.html 那个纯静态
// 兜底页会读这份清单让用户挑账本记账。
//
// 为什么这个必须存在：
//   SPA 里点 <Link> 只发 RSC 请求，SW 的 navigate 分支从没见过 /l/[id] 的
//   HTML —— 断网硬跳就掉进 offline.html。首页 mount 时挨个 fetch 一下同 URL
//   的 HTML（走 SW 的 network-first 路径），下次断网就能命中缓存渲染出
//   GeneralView / TravelView，B8 的离线记账队列才真正能被用起来。

import { useEffect } from 'react';

export type WarmableLedger = {
  id: string;
  kind: 'general' | 'travel';
  name: string;
  icon: string | null;
};

const CACHED_LEDGERS_KEY = 'xyd:cachedLedgers';

export default function OfflineWarmer({
  ledgers,
  extraUrls = [],
}: {
  ledgers: WarmableLedger[];
  /** 除账本外还想让 SW 预热的路径（比如 /work、/taoyuan） */
  extraUrls?: string[];
}) {
  useEffect(() => {
    // 1) 记下账本清单，让 offline-record.html 兜底页读得到
    try {
      localStorage.setItem(
        CACHED_LEDGERS_KEY,
        JSON.stringify({
          savedAt: new Date().toISOString(),
          ledgers,
        }),
      );
    } catch {
      /* 隐私模式 / 存满了 都无所谓 */
    }

    // 2) 请 SW 把这些 URL 的 HTML 拉进缓存 —— 不能自己 fetch，
    //    要用 postMessage 走 SW 的 warm 处理器（skip-if-cached）
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;

    const urls = [
      '/', // 首页兜底再 warm 一次，覆盖 SW 刚升级后 NAV_CACHE 是空的情况
      ...ledgers.map((l) => `/l/${l.id}`),
      ...extraUrls,
    ];

    const send = () => {
      navigator.serviceWorker.ready
        .then((reg) => {
          const target = reg.active ?? navigator.serviceWorker.controller;
          if (target) target.postMessage({ type: 'warm', urls });
        })
        .catch(() => {
          /* 没注册 SW 或注册失败：老浏览器 or 隐私模式，不影响主流程 */
        });
    };

    // 别抢首屏渲染的带宽
    if ('requestIdleCallback' in window) {
      (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(
        send,
      );
    } else {
      setTimeout(send, 1200);
    }
    // 弹窗 chunk 的预热放在 GeneralView 里（用户进过一次账本就好）；
    // 从没进过账本的情况下 GeneralView 的按钮会捕获 import() 失败并跳
    // /offline-record.html —— 走静态兜底页，用户依然能记账
  }, [ledgers, extraUrls]);

  return null;
}
