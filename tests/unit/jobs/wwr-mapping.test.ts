import { describe, expect, it } from 'vitest';

import {
  isWwrCountry,
  isWwrListingUrl,
  mapWwrEmploymentType,
  mapWwrItem,
  parseWwrPublishedAt,
  splitWwrTitle,
  wwrExternalId,
} from '@/lib/jobs/adapters/we-work-remotely';
import { parseWwrRssXml } from '@/lib/jobs/adapters/wwr-xml';
import { prepareNormalizedJob } from '@/lib/jobs/normalization/normalize-job';

import { WWR_SOURCE_ID, wwrItemXml, wwrRssXml } from './fixtures/wwr-jobs';

function firstItem(xml: string) {
  return parseWwrRssXml(wwrRssXml([xml])).items[0]!;
}

const INPUT = { sourceId: WWR_SOURCE_ID };

describe('WWR mapping', () => {
  it('splits employer and title on the first colon', () => {
    expect(splitWwrTitle('Acme: Senior Frontend Engineer')).toEqual({
      company: 'Acme',
      title: 'Senior Frontend Engineer',
    });
    expect(splitWwrTitle('Fivetran : Business Development Representative')).toEqual({
      company: 'Fivetran',
      title: 'Business Development Representative',
    });
    expect(splitWwrTitle('ACME, Inc.: Senior Engineer')).toEqual({
      company: 'ACME, Inc.',
      title: 'Senior Engineer',
    });
    expect(splitWwrTitle('Foo & Bar: Staff Engineer')).toEqual({
      company: 'Foo & Bar',
      title: 'Staff Engineer',
    });
    expect(splitWwrTitle('Example.io: Backend Engineer')).toEqual({
      company: 'Example.io',
      title: 'Backend Engineer',
    });
    expect(splitWwrTitle('Company - Europe: Product Designer')).toEqual({
      company: 'Company - Europe',
      title: 'Product Designer',
    });
    expect(splitWwrTitle('No delimiter here')).toBeNull();
    expect(splitWwrTitle(': Missing company')).toBeNull();
    expect(splitWwrTitle('Missing title:')).toBeNull();
  });

  it('decodes RSS title character references into company and title', () => {
    const mercury = mapWwrItem(
      firstItem(
        wwrItemXml({
          title: 'Mercury: Counsel, Product &amp; Regulatory - Payments &amp; AML',
          guid: 'https://weworkremotely.com/remote-jobs/mercury-counsel-product-regulatory',
        }),
      ),
      INPUT,
    );
    expect(mercury.ok).toBe(true);
    if (!mercury.ok) return;
    expect(mercury.job.company.name).toBe('Mercury');
    expect(mercury.job.title).toBe('Counsel, Product & Regulatory - Payments & AML');
    expect(mercury.job.source.externalId).toBe(
      'https://weworkremotely.com/remote-jobs/mercury-counsel-product-regulatory',
    );

    const rd = mapWwrItem(
      firstItem(
        wwrItemXml({
          title: 'Foo &amp; Bar: Senior R&amp;D Engineer',
          guid: 'https://weworkremotely.com/remote-jobs/foo-bar-senior-rd-engineer',
        }),
      ),
      INPUT,
    );
    expect(rd.ok).toBe(true);
    if (!rd.ok) return;
    expect(rd.job.company.name).toBe('Foo & Bar');
    expect(rd.job.title).toBe('Senior R&D Engineer');
    expect(prepareNormalizedJob(rd.job).title).toBe('Senior R&D Engineer');

    const located = mapWwrItem(
      firstItem(
        wwrItemXml({
          title: 'Acme: Engineer',
          region: 'US &amp; Canada',
        }),
      ),
      INPUT,
    );
    expect(located.ok && located.job.location.text).toBe('US & Canada');
    expect(located.ok && located.job.location.region).toBe('US & Canada');
  });

  it('maps a standard RSS item onto the normalized contract', () => {
    const result = mapWwrItem(firstItem(wwrItemXml()), INPUT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.job.company.name).toBe('Acme');
    expect(result.job.title).toBe('Senior Frontend Engineer');
    expect(result.job.remoteType).toBe('remote');
    expect(result.job.employmentType).toBe('full_time');
    expect(result.job.location.text).toBe('Anywhere in the World');
    expect(result.job.location.country).toBeNull();
    expect(result.job.sourceUrl).toBe('https://weworkremotely.com/remote-jobs/acme-senior-frontend-engineer');
    expect(result.job.applyUrl).toBe(result.job.sourceUrl);
    expect(result.job.department).toBe('Front-End Programming');
    expect(result.job.publishedAt).toBe('Sun, 30 Aug 2026 10:00:00 +0000');
    expect(result.job.company.companyId).toBeUndefined();
  });

  it('prefers guid identity and falls back to a validated WWR link', () => {
    expect(
      wwrExternalId(
        'https://weworkremotely.com/remote-jobs/acme-senior-frontend-engineer',
        'https://weworkremotely.com/remote-jobs/other',
      ),
    ).toBe('https://weworkremotely.com/remote-jobs/acme-senior-frontend-engineer');
    const fallback = mapWwrItem(
      firstItem(
        wwrItemXml({
          guid: '',
          link: 'https://weworkremotely.com/remote-jobs/acme-senior-frontend-engineer',
        }),
      ),
      INPUT,
    );
    expect(fallback.ok && fallback.job.source.externalId).toBe(
      'https://weworkremotely.com/remote-jobs/acme-senior-frontend-engineer',
    );
    expect(
      mapWwrItem(
        firstItem(wwrItemXml({ guid: '', link: 'https://evil.example/remote-jobs/x' })),
        INPUT,
      ),
    ).toMatchObject({ ok: false, reason: 'malformed_id' });
  });

  it('rejects malicious and non-WWR URLs', () => {
    expect(isWwrListingUrl('javascript:alert(1)')).toBe(false);
    expect(isWwrListingUrl('https://evil.example/remote-jobs/x')).toBe(false);
    expect(isWwrListingUrl('https://weworkremotely.com/remote-jobs/ok-job')).toBe(true);
  });

  it('keeps remote jobs regionally restricted', () => {
    const worldwide = mapWwrItem(firstItem(wwrItemXml()), INPUT);
    expect(worldwide.ok && worldwide.job.remoteType).toBe('remote');
    expect(worldwide.ok && worldwide.job.location.country).toBeNull();
    const us = mapWwrItem(
      firstItem(wwrItemXml({ region: 'United States', country: 'United States' })),
      INPUT,
    );
    expect(us.ok && us.job.remoteType).toBe('remote');
    expect(us.ok && us.job.location.text).toBe('United States');
    expect(us.ok && us.job.location.country).toBe('United States');
    expect(isWwrCountry('Europe')).toBe(false);
    expect(isWwrCountry('Canada')).toBe(true);
  });

  it('does not treat a country restriction list as a country', () => {
    const restrictionList = Array.from({ length: 40 }, (_, i) => `Country${i}`).join(', ');
    expect(restrictionList.length).toBeGreaterThan(120);
    expect(isWwrCountry(restrictionList)).toBe(false);
    expect(isWwrCountry('USA, Canada, UK')).toBe(false);
    expect(isWwrCountry('Worldwide except sanctioned countries')).toBe(false);

    const mapped = mapWwrItem(
      firstItem(
        wwrItemXml({
          title: 'Lemon.io: Senior React Full-stack Developer',
          country: restrictionList,
          region: 'Anywhere in the World',
        }),
      ),
      INPUT,
    );
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.job.company.name).toBe('Lemon.io');
    expect(mapped.job.title).toBe('Senior React Full-stack Developer');
    expect(mapped.job.location.country).toBeNull();
    expect(mapped.job.location.region).toBe('Anywhere in the World');
    expect(mapped.job.location.text).toBe('Anywhere in the World');
    expect(() => prepareNormalizedJob(mapped.job)).not.toThrow();
  });

  it('maps employment types conservatively', () => {
    expect(mapWwrEmploymentType('Full-Time')).toBe('full_time');
    expect(mapWwrEmploymentType('Part Time')).toBe('part_time');
    expect(mapWwrEmploymentType('Contract')).toBe('contract');
    expect(mapWwrEmploymentType('Freelance')).toBe('freelance');
    expect(mapWwrEmploymentType('Internship')).toBe('internship');
    expect(mapWwrEmploymentType('Temporary')).toBe('temporary');
    expect(mapWwrEmploymentType('Employee')).toBe('unknown');
  });

  it('maps valid pubDate and nulls a malformed one', () => {
    expect(parseWwrPublishedAt('Sun, 30 Aug 2026 10:00:00 +0000')).toBe(
      'Sun, 30 Aug 2026 10:00:00 +0000',
    );
    expect(parseWwrPublishedAt('not-a-date')).toBeNull();
    const mapped = mapWwrItem(firstItem(wwrItemXml({ pubDate: 'not-a-date' })), INPUT);
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.job.publishedAt).toBeNull();
    expect(prepareNormalizedJob(mapped.job).publishedAt).toBeNull();
  });

  it('sanitizes encoded description HTML through the generic sanitizer', () => {
    const mapped = mapWwrItem(
      firstItem(
        wwrItemXml({
          description:
            '&lt;p&gt;Safe&lt;/p&gt;&lt;script&gt;alert(1)&lt;/script&gt;&lt;a href="javascript:alert(1)"&gt;x&lt;/a&gt;',
        }),
      ),
      INPUT,
    );
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    const prepared = prepareNormalizedJob(mapped.job);
    expect(prepared.descriptionHtml).toContain('<p>Safe</p>');
    expect(prepared.descriptionHtml).not.toContain('script');
    expect(prepared.descriptionHtml).not.toContain('javascript:');
  });
});
