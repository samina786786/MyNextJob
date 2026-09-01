import { Suspense } from 'react';

import { ClaySkeleton } from '@/components/clay/ClaySkeleton';

/** Cache Components: cookies/params must live under a Suspense boundary. */
export function RouteSuspense({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="space-y-3 px-4 pt-2" aria-hidden="true">
          <ClaySkeleton className="h-5 w-28 rounded-clay-sm" />
          <ClaySkeleton className="h-8 w-3/4 rounded-clay-sm" />
          <ClaySkeleton className="h-4 w-full rounded-clay-sm" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
