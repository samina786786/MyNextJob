import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { normalizeCompanyName } from '@/lib/jobs/normalization/normalize-company';
import { normalizeDomain } from '@/lib/jobs/normalization/normalize-domain';
import { inferRemoteType, normalizeLocation } from '@/lib/jobs/normalization/normalize-location';
import { normalizeEmploymentType, normalizeRemoteLabel } from '@/lib/jobs/normalization/normalize-employment';
import { displayTitle, normalizeTitle } from '@/lib/jobs/normalization/normalize-title';
import { isSafeHttpUrl, resolveJobUrls } from '@/lib/jobs/normalization/normalize-urls';
import { prepareNormalizedJob } from '@/lib/jobs/normalization/normalize-job';
import { normalizedJobInputSchema } from '@/lib/jobs/schemas/normalized-job';
import { ValidationError } from '@/lib/jobs/errors';

const source = { sourceId: '11111111-1111-4111-8111-111111111111', externalId: 'ext-1' };

describe('normalized job schema', () => {
  it('accepts a complete provider-neutral job', () => {
    const parsed = normalizedJobInputSchema.parse({
      source,
      company: { name: 'Acme Technologies' },
      title: 'Senior Frontend Engineer',
      location: { text: 'Remote India' },
      remoteType: 'remote',
      employmentType: 'full_time',
      applyUrl: 'https://jobs.example.test/apply',
      sourceUrl: 'https://jobs.example.test/job',
    });
    expect(parsed.title).toBe('Senior Frontend Engineer');
  });

  it('rejects a missing title', () => {
    expect(() =>
      normalizedJobInputSchema.parse({
        source,
        company: { name: 'Acme' },
        title: '  ',
        applyUrl: 'https://jobs.example.test/a',
        sourceUrl: 'https://jobs.example.test/s',
      }),
    ).toThrow(ZodError);
  });
});

describe('title normalization', () => {
  it('preserves display title while collapsing comparison keys', () => {
    expect(displayTitle('Senior Frontend Engineer ')).toBe('Senior Frontend Engineer');
    expect(normalizeTitle('Senior Frontend Engineer ')).toBe(
      normalizeTitle('SENIOR   FRONTEND ENGINEER'),
    );
  });
});

describe('company name normalization', () => {
  it('folds case and whitespace without stripping legal suffixes', () => {
    expect(normalizeCompanyName('Atlassian')).toBe(normalizeCompanyName('ATLASSIAN'));
    expect(normalizeCompanyName('Atlassian')).not.toBe(normalizeCompanyName('Atlassian Pty Ltd'));
  });
});

describe('domain normalization', () => {
  it('canonicalizes hosts', () => {
    expect(normalizeDomain('https://www.example.com/')).toBe('example.com');
    expect(normalizeDomain('www.example.com')).toBe('example.com');
    expect(normalizeDomain('example.com/')).toBe('example.com');
  });

  it('rejects javascript URLs and embedded credentials', () => {
    expect(() => normalizeDomain('javascript:alert(1)')).toThrow();
    expect(() => normalizeDomain('https://user:pass@example.com')).toThrow();
  });
});

describe('location normalization', () => {
  it('does not equate Hyderabad variants automatically', () => {
    const a = normalizeLocation({ text: 'Hyderabad, India' });
    const b = normalizeLocation({ text: 'Hyderabad, Telangana, India' });
    expect(a.comparison).not.toBe(b.comparison);
    expect(a.text).toBe('Hyderabad, India');
  });

  it('infers remote from location only when adapter left it unknown', () => {
    expect(inferRemoteType('unknown', 'Remote India')).toBe('remote');
    expect(inferRemoteType('unknown', 'Work from home')).toBe('remote');
    expect(inferRemoteType('unknown', 'Hybrid')).toBe('hybrid');
    expect(inferRemoteType('unknown', 'On-site')).toBe('onsite');
    expect(inferRemoteType('unknown', 'Office')).toBe('onsite');
    expect(inferRemoteType('onsite', 'Remote India')).toBe('onsite');
  });
});

describe('employment and remote labels', () => {
  it('maps common ATS employment labels', () => {
    expect(normalizeEmploymentType('Full Time')).toBe('full_time');
    expect(normalizeEmploymentType('Full-time')).toBe('full_time');
    expect(normalizeEmploymentType('FULL_TIME')).toBe('full_time');
    expect(normalizeEmploymentType('Permanent')).toBe('full_time');
    expect(normalizeEmploymentType('')).toBe('unknown');
    expect(normalizeEmploymentType('mystery')).toBe('unknown');
  });

  it('maps remote labels', () => {
    expect(normalizeRemoteLabel('Remote')).toBe('remote');
    expect(normalizeRemoteLabel('Remote - India')).toBe('remote');
    expect(normalizeRemoteLabel('Work from home')).toBe('remote');
    expect(normalizeRemoteLabel('Hybrid')).toBe('hybrid');
    expect(normalizeRemoteLabel('Onsite')).toBe('onsite');
  });
});

describe('URL validation', () => {
  it('allows http(s) and rejects other protocols', () => {
    expect(isSafeHttpUrl('https://jobs.example.test/x')).toBe(true);
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('data:text/html,hi')).toBe(false);
    expect(isSafeHttpUrl('file:///etc/passwd')).toBe(false);
  });

  it('requires apply or source URL', () => {
    expect(() => resolveJobUrls('', '')).toThrow(ValidationError);
    const resolved = resolveJobUrls('', 'https://jobs.example.test/job');
    expect(resolved.canonicalUrl).toBe('https://jobs.example.test/job');
  });
});

describe('prepareNormalizedJob', () => {
  it('rejects min salary greater than max', () => {
    expect(() =>
      prepareNormalizedJob({
        source,
        company: { name: 'Acme Technologies' },
        title: 'Engineer',
        applyUrl: 'https://jobs.example.test/a',
        sourceUrl: 'https://jobs.example.test/s',
        salary: { min: 200, max: 100, currency: 'usd' },
      }),
    ).toThrow(ValidationError);
  });

  it('uppercases salary currency and leaves experience unset as null', () => {
    const prepared = prepareNormalizedJob({
      source,
      company: { name: 'Acme Technologies', domain: 'https://www.acme-test.example/' },
      title: 'Engineer',
      applyUrl: 'https://jobs.example.test/a',
      sourceUrl: 'https://jobs.example.test/s',
      salary: { min: 10, max: 20, currency: 'inr', period: 'year' },
    });
    expect(prepared.salaryCurrency).toBe('INR');
    expect(prepared.experienceMin).toBeNull();
    expect(prepared.companyDomain).toBe('acme-test.example');
  });
});
