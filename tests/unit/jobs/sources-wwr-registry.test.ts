import { describe, expect, it } from 'vitest';

import { WWR_SOURCE_IDENTIFIER } from '@/lib/jobs/adapters/wwr-http';
import type { JobSourceRecord } from '@/lib/jobs/repository/types';
import {
  WWR_ALL_JOBS_IDENTIFIER,
  findDuplicateSources,
  validateSourceConfig,
} from '@/lib/jobs/sources/registry';
import { runSyncOrchestrator } from '@/lib/jobs/sources/sync-orchestrator';
import { MemoryJobStore } from '@/lib/jobs/repository/memory';

function wwrSource(overrides: Partial<JobSourceRecord> = {}): JobSourceRecord {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    companyId: null,
    name: 'We Work Remotely — All Jobs',
    sourceType: 'we_work_remotely',
    externalIdentifier: WWR_SOURCE_IDENTIFIER,
    enabled: true,
    syncFrequencyMinutes: 15,
    lastSyncedAt: null,
    nextSyncAt: null,
    status: 'active',
    errorCount: 0,
    metadata: {},
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

describe('WWR registry compatibility (Phase 4D canonical identifier)', () => {
  it('the exported registry constant is the same string the adapter and 0009 use', () => {
    // One shared source of truth. If the WWR string ever changes, all
    // three call sites must be updated together.
    expect(WWR_ALL_JOBS_IDENTIFIER).toBe(WWR_SOURCE_IDENTIFIER);
    expect(WWR_ALL_JOBS_IDENTIFIER).toBe('weworkremotely-all');
  });

  it('validateSourceConfig accepts the canonical WWR row from 0009', () => {
    const result = validateSourceConfig(wwrSource());
    expect(result).toMatchObject({ valid: true, provider: 'we_work_remotely' });
  });

  it('preserves Phase 4D invariant: source-level company_id must be NULL', () => {
    const result = validateSourceConfig(
      wwrSource({ companyId: '00000000-0000-4000-8000-000000000001' }),
    );
    expect(result).toMatchObject({ valid: false, issue: 'wwr_company_must_be_null' });
  });

  it('rejects a second/arbitrary WWR identifier — the aggregator stays a singleton', () => {
    const result = validateSourceConfig(
      wwrSource({ externalIdentifier: 'weworkremotely-marketing-only-rss' }),
    );
    expect(result).toMatchObject({ valid: false, issue: 'wwr_identifier_must_be_singleton' });
  });

  it('rejects a URL/path identifier on the WWR row', () => {
    for (const bad of [
      'https://weworkremotely.com/marketing.rss',
      '../etc/passwd',
      'weworkremotely-all/extra',
    ]) {
      const result = validateSourceConfig(wwrSource({ externalIdentifier: bad }));
      expect(result.valid).toBe(false);
    }
  });

  it('duplicate audit still triggers when the canonical WWR row is present twice', () => {
    const a = wwrSource({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
    const b = wwrSource({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' });
    const dups = findDuplicateSources([a, b]);
    expect(dups).toHaveLength(1);
    expect(dups[0]?.provider).toBe('we_work_remotely');
  });
});

describe('WWR orchestrator (Phase 4D compatibility)', () => {
  const NOW = new Date('2026-09-15T00:00:00.000Z');

  it('the canonical WWR row is NOT skipped_invalid by the orchestrator', async () => {
    const store = new MemoryJobStore(() => NOW);
    // Insert the canonical WWR row directly — MemoryJobStore does not
    // reproduce every DB constraint, but the orchestrator only reads
    // exactly what validateSourceConfig needs.
    const canonical = await store.insertJobSource({
      name: 'We Work Remotely — All Jobs',
      sourceType: 'we_work_remotely',
      externalIdentifier: WWR_SOURCE_IDENTIFIER,
      companyId: null,
      enabled: true,
      metadata: {},
    });
    const { items, summary } = await runSyncOrchestrator(store, [canonical], {
      apply: false,
      now: () => NOW,
    });
    expect(items[0]?.outcome.status).toBe('skipped_dry_run');
    expect(summary.sourcesSkippedInvalid).toBe(0);
  });
});
