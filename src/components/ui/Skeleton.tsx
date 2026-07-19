// 骨架屏原件：用统一的柔和动画，避免每个 loading.tsx 重复写 class
export function SkeletonBox({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-ink-200/70 dark:bg-ink-700/60 rounded-2xl ${className ?? ''}`}
    />
  );
}

export function SkeletonLine({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-ink-200/70 dark:bg-ink-700/60 rounded ${className ?? 'h-4'}`}
    />
  );
}
