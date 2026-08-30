import { describe, expect, it } from 'vitest';

import { formatDryRunReport } from '@/lib/jobs/dev/cli-greenhouse';
import { greenhouseJobFixture } from './fixtures/greenhouse-jobs';
import { mapGreenhouseJob } from '@/lib/jobs/adapters/greenhouse';

describe('Greenhouse dry-run report', () => {
  it('prints counts and a title/location sample without descriptions', () => {
    const mapped = mapGreenhouseJob(greenhouseJobFixture(), {
      sourceId: '11111111-1111-4111-8111-111111111111',
      companyName: 'Dscout',
    });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    const report = formatDryRunReport({
      sourceName: 'Dscout',
      boardToken: 'dscout',
      jobs: [mapped.job],
      snapshotComplete: true,
    });
    expect(report).toContain('Source: Dscout');
    expect(report).toContain('Fetched: 1');
    expect(report).toContain('Accepted: 1');
    expect(report).toContain('Snapshot: complete');
    expect(report).toContain('Software Engineer - India');
    expect(report).toContain('Remote - India');
    expect(report).not.toContain('Build product UI');
    expect(report).not.toContain('internal_job_id');
  });
});
