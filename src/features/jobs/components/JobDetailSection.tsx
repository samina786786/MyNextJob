import { JobUnavailableState } from '@/features/jobs/components/JobDetailView';
import { JobsFeedSectionError } from '@/features/jobs/components/JobsFeedSectionError';
import { JobDetailView } from '@/features/jobs/components/JobDetailView';
import { loadSharedJobDetail } from '@/lib/jobs/feed/load';
import type { JobDetailDto } from '@/lib/jobs/feed/supabase-detail';

export async function JobDetailSection({ jobId }: { jobId: string }) {
  let job: JobDetailDto | null = null;
  let failed = false;
  try {
    job = await loadSharedJobDetail(jobId);
  } catch {
    failed = true;
  }

  if (failed) {
    return (
      <JobsFeedSectionError
        title="Couldn't load this job."
        message="Please try again in a moment."
      />
    );
  }
  if (!job) return <JobUnavailableState />;
  return <JobDetailView job={job} asOf={new Date().toISOString()} />;
}
