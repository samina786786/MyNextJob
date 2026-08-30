import { describe, expect, it } from 'vitest';
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from '@/features/auth/schemas';

describe('signUpSchema', () => {
  const valid = {
    fullName: 'Kiran Shah',
    email: 'Kiran@Example.com',
    password: 'opportunities',
    confirmPassword: 'opportunities',
  };

  it('accepts a valid signup and normalizes email', () => {
    const parsed = signUpSchema.parse(valid);
    expect(parsed.email).toBe('kiran@example.com');
    expect(parsed.fullName).toBe('Kiran Shah');
  });

  it('rejects a short password', () => {
    expect(signUpSchema.safeParse({ ...valid, password: 'short', confirmPassword: 'short' }).success).toBe(false);
  });

  it('rejects mismatched passwords', () => {
    const result = signUpSchema.safeParse({ ...valid, confirmPassword: 'different1' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.confirmPassword?.[0]).toMatch(/do not match/i);
    }
  });

  it('rejects an empty name', () => {
    expect(signUpSchema.safeParse({ ...valid, fullName: '   ' }).success).toBe(false);
  });
});

describe('signInSchema', () => {
  it('accepts email and password', () => {
    expect(signInSchema.parse({ email: 'a@b.co', password: 'x' }).email).toBe('a@b.co');
  });

  it('rejects an invalid email', () => {
    expect(signInSchema.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(false);
  });
});

describe('forgotPasswordSchema', () => {
  it('requires a valid email', () => {
    expect(forgotPasswordSchema.parse({ email: '  A@B.CO ' }).email).toBe('a@b.co');
    expect(forgotPasswordSchema.safeParse({ email: '' }).success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('requires matching passwords of at least 8 characters', () => {
    expect(
      resetPasswordSchema.parse({ password: 'newpass1', confirmPassword: 'newpass1' }).password,
    ).toBe('newpass1');
    expect(
      resetPasswordSchema.safeParse({ password: 'newpass1', confirmPassword: 'otherpass' }).success,
    ).toBe(false);
  });
});
