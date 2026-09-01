import type { SupabaseClient } from '@supabase/supabase-js';

import { PersistenceError } from '@/lib/jobs/errors';
import {
  metadataAttributionRequired,
  pickAttributionLabel,
  type AttributionSource,
} from '@/lib/jobs/feed/attribution';

type AttributionRow = {
  job_id: string;
  job_sources:
    | {
        name: string;
        source_type: string;
        metadata: unknown;
      }
    | {
        name: string;
        source_type: string;
        metadata: unknown;
      }[]
    | null;
};

function sourceFromRelated(
  related: AttributionRow['job_sources'],
): AttributionSource | null {
  const row = Array.isArray(related) ? related[0] : related;
  if (!row) return null;
  return {
    name: row.name,
    sourceType: row.source_type,
    attributionRequired: metadataAttributionRequired(row.metadata),
  };
}

/**
 * One batched provenance lookup per page. Never returns posting ids,
 * external ids, or raw payloads to callers of the UI layer.
 */
export async function getAttributionLabelsByJobIds(
  client: SupabaseClient,
  jobIds: string[],
): Promise<Map<string, string | null>> {
  const labels = new Map<string, string | null>();
  if (jobIds.length === 0) return labels;

  const { data, error } = await client
    .from('job_source_postings')
    .select('job_id, job_sources(name, source_type, metadata)')
    .in('job_id', jobIds);

  if (error) {
    throw new PersistenceError(error.message);
  }

  const grouped = new Map<string, AttributionSource[]>();
  for (const row of (data as AttributionRow[] | null) ?? []) {
    const source = sourceFromRelated(row.job_sources);
    if (!source) continue;
    const list = grouped.get(row.job_id) ?? [];
    list.push(source);
    grouped.set(row.job_id, list);
  }

  for (const id of jobIds) {
    labels.set(id, pickAttributionLabel(grouped.get(id) ?? []));
  }
  return labels;
}
