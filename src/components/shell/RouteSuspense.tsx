import { Suspense } from 'react';

import { JobsFeedSkeleton } from '@/features/jobs/components/JobCardSkeleton';

/** Cache Components: cookies/params must live under a Suspense boundary. */
export function RouteSuspense({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 px-4 pt-2" aria-hidden="true">
          <JobsFeedSkeleton count={4} />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
