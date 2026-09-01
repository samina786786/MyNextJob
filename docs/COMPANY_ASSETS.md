# Company assets (Phase 5C)

One canonical company has one normalized logo. The asset is shared catalog
data: reused for every job and every user. Discovery is an admin CLI, never
part of a user request.

See also [`JOB_FEED_UI.md`](./JOB_FEED_UI.md).

## Model

```
companies.domain (trusted, or null)
        │
        ▼
pnpm companies:assets --apply
        │
        ├─ SSRF-safe homepage fetch
        ├─ official icon candidates
        ├─ validate + Sharp normalize
        └─ Storage companies/<company-id>/logo.webp
                │
                ▼
Feed / detail DTO: companyLogoUrl | null
                │
                ▼
48×48 slot: initials always, logo fades in after decode
```

`companies.logo_url` (0001) is unused. 5C stores `logo_storage_path` and
builds the public URL in one helper.

## Domain trust

Use existing `companies.domain` only.

- Do not invent `name.com`.
- Do not guess from company name.
- Do not use fuzzy web search.
- Null / untrustworthy domain → `logo_status = unresolved` and initials.
- Coverage is not more important than correctness.

WWR-created companies often have `domain = NULL`. That is a finished state.

## Resolution order

For a trusted domain, fetch `https://{domain}/` and rank:

1. `apple-touch-icon` / `apple-touch-icon-precomposed`
2. `rel="icon"` / `shortcut icon` (larger sizes win within the kind)
3. web manifest icons when the manifest URL is safely discoverable
4. `/favicon.ico`

Skip SVG candidates. Skip `mask-icon`. Do not use `og:image`, social
avatars, Google image search, Clearbit, Brandfetch, or logo.dev.

## Status lifecycle

| Status | Meaning | Retry |
| --- | --- | --- |
| `pending` | Never processed | Yes |
| `ready` | Normalized WebP exists | Only with `--force` |
| `unresolved` | No trusted domain or no suitable official icon | Not continuously |
| `failed` | Network/decode error | `--retry-failed` |

A later domain ownership change does **not** auto-refresh a ready asset.
The stored file stays under our control until a forced maintenance run.
That is intentional.

## SSRF

Outbound fetches are HTTPS-only. DNS is resolved and checked before the
request. Every redirect target is re-validated (max 3). Timeouts are 6s.
HTML is capped at 400 KB; images at 800 KB.

Blocked: `http`, `file`, `data`, `javascript`, `ftp`, localhost, loopback,
private/link-local/reserved IPv4, CGNAT, IPv6 loopback / unique-local /
link-local, IPv4-mapped private IPv6, metadata hostnames.

No cookies, Authorization, or Supabase credentials are forwarded.
User-Agent: `MyNextJob/5C-company-assets`.

Fail closed → initials.

## Image safety

Never trust the file extension. Validate Content-Type against magic bytes,
decode with Sharp (`limitInputPixels`), reject tiny/huge dimensions, reject
SVG. Output is always our raster: 256×256 WebP, contain fit, transparent
pad, no aspect stretch.

## Storage

Bucket `company-assets` is public-read for known object URLs.

- Path: `companies/<company-id>/logo.webp`
- Writes: `service_role` / admin CLI only
- No `SELECT` policy on `storage.objects` (lint 0025 — listing)
- Authenticated users cannot upload
- Do not change the private `resumes` bucket

## CLI

Dry-run is the default. It does not fetch homepages, upload files, or
update rows.

```bash
pnpm companies:assets --dry-run
pnpm companies:assets --apply
pnpm companies:assets --apply --company=<uuid> --force --retry-failed --limit=20
```

Concurrency is 4 (max 5). Ready companies are skipped unless `--force`.

The CLI cannot invalidate a deployed Next Data Cache. Feed/detail use the
`company-assets` cache tag plus the existing `jobsFresh` TTL. Phase 10 can
connect enrichment completion to protected invalidation.

## UI

The 48×48 slot never changes size. Initials render immediately. A ready
logo overlays after `onLoad`. `onError` keeps initials. First 5
server-rendered cards may use Next Image `priority`; later cards lazy-load.
Company name stays the accessible label; the image `alt` is empty.

Source attribution (for example We Work Remotely) is not the employer logo.

Logos do not affect matching.

## Known limits

- Broader trusted domains → 5E
- Search / filters → 5D
- Matching → 6
- Scheduled refresh / cron → 10
- Migration `0012_company_assets.sql` is not applied until the live pilot
