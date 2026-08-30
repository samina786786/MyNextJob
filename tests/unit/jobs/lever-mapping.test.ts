import { describe, expect, it } from 'vitest';

import {
  composeLeverDescriptionHtml,
  leverCountry,
  leverExternalId,
  leverLocationText,
  mapLeverCommitment,
  mapLeverJob,
  mapLeverSalary,
  mapLeverWorkplaceType,
} from '@/lib/jobs/adapters/lever';
import { prepareNormalizedJob } from '@/lib/jobs/normalization/normalize-job';

import { LEVER_SOURCE_ID, leverJobFixture } from './fixtures/lever-jobs';

const MAP_INPUT = {
  sourceId: LEVER_SOURCE_ID,
  companyName: 'Drivetrain',
  companyId: '44444444-4444-4444-8444-444444444444',
};

describe('Lever mapping', () => {
  it('maps a standard job onto the normalized contract', () => {
    const result = mapLeverJob(leverJobFixture(), MAP_INPUT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.job.source.externalId).toBe('lever-job-abc123');
    expect(result.job.title).toBe('Frontend Engineer — India');
    expect(result.job.company.name).toBe('Drivetrain');
    expect(result.job.location.text).toBe('Remote - India');
    expect(result.job.location.country).toBe('IN');
    expect(result.job.remoteType).toBe('remote');
    expect(result.job.employmentType).toBe('full_time');
    expect(result.job.team).toBe('Engineering');
    expect(result.job.department).toBe('Product Engineering');
    expect(result.job.sourceUrl).toBe('https://jobs.lever.co/example/lever-job-abc123');
    expect(result.job.applyUrl).toBe('https://jobs.lever.co/example/lever-job-abc123/apply');
    expect(result.job.publishedAt).toBeNull();
    expect(result.job.salary).toBeNull();
  });

  it('uses Lever id as a stable string externalId', () => {
    expect(leverExternalId('4370266009')).toBe('4370266009');
    const first = mapLeverJob(leverJobFixture({ id: '4370266009' }), MAP_INPUT);
    const second = mapLeverJob(leverJobFixture({ id: '4370266009' }), MAP_INPUT);
    expect(first.ok && first.job.source.externalId).toBe('4370266009');
    expect(second.ok && second.job.source.externalId).toBe('4370266009');
  });

  it('falls back to a single allLocations entry when location is missing', () => {
    const result = mapLeverJob(
      leverJobFixture({
        categories: {
          location: '',
          allLocations: ['Noida / Bengaluru'],
        },
      }),
      MAP_INPUT,
    );
    expect(result.ok && result.job.location.text).toBe('Noida / Bengaluru');
  });

  it('does not flatten many allLocations into the primary location', () => {
    expect(
      leverLocationText(
        leverJobFixture({
          categories: { location: '', allLocations: ['India', 'United States'] },
        }) as never,
      ),
    ).toBeNull();
  });

  it('maps workplaceType deterministically and does not infer when unspecified', () => {
    expect(mapLeverWorkplaceType('remote', 'London')).toBe('remote');
    expect(mapLeverWorkplaceType('hybrid', 'Remote - India')).toBe('hybrid');
    expect(mapLeverWorkplaceType('on-site', 'Remote - India')).toBe('onsite');
    expect(mapLeverWorkplaceType('unspecified', 'Remote - India')).toBe('unknown');
    expect(mapLeverWorkplaceType(null, 'Remote - India')).toBe('remote');
    expect(mapLeverWorkplaceType(undefined, 'Hybrid — Bengaluru')).toBe('hybrid');
    expect(mapLeverWorkplaceType(null, 'Hyderabad, India')).toBe('unknown');
  });

  it('maps commitment conservatively', () => {
    expect(mapLeverCommitment('Full Time')).toBe('full_time');
    expect(mapLeverCommitment('Full-Time')).toBe('full_time');
    expect(mapLeverCommitment('Fulltime')).toBe('full_time');
    expect(mapLeverCommitment('Part Time')).toBe('part_time');
    expect(mapLeverCommitment('Contract')).toBe('contract');
    expect(mapLeverCommitment('Contractor')).toBe('contract');
    expect(mapLeverCommitment('Internship')).toBe('internship');
    expect(mapLeverCommitment('Intern')).toBe('internship');
    expect(mapLeverCommitment('Temporary')).toBe('temporary');
    expect(mapLeverCommitment('Employee India')).toBe('unknown');
    expect(mapLeverCommitment('')).toBe('unknown');
  });

  it('stores a valid ISO country and ignores non-ISO values', () => {
    expect(leverCountry('in')).toBe('IN');
    expect(leverCountry('US')).toBe('US');
    expect(leverCountry('India')).toBeNull();
    expect(leverCountry(null)).toBeNull();
  });

  it('maps a structurally valid salaryRange and ignores salary description text', () => {
    const result = mapLeverJob(
      leverJobFixture({
        salaryRange: { currency: 'usd', interval: 'per-year-salary', min: 80_000, max: 120_000 },
        salaryDescriptionPlain: 'Competitive plus bonus',
      }),
      MAP_INPUT,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.job.salary).toEqual({
      min: 80_000,
      max: 120_000,
      currency: 'USD',
      period: 'year',
    });
    expect((result.job.rawPayload as { salaryDescriptionPlain: string }).salaryDescriptionPlain).toBe(
      'Competitive plus bonus',
    );
    expect(mapLeverSalary({ currency: 'INR', interval: 'weird', min: 10, max: 5 })).toBeNull();
  });

  it('does not invent publishedAt from undocumented timestamps', () => {
    const result = mapLeverJob(leverJobFixture({ createdAt: 1_784_573_753_095 }), MAP_INPUT);
    expect(result.ok && result.job.publishedAt).toBeNull();
    if (!result.ok) return;
    const prepared = prepareNormalizedJob(result.job);
    expect(prepared.publishedAt).toBeNull();
  });

  it('composes description + lists + additional without duplicating opening', () => {
    const html = composeLeverDescriptionHtml(leverJobFixture() as never);
    expect(html).toContain('Join the product team.');
    expect(html).toContain('Build React applications.');
    expect(html).toContain('Requirements');
    expect(html).toContain('TypeScript');
    expect(html).toContain('equal opportunity employer');
    expect(html?.split('Join the product team.').length).toBe(2);
  });

  it('sanitizes unsafe Lever HTML through the Phase 3 sanitizer', () => {
    const result = mapLeverJob(
      leverJobFixture({
        description: '<p>Safe</p><script>alert(1)</script><a href="javascript:alert(1)">x</a>',
        lists: [{ text: 'Bad', content: '<li onclick="alert(1)">Item</li>' }],
        additional: '<img src=x onerror=alert(1)>',
      }),
      MAP_INPUT,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const prepared = prepareNormalizedJob(result.job);
    expect(prepared.descriptionHtml).toContain('<p>Safe</p>');
    expect(prepared.descriptionText).toContain('Safe');
    expect(prepared.descriptionText).toContain('Item');
    expect(prepared.descriptionHtml).not.toContain('script');
    expect(prepared.descriptionHtml).not.toContain('javascript:');
    expect(prepared.descriptionHtml).not.toContain('onclick');
    expect(prepared.descriptionHtml).not.toContain('onerror');
  });

  it('rejects missing id and missing title', () => {
    expect(mapLeverJob(leverJobFixture({ id: { nested: true } }), MAP_INPUT).ok).toBe(false);
    const missingTitle = mapLeverJob(leverJobFixture({ text: '  ' }), MAP_INPUT);
    expect(missingTitle.ok).toBe(false);
    if (missingTitle.ok) return;
    expect(missingTitle.reason).toBe('missing_title');
  });

  it('passes an invalid hosted URL through so the engine can reject it', () => {
    const result = mapLeverJob(
      leverJobFixture({ hostedUrl: 'javascript:alert(1)', applyUrl: '' }),
      MAP_INPUT,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(() => prepareNormalizedJob(result.job)).toThrow(/apply_url|source_url|http/i);
  });
});
