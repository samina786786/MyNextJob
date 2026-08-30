import { describe, expect, it } from 'vitest';

import { mapLeverJob } from '@/lib/jobs/adapters/lever';
import { formatLeverDryRunReport } from '@/lib/jobs/dev/cli-lever';

import { LEVER_SOURCE_ID, leverJobFixture } from './fixtures/lever-jobs';

describe('Lever dry-run report', () => {
  it('prints counts and a title/location sample without descriptions', () => {
    const mapped = mapLeverJob(leverJobFixture(), {
      sourceId: LEVER_SOURCE_ID,
      companyName: 'Drivetrain',
    });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    const report = formatLeverDryRunReport({
      sourceName: 'Drivetrain',
      site: 'drivetrain',
      instance: 'global',
      pages: 1,
      jobs: [mapped.job],
      snapshotComplete: true,
    });
    expect(report).toContain('Source: Drivetrain');
    expect(report).toContain('Provider: Lever');
    expect(report).toContain('Instance: global');
    expect(report).toContain('Fetched: 1');
    expect(report).toContain('Frontend Engineer — India');
    expect(report).toContain('Remote - India');
    expect(report).not.toContain('Build React applications');
    expect(report).not.toContain('openingPlain');
  });
});
