import { test, expect } from '@playwright/test';

test.describe('MyNextJob — Phase 2 onboarding', () => {
  test('unauthenticated onboarding and profile routes redirect to sign-in', async ({ page }) => {
    for (const path of [
      '/onboarding/resume',
      '/onboarding/profile',
      '/onboarding/preferences',
      '/profile',
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/sign-in/);
    }
  });

  test('onboarding routes have no mobile horizontal overflow after the auth wall', async ({ page }) => {
    // These routes are protected; anonymous requests redirect to /sign-in.
    // Default `page.goto` waits for `load`, which the browser aborts when
    // the app fires a client-side redirect mid-navigation — surfaced as
    // `net::ERR_ABORTED`. Using `domcontentloaded` returns as soon as the
    // DOM is parsed, and we explicitly wait for the sign-in URL to settle
    // before measuring so we always inspect a real rendered layout.
    for (const path of ['/onboarding/resume', '/onboarding/profile', '/onboarding/preferences', '/profile']) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForURL(/\/sign-in/, { timeout: 20_000 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `overflow on ${path}`).toBeLessThanOrEqual(1);
    }
  });

  test('resume upload copy is not shown to anonymous users', async ({ page }) => {
    await page.goto('/onboarding/resume');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose resume' })).toHaveCount(0);
  });
});
