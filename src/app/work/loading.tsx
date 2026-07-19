import { SkeletonBox, SkeletonLine } from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <div className="px-6 pt-14">
      <div className="flex items-center gap-3 mb-6">
        <SkeletonLine className="h-4 w-14" />
        <SkeletonLine className="h-6 w-24 ml-2" />
      </div>
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => (
          <SkeletonBox key={i} className="h-28" />
        ))}
      </div>
    </div>
  );
}
