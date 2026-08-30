import { test, expect } from '@playwright/test';

test.describe('MyNextJob — Phase 1 auth', () => {
  test('sign-in renders accessible fields', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

    await page.getByLabel('Email address').focus();
    await expect(page.getByLabel('Email address')).toBeFocused();
  });

  test('sign-up renders and validates mismatched passwords', async ({ page }) => {
    await page.goto('/sign-up');
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    await expect(page.getByText('Your next opportunity starts here.')).toBeVisible();

    await page.getByLabel('Full name').fill('Kiran Shah');
    await page.getByLabel('Email address').fill('kiran@example.com');
    await page.getByLabel('Password', { exact: true }).fill('longenough');
    await page.getByLabel('Confirm password').fill('doesnotmatch');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByText(/passwords do not match/i)).toBeVisible();
  });

  test('forgot-password renders', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send reset link' })).toBeVisible();
  });

  test('auth forms have no mobile horizontal overflow', async ({ page }) => {
    for (const path of ['/sign-in', '/sign-up', '/forgot-password', '/reset-password']) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `overflow on ${path}`).toBeLessThanOrEqual(1);
    }
  });

  test('unsafe next query is sanitized on the sign-in form', async ({ page }) => {
    await page.goto('/sign-in?next=https://evil.example');
    const nextValue = await page.locator('input[name="next"]').inputValue();
    expect(nextValue).toBe('/home');
  });

  test('protocol-relative and javascript next values are rejected', async ({ page }) => {
    await page.goto('/sign-in?next=//evil.example');
    expect(await page.locator('input[name="next"]').inputValue()).toBe('/home');

    await page.goto('/sign-in?next=javascript:alert(1)');
    expect(await page.locator('input[name="next"]').inputValue()).toBe('/home');
  });

  test('anonymous /home redirects toward sign-in', async ({ page }) => {
    const response = await page.goto('/home');
    expect(response?.ok() || page.url().includes('/sign-in')).toBeTruthy();
    await expect(page).toHaveURL(/\/sign-in/);
    expect(page.url()).toMatch(/next=%2Fhome|next=\/home/);
  });

  test('unauthenticated reset-password does not offer a password update form', async ({ page }) => {
    await page.goto('/reset-password');
    await expect(page.getByRole('heading', { name: 'Link expired' })).toBeVisible();
    await expect(page.getByLabel('New password')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Update password' })).toHaveCount(0);
  });

  test('invalid confirmation link lands on the friendly error page without leaking the token', async ({
    page,
  }) => {
    await page.goto('/auth/confirm?token_hash=not-a-real-hash&type=email');
    await expect(page).toHaveURL(/\/error/);
    expect(page.url()).not.toMatch(/token_hash|otp|code=/);
    await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible();
    await expect(page.getByText(/expired or already been used/i)).toBeVisible();
  });

  test('wrong password shows a clay error and does not repopulate the password', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByLabel('Email address').fill('qa-invalid@example.invalid');
    await page.getByLabel('Password', { exact: true }).fill('definitely-wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    const alert = page.locator('p[role="alert"]');
    await expect(alert).toBeVisible({ timeout: 15_000 });
    await expect(alert).toHaveText(
      /couldn't sign you in|couldn't complete that request|isn't connected to an auth service/i,
    );
    await expect(alert).not.toHaveText(/AuthApiError|stack|invalid_grant|token_hash/i);

    await expect(page.getByLabel('Email address')).toHaveValue('qa-invalid@example.invalid');
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  });

  test('forgot-password uses the same generic inbox state for an unknown email', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel('Email address').fill('nobody-on-this-project@example.invalid');
    await page.getByRole('button', { name: 'Send reset link' }).click();

    await expect(page.getByText('Check your inbox')).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(/if an account exists for that email/i),
    ).toBeVisible();
  });
});
