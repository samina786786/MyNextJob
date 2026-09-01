import { expect, test } from '@playwright/test';

test.describe('MyNextJob — Phase 5B auth walls', () => {
  test('unauthenticated /home redirects to sign-in', async ({ page }) => {
    await page.goto('/home');
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('unauthenticated job detail redirects to sign-in', async ({ page }) => {
    await page.goto('/jobs/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    await expect(page).toHaveURL(/\/sign-in/);
    expect(page.url()).toMatch(/next=/);
  });

  test('unauthenticated feed API returns 401 without internals', async ({ request }) => {
    const response = await request.get('/api/jobs/feed');
    expect(response.status()).toBe(401);
    expect(response.headers()['cache-control'] ?? '').toMatch(/private|no-store/i);
    const body = await response.json();
    expect(body.error).toBe('Unauthorized');
    expect(JSON.stringify(body)).not.toMatch(/raw_payload|fingerprint|content_hash|external_id|source_id|consecutive_misses/);
  });

  test('malformed cursor is 401 when unauthenticated, not a public catalog dump', async ({
    request,
  }) => {
    const response = await request.get('/api/jobs/feed?cursor=not-a-cursor');
    expect(response.status()).toBe(401);
    const body = await response.text();
    expect(body).not.toMatch(/raw_payload|fingerprint/);
  });
});
