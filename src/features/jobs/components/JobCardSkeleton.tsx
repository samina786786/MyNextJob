import { ClaySkeleton } from '@/components/clay/ClaySkeleton';
import { cn } from '@/lib/utils';

export function JobCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'feed-skeleton-reveal rounded-clay-xl bg-surface-raised p-5 shadow-clay-raised',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <ClaySkeleton className="h-12 w-12 shrink-0 rounded-clay-md" />
        <div className="min-w-0 flex-1 space-y-2">
          <ClaySkeleton className="h-5 w-4/5 rounded-clay-sm" />
          <ClaySkeleton className="h-4 w-2/5 rounded-clay-sm" />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <ClaySkeleton className="h-7 w-20 rounded-full" />
        <ClaySkeleton className="h-7 w-24 rounded-full" />
        <ClaySkeleton className="h-7 w-16 rounded-full" />
      </div>
      <ClaySkeleton className="mt-4 h-3 w-28 rounded-clay-sm" />
    </div>
  );
}

export function JobsFeedSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-4" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <JobCardSkeleton key={index} />
      ))}
    </div>
  );
}
