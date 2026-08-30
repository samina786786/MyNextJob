import { createHash } from 'node:crypto';

import { RAW_PAYLOAD_MAX_BYTES } from '@/lib/jobs/types';
import { ValidationError } from '@/lib/jobs/errors';

const SECRET_KEY = /auth|authorization|secret|password|token|cookie|api[_-]?key|bearer/i;

/**
 * Keep only the source job object needed to reconstruct mapping.
 * Strip secret-looking keys. Cap size. Never log the result.
 */
export function sanitizeRawPayload(payload: unknown): unknown {
  if (payload == null) return null;
  const stripped = stripSecrets(payload);
  const encoded = JSON.stringify(stripped);
  if (encoded === undefined) return null;
  const bytes = Buffer.byteLength(encoded, 'utf8');
  if (bytes > RAW_PAYLOAD_MAX_BYTES) {
    throw new ValidationError('payload_too_large', 'raw_payload exceeds 32 KiB');
  }
  return stripped;
}

function stripSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(key)) continue;
      out[key] = stripSecrets(nested);
    }
    return out;
  }
  return value;
}

export function sha256Hex(parts: string[]): string {
  return createHash('sha256').update(parts.join('\u001f')).digest('hex');
}
