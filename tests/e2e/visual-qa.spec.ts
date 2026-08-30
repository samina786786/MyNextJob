import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Visual / responsive QA for the Phase 0 shell. Screenshots land in
 * `docs/qa/` so they can be reviewed after `pnpm test:e2e`.
 */
const VIEWPORTS = [
  { name: '360x800', width: 360, height: 800 },
  { name: '390x844', width: 390, height: 844 },
  { name: '430x932', width: 430, height: 932 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1440x900', width: 1440, height: 900 },
] as const;

const ROUTES = [
  { path: '/', slug: 'landing', nav: true },
  { path: '/design-system', slug: 'design-system', nav: true },
  { path: '/sign-in', slug: 'sign-in', nav: false },
  { path: '/sign-up', slug: 'sign-up', nav: false },
  { path: '/forgot-password', slug: 'forgot-password', nav: false },
  { path: '/reset-password', slug: 'reset-password', nav: false },
] as const;

test.describe('Visual QA — clay design across viewports', () => {
  test.beforeAll(async () => {
    await mkdir(join(process.cwd(), 'docs', 'qa'), { recursive: true });
  });

  for (const vp of VIEWPORTS) {
    for (const route of ROUTES) {
      test(`${route.slug} @ ${vp.name}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(route.path, { waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('heading').first()).toBeVisible();

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `horizontal overflow on ${route.slug} @ ${vp.name}`).toBeLessThanOrEqual(1);

        const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        // Warm ivory #f6f3ea → rgb(246, 243, 234)
        expect(bg.replace(/\s/g, '')).toBe('rgb(246,243,234)');

        if (route.nav) {
          await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
        }

        await page.screenshot({
          path: join('docs', 'qa', `${route.slug}-${vp.name}.png`),
          fullPage: true,
        });
      });
    }
  }
});
