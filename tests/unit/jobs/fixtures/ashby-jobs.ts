export const ASHBY_SOURCE_ID = '55555555-5555-4555-8555-555555555555';
export const ASHBY_JOB_ID = '1e04922e-2a0f-4539-ab33-cc31ab29a325';

export function ashbySalaryComponent(overrides: Record<string, unknown> = {}) {
  return {
    compensationType: 'Salary',
    interval: '1 YEAR',
    currencyCode: 'USD',
    minValue: 81_000,
    maxValue: 87_000,
    ...overrides,
  };
}

export function ashbyCompensation(overrides: Record<string, unknown> = {}) {
  return {
    compensationTierSummary: '$81K – $87K',
    scrapeableCompensationSalarySummary: '$81K - $87K',
    compensationTiers: [
      {
        id: 'tier-1',
        title: null,
        additionalInformation: null,
        tierSummary: 'Estimated Base Salary $81K – $87K',
        components: [ashbySalaryComponent()],
      },
    ],
    summaryComponents: [ashbySalaryComponent()],
    ...overrides,
  };
}

export function ashbyJobFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: ASHBY_JOB_ID,
    title: 'Member of Technical Staff',
    location: 'India - Remote',
    secondaryLocations: [],
    department: 'Engineering',
    team: 'Platform',
    isRemote: true,
    workplaceType: 'Remote',
    descriptionHtml: '<p>Build infrastructure.</p>',
    descriptionPlain: 'Build infrastructure.',
    publishedAt: '2026-08-30T10:00:00Z',
    employmentType: 'FullTime',
    address: {
      postalAddress: {
        addressLocality: 'Bengaluru',
        addressRegion: 'Karnataka',
        addressCountry: 'India',
      },
    },
    jobUrl: `https://jobs.ashbyhq.com/junipersquare/${ASHBY_JOB_ID}`,
    applyUrl: `https://jobs.ashbyhq.com/junipersquare/${ASHBY_JOB_ID}/application`,
    isListed: true,
    compensation: ashbyCompensation(),
    ...overrides,
  };
}

export function ashbyBoardFixture(jobs: unknown[], apiVersion = '1') {
  return {
    apiVersion,
    jobs,
  };
}

export function mockAshbyFetch(
  body: unknown,
  options: { status?: number; contentType?: string } = {},
): typeof fetch {
  return async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status: options.status ?? 200,
      headers: { 'content-type': options.contentType ?? 'application/json' },
    });
}
