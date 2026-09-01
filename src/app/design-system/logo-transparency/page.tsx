import type { Metadata } from 'next';

import { CompanyLogoTile } from '@/features/jobs/components/CompanyLogoTile';

export const metadata: Metadata = { title: 'Logo transparency fixture' };

/**
 * Deterministic fixture for the transparent-logo regression test.
 * Renders CompanyLogoTile twice: once with a known-loadable image URL,
 * once with no image. E2E asserts that after `onLoad` fires on the
 * first tile the initials layer becomes inaccessible.
 *
 * The fixture image lives at public/fixtures/company-logo.webp — the
 * WebP bytes themselves need not be transparent for the regression to
 * hold, because the layering bug is a DOM/CSS issue: the fallback
 * letter used to sit BEHIND the image and show through any pixel that
 * happened to be transparent. Once the fallback layer is hidden on
 * successful load, no transparent logo can ever reveal it.
 *
 * This page is a design-system demo route — no auth, no DB access, no
 * user data. It is safe to keep in production builds.
 */
export default function LogoTransparencyFixturePage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">Logo transparency fixture</h1>
        <p className="text-sm text-secondary">
          Regression fixture for the Phase 5D CompanyLogoTile layering fix. E2E asserts that once
          <code className="mx-1 rounded bg-surface-pressed px-1 py-0.5">onLoad</code>
          fires, the initials fallback becomes
          <code className="mx-1 rounded bg-surface-pressed px-1 py-0.5">aria-hidden</code>.
        </p>
      </header>
      <section aria-labelledby="loaded-heading" className="space-y-2">
        <h2 id="loaded-heading" className="text-lg font-semibold text-foreground">
          With a loadable logo URL
        </h2>
        <div data-testid="tile-with-logo" className="flex items-center gap-4">
          <CompanyLogoTile name="Dscout" logoUrl="/fixtures/company-logo.webp" />
          <p className="text-sm text-secondary">Initials must be hidden after the image decodes.</p>
        </div>
      </section>
      <section aria-labelledby="fallback-heading" className="space-y-2">
        <h2 id="fallback-heading" className="text-lg font-semibold text-foreground">
          With no logo URL
        </h2>
        <div data-testid="tile-without-logo" className="flex items-center gap-4">
          <CompanyLogoTile name="Drivetrain" logoUrl={null} />
          <p className="text-sm text-secondary">Initials always render.</p>
        </div>
      </section>
    </main>
  );
}
