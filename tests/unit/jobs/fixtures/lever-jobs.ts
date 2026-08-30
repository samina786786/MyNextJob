export const LEVER_SOURCE_ID = '33333333-3333-4333-8333-333333333333';

export function leverJobFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lever-job-abc123',
    text: 'Frontend Engineer — India',
    categories: {
      location: 'Remote - India',
      commitment: 'Full Time',
      team: 'Engineering',
      department: 'Product Engineering',
      allLocations: ['Remote - India'],
    },
    country: 'IN',
    opening: '<p>Join the product team.</p>',
    openingPlain: 'Join the product team.',
    description: '<p>Join the product team.</p><p>Build React applications.</p>',
    descriptionPlain: 'Join the product team. Build React applications.',
    descriptionBody: '<p>Build React applications.</p>',
    descriptionBodyPlain: 'Build React applications.',
    lists: [{ text: 'Requirements', content: '<li>TypeScript</li><li>React</li>' }],
    additional: '<p>We are an equal opportunity employer.</p>',
    additionalPlain: 'We are an equal opportunity employer.',
    hostedUrl: 'https://jobs.lever.co/example/lever-job-abc123',
    applyUrl: 'https://jobs.lever.co/example/lever-job-abc123/apply',
    workplaceType: 'remote',
    salaryRange: null,
    salaryDescription: null,
    salaryDescriptionPlain: null,
    ...overrides,
  };
}

export function mockLeverPages(
  pages: unknown[][],
  options: { failAt?: number; status?: number } = {},
): typeof fetch {
  return async (input) => {
    const url = new URL(String(input));
    const skip = Number(url.searchParams.get('skip') ?? '0');
    const limit = Number(url.searchParams.get('limit') ?? '100');
    const index = Math.floor(skip / Math.max(limit, 1));
    if (options.failAt != null && index === options.failAt) {
      return new Response('nope', {
        status: options.status ?? 500,
        headers: { 'content-type': 'application/json' },
      });
    }
    const page = pages[index] ?? [];
    return new Response(JSON.stringify(page), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
}
