type JobEngineEvent =
  | 'job_sync_started'
  | 'job_sync_completed'
  | 'job_sync_failed'
  | 'job_created'
  | 'job_updated'
  | 'duplicate_candidate'
  | 'job_rejected'
  | 'job_stale_skipped'
  | 'greenhouse_fetch_started'
  | 'greenhouse_fetch_completed'
  | 'greenhouse_source_sync_completed'
  | 'greenhouse_source_sync_failed'
  | 'lever_fetch_started'
  | 'lever_fetch_completed'
  | 'lever_source_sync_completed'
  | 'lever_source_sync_failed'
  | 'ashby_fetch_started'
  | 'ashby_fetch_completed'
  | 'ashby_source_sync_completed'
  | 'ashby_source_sync_failed'
  | 'wwr_fetch_started'
  | 'wwr_fetch_completed'
  | 'wwr_source_sync_completed'
  | 'wwr_source_sync_failed';

/**
 * Structured engine logs. Never include raw payloads, secrets, or
 * full job descriptions.
 */
export function logJobEngine(
  event: JobEngineEvent,
  fields: Record<string, string | number | boolean | null | undefined>,
): void {
  console.info(`[${event}]`, fields);
}
