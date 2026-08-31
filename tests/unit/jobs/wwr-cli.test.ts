import { describe, expect, it } from 'vitest';

import { mapWwrItem } from '@/lib/jobs/adapters/we-work-remotely';
import { parseWwrRssXml } from '@/lib/jobs/adapters/wwr-xml';
import { formatWwrDryRunReport } from '@/lib/jobs/dev/cli-wwr';

import { WWR_SOURCE_ID, wwrItemXml, wwrRssXml } from './fixtures/wwr-jobs';

describe('WWR dry-run report', () => {
  it('prints counts and a title/company/location sample without descriptions', () => {
    const item = parseWwrRssXml(wwrRssXml([wwrItemXml()])).items[0]!;
    const mapped = mapWwrItem(item, { sourceId: WWR_SOURCE_ID });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    const report = formatWwrDryRunReport({
      sourceName: 'We Work Remotely',
      jobs: [mapped.job],
      snapshotComplete: false,
      fetched: 90,
      bytes: 843645,
      publishedDates: 1,
      existingMatches: 0,
      newCandidates: 1,
      ambiguousNames: 0,
    });
    expect(report).toContain('Source: We Work Remotely');
    expect(report).toContain('Format: RSS');
    expect(report).toContain('Fetched: 90');
    expect(report).toContain('Snapshot: incomplete');
    expect(report).toContain('Senior Frontend Engineer');
    expect(report).toContain('Acme');
    expect(report).toContain('Anywhere in the World');
    expect(report).not.toContain('Build React applications');
  });
});
