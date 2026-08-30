import { acmeFrontendJob, exampleLabsMobileJob, SyntheticAdapter } from '@/lib/jobs/adapters/synthetic';
import { syncJobSource } from '@/lib/jobs/engine/sync-source';
import { MemoryJobStore } from '@/lib/jobs/repository/memory';

/**
 * Development-only engine exercise. No public HTTP route. No live
 * Supabase writes. Run via `pnpm jobs:synthetic`.
 */
export async function runSyntheticSyncDemo(): Promise<{
  first: Awaited<ReturnType<typeof syncJobSource>>;
  second: Awaited<ReturnType<typeof syncJobSource>>;
  jobCount: number;
  postingCount: number;
}> {
  const store = new MemoryJobStore();
  const source = await store.insertJobSource({ name: 'Synthetic ATS' });
  const adapter = new SyntheticAdapter([acmeFrontendJob(), exampleLabsMobileJob()]);

  const first = await syncJobSource(store, source.id, adapter);
  const second = await syncJobSource(store, source.id, adapter);

  return {
    first,
    second,
    jobCount: store.listJobs().length,
    postingCount: store.listPostings().length,
  };
}
