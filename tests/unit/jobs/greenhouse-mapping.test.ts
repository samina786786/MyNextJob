import { describe, expect, it } from 'vitest';

import {
  decodeGreenhouseContent,
  greenhouseExternalId,
  inferGreenhouseRemoteType,
  mapGreenhouseJob,
} from '@/lib/jobs/adapters/greenhouse';
import { prepareNormalizedJob } from '@/lib/jobs/normalization/normalize-job';
import { sanitizeDescriptionHtml } from '@/lib/jobs/normalization/sanitize-description';

import {
  GREENHOUSE_SOURCE_ID,
  greenhouseJobFixture,
} from './fixtures/greenhouse-jobs';

const MAP_INPUT = {
  sourceId: GREENHOUSE_SOURCE_ID,
  companyName: 'Dscout',
  companyId: '22222222-2222-4222-8222-222222222222',
};

describe('Greenhouse mapping', () => {
  it('maps a normal job onto the normalized contract', () => {
    const result = mapGreenhouseJob(greenhouseJobFixture(), MAP_INPUT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.job.title).toBe('Software Engineer - India');
    expect(result.job.company.name).toBe('Dscout');
    expect(result.job.company.companyId).toBe(MAP_INPUT.companyId);
    expect(result.job.department).toBe('Engineering');
    expect(result.job.employmentType).toBe('unknown');
    expect(result.job.salary).toBeUndefined();
  });

  it('uses Greenhouse job.id as a stable string externalId', () => {
    const first = mapGreenhouseJob(greenhouseJobFixture({ id: 4370266009 }), MAP_INPUT);
    const second = mapGreenhouseJob(greenhouseJobFixture({ id: 4370266009 }), MAP_INPUT);
    expect(first.ok && first.job.source.externalId).toBe('4370266009');
    expect(second.ok && second.job.source.externalId).toBe('4370266009');
    expect(greenhouseExternalId(4370266009)).toBe('4370266009');
  });

  it('accepts prospect posts with null internal_job_id', () => {
    const result = mapGreenhouseJob(
      greenhouseJobFixture({ internal_job_id: null }),
      MAP_INPUT,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.job.source.externalId).toBe('4370266009');
    expect((result.job.rawPayload as { internal_job_id: unknown }).internal_job_id).toBeNull();
  });

  it('keeps original location text when location is missing', () => {
    const result = mapGreenhouseJob(
      greenhouseJobFixture({ location: null, offices: [] }),
      MAP_INPUT,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.job.location.text).toBeNull();
    expect(result.job.remoteType).toBe('unknown');
  });

  it('falls back to a single office name only when location.name is missing', () => {
    const result = mapGreenhouseJob(
      greenhouseJobFixture({
        location: { name: '' },
        offices: [{ id: 1, name: 'Hyderabad' }],
      }),
      MAP_INPUT,
    );
    expect(result.ok && result.job.location.text).toBe('Hyderabad');
  });

  it('infers remote from Remote India location variants and never assumes onsite', () => {
    expect(inferGreenhouseRemoteType('Remote - India')).toBe('remote');
    expect(inferGreenhouseRemoteType('India - Remote')).toBe('remote');
    expect(inferGreenhouseRemoteType('Remote, India')).toBe('remote');
    expect(inferGreenhouseRemoteType('India Remote')).toBe('remote');
    expect(inferGreenhouseRemoteType('Hybrid — Bengaluru')).toBe('hybrid');
    expect(inferGreenhouseRemoteType('Hyderabad, India')).toBe('unknown');
    expect(inferGreenhouseRemoteType('London')).toBe('unknown');
  });

  it('does not map updated_at onto publishedAt', () => {
    const result = mapGreenhouseJob(
      greenhouseJobFixture({ updated_at: '2026-08-20T12:00:00Z' }),
      MAP_INPUT,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.job.publishedAt).toBeNull();
    expect((result.job.rawPayload as { updated_at: string }).updated_at).toBe(
      '2026-08-20T12:00:00Z',
    );
    const prepared = prepareNormalizedJob(result.job);
    expect(prepared.publishedAt).toBeNull();
  });

  it('decodes escaped HTML once then relies on the Phase 3 sanitizer', () => {
    const escaped = decodeGreenhouseContent(
      '&lt;p&gt;Build React apps&lt;/p&gt;&lt;script&gt;alert(1)&lt;/script&gt;',
    );
    expect(escaped).toContain('<p>Build React apps</p>');
    expect(sanitizeDescriptionHtml(escaped)).toBe('<p>Build React apps</p>');
    expect(sanitizeDescriptionHtml(escaped)).not.toContain('script');
  });

  it('does not double-decode content that already has tags', () => {
    const html = '<p>Use &lt;Component /&gt;</p>';
    expect(decodeGreenhouseContent(html)).toBe(html);
  });

  it('strips unsafe Greenhouse content through the generic sanitizer', () => {
    const result = mapGreenhouseJob(
      greenhouseJobFixture({
        content: '<p>Hello</p><script>alert(1)</script><a href="javascript:alert(1)">x</a>',
      }),
      MAP_INPUT,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const prepared = prepareNormalizedJob(result.job);
    expect(prepared.descriptionHtml).toContain('<p>Hello</p>');
    expect(prepared.descriptionHtml).not.toContain('script');
    expect(prepared.descriptionHtml).not.toContain('javascript:');
  });

  it('uses the first department as the single department field and keeps extras in raw payload', () => {
    const result = mapGreenhouseJob(
      greenhouseJobFixture({
        departments: [
          { id: 1, name: 'Engineering' },
          { id: 2, name: 'Product' },
        ],
      }),
      MAP_INPUT,
    );
    expect(result.ok && result.job.department).toBe('Engineering');
    if (!result.ok) return;
    const departments = (result.job.rawPayload as { departments: { name: string }[] }).departments;
    expect(departments.map((d) => d.name)).toEqual(['Engineering', 'Product']);
  });

  it('preserves offices and metadata in the capped raw payload', () => {
    const result = mapGreenhouseJob(greenhouseJobFixture(), MAP_INPUT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const raw = result.job.rawPayload as {
      offices: unknown[];
      metadata: unknown;
      content?: unknown;
    };
    expect(raw.offices).toHaveLength(1);
    expect(raw.metadata).toBeTruthy();
    expect(raw.content).toBeUndefined();
  });

  it('passes an invalid absolute_url through so the engine can reject it', () => {
    const result = mapGreenhouseJob(
      greenhouseJobFixture({ absolute_url: 'javascript:alert(1)' }),
      MAP_INPUT,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(() => prepareNormalizedJob(result.job)).toThrow(/apply_url|source_url|http/i);
  });

  it('rejects a malformed id without using internal_job_id as identity', () => {
    const result = mapGreenhouseJob(
      greenhouseJobFixture({ id: { nested: true }, internal_job_id: 99 }),
      MAP_INPUT,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('malformed_id');
  });

  it('rejects a missing title', () => {
    const result = mapGreenhouseJob(greenhouseJobFixture({ title: '  ' }), MAP_INPUT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('missing_title');
    expect(result.externalId).toBe('4370266009');
  });
});
