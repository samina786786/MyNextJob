import { isIP } from 'node:net';

import {
  ASSET_MAX_HTML_BYTES,
  ASSET_MAX_IMAGE_BYTES,
  UnsafeOutboundUrlError,
  assertPublicHttpsUrl,
  defaultDnsLookup,
  parseHttpsAssetUrl,
  type DnsLookupFn,
} from '@/lib/companies/assets/ssrf';
import {
  candidatesFromManifestJson,
  discoverIconCandidates,
  discoverManifestHref,
  mergeIconCandidates,
  type IconCandidate,
} from '@/lib/companies/assets/discover';
import { fetchSafeHttps } from '@/lib/companies/assets/fetch-safe';
import { normalizeCompanyLogo } from '@/lib/companies/assets/normalize';
import { companyLogoObjectExists, uploadCompanyLogo } from '@/lib/companies/assets/store';
import { validateRasterImage } from '@/lib/companies/assets/validate-image';
import { normalizeDomain } from '@/lib/jobs/normalization/normalize-domain';
import type { CompanyLogoStatus } from '@/lib/companies/assets/status';
import type { CompanyAssetRow } from '@/lib/companies/assets/store';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ResolveOutcome =
  | { status: 'ready'; storagePath: string; bytes: number }
  | { status: 'unresolved'; reason: string }
  | { status: 'failed'; reason: string }
  | { status: 'skipped'; reason: string };

export type ResolveDeps = {
  lookup?: DnsLookupFn;
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

function homepageUrl(domain: string): string {
  return `https://${domain}/`;
}

async function loadManifestCandidates(
  html: string,
  pageUrl: URL,
  deps: ResolveDeps,
): Promise<IconCandidate[]> {
  const href = discoverManifestHref(html, pageUrl);
  if (!href) return [];
  try {
    const manifest = await fetchSafeHttps(href, {
      maxBytes: 64_000,
      lookup: deps.lookup,
      fetchImpl: deps.fetchImpl,
      accept: 'application/manifest+json, application/json, */*',
    });
    return candidatesFromManifestJson(manifest.body.toString('utf8'), new URL(manifest.finalUrl));
  } catch {
    return [];
  }
}

export async function resolveCompanyAsset(
  client: SupabaseClient,
  company: CompanyAssetRow,
  options: { apply: boolean; force: boolean; deps?: ResolveDeps } = { apply: false, force: false },
): Promise<ResolveOutcome> {
  const deps = options.deps ?? {};
  const lookup: DnsLookupFn = deps.lookup ?? defaultDnsLookup;

  if (
    company.logoStatus === 'ready' &&
    company.logoStoragePath &&
    !options.force
  ) {
    if (!options.apply) return { status: 'skipped', reason: 'already ready' };
    const exists = await companyLogoObjectExists(client, company.logoStoragePath);
    if (exists) return { status: 'skipped', reason: 'already ready' };
  }

  if (company.logoStatus === 'unresolved' && !options.force) {
    return { status: 'skipped', reason: 'unresolved is not retried' };
  }

  let domain: string | null;
  try {
    domain = normalizeDomain(company.domain);
  } catch {
    // A malformed/untrustworthy domain string is a real signal — mark
    // the row unresolved so it does not churn on every bulk run.
    return { status: 'unresolved', reason: 'domain is not trustworthy' };
  }
  // A NULL domain is a *no attempt made* condition. Keep the row in
  // whatever state it was (typically `pending`) — we never tried to
  // fetch anything, so overwriting to `unresolved` would poison the
  // meaning of that status. Return `skipped` so persistOutcome leaves
  // the row alone.
  if (!domain) return { status: 'skipped', reason: 'no trusted domain (row unchanged)' };
  if (isIP(domain)) {
    // A literal-IP company domain is definitely not a legitimate logo
    // source; record the attempt as unresolved.
    return { status: 'unresolved', reason: 'literal IP domains are not used for logos' };
  }

  try {
    parseHttpsAssetUrl(homepageUrl(domain));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'blocked domain';
    return { status: 'unresolved', reason: message };
  }

  if (!options.apply) {
    return { status: 'skipped', reason: `dry-run would fetch https://${domain}/` };
  }

  try {
    await assertPublicHttpsUrl(homepageUrl(domain), lookup);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'blocked domain';
    return { status: 'unresolved', reason: message };
  }

  try {
    const page = await fetchSafeHttps(homepageUrl(domain), {
      maxBytes: ASSET_MAX_HTML_BYTES,
      lookup,
      fetchImpl: deps.fetchImpl,
      accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
    });
    const pageUrl = new URL(page.finalUrl);
    const html = page.body.toString('utf8');
    const fromPage = discoverIconCandidates(html, pageUrl);
    const fromManifest = await loadManifestCandidates(html, pageUrl, { ...deps, lookup });
    const ranked = mergeIconCandidates(fromPage, fromManifest);

    for (const candidate of ranked) {
      try {
        const image = await fetchSafeHttps(candidate.href, {
          maxBytes: ASSET_MAX_IMAGE_BYTES,
          lookup,
          fetchImpl: deps.fetchImpl,
          accept: 'image/avif,image/webp,image/png,image/jpeg,image/x-icon,*/*;q=0.5',
        });
        await validateRasterImage(image.body, image.contentType);
        const normalized = await normalizeCompanyLogo(image.body);
        const storagePath = await uploadCompanyLogo(client, company.id, normalized.buffer);
        return { status: 'ready', storagePath, bytes: normalized.buffer.length };
      } catch {
        continue;
      }
    }
    return { status: 'unresolved', reason: 'no suitable official icon' };
  } catch (error) {
    if (error instanceof UnsafeOutboundUrlError) {
      return { status: 'failed', reason: error.message };
    }
    return { status: 'failed', reason: error instanceof Error ? error.message : 'network failure' };
  }
}

export function outcomeToStatus(outcome: ResolveOutcome): CompanyLogoStatus | null {
  if (outcome.status === 'skipped') return null;
  return outcome.status;
}
