import { SkeletonBox, SkeletonLine } from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <div className="px-6 pt-14">
      <div className="flex items-center justify-between mb-2">
        <SkeletonLine className="h-4 w-40" />
        <SkeletonLine className="h-4 w-10" />
      </div>

      <div className="rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 p-6 mt-4 shadow-sm">
        <SkeletonLine className="h-3 w-40 mb-3" />
        <SkeletonLine className="h-10 w-56 mb-6" />
        <div className="space-y-3">
          <SkeletonLine className="h-4" />
          <SkeletonLine className="h-4" />
          <SkeletonLine className="h-4" />
        </div>
      </div>

      <div className="mt-8 space-y-3">
        <SkeletonBox className="h-20" />
        <SkeletonBox className="h-20" />
        <SkeletonBox className="h-20" />
      </div>
    </div>
  );
}
