import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { pickAttributionLabel } from '@/lib/jobs/feed/attribution';
import { collectForbiddenFeedFields, toFeedCardJob } from '@/lib/jobs/feed/card';
import { companyInitials } from '@/lib/jobs/feed/company-initials';
import { encodeFeedCursor } from '@/lib/jobs/feed/cursor';
import { appendUniqueById } from '@/lib/jobs/feed/dedupe';
import { parseFeedQuery } from '@/lib/jobs/feed/parse-query';
import { freshnessWording, formatRelativeAge } from '@/lib/jobs/feed/relative-time';
import { formatSalary } from '@/lib/jobs/feed/salary-display';
import { pickApplyUrl } from '@/lib/jobs/feed/supabase-detail';
import { workplaceLines } from '@/lib/jobs/feed/workplace';
import { FeedCursorError } from '@/lib/jobs/errors';
import type { FeedJob } from '@/lib/jobs/feed/types';

const AS_OF = new Date('2026-09-01T12:00:00.000Z');

function feedJob(overrides: Partial<FeedJob> = {}): FeedJob {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    companyId: '22222222-2222-4222-8222-222222222222',
    companyName: 'Acme',
    companyLogoUrl: null,
    title: 'Engineer',
    locationText: 'Bengaluru',
    city: 'Bengaluru',
    region: null,
    country: 'India',
    remoteType: 'hybrid',
    employmentType: 'full_time',
    salaryMin: 175000,
    salaryMax: 250000,
    salaryCurrency: 'USD',
    salaryPeriod: 'year',
    publishedAt: new Date('2026-08-31T10:00:00.000Z'),
    discoveredAt: new Date('2026-08-31T11:00:00.000Z'),
    freshnessAt: new Date('2026-08-31T10:00:00.000Z'),
    status: 'open',
    applyUrl: 'https://jobs.example.test/apply',
    sourceUrl: 'https://jobs.example.test/job',
    ...overrides,
  };
}

describe('freshness wording', () => {
  it('labels published_at as Posted', () => {
    const wording = freshnessWording({
      publishedAt: '2026-09-01T10:00:00.000Z',
      discoveredAt: '2026-08-20T00:00:00.000Z',
      asOf: AS_OF,
    });
    expect(wording.kind).toBe('posted');
    expect(wording.label).toBe('Posted 2h ago');
    expect(wording.datetime).toBe('2026-09-01T10:00:00.000Z');
  });

  it('labels missing published_at as Found from discovered_at', () => {
    const wording = freshnessWording({
      publishedAt: null,
      discoveredAt: '2026-08-31T12:00:00.000Z',
      asOf: AS_OF,
    });
    expect(wording.kind).toBe('found');
    expect(wording.label).toBe('Found yesterday');
    expect(wording.label.startsWith('Posted')).toBe(false);
  });

  it('formats minutes, hours, yesterday, and days', () => {
    expect(formatRelativeAge(new Date('2026-09-01T11:40:00.000Z'), AS_OF)).toBe('20m ago');
    expect(formatRelativeAge(new Date('2026-09-01T09:00:00.000Z'), AS_OF)).toBe('3h ago');
    expect(formatRelativeAge(new Date('2026-08-31T12:00:00.000Z'), AS_OF)).toBe('yesterday');
    expect(formatRelativeAge(new Date('2026-08-26T12:00:00.000Z'), AS_OF)).toBe('6 days ago');
  });
});

describe('company initials', () => {
  it('uses the first letter of a single name', () => {
    expect(companyInitials('Drivetrain')).toBe('D');
    expect(companyInitials('AlphaSense')).toBe('A');
  });

  it('uses the first letters of the first two tokens', () => {
    expect(companyInitials('TRM Labs')).toBe('TL');
  });

  it('falls back when the name is empty', () => {
    expect(companyInitials('')).toBe('?');
    expect(companyInitials(null)).toBe('?');
  });
});

describe('salary formatting', () => {
  it('formats USD yearly ranges in thousands', () => {
    expect(
      formatSalary({
        salaryMin: 175000,
        salaryMax: 250000,
        salaryCurrency: 'USD',
        salaryPeriod: 'year',
      }),
    ).toBe('$175k–$250k / year');
  });

  it('formats INR yearly ranges in lakhs', () => {
    expect(
      formatSalary({
        salaryMin: 2_500_000,
        salaryMax: 3_500_000,
        salaryCurrency: 'INR',
        salaryPeriod: 'year',
      }),
    ).toBe('₹25L–₹35L / year');
  });

  it('omits the row when structured salary is missing', () => {
    expect(
      formatSalary({
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: 'USD',
        salaryPeriod: 'year',
      }),
    ).toBeNull();
  });
});

describe('remote and location rendering', () => {
  it('keeps remote restrictions instead of reducing to Remote only', () => {
    expect(
      workplaceLines({
        remoteType: 'remote',
        locationText: 'North America Only',
        city: null,
        country: null,
      }),
    ).toEqual({ remote: 'Remote', location: 'North America Only' });
  });

  it('does not duplicate a bare Remote location', () => {
    expect(
      workplaceLines({
        remoteType: 'remote',
        locationText: 'Remote',
        city: null,
        country: null,
      }),
    ).toEqual({ remote: 'Remote', location: null });
  });
});

describe('attribution preference', () => {
  it('prefers a direct ATS over We Work Remotely', () => {
    expect(
      pickAttributionLabel([
        { sourceType: 'we_work_remotely', name: 'We Work Remotely — All Jobs', attributionRequired: true },
        { sourceType: 'greenhouse', name: 'Acme Greenhouse', attributionRequired: false },
      ]),
    ).toBe('Greenhouse');
  });

  it('labels WWR when it is the only source', () => {
    expect(
      pickAttributionLabel([
        { sourceType: 'we_work_remotely', name: 'We Work Remotely — All Jobs', attributionRequired: true },
      ]),
    ).toBe('We Work Remotely');
  });
});

describe('feed card DTO', () => {
  it('omits apply URLs and internal fields', () => {
    const card = toFeedCardJob(feedJob(), 'Greenhouse');
    expect(card.sourceLabel).toBe('Greenhouse');
    expect(card.companyLogoUrl).toBeNull();
    expect(card).not.toHaveProperty('applyUrl');
    expect(card).not.toHaveProperty('sourceUrl');
    expect(card).not.toHaveProperty('rawPayload');
    expect(collectForbiddenFeedFields({ items: [card], nextCursor: null, hasNextPage: false, asOf: AS_OF.toISOString() })).toEqual(
      [],
    );
  });

  it('flags leaked internals', () => {
    expect(collectForbiddenFeedFields({ fingerprint: 'abc', items: [{ content_hash: 'x' }] })).toEqual(
      expect.arrayContaining(['fingerprint', 'content_hash']),
    );
  });

  it('carries a public logo URL without storage internals', () => {
    const card = toFeedCardJob(
      feedJob({
        companyLogoUrl:
          'https://abc.supabase.co/storage/v1/object/public/company-assets/companies/22222222-2222-4222-8222-222222222222/logo.webp',
      }),
      'Lever',
    );
    expect(card.companyLogoUrl).toContain('/company-assets/');
    expect(card).not.toHaveProperty('logo_storage_path');
    expect(card).not.toHaveProperty('logoStatus');
    expect(card).not.toHaveProperty('logo_status');
  });
});

describe('feed query parsing', () => {
  it('defaults to 15 and accepts a valid cursor', () => {
    const cursor = encodeFeedCursor({
      freshnessAt: new Date('2026-09-01T00:00:00.000Z'),
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    });
    const parsed = parseFeedQuery(new URLSearchParams({ cursor }));
    expect(parsed.limit).toBe(15);
    expect(parsed.cursor).toBe(cursor);
  });

  it('rejects a malformed cursor before caching', () => {
    expect(() => parseFeedQuery(new URLSearchParams({ cursor: 'not-a-cursor' }))).toThrow(FeedCursorError);
  });
});

describe('dedupe and apply URL', () => {
  it('does not append an existing job id', () => {
    const first = { id: 'a' };
    expect(appendUniqueById([first], [{ id: 'a' }, { id: 'b' }])).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('uses apply_url then a safe source_url', () => {
    expect(pickApplyUrl('https://apply.example/x', 'https://source.example/x')).toBe('https://apply.example/x');
    expect(pickApplyUrl(null, 'https://source.example/x')).toBe('https://source.example/x');
    expect(pickApplyUrl('javascript:alert(1)', 'https://source.example/x')).toBe('https://source.example/x');
    expect(pickApplyUrl('javascript:alert(1)', 'javascript:alert(1)')).toBeNull();
  });
});

describe('shared cache source safety', () => {
  it('does not close over user identity in cached feed functions', () => {
    const cached = readFileSync(join(process.cwd(), 'src/lib/jobs/feed/cached.ts'), 'utf8');
    const load = readFileSync(join(process.cwd(), 'src/lib/jobs/feed/load.ts'), 'utf8');
    for (const source of [cached, load]) {
      expect(source).not.toMatch(/userId|getClaims|cookies\(|email|resume|preferences/);
    }
    expect(cached).toMatch(/cursor: string \| null/);
    expect(cached).toMatch(/limit: number/);
  });
});
