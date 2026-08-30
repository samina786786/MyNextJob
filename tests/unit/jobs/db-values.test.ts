import { describe, expect, it } from 'vitest';

import {
  toDbEmploymentType,
  toDbRemoteType,
  toDbSalaryPeriod,
  toDbSourceType,
} from '@/lib/jobs/repository/db-values';

describe('DB enum mapping', () => {
  it('maps synthetic adapter provider to custom, not a new enum value', () => {
    expect(toDbSourceType('synthetic')).toBe('custom');
    expect(toDbSourceType('greenhouse')).toBe('greenhouse');
    expect(toDbSourceType('we_work_remotely')).toBe('we_work_remotely');
  });

  it('maps unknown remote/employment/salary to NULL', () => {
    expect(toDbRemoteType('unknown')).toBeNull();
    expect(toDbRemoteType(null)).toBeNull();
    expect(toDbEmploymentType('unknown')).toBeNull();
    expect(toDbSalaryPeriod('unknown')).toBeNull();
  });

  it('persists genuine employment values including part_time and temporary', () => {
    expect(toDbEmploymentType('part_time')).toBe('part_time');
    expect(toDbEmploymentType('temporary')).toBe('temporary');
    expect(toDbEmploymentType('freelance')).toBe('freelance');
    expect(toDbEmploymentType('full_time')).toBe('full_time');
  });

  it('persists remote/hybrid/onsite and never writes preference wildcard any', () => {
    expect(toDbRemoteType('remote')).toBe('remote');
    expect(toDbRemoteType('hybrid')).toBe('hybrid');
    expect(toDbRemoteType('onsite')).toBe('onsite');
    expect(toDbRemoteType('any' as never)).toBeNull();
  });

  it('persists salary period hour/day/month/year only', () => {
    expect(toDbSalaryPeriod('year')).toBe('year');
    expect(toDbSalaryPeriod('month')).toBe('month');
  });
});
