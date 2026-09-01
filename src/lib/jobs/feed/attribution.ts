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

const ATS_TYPES = new Set(['greenhouse', 'lever', 'ashby']);

/**
 * Human-facing label. Direct employer ATS surfaces as `<Company> Careers`
 * because the technical provider name (Greenhouse / Lever / Ashby) is
 * implementation detail — users care that the job comes straight from the
 * hiring team, not from an aggregator republish. Aggregators keep their
 * own brand.
 *
 * job_sources.name for Greenhouse/Lever/Ashby seeds is the company display
 * name (e.g. "Dscout"). For WWR it is the full source name; we normalize
 * to the aggregator brand.
 */
export function displaySourceLabel(source: AttributionSource): string {
  const type = source.sourceType;
  if (ATS_TYPES.has(type)) {
    const cleaned = source.name.trim().replace(/\s+careers$/i, '');
    return cleaned ? `${cleaned} Careers` : 'Employer Careers';
  }
  if (type === 'we_work_remotely') return 'We Work Remotely';
  if (type === 'rss') return source.name.trim() || 'Listed source';
  return source.name.trim() || 'Listed source';
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
