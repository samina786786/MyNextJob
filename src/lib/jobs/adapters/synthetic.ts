import type { JobSourceAdapter, AdapterFetchResult, RawAdapterJob } from '@/lib/jobs/adapters/types';
import { AdapterFetchError } from '@/lib/jobs/errors';
import type { NormalizedJobInput } from '@/lib/jobs/types';

export const SYNTHETIC_UNSAFE_HTML =
  '<p>Build React applications</p><script>alert("x")</script><a href="javascript:alert(1)">bad</a>';

const PLACEHOLDER_SOURCE = '00000000-0000-4000-8000-000000000000';

export function syntheticJob(
  partial: Partial<NormalizedJobInput> & {
    externalId: string;
    title: string;
    companyName: string;
  },
): RawAdapterJob {
  return {
    source: {
      sourceId: partial.source?.sourceId ?? PLACEHOLDER_SOURCE,
      externalId: partial.externalId,
    },
    company: {
      name: partial.companyName,
      domain: partial.company?.domain,
      companyId: partial.company?.companyId,
    },
    title: partial.title,
    location: partial.location ?? { text: 'Remote India' },
    remoteType: partial.remoteType ?? 'unknown',
    employmentType: partial.employmentType ?? 'full_time',
    descriptionHtml: partial.descriptionHtml ?? '<p>Build product UI.</p>',
    descriptionText: partial.descriptionText,
    applyUrl: partial.applyUrl ?? 'https://jobs.example.test/apply/1',
    sourceUrl: partial.sourceUrl ?? 'https://jobs.example.test/jobs/1',
    experienceMin: partial.experienceMin,
    experienceMax: partial.experienceMax,
    salary: partial.salary,
    department: partial.department,
    team: partial.team,
    publishedAt: partial.publishedAt ?? '2026-08-01T00:00:00.000Z',
    rawPayload: partial.rawPayload ?? { id: partial.externalId, title: partial.title },
  };
}

export function acmeFrontendJob(overrides?: Partial<NormalizedJobInput> & { externalId?: string }): RawAdapterJob {
  return syntheticJob({
    externalId: overrides?.externalId ?? 'acme-fe-1',
    title: 'Senior Frontend Engineer',
    companyName: 'Acme Technologies',
    location: { text: 'Remote India' },
    descriptionHtml: SYNTHETIC_UNSAFE_HTML,
    descriptionText: 'Build React applications with Next.js.',
    applyUrl: 'https://jobs.acme-test.example/apply/fe',
    sourceUrl: 'https://jobs.acme-test.example/jobs/fe',
    ...overrides,
    company: {
      name: 'Acme Technologies',
      ...overrides?.company,
    },
  });
}

export function exampleLabsMobileJob(
  overrides?: Partial<NormalizedJobInput> & { externalId?: string },
): RawAdapterJob {
  return syntheticJob({
    externalId: overrides?.externalId ?? 'labs-rn-1',
    title: 'React Native Engineer',
    companyName: 'Example Labs',
    location: { text: 'Hyderabad', city: 'Hyderabad', country: 'India' },
    remoteType: 'onsite',
    descriptionHtml: '<p>Ship mobile apps with React Native.</p>',
    applyUrl: 'https://jobs.example-labs.test/apply/rn',
    sourceUrl: 'https://jobs.example-labs.test/jobs/rn',
    ...overrides,
    company: {
      name: 'Example Labs',
      ...overrides?.company,
    },
  });
}

export type SyntheticAdapterOptions = {
  snapshotComplete?: boolean;
  fail?: boolean;
  failMessage?: string;
};

/**
 * In-memory adapter for tests and local engine exercises.
 * Fictional companies only. No network.
 */
export class SyntheticAdapter implements JobSourceAdapter {
  readonly provider = 'synthetic' as const;

  constructor(
    private readonly jobs: RawAdapterJob[],
    private readonly options: SyntheticAdapterOptions = {},
  ) {}

  async fetchJobs(): Promise<AdapterFetchResult> {
    if (this.options.fail) {
      throw new AdapterFetchError(this.options.failMessage ?? 'Synthetic ATS unavailable');
    }
    return {
      jobs: this.jobs.map((job) => ({ ...job })),
      snapshotComplete: this.options.snapshotComplete ?? true,
      metadata: { pages: 1, requestCount: 1 },
    };
  }
}
