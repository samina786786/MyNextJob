import { describe, expect, it } from 'vitest';

import type { JobSourceRecord } from '@/lib/jobs/repository/types';
import {
  SUPPORTED_PROVIDERS,
  WWR_ALL_JOBS_IDENTIFIER,
  findDuplicateSources,
  validateSourceConfig,
} from '@/lib/jobs/sources/registry';

function source(overrides: Partial<JobSourceRecord> = {}): JobSourceRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    companyId: '22222222-2222-4222-8222-222222222222',
    name: 'Acme',
    sourceType: 'greenhouse',
    externalIdentifier: 'acme',
    enabled: true,
    syncFrequencyMinutes: 60,
    lastSyncedAt: null,
    nextSyncAt: null,
    status: 'active',
    errorCount: 0,
    metadata: {},
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('validateSourceConfig', () => {
  it('accepts a well-formed Greenhouse source', () => {
    const result = validateSourceConfig(source({ sourceType: 'greenhouse', externalIdentifier: 'dscout' }));
    expect(result).toEqual({ valid: true, provider: 'greenhouse', identifier: 'dscout' });
  });

  it('accepts a well-formed Lever source', () => {
    const result = validateSourceConfig(source({ sourceType: 'lever', externalIdentifier: 'drivetrain' }));
    expect(result.valid).toBe(true);
  });

  it('accepts a well-formed Ashby source', () => {
    const result = validateSourceConfig(source({ sourceType: 'ashby', externalIdentifier: 'zeeg' }));
    expect(result.valid).toBe(true);
  });

  it('accepts the WWR singleton with company_id NULL', () => {
    const result = validateSourceConfig(
      source({ sourceType: 'we_work_remotely', externalIdentifier: WWR_ALL_JOBS_IDENTIFIER, companyId: null }),
    );
    expect(result.valid).toBe(true);
  });

  it('rejects an unknown provider', () => {
    const result = validateSourceConfig(source({ sourceType: 'workday' as never }));
    expect(result).toMatchObject({ valid: false, issue: 'unsupported_provider' });
  });

  it('rejects a blank identifier', () => {
    const result = validateSourceConfig(source({ externalIdentifier: '' }));
    expect(result).toMatchObject({ valid: false, issue: 'missing_identifier' });
  });

  it('rejects a malformed identifier (path/URL characters)', () => {
    const result = validateSourceConfig(source({ externalIdentifier: '../evil' }));
    expect(result).toMatchObject({ valid: false, issue: 'invalid_identifier' });
  });

  it('rejects an https URL as identifier', () => {
    const result = validateSourceConfig(source({ externalIdentifier: 'https://evil.example' }));
    expect(result).toMatchObject({ valid: false, issue: 'invalid_identifier' });
  });

  it('rejects a direct-employer source with no company_id', () => {
    const result = validateSourceConfig(
      source({ sourceType: 'greenhouse', externalIdentifier: 'acme', companyId: null }),
    );
    expect(result).toMatchObject({ valid: false, issue: 'missing_company_binding' });
  });

  it('rejects WWR with a company_id', () => {
    const result = validateSourceConfig(
      source({
        sourceType: 'we_work_remotely',
        externalIdentifier: WWR_ALL_JOBS_IDENTIFIER,
        companyId: '33333333-3333-4333-8333-333333333333',
      }),
    );
    expect(result).toMatchObject({ valid: false, issue: 'wwr_company_must_be_null' });
  });

  it('rejects WWR with any identifier other than the singleton', () => {
    const result = validateSourceConfig(
      source({
        sourceType: 'we_work_remotely',
        externalIdentifier: 'weworkremotely-marketing-rss',
        companyId: null,
      }),
    );
    expect(result).toMatchObject({ valid: false, issue: 'wwr_identifier_must_be_singleton' });
  });

  it('exposes the current provider set exactly', () => {
    expect([...SUPPORTED_PROVIDERS].sort()).toEqual(['ashby', 'greenhouse', 'lever', 'we_work_remotely']);
  });
});

describe('findDuplicateSources', () => {
  it('detects the same provider+identifier registered twice, case-insensitive', () => {
    const a = source({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', externalIdentifier: 'Acme' });
    const b = source({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', externalIdentifier: 'acme' });
    const c = source({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', externalIdentifier: 'other' });
    const dups = findDuplicateSources([a, b, c]);
    expect(dups).toHaveLength(1);
    expect(dups[0]?.ids.sort()).toEqual([a.id, b.id]);
  });

  it('does not conflate different providers with the same identifier', () => {
    const gh = source({ sourceType: 'greenhouse', externalIdentifier: 'acme' });
    const lv = source({ sourceType: 'lever', externalIdentifier: 'acme' });
    expect(findDuplicateSources([gh, lv])).toEqual([]);
  });
});
