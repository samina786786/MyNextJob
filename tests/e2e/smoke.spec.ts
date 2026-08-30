import { test, expect } from '@playwright/test';

test.describe('MyNextJob — Phase 0 smoke', () => {
  test('home page loads with MyNextJob branding and tagline', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('MyNextJob', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Your next opportunity starts here.')).toBeVisible();
  });

  test('home page has no mobile horizontal overflow', async ({ page }) => {
    await page.goto('/');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('bottom navigation is present with all destinations', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav).toBeVisible();
    for (const label of ['Home', 'Search', 'Saved', 'Activity', 'Profile']) {
      await expect(nav.getByLabel(label, { exact: true })).toBeVisible();
    }
  });

  test('design-system route renders without horizontal overflow', async ({ page }) => {
    await page.goto('/design-system');
    await expect(page.getByRole('heading', { name: /design system/i })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('search input is keyboard-focusable', async ({ page }) => {
    await page.goto('/');
    const search = page.getByLabel('Search jobs');
    await search.focus();
    await expect(search).toBeFocused();
  });

  test('PWA manifest resolves', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.ok()).toBeTruthy();
    const contentType = res.headers()['content-type'] ?? '';
    expect(contentType).toMatch(/application\/(manifest\+json|json)/);
    const body = await res.json();
    expect(body.name).toBe('MyNextJob');
    expect(body.theme_color).toBe('#059669');
    expect(body.background_color.toLowerCase()).toBe('#f6f3ea');
    expect(Array.isArray(body.icons)).toBeTruthy();
    expect(body.icons.length).toBeGreaterThanOrEqual(3);
  });

  test('referenced icon assets resolve as real images', async ({ request }) => {
    const assets = [
      { path: '/icons/icon-192.png', type: /image\/png/ },
      { path: '/icons/icon-512.png', type: /image\/png/ },
      { path: '/icons/icon-maskable-512.png', type: /image\/png/ },
      { path: '/icons/apple-touch-icon.png', type: /image\/png/ },
      { path: '/favicon.ico', type: /image\/(x-icon|vnd.microsoft.icon|png)/ },
    ];

    for (const { path, type } of assets) {
      const res = await request.get(path);
      expect(res.ok(), `${path} should resolve`).toBeTruthy();
      const contentType = res.headers()['content-type'] ?? '';
      expect(contentType, `${path} content-type`).toMatch(type);
      const bytes = await res.body();
      expect(bytes.byteLength, `${path} should not be empty`).toBeGreaterThan(100);
      // PNG files start with the 8-byte PNG signature. Favicon is an ICO wrapper.
      if (path.endsWith('.png')) {
        expect(bytes.subarray(0, 8)).toEqual(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        );
      }
    }
  });
});
