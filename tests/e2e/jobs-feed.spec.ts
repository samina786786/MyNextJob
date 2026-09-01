import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page): Promise<boolean> {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;
  if (!email || !password) return false;

  await page.goto('/sign-in');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(home|onboarding)/, { timeout: 45_000 });
  if (page.url().includes('/onboarding')) {
    test.info().annotations.push({ type: 'skip-reason', description: 'E2E user has not finished onboarding' });
    return false;
  }
  return true;
}

function jobCards(page: Page) {
  return page.locator('[data-job-id]');
}

test.describe('MyNextJob — Phase 5B job feed', () => {
  test.beforeEach(async ({ page }) => {
    const ok = await signIn(page);
    test.skip(!ok, 'Set E2E_USER_EMAIL and E2E_USER_PASSWORD to run authenticated feed tests');
  });

  test('home renders a server-provided first page of at most 15 jobs', async ({ page }) => {
    await page.goto('/home');
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Fresh jobs' })).toBeVisible();
    await expect(jobCards(page).first()).toBeVisible({ timeout: 30_000 });
    expect(await jobCards(page).count()).toBeLessThanOrEqual(15);
    await expect(page.getByText(/% match/i)).toHaveCount(0);
    await expect(page.locator('img[src*="clearbit"], img[src*="logo"]').first()).toHaveCount(0);

    const first = jobCards(page).first();
    await expect(first.getByRole('heading').first()).not.toHaveText('');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('infinite scroll appends the next page without dropping the first', async ({ page }) => {
    const feedRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/jobs/feed')) feedRequests.push(url);
      expect(url).not.toMatch(/boards-api\.greenhouse\.io|api\.lever\.co|api\.ashbyhq\.com|weworkremotely\.com/);
    });

    await page.goto('/home');
    await expect(jobCards(page).first()).toBeVisible({ timeout: 30_000 });
    const firstCount = await jobCards(page).count();
    const firstIds = await jobCards(page).evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-job-id')),
    );

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const loadMore = page.getByRole('button', { name: 'Load more jobs' });
    if (await loadMore.isVisible()) {
      await loadMore.click();
    }
    await expect.poll(async () => jobCards(page).count(), { timeout: 30_000 }).toBeGreaterThan(firstCount);

    const afterIds = await jobCards(page).evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-job-id')),
    );
    expect(new Set(afterIds).size).toBe(afterIds.length);
    expect(firstIds.every((id) => afterIds.includes(id))).toBe(true);
    expect(feedRequests.length).toBeGreaterThanOrEqual(1);
    expect(feedRequests.every((url) => url.includes('cursor='))).toBe(true);
  });

  test('pagination failure keeps existing cards and retries the same cursor', async ({ page }) => {
    const cursors: string[] = [];
    let shouldFail = true;
    await page.route('**/api/jobs/feed*', async (route) => {
      const url = new URL(route.request().url());
      const cursor = url.searchParams.get('cursor');
      if (cursor) cursors.push(cursor);
      if (shouldFail && cursor) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: '{"error":"Something went wrong"}',
        });
        return;
      }
      await route.continue();
    });

    await page.goto('/home');
    await expect(jobCards(page).first()).toBeVisible({ timeout: 30_000 });
    const firstCount = await jobCards(page).count();

    await page.getByRole('button', { name: 'Load more jobs' }).click();
    await expect(page.getByText("Couldn't load more jobs.")).toBeVisible();
    expect(await jobCards(page).count()).toBe(firstCount);

    shouldFail = false;
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect.poll(async () => jobCards(page).count(), { timeout: 30_000 }).toBeGreaterThan(firstCount);
    expect(cursors.length).toBeGreaterThanOrEqual(2);
    expect(cursors[0]).toBe(cursors[1]);
  });

  test('Load more jobs is keyboard reachable', async ({ page }) => {
    await page.goto('/home');
    await expect(jobCards(page).first()).toBeVisible({ timeout: 30_000 });
    const firstCount = await jobCards(page).count();
    const button = page.getByRole('button', { name: 'Load more jobs' });
    await button.focus();
    await expect(button).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(async () => jobCards(page).count(), { timeout: 30_000 }).toBeGreaterThan(firstCount);
  });

  test('job detail shows title, freshness, description, apply, and back restores the feed', async ({
    page,
  }) => {
    await page.goto('/home');
    await expect(jobCards(page).first()).toBeVisible({ timeout: 30_000 });
    await jobCards(page).nth(2).scrollIntoViewIfNeeded();
    const beforeY = await page.evaluate(() => window.scrollY);
    const href = await jobCards(page).nth(2).getAttribute('href');
    expect(href).toMatch(/^\/jobs\//);

    await jobCards(page).nth(2).click();
    await expect(page).toHaveURL(/\/jobs\//);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/Posted |Found /)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Description' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Apply now' })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/home/);
    await expect(jobCards(page).first()).toBeVisible();
    const afterY = await page.evaluate(() => window.scrollY);
    expect(Math.abs(afterY - beforeY)).toBeLessThan(400);
  });

  test('Posted vs Found wording is never swapped', async ({ page }) => {
    await page.goto('/home');
    await expect(jobCards(page).first()).toBeVisible({ timeout: 30_000 });
    const labels = await page.locator('time').allTextContents();
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(label).toMatch(/^(Posted|Found) /);
    }
  });

  test('feed stays within the viewport at mobile and desktop widths', async ({ page }) => {
    await page.goto('/home');
    await expect(jobCards(page).first()).toBeVisible({ timeout: 30_000 });
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 1024, height: 768 },
    ]) {
      await page.setViewportSize(viewport);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(1);
    }
  });
});
