'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// 页面 mount 后立刻把常去的路由 payload 拉回来放到 client cache
// 用户真去点时，router.push 直接命中缓存 → 感觉即点即开
export default function Prefetcher({ routes }: { routes: string[] }) {
  const router = useRouter();
  useEffect(() => {
    for (const r of routes) {
      try {
        router.prefetch(r);
      } catch {
        // ignore
      }
    }
  }, [routes, router]);
  return null;
}
