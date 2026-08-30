import { describe, expect, it } from 'vitest';
import { DEFAULT_AUTH_REDIRECT, sanitizeNext } from '@/features/auth/redirects';

describe('sanitizeNext', () => {
  it('allows known internal destinations', () => {
    expect(sanitizeNext('/home')).toBe('/home');
    expect(sanitizeNext('/profile')).toBe('/profile');
    expect(sanitizeNext('/saved')).toBe('/saved');
    expect(sanitizeNext('/search')).toBe('/search');
  });

  it('rejects external and protocol-relative URLs', () => {
    expect(sanitizeNext('https://evil.example')).toBe(DEFAULT_AUTH_REDIRECT);
    expect(sanitizeNext('//evil.example')).toBe(DEFAULT_AUTH_REDIRECT);
    expect(sanitizeNext('javascript:alert(1)')).toBe(DEFAULT_AUTH_REDIRECT);
    expect(sanitizeNext('/\\evil.example')).toBe(DEFAULT_AUTH_REDIRECT);
  });

  it('rejects unknown internal paths', () => {
    expect(sanitizeNext('/sign-in')).toBe(DEFAULT_AUTH_REDIRECT);
    expect(sanitizeNext('/auth/callback')).toBe(DEFAULT_AUTH_REDIRECT);
  });

  it('falls back for empty or non-string values', () => {
    expect(sanitizeNext(null)).toBe(DEFAULT_AUTH_REDIRECT);
    expect(sanitizeNext('')).toBe(DEFAULT_AUTH_REDIRECT);
    expect(sanitizeNext('/home', '/saved')).toBe('/home');
    expect(sanitizeNext('nope', '/saved')).toBe('/saved');
  });
});
