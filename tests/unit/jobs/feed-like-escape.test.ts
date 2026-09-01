import { describe, expect, it } from 'vitest';

import { escapePostgrestLikeSubstring } from '@/lib/jobs/feed/filters';

/**
 * The helper collapses every SQL-LIKE metacharacter (`%`, `_`, `\`) and
 * every PostgREST OR-grammar metacharacter (`,`, `(`, `)`, `*`) to a
 * single space, then collapses runs and trims. Everything else — quotes,
 * digits, punctuation, Unicode letters — is preserved verbatim.
 */

describe('escapePostgrestLikeSubstring', () => {
  it.each([
    ['%', ''],
    ['_', ''],
    ['%%', ''],
    ['React%', 'React'],
    ['_data', 'data'],
    ['\\', ''],
    ['\\_%', ''],
    [',', ''],
    ['(', ''],
    [')', ''],
    ['*', ''],
  ])('strips SQL LIKE and PostgREST metacharacter %j', (input, expected) => {
    expect(escapePostgrestLikeSubstring(input)).toBe(expected);
  });

  it('preserves plain ASCII', () => {
    expect(escapePostgrestLikeSubstring('React Developer')).toBe('React Developer');
  });

  it('keeps single and double quotes as literal text (PostgREST parameterizes the value)', () => {
    expect(escapePostgrestLikeSubstring("O'Brien")).toBe("O'Brien");
    expect(escapePostgrestLikeSubstring('"quoted"')).toBe('"quoted"');
  });

  it('collapses embedded wildcards to a single space and trims', () => {
    expect(escapePostgrestLikeSubstring('%foo%bar%')).toBe('foo bar');
    expect(escapePostgrestLikeSubstring('a__b')).toBe('a b');
    expect(escapePostgrestLikeSubstring('React (Native)')).toBe('React Native');
    expect(escapePostgrestLikeSubstring('a,b,c')).toBe('a b c');
  });

  it('is idempotent', () => {
    const first = escapePostgrestLikeSubstring('%React_Dev%');
    expect(escapePostgrestLikeSubstring(first)).toBe(first);
  });

  it('preserves Unicode letters and digits', () => {
    expect(escapePostgrestLikeSubstring('Café')).toBe('Café');
    expect(escapePostgrestLikeSubstring('東京')).toBe('東京');
    expect(escapePostgrestLikeSubstring('São Paulo')).toBe('São Paulo');
  });

  it('collapses whitespace runs and trims ends', () => {
    expect(escapePostgrestLikeSubstring('  hello    world  ')).toBe('hello world');
  });

  it('returns an empty string when input is entirely metacharacters (empty pattern is safe)', () => {
    expect(escapePostgrestLikeSubstring('%_\\,()*')).toBe('');
  });

  it('a raw backslash cannot escape a wildcard through this helper', () => {
    // In SQL LIKE, `\%` matches a literal %. If we let `\` through, we would
    // change the meaning of the pattern. The helper strips both.
    expect(escapePostgrestLikeSubstring('50\\%')).toBe('50');
  });
});
