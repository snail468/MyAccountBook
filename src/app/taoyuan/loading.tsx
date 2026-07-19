import { SkeletonBox, SkeletonLine } from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <div className="px-6 pt-14 pb-24">
      <div className="flex items-center gap-3 mb-6">
        <SkeletonLine className="h-4 w-16" />
      </div>
      <SkeletonBox className="h-14" />
      <div className="mt-6 space-y-6">
        {[...Array(2)].map((_, i) => (
          <section key={i}>
            <SkeletonLine className="h-3 w-32 mb-2" />
            <div className="space-y-2">
              <SkeletonBox className="h-40" />
              <SkeletonBox className="h-40" />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
