export const GREENHOUSE_SOURCE_ID = '11111111-1111-4111-8111-111111111111';

export function greenhouseJobFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 4370266009,
    internal_job_id: 4001,
    title: 'Software Engineer - India',
    updated_at: '2026-08-20T12:00:00Z',
    requisition_id: 'REQ-42',
    location: { name: 'Remote - India' },
    absolute_url: 'https://boards.greenhouse.io/example/jobs/4370266009',
    language: 'en',
    metadata: [{ id: 1, name: 'Employment Type', value: 'Full-time' }],
    content: '<p>Build product UI with React.</p>',
    departments: [{ id: 10, name: 'Engineering' }],
    offices: [{ id: 20, name: 'Bengaluru' }],
    ...overrides,
  };
}

export function greenhouseListFixture(
  jobs: unknown[],
  metaTotal?: number,
): { jobs: unknown[]; meta?: { total: number } } {
  return metaTotal == null ? { jobs } : { jobs, meta: { total: metaTotal } };
}

export function mockGreenhouseFetch(options: {
  jobsStatus?: number;
  jobsBody?: unknown;
  boardStatus?: number;
  boardBody?: unknown;
  jobsContentType?: string;
}): typeof fetch {
  const jobsStatus = options.jobsStatus ?? 200;
  const boardStatus = options.boardStatus ?? 200;
  return async (input) => {
    const url = String(input);
    const isJobs = url.includes('/jobs');
    const status = isJobs ? jobsStatus : boardStatus;
    const body = isJobs
      ? (options.jobsBody ?? greenhouseListFixture([greenhouseJobFixture()], 1))
      : (options.boardBody ?? { name: 'Example Board' });
    const contentType = options.jobsContentType ?? 'application/json; charset=utf-8';
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': isJobs ? contentType : 'application/json' },
    });
  };
}
