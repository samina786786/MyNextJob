import { describe, expect, it } from 'vitest';

import { mapAshbyJob } from '@/lib/jobs/adapters/ashby';
import { formatAshbyDryRunReport } from '@/lib/jobs/dev/cli-ashby';

import { ASHBY_SOURCE_ID, ashbyJobFixture } from './fixtures/ashby-jobs';

describe('Ashby dry-run report', () => {
  it('prints counts and a title/location/workplace sample without descriptions', () => {
    const mapped = mapAshbyJob(ashbyJobFixture(), {
      sourceId: ASHBY_SOURCE_ID,
      companyName: 'Juniper Square',
      boardName: 'junipersquare',
    });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    const report = formatAshbyDryRunReport({
      sourceName: 'Juniper Square',
      boardName: 'junipersquare',
      apiVersion: '1',
      fetched: 5,
      listed: 3,
      unlistedSkipped: 2,
      jobs: [mapped.job],
      snapshotComplete: true,
    });
    expect(report).toContain('Source: Juniper Square');
    expect(report).toContain('Provider: Ashby');
    expect(report).toContain('Board: junipersquare');
    expect(report).toContain('API version: 1');
    expect(report).toContain('Fetched: 5');
    expect(report).toContain('Listed: 3');
    expect(report).toContain('Unlisted skipped: 2');
    expect(report).toContain('Member of Technical Staff');
    expect(report).toContain('India - Remote');
    expect(report).toContain('remote');
    expect(report).not.toContain('Build infrastructure');
    expect(report).not.toContain('descriptionHtml');
  });
});
