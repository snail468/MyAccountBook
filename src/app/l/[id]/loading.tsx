import { SkeletonBox, SkeletonLine } from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <div className="px-6 pt-14 pb-24">
      <div className="flex items-center gap-3 mb-6">
        <SkeletonLine className="h-4 w-16" />
      </div>
      <SkeletonBox className="h-32" />
      <SkeletonBox className="mt-4 h-14" />
      <div className="mt-6 space-y-2">
        {[...Array(4)].map((_, i) => (
          <SkeletonBox key={i} className="h-16" />
        ))}
      </div>
    </div>
  );
}
