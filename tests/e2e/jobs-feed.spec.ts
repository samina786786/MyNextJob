import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page): Promise<boolean> {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;
  if (!email || !password) return false;

  await page.goto('/sign-in', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(home|onboarding)/, { timeout: 45_000 });
  return page.url().includes('/home');
}

function jobCards(page: Page) {
  return page.locator('[data-job-id]');
}

async function waitForHomeFeed(page: Page) {
  await expect(page.getByRole('heading', { name: 'Fresh jobs' })).toBeVisible();
  await expect(jobCards(page).first()).toBeVisible({ timeout: 30_000 });
}

async function uniqueJobIds(page: Page): Promise<string[]> {
  const ids = await jobCards(page).evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-job-id')),
  );
  return ids.filter((id): id is string => Boolean(id));
}

async function loadNextPage(page: Page): Promise<void> {
  const before = await jobCards(page).count();
  const loadMore = page.getByRole('button', { name: 'Load more jobs' });
  await expect(loadMore).toBeVisible();
  await expect(loadMore).toBeEnabled({ timeout: 20_000 });
  await loadMore.click();
  await expect.poll(async () => jobCards(page).count(), { timeout: 30_000 }).toBeGreaterThan(before);
}

async function assertNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, label).toBeLessThanOrEqual(1);
}

async function assertNavClearsFeedControls(page: Page) {
  const { paddingBottom, navHeight } = await page.evaluate(() => {
    const main = document.querySelector('#main');
    const nav = document.querySelector('nav[aria-label="Primary"]');
    if (!main || !nav) return { paddingBottom: 0, navHeight: 999 };
    return {
      paddingBottom: parseFloat(getComputedStyle(main).paddingBottom),
      navHeight: nav.getBoundingClientRect().height,
    };
  });
  expect(paddingBottom + 8, 'main padding should clear the bottom nav').toBeGreaterThanOrEqual(navHeight);
}

test.describe('MyNextJob — Phase 5B job feed', () => {
  test.describe.configure({ timeout: 60_000 });

  test.beforeEach(async ({ page }) => {
    const configured = Boolean(process.env.E2E_USER_EMAIL && process.env.E2E_USER_PASSWORD);
    test.skip(!configured, 'Set E2E_USER_EMAIL and E2E_USER_PASSWORD to run authenticated feed tests');
    const landed = await signIn(page);
    expect(landed, 'E2E user must sign in and reach /home').toBe(true);
    await waitForHomeFeed(page);
  });

  test('home chrome stays visible around the job list', async ({ page }) => {
    await expect(page.getByRole('main').getByText('MyNextJob')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Fresh jobs' })).toBeVisible();
    await expect(page.getByText('Latest opportunities from the active catalog.')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
    await expect(jobCards(page).first()).toBeVisible();
  });

  test('home renders a server-provided first page of at most 15 jobs', async ({ page }) => {
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
    expect(await jobCards(page).count()).toBeLessThanOrEqual(15);
    await expect(page.getByText(/% match/i)).toHaveCount(0);
    await expect(page.locator('img[src*="clearbit"], img[src*="logo.dev"], img[src*="brandfetch"]').first()).toHaveCount(0);

    const slot = page.locator('[data-company-identity]').first();
    await expect(slot).toHaveAttribute('data-company-identity', 'initials');
    const box = await slot.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(47);
    expect(box?.width).toBeLessThanOrEqual(49);
    expect(box?.height).toBeGreaterThanOrEqual(47);
    expect(box?.height).toBeLessThanOrEqual(49);

    const first = jobCards(page).first();
    await expect(first.getByRole('heading').first()).not.toHaveText('');
    await assertNoHorizontalOverflow(page, 'home first page');
  });

  test('infinite scroll appends page 2 and another page without duplicate ids', async ({ page }) => {
    const feedRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/jobs/feed')) feedRequests.push(url);
      expect(url).not.toMatch(
        /boards-api\.greenhouse\.io|api\.lever\.co|api\.ashbyhq\.com|weworkremotely\.com|logo\.clearbit\.com|logo\.dev|brandfetch/,
      );
    });

    const firstCount = await jobCards(page).count();
    const firstIds = await uniqueJobIds(page);

    await loadNextPage(page);
    const pageTwoIds = await uniqueJobIds(page);
    expect(new Set(pageTwoIds).size).toBe(pageTwoIds.length);
    expect(firstIds.every((id) => pageTwoIds.includes(id))).toBe(true);
    expect(pageTwoIds.length).toBeGreaterThan(firstCount);
    expect(feedRequests.length).toBeGreaterThanOrEqual(1);
    expect(feedRequests.every((url) => url.includes('cursor='))).toBe(true);

    const loadMore = page.getByRole('button', { name: 'Load more jobs' });
    if (await loadMore.isVisible()) {
      await loadNextPage(page);
      const pageThreeIds = await uniqueJobIds(page);
      expect(new Set(pageThreeIds).size).toBe(pageThreeIds.length);
      expect(pageThreeIds.length).toBeGreaterThan(pageTwoIds.length);
    }
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

    await page.goto('/home', { waitUntil: 'domcontentloaded' });
    await waitForHomeFeed(page);
    const firstCount = await jobCards(page).count();

    const loadMore = page.getByRole('button', { name: 'Load more jobs' });
    await expect(loadMore).toBeEnabled({ timeout: 20_000 });
    await loadMore.click();
    await expect(page.getByText("Couldn't load more jobs.")).toBeVisible();
    expect(await jobCards(page).count()).toBe(firstCount);

    shouldFail = false;
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect.poll(async () => jobCards(page).count(), { timeout: 30_000 }).toBeGreaterThan(firstCount);
    expect(cursors.length).toBeGreaterThanOrEqual(2);
    expect(cursors[0]).toBe(cursors[1]);
  });

  test('Load more jobs is keyboard reachable', async ({ page }) => {
    const firstCount = await jobCards(page).count();
    const button = page.getByRole('button', { name: 'Load more jobs' });
    await expect(button).toBeVisible();
    await button.press('Enter');
    await expect.poll(async () => jobCards(page).count(), { timeout: 30_000 }).toBeGreaterThan(firstCount);
  });

  test('job detail shows title, freshness, description, apply, and back restores the feed', async ({
    page,
  }) => {
    await jobCards(page).nth(2).scrollIntoViewIfNeeded();
    const beforeY = await page.evaluate(() => window.scrollY);
    const href = await jobCards(page).nth(2).getAttribute('href');
    expect(href).toMatch(/^\/jobs\//);

    await jobCards(page).nth(2).click();
    await expect(page).toHaveURL(/\/jobs\//);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('article > header time')).toHaveText(/^(Posted|Found) /);
    await expect(page.getByRole('heading', { name: 'Description' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Apply now' })).toBeVisible();
    const detailSlot = page.locator('article > header [data-company-identity]');
    await expect(detailSlot).toBeVisible();
    const detailBox = await detailSlot.boundingBox();
    expect(detailBox?.width).toBeGreaterThanOrEqual(47);
    expect(detailBox?.width).toBeLessThanOrEqual(49);
    expect(detailBox?.height).toBeGreaterThanOrEqual(47);
    expect(detailBox?.height).toBeLessThanOrEqual(49);
    await assertNoHorizontalOverflow(page, 'job detail');
    await assertNavClearsFeedControls(page);

    await page.goBack();
    await expect(page).toHaveURL(/\/home/);
    await expect(jobCards(page).first()).toBeVisible();
    const afterY = await page.evaluate(() => window.scrollY);
    expect(Math.abs(afterY - beforeY)).toBeLessThan(400);
  });

  test('stored Lever description does not render glued sentences', async ({ page }) => {
    await page.goto('/jobs/e212fd4a-e427-4f9c-914b-42d208bc7257', { waitUntil: 'domcontentloaded' });
    const unavailable = page.getByRole('heading', { name: /no longer in the active catalog/i });
    if (await unavailable.isVisible().catch(() => false)) {
      await page.goto('/home', { waitUntil: 'domcontentloaded' });
      await waitForHomeFeed(page);
      await jobCards(page).first().click();
    }
    await expect(page.getByRole('heading', { name: 'Description' })).toBeVisible({ timeout: 30_000 });
    const text = await page.locator('.job-description').innerText();
    expect(text).not.toMatch(/briefs\.Edit/);
    expect(text).not.toMatch(/readability\.Track/);
    expect(text).not.toMatch(/smoothly\.Help/);
    if (/structured, reader-focused briefs/i.test(text)) {
      expect(text).toMatch(/briefs\.\s+Edit/);
    }
  });

  test('Posted vs Found wording is never swapped', async ({ page }) => {
    const labels = await page.locator('time').allTextContents();
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(label).toMatch(/^(Posted|Found) /);
    }
  });

  test('company identity never discovers logos in the browser', async ({ page }) => {
    const pageOrigin = new URL(page.url()).origin;
    page.on('request', (request) => {
      const url = request.url();
      expect(url).not.toMatch(/logo\.clearbit\.com|logo\.dev|brandfetch|google\.com\/s2\/favicons/);
      try {
        const parsed = new URL(url);
        if (parsed.origin !== pageOrigin) {
          expect(parsed.pathname).not.toMatch(/favicon\.ico|apple-touch-icon/i);
        }
      } catch {
        /* ignore invalid URLs */
      }
    });

    await expect(page.locator('[data-company-identity]').first()).toHaveAttribute(
      'data-company-identity',
      'initials',
    );
    await assertNoHorizontalOverflow(page, 'company identity first page');

    const fixture = '/fixtures/company-logo.webp';
    await page.route('**/api/jobs/feed*', async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as {
        items: Array<Record<string, unknown>>;
        nextCursor: string | null;
        hasNextPage: boolean;
        asOf: string;
      };
      await route.fulfill({
        status: response.status(),
        contentType: 'application/json',
        body: JSON.stringify({
          ...body,
          items: body.items.map((item, index) => ({
            ...item,
            companyLogoUrl: index < 2 ? fixture : null,
          })),
        }),
      });
    });

    const loadMore = page.getByRole('button', { name: 'Load more jobs' });
    if (await loadMore.isVisible()) {
      const before = await jobCards(page).count();
      await loadMore.click();
      await expect.poll(async () => jobCards(page).count(), { timeout: 30_000 }).toBeGreaterThan(before);
      await expect(page.locator('img[src*="company-logo.webp"]').first()).toBeVisible({ timeout: 20_000 });
      const srcs = await page.locator('img[src*="company-logo.webp"]').evaluateAll((nodes) =>
        nodes.map((node) => (node as HTMLImageElement).getAttribute('src')),
      );
      expect(srcs.length).toBeGreaterThan(1);
      expect(new Set(srcs).size).toBe(1);
    }
  });

  test('feed stays within the viewport at mobile and desktop widths', async ({ page }) => {
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 1024, height: 768 },
    ]) {
      await page.setViewportSize(viewport);
      await assertNoHorizontalOverflow(page, `${viewport.width}x${viewport.height}`);
      await assertNavClearsFeedControls(page);
    }
  });
});
