import { describe, expect, it } from 'vitest';
import { mapAuthError } from '@/features/auth/errors';

describe('mapAuthError', () => {
  it('maps unconfirmed email without leaking internals', () => {
    expect(mapAuthError('Email not confirmed')).toMatch(/confirm your email/i);
  });

  it('maps invalid credentials generically', () => {
    expect(mapAuthError('Invalid login credentials')).toBe("We couldn't sign you in with those details.");
  });

  it('does not return raw SDK dumps', () => {
    expect(mapAuthError('AuthApiError 400 invalid token_hash')).not.toMatch(/AuthApiError|token_hash/);
  });
});
