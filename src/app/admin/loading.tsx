import { SkeletonBox, SkeletonLine } from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <div className="px-6 pt-14">
      <div className="flex items-center gap-3 mb-6">
        <SkeletonLine className="h-4 w-16" />
      </div>
      <SkeletonBox className="h-14 mb-4" />
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <SkeletonBox key={i} className="h-24" />
        ))}
      </div>
    </div>
  );
}
