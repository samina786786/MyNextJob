type JobEngineEvent =
  | 'job_sync_started'
  | 'job_sync_completed'
  | 'job_sync_failed'
  | 'job_created'
  | 'job_updated'
  | 'duplicate_candidate'
  | 'job_rejected'
  | 'greenhouse_fetch_started'
  | 'greenhouse_fetch_completed'
  | 'greenhouse_source_sync_completed'
  | 'greenhouse_source_sync_failed'
  | 'lever_fetch_started'
  | 'lever_fetch_completed'
  | 'lever_source_sync_completed'
  | 'lever_source_sync_failed';

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
