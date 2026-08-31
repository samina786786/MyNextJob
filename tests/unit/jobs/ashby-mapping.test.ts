import { describe, expect, it } from 'vitest';

import {
  ashbyExternalId,
  ashbyLocation,
  extractAshbyIdFromJobUrl,
  mapAshbyCompensation,
  mapAshbyEmploymentType,
  mapAshbyJob,
  mapAshbySalaryInterval,
  mapAshbyWorkplace,
  parseAshbyPublishedAt,
} from '@/lib/jobs/adapters/ashby';
import { prepareNormalizedJob } from '@/lib/jobs/normalization/normalize-job';

import {
  ASHBY_JOB_ID,
  ASHBY_SOURCE_ID,
  ashbyCompensation,
  ashbyJobFixture,
  ashbySalaryComponent,
} from './fixtures/ashby-jobs';

const MAP_INPUT = {
  sourceId: ASHBY_SOURCE_ID,
  companyName: 'Juniper Square',
  companyId: '66666666-6666-4666-8666-666666666666',
  boardName: 'junipersquare',
};

describe('Ashby mapping', () => {
  it('maps a standard public posting onto the normalized contract', () => {
    const result = mapAshbyJob(ashbyJobFixture(), MAP_INPUT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.job.source.externalId).toBe(ASHBY_JOB_ID);
    expect(result.job.title).toBe('Member of Technical Staff');
    expect(result.job.company.name).toBe('Juniper Square');
    expect(result.job.location.text).toBe('India - Remote');
    expect(result.job.location.city).toBe('Bengaluru');
    expect(result.job.location.region).toBe('Karnataka');
    expect(result.job.location.country).toBe('India');
    expect(result.job.remoteType).toBe('remote');
    expect(result.job.employmentType).toBe('full_time');
    expect(result.job.department).toBe('Engineering');
    expect(result.job.team).toBe('Platform');
    expect(result.job.sourceUrl).toBe(`https://jobs.ashbyhq.com/junipersquare/${ASHBY_JOB_ID}`);
    expect(result.job.applyUrl).toBe(
      `https://jobs.ashbyhq.com/junipersquare/${ASHBY_JOB_ID}/application`,
    );
    expect(result.job.publishedAt).toBe('2026-08-30T10:00:00Z');
    expect(result.job.salary).toEqual({
      min: 81_000,
      max: 87_000,
      currency: 'USD',
      period: 'year',
    });
    expect(result.identityFromJobUrl).toBe(false);
  });

  it('uses the live UUID id as externalId', () => {
    expect(ashbyExternalId(ASHBY_JOB_ID)).toBe(ASHBY_JOB_ID);
    const first = mapAshbyJob(ashbyJobFixture({ id: ASHBY_JOB_ID }), MAP_INPUT);
    const second = mapAshbyJob(ashbyJobFixture({ id: ASHBY_JOB_ID }), MAP_INPUT);
    expect(first.ok && first.job.source.externalId).toBe(ASHBY_JOB_ID);
    expect(second.ok && second.job.source.externalId).toBe(ASHBY_JOB_ID);
  });

  it('falls back to a validated Ashby jobUrl UUID when id is absent', () => {
    const result = mapAshbyJob(ashbyJobFixture({ id: undefined }), MAP_INPUT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.job.source.externalId).toBe(ASHBY_JOB_ID);
    expect(result.identityFromJobUrl).toBe(true);
  });

  it('does not invent identity from title, company, or location', () => {
    expect(
      mapAshbyJob(
        ashbyJobFixture({
          id: undefined,
          jobUrl: 'https://jobs.ashbyhq.com/other-board/1e04922e-2a0f-4539-ab33-cc31ab29a325',
        }),
        MAP_INPUT,
      ),
    ).toEqual({ ok: false, reason: 'malformed_id' });
    expect(extractAshbyIdFromJobUrl('https://evil.example/junipersquare/' + ASHBY_JOB_ID, 'junipersquare')).toBeNull();
    expect(extractAshbyIdFromJobUrl('https://jobs.ashbyhq.com/junipersquare/not-a-uuid', 'junipersquare')).toBeNull();
  });

  it('preserves primary location text and structured address conservatively', () => {
    const location = ashbyLocation(
      ashbyJobFixture({
        location: 'India - Remote',
        address: {
          postalAddress: {
            addressLocality: 'Bengaluru',
            addressRegion: 'Karnataka',
            addressCountry: 'India',
          },
        },
      }) as never,
    );
    expect(location.text).toBe('India - Remote');
    expect(location.city).toBe('Bengaluru');
  });

  it('uses exactly one secondary location when primary location is absent', () => {
    const result = mapAshbyJob(
      ashbyJobFixture({
        location: '',
        address: null,
        secondaryLocations: [{ location: 'Bengaluru, India', address: null }],
      }),
      MAP_INPUT,
    );
    expect(result.ok && result.job.location.text).toBe('Bengaluru, India');
  });

  it('does not concatenate many secondary locations into the primary field', () => {
    expect(
      ashbyLocation(
        ashbyJobFixture({
          location: '',
          address: null,
          secondaryLocations: [{ location: 'India' }, { location: 'United States' }],
        }) as never,
      ).text,
    ).toBeNull();
  });

  it('maps workplaceType first, then isRemote, then location text', () => {
    expect(mapAshbyWorkplace('Remote', true, 'London').remoteType).toBe('remote');
    expect(mapAshbyWorkplace('Hybrid', false, 'Remote - India').remoteType).toBe('hybrid');
    expect(mapAshbyWorkplace('OnSite', false, 'Remote - India').remoteType).toBe('onsite');
    expect(mapAshbyWorkplace(null, true, 'London').remoteType).toBe('remote');
    expect(mapAshbyWorkplace(null, false, 'Remote - India').remoteType).toBe('remote');
    expect(mapAshbyWorkplace(null, null, 'Hybrid — Bengaluru').remoteType).toBe('hybrid');
    expect(mapAshbyWorkplace(null, false, 'Hyderabad, India').remoteType).toBe('unknown');
  });

  it('records workplace inconsistency without failing the posting', () => {
    const inconsistent = mapAshbyWorkplace('OnSite', true, 'Bengaluru');
    expect(inconsistent.remoteType).toBe('onsite');
    expect(inconsistent.inconsistent).toBe(true);
    const result = mapAshbyJob(ashbyJobFixture({ workplaceType: 'OnSite', isRemote: true }), MAP_INPUT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.job.remoteType).toBe('onsite');
    expect(result.workplaceInconsistent).toBe(true);
  });

  it('maps documented employment types exactly', () => {
    expect(mapAshbyEmploymentType('FullTime')).toBe('full_time');
    expect(mapAshbyEmploymentType('PartTime')).toBe('part_time');
    expect(mapAshbyEmploymentType('Intern')).toBe('internship');
    expect(mapAshbyEmploymentType('Contract')).toBe('contract');
    expect(mapAshbyEmploymentType('Temporary')).toBe('temporary');
    expect(mapAshbyEmploymentType('Employee')).toBe('unknown');
    expect(mapAshbyEmploymentType('')).toBe('unknown');
  });

  it('maps a valid publishedAt and nulls a malformed one without substituting now', () => {
    expect(parseAshbyPublishedAt('2026-08-30T10:00:00Z')).toBe('2026-08-30T10:00:00Z');
    expect(parseAshbyPublishedAt('not-a-date')).toBeNull();
    const mapped = mapAshbyJob(ashbyJobFixture({ publishedAt: 'not-a-date' }), MAP_INPUT);
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.job.publishedAt).toBeNull();
    expect(prepareNormalizedJob(mapped.job).publishedAt).toBeNull();
  });

  it('keeps a valid publishedAt through Phase 3 prepare', () => {
    const mapped = mapAshbyJob(ashbyJobFixture({ publishedAt: '2026-08-30T10:00:00Z' }), MAP_INPUT);
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    const prepared = prepareNormalizedJob(mapped.job);
    expect(prepared.publishedAt?.toISOString()).toBe('2026-08-30T10:00:00.000Z');
  });

  it('prefers descriptionHtml and falls back to descriptionPlain', () => {
    const html = mapAshbyJob(ashbyJobFixture(), MAP_INPUT);
    expect(html.ok && html.job.descriptionHtml).toBe('<p>Build infrastructure.</p>');
    const plain = mapAshbyJob(
      ashbyJobFixture({ descriptionHtml: '', descriptionPlain: 'Plain description only.' }),
      MAP_INPUT,
    );
    expect(plain.ok && plain.job.descriptionHtml).toBeNull();
    expect(plain.ok && plain.job.descriptionText).toBe('Plain description only.');
  });

  it('maps a single Salary component and ignores bonus and equity', () => {
    expect(
      mapAshbyCompensation(
        ashbyCompensation({
          summaryComponents: [
            ashbySalaryComponent(),
            { compensationType: 'Bonus', interval: '1 YEAR', currencyCode: 'USD', minValue: 10_000, maxValue: 20_000 },
            {
              compensationType: 'EquityPercentage',
              interval: 'NONE',
              currencyCode: null,
              minValue: 0.1,
              maxValue: 0.2,
            },
          ],
        }),
      ),
    ).toEqual({ min: 81_000, max: 87_000, currency: 'USD', period: 'year' });
  });

  it('leaves canonical salary null when salary tiers conflict', () => {
    expect(
      mapAshbyCompensation(
        ashbyCompensation({
          summaryComponents: [
            ashbySalaryComponent({ minValue: 80_000, maxValue: 90_000, currencyCode: 'USD' }),
            ashbySalaryComponent({ minValue: 2_000_000, maxValue: 3_000_000, currencyCode: 'INR' }),
          ],
        }),
      ),
    ).toBeNull();
  });

  it('ignores salary when min exceeds max without rejecting the job', () => {
    const result = mapAshbyJob(
      ashbyJobFixture({
        compensation: ashbyCompensation({
          summaryComponents: [ashbySalaryComponent({ minValue: 90_000, maxValue: 80_000 })],
          compensationTiers: [],
        }),
      }),
      MAP_INPUT,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.job.salary).toBeNull();
  });

  it('maps known salary intervals and leaves unknown periods null', () => {
    expect(mapAshbySalaryInterval('1 YEAR')).toBe('year');
    expect(mapAshbySalaryInterval('1 MONTH')).toBe('month');
    expect(mapAshbySalaryInterval('1 DAY')).toBe('day');
    expect(mapAshbySalaryInterval('1 HOUR')).toBe('hour');
    expect(mapAshbySalaryInterval('NONE')).toBeNull();
  });

  it('does not invent salary from scrapeable compensation text', () => {
    expect(
      mapAshbyCompensation(
        ashbyCompensation({
          scrapeableCompensationSalarySummary: '$150K - $250K',
          summaryComponents: [],
          compensationTiers: [],
        }),
      ),
    ).toBeNull();
  });

  it('rejects a missing title and an invalid apply URL at prepare time', () => {
    expect(mapAshbyJob(ashbyJobFixture({ title: '' }), MAP_INPUT)).toMatchObject({
      ok: false,
      reason: 'missing_title',
      externalId: ASHBY_JOB_ID,
    });
    const mapped = mapAshbyJob(ashbyJobFixture({ applyUrl: 'javascript:alert(1)', jobUrl: '' }), MAP_INPUT);
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(() => prepareNormalizedJob(mapped.job)).toThrow();
  });
});
