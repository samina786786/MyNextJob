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

async function firstCardTitle(page: Page): Promise<string> {
  return (await jobCards(page).first().getByRole('heading').first().innerText()).trim();
}

test.describe('MyNextJob — Phase 5D search & filters', () => {
  test.describe.configure({ timeout: 60_000 });

  test.beforeEach(async ({ page }) => {
    const configured = Boolean(process.env.E2E_USER_EMAIL && process.env.E2E_USER_PASSWORD);
    test.skip(!configured, 'Set E2E_USER_EMAIL and E2E_USER_PASSWORD to run authenticated search tests');
    const landed = await signIn(page);
    expect(landed, 'E2E user must sign in and reach /home').toBe(true);
    await waitForHomeFeed(page);
  });

  test('search box narrows the feed and updates the URL as ?q=', async ({ page }) => {
    const outboundBlocked: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (
        /boards-api\.greenhouse\.io|api\.lever\.co|api\.ashbyhq\.com|weworkremotely\.com/.test(url)
      ) {
        outboundBlocked.push(url);
      }
    });

    const before = await firstCardTitle(page);
    const search = page.getByRole('searchbox', { name: /search fresh jobs/i });
    await search.click();
    await search.fill('engineer');
    await expect
      .poll(async () => new URL(page.url()).searchParams.get('q'), { timeout: 5_000 })
      .toBe('engineer');
    await expect(jobCards(page).first()).toBeVisible({ timeout: 20_000 });
    const after = await firstCardTitle(page);
    const titles = await jobCards(page).locator('h3').allInnerTexts();
    if (titles.length > 0) {
      expect(
        titles.some((title) => /engineer/i.test(title)),
        `no card matched "engineer" — first card was "${before}", then "${after}"`,
      ).toBe(true);
    }
    expect(outboundBlocked, 'browser must never call external providers').toEqual([]);
  });

  test('filter chip: Remote survives a reload via the URL', async ({ page }) => {
    await page.getByRole('button', { name: /^Remote$/ }).click();
    await expect
      .poll(async () => new URL(page.url()).searchParams.get('work'), { timeout: 5_000 })
      .toBe('remote');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForHomeFeed(page);
    const remoteChip = page.getByRole('button', { name: /^Remote$/ });
    await expect(remoteChip).toHaveAttribute('aria-pressed', 'true');
  });

  test('older search response never overwrites the newer one', async ({ page }) => {
    await page.route('**/api/jobs/feed*', async (route) => {
      const url = new URL(route.request().url());
      const q = url.searchParams.get('q');
      if (q === 'aaa') {
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
      await route.continue();
    });
    const search = page.getByRole('searchbox', { name: /search fresh jobs/i });
    await search.fill('aaa');
    await search.fill('bbb');
    await expect
      .poll(async () => new URL(page.url()).searchParams.get('q'), { timeout: 5_000 })
      .toBe('bbb');
    await page.waitForTimeout(2000);
    expect(new URL(page.url()).searchParams.get('q')).toBe('bbb');
  });

  test('attribution: source labels are either "We Work Remotely" or "<Company> Careers"', async ({
    page,
  }) => {
    const labels = await page.locator('footer >> text=/^Source:/').allInnerTexts();
    // The seed catalog always renders at least one source label on the first
    // page. If this ever comes back empty we want a hard failure, not a skip.
    expect(labels.length, 'expected at least one Source: label on the first page').toBeGreaterThan(
      0,
    );
    for (const label of labels) {
      const value = label.replace(/^Source:\s*/, '').trim();
      const isWwr = /we work remotely/i.test(value);
      const looksAts = /careers$/i.test(value);
      expect(isWwr || looksAts, `unexpected attribution label: ${label}`).toBe(true);
    }
  });
});

/**
 * Deterministic logo layering regression, independent of live catalog state
 * and independent of auth. Uses the /design-system/logo-transparency
 * fixture page which mounts CompanyLogoTile against a known-loadable image.
 */
test.describe('MyNextJob — Phase 5D logo transparency', () => {
  test.describe.configure({ timeout: 30_000 });

  test('successful onLoad hides the initials fallback (deterministic fixture)', async ({
    page,
  }) => {
    await page.goto('/design-system/logo-transparency', { waitUntil: 'domcontentloaded' });

    const withLogo = page.getByTestId('tile-with-logo').locator('[data-company-identity]');
    const withoutLogo = page.getByTestId('tile-without-logo').locator('[data-company-identity]');

    // Sanity: the null-URL tile stays on initials.
    await expect(withoutLogo).toHaveAttribute('data-company-identity', 'initials');
    await expect(withoutLogo.locator('[data-company-fallback]')).toHaveAttribute(
      'data-company-fallback',
      'visible',
    );

    // After the fixture image decodes, the tile flips to logo mode and the
    // initials fallback becomes hidden + aria-hidden. Poll to survive
    // Next/Image's optimizer path (`/_next/image?...`) on production builds.
    await expect(withLogo).toHaveAttribute('data-company-identity', 'logo', { timeout: 15_000 });
    const fallback = withLogo.locator('[data-company-fallback]');
    await expect(fallback).toHaveAttribute('data-company-fallback', 'hidden');
    await expect(fallback).toHaveAttribute('aria-hidden', 'true');
    // Belt-and-suspenders: the layer is invisible even for browsers that
    // do not fully honor visibility toggles mid-transition.
    await expect(fallback).toHaveClass(/invisible/);
    await expect(fallback).toHaveClass(/opacity-0/);
  });
});
