import type { JobSourceProvider } from '@/lib/jobs/types';

export type AttributionSource = {
  sourceType: JobSourceProvider | string;
  name: string;
  attributionRequired: boolean;
};

const ATS_RANK: Record<string, number> = {
  greenhouse: 0,
  lever: 1,
  ashby: 2,
};

function attributionRank(source: AttributionSource): number {
  const ats = ATS_RANK[source.sourceType];
  if (ats != null) return ats;
  if (source.sourceType === 'we_work_remotely') return 50;
  if (source.sourceType === 'rss') return 51;
  return 20;
}

export function displaySourceLabel(source: AttributionSource): string {
  switch (source.sourceType) {
    case 'greenhouse':
      return 'Greenhouse';
    case 'lever':
      return 'Lever';
    case 'ashby':
      return 'Ashby';
    case 'we_work_remotely':
      return 'We Work Remotely';
    default:
      return source.name.trim() || 'Listed source';
  }
}

/**
 * One label per canonical job. Prefer a direct employer ATS over an
 * aggregator. Never drop provenance in storage — this only picks what
 * the UI shows in Phase 5B.
 */
export function pickAttributionLabel(sources: AttributionSource[]): string | null {
  if (sources.length === 0) return null;
  const sorted = [...sources].sort((a, b) => {
    const rank = attributionRank(a) - attributionRank(b);
    if (rank !== 0) return rank;
    return displaySourceLabel(a).localeCompare(displaySourceLabel(b));
  });
  const preferred = sorted[0];
  return preferred ? displaySourceLabel(preferred) : null;
}

export function metadataAttributionRequired(metadata: unknown): boolean {
  if (metadata == null || typeof metadata !== 'object') return false;
  return (metadata as { attribution_required?: unknown }).attribution_required === true;
}
