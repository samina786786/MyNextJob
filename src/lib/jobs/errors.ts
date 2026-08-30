import type { RejectionReason } from '@/lib/jobs/types';

export class JobEngineError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'JobEngineError';
    this.code = code;
  }
}

export class AdapterFetchError extends JobEngineError {
  constructor(message: string) {
    super(message, 'adapter_fetch');
    this.name = 'AdapterFetchError';
  }
}

export class NormalizationError extends JobEngineError {
  constructor(message: string, code = 'normalization') {
    super(message, code);
    this.name = 'NormalizationError';
  }
}

export class ValidationError extends JobEngineError {
  readonly reason: RejectionReason;

  constructor(reason: RejectionReason, message: string) {
    super(message, reason);
    this.name = 'ValidationError';
    this.reason = reason;
  }
}

export class PersistenceError extends JobEngineError {
  readonly pgCode?: string;

  constructor(message: string, pgCode?: string) {
    super(message, pgCode === '23505' ? 'unique_violation' : 'persistence');
    this.name = 'PersistenceError';
    this.pgCode = pgCode;
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof PersistenceError && error.pgCode === '23505';
}

const SECRETISH = /authorization|bearer\s+\S+|api[_-]?key|secret|password|cookie/gi;

export function sanitizeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(SECRETISH, '[redacted]').slice(0, 500);
}
