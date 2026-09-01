import type { Metadata } from 'next';
import { Suspense } from 'react';

import { JobCardSkeleton } from '@/features/jobs/components/JobCardSkeleton';
import { JobDetailSection } from '@/features/jobs/components/JobDetailSection';
import { requireAuth } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Job' };

async function JobDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAuth(`/jobs/${id}`);
  return <JobDetailSection jobId={id} />;
}

export default function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="space-y-4 px-4 pt-2 safe-top">
      <Suspense
        fallback={
          <div className="space-y-4" aria-hidden="true">
            <JobCardSkeleton />
            <JobCardSkeleton />
          </div>
        }
      >
        <JobDetailRoute params={params} />
      </Suspense>
    </div>
  );
}
