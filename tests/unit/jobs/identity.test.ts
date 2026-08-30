import { describe, expect, it } from 'vitest';

import { jobContentHash, jobFingerprint } from '@/lib/jobs/engine/fingerprint';
import { isStrongDuplicate } from '@/lib/jobs/engine/deduplicate';
import { prepareNormalizedJob } from '@/lib/jobs/normalization/normalize-job';
import type { CanonicalJobRecord } from '@/lib/jobs/repository/types';

const sourceA = { sourceId: '11111111-1111-4111-8111-111111111111', externalId: 'a-1' };

function prepared(title: string, extras: Record<string, unknown> = {}) {
  return prepareNormalizedJob({
    source: sourceA,
    company: { name: 'Acme Technologies' },
    title,
    location: { text: 'Remote India' },
    employmentType: 'full_time',
    applyUrl: 'https://jobs.example.test/a',
    sourceUrl: 'https://jobs.example.test/s',
    descriptionText: 'Build React applications with Next.js.',
    ...extras,
  });
}

describe('fingerprint', () => {
  it('is deterministic for the same normalized job', () => {
    expect(jobFingerprint(prepared('Senior Frontend Engineer'))).toBe(
      jobFingerprint(prepared('Senior Frontend Engineer')),
    );
  });

  it('ignores title whitespace and case', () => {
    expect(jobFingerprint(prepared('Senior Frontend Engineer '))).toBe(
      jobFingerprint(prepared('SENIOR   FRONTEND ENGINEER')),
    );
  });

  it('changes for a materially different role', () => {
    expect(jobFingerprint(prepared('Senior Frontend Engineer'))).not.toBe(
      jobFingerprint(prepared('React Native Engineer')),
    );
  });
});

describe('content hash', () => {
  it('matches when content is the same', () => {
    expect(jobContentHash(prepared('Engineer'))).toBe(jobContentHash(prepared('Engineer')));
  });

  it('changes when description changes', () => {
    const a = jobContentHash(prepared('Engineer'));
    const b = jobContentHash(
      prepared('Engineer', { descriptionText: 'Totally different requisition.' }),
    );
    expect(a).not.toBe(b);
  });

  it('does not change when only publication time changes', () => {
    const a = jobContentHash(prepared('Engineer', { publishedAt: '2026-01-01T00:00:00.000Z' }));
    const b = jobContentHash(prepared('Engineer', { publishedAt: '2026-08-01T00:00:00.000Z' }));
    expect(a).toBe(b);
  });
});

describe('strong duplicate rule', () => {
  it('refuses to merge when descriptions differ', () => {
    const incoming = prepared('Senior Frontend Engineer', {
      descriptionText: 'Platform reliability on-call rotation.',
    });
    const candidate = {
      companyId: 'company-1',
      companyNameKey: incoming.companyNameKey,
      companyDomain: null,
      titleKey: incoming.titleKey,
      locationComparison: incoming.locationComparison,
      descriptionText: 'Build React applications with Next.js.',
      publishedAt: new Date('2026-08-01T00:00:00.000Z'),
    } as CanonicalJobRecord;
    incoming.companyId = 'company-1';
    expect(isStrongDuplicate(candidate, incoming)).toBe(false);
  });
});
