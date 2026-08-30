import { describe, expect, it } from 'vitest';
import { toneForMatchScore } from '@/components/clay/ClayBadge';

describe('toneForMatchScore', () => {
  it('returns matchStrong for 90+', () => {
    expect(toneForMatchScore(90)).toBe('matchStrong');
    expect(toneForMatchScore(100)).toBe('matchStrong');
  });

  it('returns matchGood for 75–89', () => {
    expect(toneForMatchScore(75)).toBe('matchGood');
    expect(toneForMatchScore(89)).toBe('matchGood');
  });

  it('returns matchModerate below 75', () => {
    expect(toneForMatchScore(74)).toBe('matchModerate');
    expect(toneForMatchScore(0)).toBe('matchModerate');
  });
});
