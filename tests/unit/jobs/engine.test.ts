import { describe, expect, it } from 'vitest';

import {
  acmeFrontendJob,
  exampleLabsMobileJob,
  SYNTHETIC_UNSAFE_HTML,
  SyntheticAdapter,
} from '@/lib/jobs/adapters/synthetic';
import { persistNormalizedJob } from '@/lib/jobs/engine/persist-job';
import { syncJobSource } from '@/lib/jobs/engine/sync-source';
import { ValidationError } from '@/lib/jobs/errors';
import { runSyntheticSyncDemo } from '@/lib/jobs/dev/run-synthetic-sync';
import { MemoryJobStore } from '@/lib/jobs/repository/memory';
import { sanitizeDescriptionHtml } from '@/lib/jobs/normalization/sanitize-description';

async function seededSource(name = 'Synthetic ATS A') {
  const store = new MemoryJobStore();
  const source = await store.insertJobSource({ name });
  return { store, source };
}

describe('persistNormalizedJob', () => {
  it('inserts a canonical job and source posting once', async () => {
    const { store, source } = await seededSource();
    const job = acmeFrontendJob();
    job.source.sourceId = source.id;
    const first = await persistNormalizedJob(store, job);
    expect(first.kind).toBe('created');
    expect(store.listJobs()).toHaveLength(1);
    expect(store.listPostings()).toHaveLength(1);
  });

  it('is idempotent for the same source posting', async () => {
    const { store, source } = await seededSource();
    const job = acmeFrontendJob();
    job.source.sourceId = source.id;
    await persistNormalizedJob(store, job);
    const second = await persistNormalizedJob(store, job);
    expect(second.kind).toBe('unchanged');
    expect(store.listJobs()).toHaveLength(1);
    expect(store.listPostings()).toHaveLength(1);
  });

  it('updates canonical content when the description changes', async () => {
    const { store, source } = await seededSource();
    const job = acmeFrontendJob();
    job.source.sourceId = source.id;
    const first = await persistNormalizedJob(store, job);
    const updated = acmeFrontendJob({
      descriptionText: 'Now owning design-system tokens and clay primitives.',
      descriptionHtml: '<p>Now owning design-system tokens.</p>',
    });
    updated.source.sourceId = source.id;
    const second = await persistNormalizedJob(store, updated);
    expect(second.kind).toBe('updated');
    expect(second.jobId).toBe(first.jobId);
    expect(store.listPostings()).toHaveLength(1);
    const canonical = await store.findCanonicalJob(first.jobId);
    expect(canonical?.descriptionText).toContain('design-system');
    expect(canonical?.discoveredAt.getTime()).toBe(canonical?.discoveredAt.getTime());
  });

  it('merges a strong cross-source duplicate into one canonical job', async () => {
    const store = new MemoryJobStore();
    const sourceA = await store.insertJobSource({ name: 'Synthetic ATS A' });
    const sourceB = await store.insertJobSource({ name: 'Synthetic ATS B' });
    const fromA = acmeFrontendJob({ externalId: 'acme-fe-a' });
    fromA.source.sourceId = sourceA.id;
    const fromB = acmeFrontendJob({
      externalId: 'acme-fe-b',
      applyUrl: 'https://jobs.other-test.example/apply/fe',
      sourceUrl: 'https://jobs.other-test.example/jobs/fe',
    });
    fromB.source.sourceId = sourceB.id;

    const first = await persistNormalizedJob(store, fromA);
    const second = await persistNormalizedJob(store, fromB);
    expect(second.kind).toBe('merged');
    expect(second.jobId).toBe(first.jobId);
    expect(store.listJobs()).toHaveLength(1);
    expect(store.listPostings()).toHaveLength(2);
  });

  it('does not merge an ambiguous same-title opening', async () => {
    const store = new MemoryJobStore();
    const sourceA = await store.insertJobSource({ name: 'Synthetic ATS A' });
    const sourceB = await store.insertJobSource({ name: 'Synthetic ATS B' });
    const fromA = acmeFrontendJob({ externalId: 'req-1' });
    fromA.source.sourceId = sourceA.id;
    const fromB = acmeFrontendJob({
      externalId: 'req-2',
      descriptionText: 'Staff-level platform role focused on payments reliability.',
      descriptionHtml: '<p>Staff-level platform role focused on payments reliability.</p>',
    });
    fromB.source.sourceId = sourceB.id;

    await persistNormalizedJob(store, fromA);
    const second = await persistNormalizedJob(store, fromB);
    expect(second.kind).toBe('created');
    expect(second.duplicateCandidate).toBe(true);
    expect(store.listJobs()).toHaveLength(2);
    expect(store.listPostings()).toHaveLength(2);
  });

  it('sanitizes unsafe HTML before persistence', async () => {
    const { store, source } = await seededSource();
    const job = acmeFrontendJob({ descriptionHtml: SYNTHETIC_UNSAFE_HTML });
    job.source.sourceId = source.id;
    const outcome = await persistNormalizedJob(store, job);
    const canonical = await store.findCanonicalJob(outcome.jobId);
    expect(canonical?.descriptionHtml).toBe(sanitizeDescriptionHtml(SYNTHETIC_UNSAFE_HTML));
    expect(canonical?.descriptionHtml).not.toContain('<script');
    expect(canonical?.descriptionHtml).not.toContain('javascript:');
  });

  it('rejects malformed jobs and unsafe URLs', async () => {
    const { store, source } = await seededSource();
    await expect(
      persistNormalizedJob(store, {
        source: { sourceId: source.id, externalId: 'x' },
        company: { name: 'Acme Technologies' },
        title: 'Engineer',
        applyUrl: 'javascript:alert(1)',
        sourceUrl: '',
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      persistNormalizedJob(store, {
        source: { sourceId: source.id, externalId: 'y' },
        company: { name: 'Acme Technologies' },
        title: '',
        applyUrl: 'https://jobs.example.test/a',
        sourceUrl: 'https://jobs.example.test/s',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('does not create duplicate companies for case/whitespace variants', async () => {
    const { store, source } = await seededSource();
    const a = acmeFrontendJob({ externalId: 'one' });
    a.source.sourceId = source.id;
    const b = acmeFrontendJob({
      externalId: 'two',
      title: 'Staff Frontend Engineer',
      descriptionText: 'Different opening on the same team.',
    });
    b.source.sourceId = source.id;
    b.company = { name: 'ACME   TECHNOLOGIES' };
    await persistNormalizedJob(store, a);
    await persistNormalizedJob(store, b);
    expect(store.listCompanies()).toHaveLength(1);
  });
});

describe('syncJobSource', () => {
  it('records metrics and does not duplicate on a second identical sync', async () => {
    const { store, source } = await seededSource();
    const adapter = new SyntheticAdapter([acmeFrontendJob(), exampleLabsMobileJob()]);
    const first = await syncJobSource(store, source.id, adapter);
    expect(first.status).toBe('succeeded');
    expect(first.metrics.canonicalJobsCreated).toBe(2);
    expect(first.metrics.rejected).toBe(0);

    const second = await syncJobSource(store, source.id, adapter);
    expect(second.metrics.unchanged).toBe(2);
    expect(store.listJobs()).toHaveLength(2);
    expect(store.listPostings()).toHaveLength(2);
    expect((await store.getJobSource(source.id))?.errorCount).toBe(0);
    expect((await store.getJobSource(source.id))?.status).toBe('active');
  });

  it('rejects a malformed job without failing the source run', async () => {
    const { store, source } = await seededSource();
    const bad = acmeFrontendJob({ externalId: 'bad' });
    bad.applyUrl = 'javascript:alert(1)';
    bad.sourceUrl = 'javascript:alert(1)';
    const adapter = new SyntheticAdapter([acmeFrontendJob(), bad]);
    const result = await syncJobSource(store, source.id, adapter);
    expect(result.status).toBe('succeeded');
    expect(result.metrics.accepted).toBe(1);
    expect(result.metrics.rejected).toBe(1);
    expect(result.rejections[0]?.reason).toBe('invalid_apply_url');
    expect(store.listJobs()).toHaveLength(1);
  });

  it('does not mark misses on a partial snapshot', async () => {
    const { store, source } = await seededSource();
    await syncJobSource(store, source.id, new SyntheticAdapter([acmeFrontendJob()]));
    const omitted = await syncJobSource(
      store,
      source.id,
      new SyntheticAdapter([], { snapshotComplete: false }),
    );
    expect(omitted.status).toBe('succeeded');
    expect(store.listJobs()[0]?.status).toBe('open');
    expect(store.listPostings()[0]?.consecutiveMisses).toBe(0);
  });

  it('does not close after one complete miss and reopens on reappearance', async () => {
    const { store, source } = await seededSource();
    await store.updateJobSource(source.id, {
      metadata: { missesBeforePossiblyClosed: 2, missesBeforeClosed: 4 },
    });
    await syncJobSource(store, source.id, new SyntheticAdapter([acmeFrontendJob()]));
    await syncJobSource(store, source.id, new SyntheticAdapter([]));
    expect(store.listJobs()[0]?.status).toBe('open');

    await syncJobSource(store, source.id, new SyntheticAdapter([]));
    expect(store.listJobs()[0]?.status).toBe('possibly_closed');

    const again = await syncJobSource(store, source.id, new SyntheticAdapter([acmeFrontendJob()]));
    expect(again.status).toBe('succeeded');
    expect(store.listJobs()).toHaveLength(1);
    expect(store.listJobs()[0]?.status).toBe('open');
    expect(store.listPostings()[0]?.consecutiveMisses).toBe(0);
  });

  it('records source failure without mass-closing existing jobs', async () => {
    const { store, source } = await seededSource();
    await syncJobSource(store, source.id, new SyntheticAdapter([acmeFrontendJob()]));
    const failed = await syncJobSource(
      store,
      source.id,
      new SyntheticAdapter([], { fail: true, failMessage: 'Authorization: Bearer secret-token boom' }),
    );
    expect(failed.status).toBe('failed');
    expect(failed.errorMessage).not.toMatch(/secret-token/i);
    expect(failed.errorMessage).not.toMatch(/Bearer /);
    const refreshed = await store.getJobSource(source.id);
    expect(refreshed?.errorCount).toBe(1);
    expect(refreshed?.status).toBe('active');
    expect(store.listJobs()).toHaveLength(1);
    expect(store.listJobs()[0]?.status).toBe('open');
    expect(store.getSyncRun(failed.runId)?.status).toBe('failed');
  });
});

describe('synthetic demo', () => {
  it('inserts then no-ops on the second run', async () => {
    const demo = await runSyntheticSyncDemo();
    expect(demo.first.status).toBe('succeeded');
    expect(demo.second.metrics.unchanged).toBe(2);
    expect(demo.jobCount).toBe(2);
    expect(demo.postingCount).toBe(2);
  });
});
