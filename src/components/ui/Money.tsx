'use client';

import { formatYuan } from '@/lib/money';
import { useUI } from './UIProvider';

export default function Money({
  cents,
  sign,
  fallback = '·····',
  className,
}: {
  cents: number;
  sign?: boolean;
  fallback?: string;
  className?: string;
}) {
  const { amountsVisible, ready } = useUI();
  // 未 hydrate 时按隐藏渲染，避免 SSR/CSR 内容闪一下
  const visible = ready && amountsVisible;
  return (
    <span className={className}>
      {visible ? formatYuan(cents, { sign }) : fallback}
    </span>
  );
}
